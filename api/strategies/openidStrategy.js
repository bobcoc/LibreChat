const fetch = require('node-fetch');
const passport = require('passport');
const jwtDecode = require('jsonwebtoken/decode');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Issuer, Strategy: OpenIDStrategy, custom } = require('openid-client');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { hashToken } = require('~/server/utils/crypto');
const { logger } = require('~/config');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}

/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @param {string} accessToken
 * @returns {Promise<Buffer>}
 */
const downloadImage = async (url, accessToken) => {
  if (!url) {
    return '';
  }

  try {
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };

    if (process.env.PROXY) {
      options.agent = new HttpsProxyAgent(process.env.PROXY);
    }

    const response = await fetch(url, options);

    if (response.ok) {
      const buffer = await response.buffer();
      return buffer;
    } else {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } catch (error) {
    logger.error(
      `[openidStrategy] downloadImage: Error downloading image at URL "${url}": ${error}`,
    );
    return '';
  }
};

/**
 * Determines the full name of a user based on OpenID userinfo and environment configuration.
 *
 * @param {Object} userinfo - The user information object from OpenID Connect
 * @param {string} [userinfo.given_name] - The user's first name
 * @param {string} [userinfo.family_name] - The user's last name
 * @param {string} [userinfo.username] - The user's username
 * @param {string} [userinfo.email] - The user's email address
 * @returns {string} The determined full name of the user
 */
function getFullName(userinfo) {
  if (process.env.OPENID_NAME_CLAIM) {
    return userinfo[process.env.OPENID_NAME_CLAIM];
  }

  if (userinfo.given_name && userinfo.family_name) {
    return `${userinfo.given_name} ${userinfo.family_name}`;
  }

  if (userinfo.given_name) {
    return userinfo.given_name;
  }

  if (userinfo.family_name) {
    return userinfo.family_name;
  }

  return userinfo.username || userinfo.email;
}

/**
 * Converts an input into a string suitable for a username.
 * If the input is a string, it will be returned as is.
 * If the input is an array, elements will be joined with underscores.
 * In case of undefined or other falsy values, a default value will be returned.
 *
 * @param {string | string[] | undefined} input - The input value to be converted into a username.
 * @param {string} [defaultValue=''] - The default value to return if the input is falsy.
 * @returns {string} The processed input as a string suitable for a username.
 */
function convertToUsername(input, defaultValue = '') {
  if (typeof input === 'string') {
    return input;
  } else if (Array.isArray(input)) {
    return input.join('_');
  }

  return defaultValue;
}

async function setupOpenId() {
  try {
    logger.info('[openidStrategy] Starting setup...');
    
    const issuer = new Issuer({
      issuer: process.env.OPENID_ISSUER,
      authorization_endpoint: process.env.OPENID_AUTH_URL,
      token_endpoint: process.env.OPENID_TOKEN_URL,
      userinfo_endpoint: process.env.OPENID_USERINFO_URL,
    });

    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
      response_types: ['code'],  // 只使用授权码
      token_endpoint_auth_method: 'client_secret_post'
    });

    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE || 'profile email',
          response_type: 'code',  // 只使用授权码
        },
        usePKCE: false,
        passReqToCallback: true,
      },
      async (req, tokenSet, userinfo, done) => {
        try {
          logger.debug('[openidStrategy] TokenSet received:', {
            has_access_token: !!tokenSet.access_token,
            token_type: tokenSet.token_type,
            expires_in: tokenSet.expires_in
          });

          // 先尝试通过 email 查找用户
          let user = await findUser({ email: userinfo.email });
          
          if (!user) {
            // 确定用户名
            let username = '';
            if (process.env.OPENID_USERNAME_CLAIM) {
              username = userinfo[process.env.OPENID_USERNAME_CLAIM];
            } else {
              username = convertToUsername(
                userinfo.username || userinfo.given_name || userinfo.email,
              );
            }

            // 获取用户名字
            const fullName = getFullName(userinfo);

            // 创建新用户
            user = {
              provider: 'openid',
              openidId: userinfo.sub || userinfo.id, // OAuth2 可能使用 id 而不是 sub
              username,
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: fullName,
            };
            user = await createUser(user, true, true);
          } else {
            // 更新现有用户
            user.provider = 'openid';
            user.openidId = userinfo.sub || userinfo.id;
            await updateUser(user._id, user);
          }

          // 处理用户头像
          if (userinfo.picture && !user.avatar?.includes('manual=true')) {
            try {
              const imageUrl = userinfo.picture;
              let fileName = userinfo.sub || userinfo.id;
              fileName = `${fileName}.png`;

              const imageBuffer = await downloadImage(imageUrl, tokenSet.access_token);
              if (imageBuffer) {
                const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
                const imagePath = await saveBuffer({
                  fileName,
                  userId: user._id.toString(),
                  buffer: imageBuffer,
                });
                if (imagePath) {
                  user.avatar = imagePath;
                  await updateUser(user._id, { avatar: imagePath });
                }
              }
            } catch (error) {
              logger.error('[openidStrategy] Error processing user avatar:', error);
            }
          }

          logger.info(
            `[openidStrategy] login success for email: ${user.email} | username: ${user.username}`,
          );

          done(null, user);
        } catch (err) {
          logger.error('[openidStrategy] Verification error:', err);
          done(err);
        }
      }
    );

    passport.use('openid', openidLogin);
    logger.info('[openidStrategy] Setup completed');
  } catch (err) {
    logger.error('[openidStrategy] Setup error:', err);
    throw err;
  }
}

module.exports = setupOpenId;
