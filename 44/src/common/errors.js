class BaseError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}

class TaskError extends BaseError {
  constructor(message, code = 'TASK_ERROR', details = {}) {
    super(message, code, details);
  }
}

class TaskNotFoundError extends TaskError {
  constructor(taskId) {
    super(`Task not found: ${taskId}`, 'TASK_NOT_FOUND', { taskId });
  }
}

class TaskTimeoutError extends TaskError {
  constructor(taskId, timeout) {
    super(`Task timeout: ${taskId} after ${timeout}ms`, 'TASK_TIMEOUT', { taskId, timeout });
  }
}

class NodeError extends BaseError {
  constructor(message, code = 'NODE_ERROR', details = {}) {
    super(message, code, details);
  }
}

class NodeNotFoundError extends NodeError {
  constructor(nodeId) {
    super(`Node not found: ${nodeId}`, 'NODE_NOT_FOUND', { nodeId });
  }
}

class NodeOfflineError extends NodeError {
  constructor(nodeId) {
    super(`Node is offline: ${nodeId}`, 'NODE_OFFLINE', { nodeId });
  }
}

class ComputationError extends BaseError {
  constructor(message, code = 'COMPUTATION_ERROR', details = {}) {
    super(message, code, details);
  }
}

class InterpolationError extends ComputationError {
  constructor(message, algorithm, details = {}) {
    super(message, 'INTERPOLATION_ERROR', { algorithm, ...details });
  }
}

class StorageError extends BaseError {
  constructor(message, code = 'STORAGE_ERROR', details = {}) {
    super(message, code, details);
  }
}

class ValidationError extends BaseError {
  constructor(message, code = 'VALIDATION_ERROR', details = {}) {
    super(message, code, details);
  }
}

module.exports = {
  BaseError,
  TaskError,
  TaskNotFoundError,
  TaskTimeoutError,
  NodeError,
  NodeNotFoundError,
  NodeOfflineError,
  ComputationError,
  InterpolationError,
  StorageError,
  ValidationError,
};
