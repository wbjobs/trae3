const logger = require('../../common/logger');
const { BaseError, ValidationError } = require('../../common/errors');

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.path} - Error:`, err);

  if (err instanceof BaseError) {
    return res.status(getHttpStatusCode(err.code)).json({
      success: false,
      error: {
        name: err.name,
        message: err.message,
        code: err.code,
        details: err.details,
      },
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        name: 'SyntaxError',
        message: 'Invalid JSON payload',
        code: 'INVALID_JSON',
      },
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: {
        name: 'UnauthorizedError',
        message: 'Invalid or missing authentication token',
        code: 'UNAUTHORIZED',
      },
    });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: {
        name: 'PayloadTooLargeError',
        message: 'File too large',
        code: 'PAYLOAD_TOO_LARGE',
      },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: {
        name: 'ParseError',
        message: 'Request body parsing failed',
        code: 'PARSE_ERROR',
      },
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      name: 'InternalServerError',
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    },
  });
}

function getHttpStatusCode(errorCode) {
  const statusMap = {
    VALIDATION_ERROR: 400,
    TASK_NOT_FOUND: 404,
    NODE_NOT_FOUND: 404,
    NODE_OFFLINE: 503,
    TASK_TIMEOUT: 408,
    INTERPOLATION_ERROR: 500,
    STORAGE_ERROR: 500,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
  };
  return statusMap[errorCode] || 500;
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      name: 'NotFoundError',
      message: `Route ${req.method} ${req.path} not found`,
      code: 'NOT_FOUND',
    },
  });
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
