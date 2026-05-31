const { baseDB, initBaseDB } = require('../../config/database');
const User = require('./User');
const Role = require('./Role');
const Chemical = require('./Chemical');
const Permission = require('./Permission');

module.exports = {
  baseDB,
  initBaseDB,
  User,
  Role,
  Chemical,
  Permission
};
