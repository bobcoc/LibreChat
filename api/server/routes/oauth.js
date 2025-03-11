// file deepcode ignore NoRateLimitingForLogin: Rate limiting is handled by the `loginLimiter` middleware
const express = require('express');
const passport = require('passport');
const { loginLimiter, checkBan, checkDomainAllowed } = require('~/server/middleware');
const { setAuthTokens } = require('~/server/services/AuthService');
const { logger } = require('~/config');

const router = express.Router();

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

router.use(loginLimiter);

const oauthHandler = async (req, res) => {
  try {
    await checkDomainAllowed(req, res);
    await checkBan(req, res);
    if (req.banned) {
      return;
    }

    // Ensure we're creating a new session (not refreshing an existing one)
    await setAuthTokens(req.user._id, res, null);
    
    // Add a small delay to ensure the old sessions are properly cleaned up
    await new Promise(resolve => setTimeout(resolve, 100));
    
    res.redirect(domains.client);
  } catch (err) {
    logger.error('Error in setting authentication tokens:', err);
    res.redirect(`${domains.client}/login?error=auth_error`);
  }
};

/**
 * Google Routes
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['openid', 'profile', 'email'],
    session: false,
  }),
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['openid', 'profile', 'email'],
  }),
  oauthHandler,
);

router.get(
  '/facebook',
  passport.authenticate('facebook', {
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
    session: false,
  }),
);

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['public_profile'],
    profileFields: ['id', 'email', 'name'],
  }),
  oauthHandler,
);

router.get(
  '/openid',
  (req, res, next) => {
    logger.debug('[oauth] Starting OAuth2 authentication');
    next();
  },
  passport.authenticate('openid', {
    session: false,
    scope: process.env.OPENID_SCOPE?.split(' ') || ['profile', 'email']
  })
);

router.get(
  '/openid/callback',
  (req, res, next) => {
    logger.debug('[oauth] Received callback', { 
      query: req.query,
      state: req.query.state
    });
    next();
  },
  passport.authenticate('openid', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false
  }),
  (req, res, next) => {
    logger.debug('[oauth] Authentication successful');
    next();
  },
  oauthHandler
);

router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email', 'read:user'],
    session: false,
  }),
);

router.get(
  '/github/callback',
  passport.authenticate('github', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['user:email', 'read:user'],
  }),
  oauthHandler,
);
router.get(
  '/discord',
  passport.authenticate('discord', {
    scope: ['identify', 'email'],
    session: false,
  }),
);

router.get(
  '/discord/callback',
  passport.authenticate('discord', {
    failureRedirect: `${domains.client}/login`,
    failureMessage: true,
    session: false,
    scope: ['identify', 'email'],
  }),
  oauthHandler,
);

module.exports = router;
