const firmwareParser = require('./FirmwareParser');
const firmwareVerifier = require('./FirmwareVerifier');

module.exports = firmwareParser;
module.exports.verifier = firmwareVerifier;
module.exports.parser = firmwareParser;
