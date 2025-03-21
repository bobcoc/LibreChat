const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const githubLogin = require('./githubStrategy');
const discordLogin = require('./discordStrategy');
const facebookLogin = require('./facebookStrategy');
const setupOpenId = require('./oauth2Strategy');
const jwtLogin = require('./jwtStrategy');
const ldapLogin = require('./ldapStrategy');

module.exports = {
  passportLogin,
  googleLogin,
  githubLogin,
  discordLogin,
  jwtLogin,
  facebookLogin,
  setupOpenId,
  ldapLogin,
};
