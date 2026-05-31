function success(data = null, message = 'success') {
  return {
    success: true,
    code: 200,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

function error(message = 'error', code = 500, data = null) {
  return {
    success: false,
    code,
    message,
    data,
    timestamp: new Date().toISOString()
  };
}

function handleAsync(fn) {
  return async (ctx, next) => {
    try {
      await fn(ctx, next);
    } catch (err) {
      ctx.status = err.status || 500;
      ctx.body = error(err.message || 'Internal Server Error', err.status || 500);
      
      const Logger = require('./logger');
      const logger = new Logger('API');
      logger.error(`Request error: ${ctx.method} ${ctx.url}`, err.message);
    }
  };
}

function validateParams(params, required) {
  const missing = [];
  for (const field of required) {
    if (params[field] === undefined || params[field] === null || params[field] === '') {
      missing.push(field);
    }
  }
  return {
    valid: missing.length === 0,
    missing
  };
}

module.exports = {
  success,
  error,
  handleAsync,
  validateParams
};
