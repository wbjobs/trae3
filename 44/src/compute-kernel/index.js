const { ComputeKernel, computeKernel } = require('./ComputeKernel');
const KrigingInterpolator = require('./KrigingInterpolator');
const { IDWInterpolator, NearestNeighborInterpolator, LinearInterpolator } = require('./IDWInterpolator');
const variogram = require('./variogram');

module.exports = {
  ComputeKernel,
  computeKernel,
  KrigingInterpolator,
  IDWInterpolator,
  NearestNeighborInterpolator,
  LinearInterpolator,
  variogram,
};
