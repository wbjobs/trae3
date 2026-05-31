const APIServer = require('./server');
const createTaskRouter = require('./routes/tasks');
const createNodeRouter = require('./routes/nodes');
const createResultRouter = require('./routes/results');
const createSystemRouter = require('./routes/system');
const errorHandler = require('./middleware/errorHandler');

module.exports = {
  APIServer,
  createTaskRouter,
  createNodeRouter,
  createResultRouter,
  createSystemRouter,
  errorHandler,
};
