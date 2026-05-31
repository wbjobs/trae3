const Joi = require('joi');
const { ValidationError } = require('./errors');

const pointSchema = Joi.object({
  x: Joi.number().required(),
  y: Joi.number().required(),
  z: Joi.number().optional(),
  value: Joi.number().required(),
});

const interpolationParamsSchema = Joi.object({
  algorithm: Joi.string().valid('kriging', 'idw', 'nearest', 'linear').required(),
  power: Joi.number().min(1).max(10).default(2),
  variogram: Joi.object({
    model: Joi.string().valid('spherical', 'exponential', 'gaussian', 'linear').default('spherical'),
    range: Joi.number().positive().required(),
    sill: Joi.number().positive().required(),
    nugget: Joi.number().min(0).default(0),
  }).optional(),
  searchRadius: Joi.number().positive().optional(),
  maxNeighbors: Joi.number().integer().positive().default(12),
});

const gridSchema = Joi.object({
  origin: Joi.object({
    x: Joi.number().required(),
    y: Joi.number().required(),
    z: Joi.number().optional(),
  }).required(),
  size: Joi.object({
    x: Joi.number().integer().positive().required(),
    y: Joi.number().integer().positive().required(),
    z: Joi.number().integer().positive().default(1),
  }).required(),
  spacing: Joi.object({
    x: Joi.number().positive().required(),
    y: Joi.number().positive().required(),
    z: Joi.number().positive().default(1),
  }).required(),
});

const taskSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().max(1000).optional(),
  priority: Joi.number().integer().min(1).max(10).default(5),
  inputData: Joi.object({
    points: Joi.array().items(pointSchema).min(3).required(),
    grid: gridSchema.required(),
    params: interpolationParamsSchema.required(),
    parameterName: Joi.string().required(),
    geologicalLayer: Joi.string().required(),
  }).required(),
  callbackUrl: Joi.string().uri().optional(),
  metadata: Joi.object().default({}),
});

const batchTaskSchema = Joi.object({
  tasks: Joi.array().items(taskSchema).min(1).max(1000).required(),
  batchName: Joi.string().max(255).required(),
  priority: Joi.number().integer().min(1).max(10).default(5),
});

const nodeSchema = Joi.object({
  id: Joi.string().optional(),
  name: Joi.string().max(255).required(),
  type: Joi.string().valid('cpu', 'gpu', 'hybrid').default('cpu'),
  capacity: Joi.object({
    cores: Joi.number().integer().positive().required(),
    memory: Joi.number().positive().required(),
    gpus: Joi.number().integer().min(0).default(0),
  }).required(),
  host: Joi.string().required(),
  port: Joi.number().integer().positive().required(),
  supportedAlgorithms: Joi.array().items(Joi.string()).optional(),
});

function validate(data, schema) {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const details = error.details.map(d => ({
      field: d.path.join('.'),
      message: d.message,
    }));
    throw new ValidationError('Validation failed', 'VALIDATION_ERROR', { details });
  }
  return value;
}

function validateTask(task) {
  return validate(task, taskSchema);
}

function validateBatchTask(batch) {
  return validate(batch, batchTaskSchema);
}

function validateNode(node) {
  return validate(node, nodeSchema);
}

module.exports = {
  validateTask,
  validateBatchTask,
  validateNode,
  validate,
  schemas: {
    taskSchema,
    batchTaskSchema,
    nodeSchema,
    pointSchema,
    gridSchema,
    interpolationParamsSchema,
  },
};
