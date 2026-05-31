const { DistributedComputingSystem } = require('../src');
const { computeKernel } = require('../src/compute-kernel');

async function runExample() {
  console.log('=== 地质岩层参数分布式计算系统 - 基础使用示例 ===\n');

  const system = new DistributedComputingSystem({
    role: 'all',
    initDatabase: false,
    schedulerOptions: {
      splitterOptions: {
        maxGridCellsPerSubtask: 1000,
      },
    },
  });

  console.log('1. 启动系统...');
  await system.start();
  console.log('✓ 系统启动成功\n');

  console.log('2. 生成示例采样点数据...');
  const points = generateSamplePoints(50, 0, 100, 0, 100);
  console.log(`✓ 生成 ${points.length} 个采样点\n`);

  console.log('3. 配置插值网格...');
  const grid = {
    origin: { x: 0, y: 0, z: 0 },
    size: { x: 50, y: 50, z: 1 },
    spacing: { x: 2, y: 2, z: 1 },
  };
  console.log(`✓ 网格配置: ${grid.size.x}x${grid.size.y}x${grid.size.z}, 总计 ${grid.size.x * grid.size.y * grid.size.z} 个网格点\n`);

  console.log('4. 直接调用计算内核测试IDW插值...');
  const idwResult = await computeKernel.interpolate({
    points,
    grid,
    params: {
      algorithm: 'idw',
      power: 2,
      maxNeighbors: 8,
    },
  });
  console.log(`✓ IDW插值完成`);
  console.log(`  - 最小值: ${idwResult.data.stats.minValue.toFixed(4)}`);
  console.log(`  - 最大值: ${idwResult.data.stats.maxValue.toFixed(4)}`);
  console.log(`  - 平均值: ${idwResult.data.stats.meanValue.toFixed(4)}`);
  console.log(`  - 计算时间: ${idwResult.data.stats.computationTime}ms\n`);

  console.log('5. 直接调用计算内核测试Kriging插值...');
  const krigingResult = await computeKernel.interpolate({
    points,
    grid,
    params: {
      algorithm: 'kriging',
      variogram: {
        model: 'spherical',
        range: 50,
        sill: 1.0,
        nugget: 0.1,
      },
      maxNeighbors: 12,
    },
  });
  console.log(`✓ Kriging插值完成`);
  console.log(`  - 最小值: ${krigingResult.data.stats.minValue.toFixed(4)}`);
  console.log(`  - 最大值: ${krigingResult.data.stats.maxValue.toFixed(4)}`);
  console.log(`  - 平均值: ${krigingResult.data.stats.meanValue.toFixed(4)}`);
  console.log(`  - 计算时间: ${krigingResult.data.stats.computationTime}ms\n`);

  console.log('6. 提交任务到调度系统...');
  const task = await system.getTaskScheduler().submitTask({
    name: '孔隙度插值计算',
    description: '第三系岩层孔隙度空间插值',
    priority: 5,
    inputData: {
      points,
      grid,
      params: {
        algorithm: 'idw',
        power: 2,
        maxNeighbors: 8,
      },
      parameterName: 'porosity',
      geologicalLayer: 'Tertiary',
    },
    metadata: {
      project: '示例项目',
      area: '华北盆地',
    },
  });
  console.log(`✓ 任务已提交，ID: ${task.id}\n`);

  console.log('7. 批量提交多个任务...');
  const parameters = ['porosity', 'permeability', 'density'];
  const batchTasks = parameters.map(param => ({
    name: `${param}插值计算`,
    description: `${param}参数空间插值计算`,
    priority: 7,
    inputData: {
      points: generateSamplePoints(30, 0, 100, 0, 100),
      grid: {
        origin: { x: 0, y: 0 },
        size: { x: 30, y: 30, z: 1 },
        spacing: { x: 3, y: 3, z: 1 },
      },
      params: {
        algorithm: 'kriging',
        variogram: {
          model: 'spherical',
          range: 40,
          sill: 0.8,
          nugget: 0.05,
        },
        maxNeighbors: 10,
      },
      parameterName: param,
      geologicalLayer: 'Cretaceous',
    },
  }));

  const batch = await system.getTaskScheduler().submitBatchTasks({
    tasks: batchTasks,
    batchName: '多参数批量插值',
    priority: 8,
  });
  console.log(`✓ 批次已提交，ID: ${batch.id}, 包含 ${batch.taskIds.length} 个任务\n`);

  console.log('8. 查询任务状态...');
  const taskStatus = await system.getTaskScheduler().getTaskStatus(task.id);
  console.log(`✓ 任务状态: ${taskStatus.status}`);
  console.log(`  - 进度: ${taskStatus.progress}%`);
  console.log(`  - 子任务数: ${taskStatus.totalSubtasks}\n`);

  console.log('9. 查询系统统计信息...');
  const queueStats = await system.getTaskScheduler().getQueueStats();
  console.log(`✓ 队列统计:`);
  console.log(`  - 总任务数: ${queueStats.totalTasks}`);
  console.log(`  - 活跃批次: ${queueStats.activeBatches}`);
  console.log(`  - 队列状态:`, queueStats.taskQueue, '\n');

  const nodeStats = system.getNodeManager().getNodeStats();
  console.log(`✓ 节点统计:`);
  console.log(`  - 总节点数: ${nodeStats.total}`);
  console.log(`  - 在线节点: ${nodeStats.online}`);
  console.log(`  - 忙碌节点: ${nodeStats.busy}`);
  console.log(`  - 平均负载: ${nodeStats.avgLoad.toFixed(2)}\n`);

  console.log('10. 支持的插值算法:');
  const algorithms = computeKernel.getSupportedAlgorithms();
  console.log(`  - ${algorithms.join('\n  - ')}\n`);

  console.log('=== 示例执行完成 ===');
  console.log('API服务已启动: http://localhost:3000');
  console.log('健康检查: http://localhost:3000/api/v1/system/health');
  console.log('系统信息: http://localhost:3000/api/v1/system/info');

  setTimeout(async () => {
    console.log('\n正在停止系统...');
    await system.stop();
    console.log('✓ 系统已停止');
  }, 5000);
}

function generateSamplePoints(count, minX, maxX, minY, maxY) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) + Math.random() * 0.2;
    points.push({ x, y, value: Math.abs(value) });
  }
  return points;
}

if (require.main === module) {
  runExample().catch(console.error);
}

module.exports = {
  runExample,
  generateSamplePoints,
};
