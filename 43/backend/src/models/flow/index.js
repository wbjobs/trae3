const { flowDB, initFlowDB } = require('../../config/database');
const Application = require('./Application');
const ApprovalRecord = require('./ApprovalRecord');
const TraceLog = require('./TraceLog');
const OperationLog = require('./OperationLog');

module.exports = {
  flowDB,
  initFlowDB,
  Application,
  ApprovalRecord,
  TraceLog,
  OperationLog
};
