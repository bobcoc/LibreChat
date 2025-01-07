const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { logger } = require('~/config');

async function setupOAuth2() {
  try {
    logger.info('[oauth2Strategy] Starting setup...');

    const strategy = new OAuth2Strategy(
      {
        authorizationURL: process.env.OPENID_AUTH_URL,
        tokenURL: process.env.OPENID_TOKEN_URL,
        clientID: process.env.OPENID_CLIENT_ID,
        clientSecret: process.env.OPENID_CLIENT_SECRET,
        callbackURL: process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL,
        scope: process.env.OPENID_SCOPE,
        state: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          logger.info('[oauth2Strategy] Token received, fetching user info');

          // 获取用户信息
          const userInfoResponse = await fetch(process.env.OPENID_USERINFO_URL, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!userInfoResponse.ok) {
            throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`);
          }

          const userinfo = await userInfoResponse.json();
          logger.debug('[oauth2Strategy] User info received:', userinfo);

          // 查找现有用户
          let user = await findUser({ email: userinfo.email });
          
          if (!user) {
            // 确定用户名
            let username = '';
            if (process.env.OPENID_USERNAME_CLAIM) {
              username = userinfo[process.env.OPENID_USERNAME_CLAIM];
            } else {
              username = userinfo.username || userinfo.email;
            }

            // 确定全名
            let fullName = '';
            if (process.env.OPENID_NAME_CLAIM) {
              fullName = userinfo[process.env.OPENID_NAME_CLAIM];
            } else {
              fullName = userinfo.fullname || username;
            }

            // 创建新用户
            user = {
              provider: 'oauth2',
              oauth2Id: userinfo.id || userinfo.sub,
              username,
              email: userinfo.email || '',
              emailVerified: true,
              name: fullName,
            };

            user = await createUser(user, true, true);
            logger.info('[oauth2Strategy] New user created:', username);
          } else {
            // 更新现有用户
            user.provider = 'oauth2';
            user.oauth2Id = userinfo.id || userinfo.sub;
            if (process.env.OPENID_USERNAME_CLAIM) {
              user.username = userinfo[process.env.OPENID_USERNAME_CLAIM];
            }
            if (process.env.OPENID_NAME_CLAIM) {
              user.name = userinfo[process.env.OPENID_NAME_CLAIM];
            }
            user = await updateUser(user._id, user);
            logger.info('[oauth2Strategy] Existing user updated:', user.username);
          }

          done(null, user);
        } catch (err) {
          logger.error('[oauth2Strategy] Authentication error:', err);
          done(err);
        }
      }
    );

    // 添加错误处理
    strategy.error((err) => {
      logger.error('[oauth2Strategy] Strategy error:', err);
    });

    passport.use('openid', strategy);
    logger.info('[oauth2Strategy] Setup completed successfully');
  } catch (err) {
    logger.error('[oauth2Strategy] Setup error:', err);
    throw err;
  }
}

module.exports = setupOAuth2;