const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { logger } = require('~/config');

async function setupOAuth2() {
  try {
    logger.info('[oauth2Strategy] Starting setup...');

    const oauth2Options = {
      authorizationURL: process.env.OPENID_AUTH_URL,
      tokenURL: process.env.OPENID_TOKEN_URL,
      clientID: process.env.OPENID_CLIENT_ID,
      clientSecret: process.env.OPENID_CLIENT_SECRET,
      callbackURL: process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL,
      scope: process.env.OPENID_SCOPE,
      state: true,
      pkce: process.env.OPENID_USE_PKCE === 'true',
    };

    logger.debug('[oauth2Strategy] Configuration:', {
      authorizationURL: oauth2Options.authorizationURL,
      tokenURL: oauth2Options.tokenURL,
      clientID: oauth2Options.clientID ? '(set)' : '(not set)',
      callbackURL: oauth2Options.callbackURL,
      scope: oauth2Options.scope,
    });

    const strategy = new OAuth2Strategy(
      oauth2Options,
      async (accessToken, refreshToken, params, profile, done) => {
        try {
          logger.info('[oauth2Strategy] Token received, fetching user info');

          // 获取用户信息
          const userInfoResponse = await fetch(process.env.OPENID_USERINFO_URL, {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (!userInfoResponse.ok) {
            logger.error('[oauth2Strategy] Failed to fetch user info:', userInfoResponse.status);
            return done(new Error(`Failed to fetch user info: ${userInfoResponse.status}`));
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
            // 从环境变量获取初始余额
            const initialBalance = parseInt(process.env.OAUTH_INITIAL_BALANCE) || 0;

            // 创建初始余额
            try {
              const balanceDoc = await Balance.create({
                user: user._id,
                tokenCredits: initialBalance
              });

              logger.debug('[oauth2Strategy] Balance creation result:', {
                userId: user._id,
                balance: balanceDoc.tokenCredits,
                balanceId: balanceDoc._id
              });

              // 验证余额是否正确创建
              const checkResult = await Balance.check({
                user: user._id,
                model: 'default',
                endpoint: 'default',
                valueKey: 'tokens',
                tokenType: 'token',
                amount: 1,
              });

              logger.info('[oauth2Strategy] Initial balance check:', {
                userId: user._id,
                balanceCheck: checkResult
              });
            } catch (balanceErr) {
              logger.error('[oauth2Strategy] Error creating initial balance:', {
                error: balanceErr.message,
                stack: balanceErr.stack,
                userId: user._id,
                attemptedBalance: initialBalance
              });
            }

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
            await updateUser(user._id, user);
            logger.info('[oauth2Strategy] Existing user updated:', user.username);
          }

          return done(null, user);
        } catch (err) {
          logger.error('[oauth2Strategy] Authentication error:', err);
          return done(err);
        }
      }
    );

    passport.use('openid', strategy);
    logger.info('[oauth2Strategy] Setup completed successfully');
  } catch (err) {
    logger.error('[oauth2Strategy] Setup error:', err);
    throw err;
  }
}

module.exports = setupOAuth2;