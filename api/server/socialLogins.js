const Redis = require('ioredis');
const passport = require('passport');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const {
  setupOpenId,
  googleLogin,
  githubLogin,
  discordLogin,
  facebookLogin,
} = require('~/strategies');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = (app) => {
  logger.info('[socialLogins] Starting social login configuration...');

  // 检查所有环境变量
  logger.debug('[socialLogins] Environment variables check:', {
    has_openid_client_id: !!process.env.OPENID_CLIENT_ID,
    has_openid_client_secret: !!process.env.OPENID_CLIENT_SECRET,
    has_openid_issuer: !!process.env.OPENID_ISSUER,
    has_openid_scope: !!process.env.OPENID_SCOPE,
    has_openid_session_secret: !!process.env.OPENID_SESSION_SECRET
  });

  if (
    process.env.OPENID_CLIENT_ID &&
    process.env.OPENID_CLIENT_SECRET &&
    process.env.OPENID_ISSUER &&
    process.env.OPENID_SCOPE &&
    process.env.OPENID_SESSION_SECRET
  ) {
    logger.info('[socialLogins] OpenID configuration detected');
    
    const sessionOptions = {
      secret: process.env.OPENID_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
    };

    if (isEnabled(process.env.USE_REDIS)) {
      logger.info('[socialLogins] Redis is enabled, configuring Redis store...');
      const client = new Redis(process.env.REDIS_URI);
      client
        .on('error', (err) => logger.error('[socialLogins] Redis error:', err))
        .on('ready', () => logger.info('[socialLogins] Redis successfully initialized'))
        .on('reconnecting', () => logger.info('[socialLogins] Redis reconnecting...'));
      
      sessionOptions.store = new RedisStore({ client, prefix: 'librechat' });
      logger.info('[socialLogins] Redis store configured');
    }

    logger.info('[socialLogins] Setting up session middleware');
    app.use(session(sessionOptions));
    app.use(passport.session());

    logger.info('[socialLogins] Calling setupOpenId...');
    try {
      setupOpenId();
      logger.info('[socialLogins] setupOpenId completed successfully');
    } catch (error) {
      logger.error('[socialLogins] setupOpenId failed:', error);
    }
  } else {
    logger.info('[socialLogins] OpenID configuration not complete, skipping setup');
  }

  // Other social logins...
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    logger.info('[socialLogins] Configuring Google login');
    passport.use(googleLogin());
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    logger.info('[socialLogins] Configuring Facebook login');
    passport.use(facebookLogin());
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    logger.info('[socialLogins] Configuring GitHub login');
    passport.use(githubLogin());
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    logger.info('[socialLogins] Configuring Discord login');
    passport.use(discordLogin());
  }

  logger.info('[socialLogins] Social login configuration completed');
};

module.exports = configureSocialLogins;