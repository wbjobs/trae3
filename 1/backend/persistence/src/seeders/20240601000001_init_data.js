import { User, Room, Node, NodeCollectTask } from '../models/index.js'
import { v4 as uuidv4 } from 'uuid'

const nodesData = [
  { id: 'n_001', name: '北京A-核心路由', ip: '10.0.1.1', roomId: 'r_001', parentId: null, status: 'online', cpuUsage: 35, memoryUsage: 45, diskUsage: 20, uptime: 86400 * 30 },
  { id: 'n_002', name: '北京A-交换机01', ip: '10.0.1.11', roomId: 'r_001', parentId: 'n_001', status: 'online', cpuUsage: 25, memoryUsage: 35, diskUsage: 15, uptime: 86400 * 25 },
  { id: 'n_003', name: '北京A-交换机02', ip: '10.0.1.12', roomId: 'r_001', parentId: 'n_001', status: 'online', cpuUsage: 30, memoryUsage: 40, diskUsage: 18, uptime: 86400 * 20 },
  { id: 'n_004', name: '北京A-计算节点01', ip: '10.0.2.11', roomId: 'r_001', parentId: 'n_002', status: 'online', cpuUsage: 65, memoryUsage: 72, diskUsage: 45, uptime: 86400 * 15 },
  { id: 'n_005', name: '北京A-计算节点02', ip: '10.0.2.12', roomId: 'r_001', parentId: 'n_002', status: 'warning', cpuUsage: 85, memoryUsage: 88, diskUsage: 60, uptime: 86400 * 10 },
  { id: 'n_006', name: '北京A-存储节点01', ip: '10.0.3.11', roomId: 'r_001', parentId: 'n_003', status: 'online', cpuUsage: 20, memoryUsage: 55, diskUsage: 82, uptime: 86400 * 18 },
  { id: 'n_007', name: '北京B-核心路由', ip: '10.1.1.1', roomId: 'r_002', parentId: null, status: 'online', cpuUsage: 28, memoryUsage: 38, diskUsage: 22, uptime: 86400 * 22 },
  { id: 'n_008', name: '北京B-计算节点01', ip: '10.1.2.11', roomId: 'r_002', parentId: 'n_007', status: 'error', cpuUsage: 0, memoryUsage: 0, diskUsage: 0, uptime: 0 },
  { id: 'n_009', name: '北京B-计算节点02', ip: '10.1.2.12', roomId: 'r_002', parentId: 'n_007', status: 'online', cpuUsage: 42, memoryUsage: 58, diskUsage: 38, uptime: 86400 * 8 },
  { id: 'n_010', name: '上海-核心路由', ip: '10.2.1.1', roomId: 'r_003', parentId: null, status: 'online', cpuUsage: 32, memoryUsage: 42, diskUsage: 25, uptime: 86400 * 28 },
  { id: 'n_011', name: '上海-计算节点01', ip: '10.2.2.11', roomId: 'r_003', parentId: 'n_010', status: 'online', cpuUsage: 55, memoryUsage: 65, diskUsage: 48, uptime: 86400 * 12 },
  { id: 'n_012', name: '上海-存储节点01', ip: '10.2.3.11', roomId: 'r_003', parentId: 'n_010', status: 'offline', cpuUsage: 0, memoryUsage: 0, diskUsage: 0, uptime: 0 },
  { id: 'n_013', name: '深圳-核心路由', ip: '10.3.1.1', roomId: 'r_004', parentId: null, status: 'maintenance', cpuUsage: 15, memoryUsage: 25, diskUsage: 18, uptime: 86400 * 5 },
  { id: 'n_014', name: '成都-核心路由', ip: '10.4.1.1', roomId: 'r_005', parentId: null, status: 'online', cpuUsage: 28, memoryUsage: 36, diskUsage: 20, uptime: 86400 * 18 },
  { id: 'n_015', name: '成都-计算节点01', ip: '10.4.2.11', roomId: 'r_005', parentId: 'n_014', status: 'online', cpuUsage: 48, memoryUsage: 52, diskUsage: 42, uptime: 86400 * 14 },
  { id: 'n_016', name: '成都-计算节点02', ip: '10.4.2.12', roomId: 'r_005', parentId: 'n_014', status: 'warning', cpuUsage: 78, memoryUsage: 82, diskUsage: 55, uptime: 86400 * 9 },
  { id: 'n_017', name: '成都-存储节点01', ip: '10.4.3.11', roomId: 'r_005', parentId: 'n_014', status: 'online', cpuUsage: 22, memoryUsage: 48, diskUsage: 72, uptime: 86400 * 16 },
  { id: 'n_018', name: '北京A-数据库节点01', ip: '10.0.4.11', roomId: 'r_001', parentId: 'n_002', status: 'online', cpuUsage: 52, memoryUsage: 78, diskUsage: 68, uptime: 86400 * 21 },
  { id: 'n_019', name: '北京A-缓存节点01', ip: '10.0.5.11', roomId: 'r_001', parentId: 'n_003', status: 'online', cpuUsage: 38, memoryUsage: 85, diskUsage: 28, uptime: 86400 * 19 },
  { id: 'n_020', name: '上海-数据库节点01', ip: '10.2.4.11', roomId: 'r_003', parentId: 'n_010', status: 'online', cpuUsage: 45, memoryUsage: 72, diskUsage: 62, uptime: 86400 * 13 }
]

export async function up() {
  await User.bulkCreate([
    { id: 'u_001', username: 'admin', password: 'admin123', role: 'admin', status: 'active' },
    { id: 'u_002', username: 'operator', password: 'admin123', role: 'operator', status: 'active' },
    { id: 'u_003', username: 'viewer', password: 'admin123', role: 'viewer', status: 'active' }
  ])

  await Room.bulkCreate([
    { id: 'r_001', name: '北京机房-A', location: '北京市朝阳区', region: 'north', status: 'active', description: '北京主数据中心A区' },
    { id: 'r_002', name: '北京机房-B', location: '北京市海淀区', region: 'north', status: 'active', description: '北京主数据中心B区' },
    { id: 'r_003', name: '上海机房', location: '上海市浦东新区', region: 'east', status: 'active', description: '上海容灾数据中心' },
    { id: 'r_004', name: '深圳机房', location: '深圳市南山区', region: 'south', status: 'maintenance', description: '深圳数据中心（维护中）' },
    { id: 'r_005', name: '成都机房', location: '成都市高新区', region: 'west', status: 'active', description: '西部数据中心' }
  ])

  await Node.bulkCreate(nodesData)

  const tasks = nodesData.map(node => ({
    id: uuidv4(),
    nodeId: node.id,
    interval: 30000,
    status: node.status === 'maintenance' ? 'paused' : 'active',
    nextRun: new Date(Date.now() + 30000)
  }))
  await NodeCollectTask.bulkCreate(tasks)

  console.log('初始化数据插入成功')
}

export async function down() {
  await NodeCollectTask.destroy({ where: {} })
  await Node.destroy({ where: {} })
  await Room.destroy({ where: {} })
  await User.destroy({ where: {} })
  console.log('初始化数据清除成功')
}

if (process.argv[1] === import.meta.url.substring(7)) {
  up()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('数据初始化失败:', err)
      process.exit(1)
    })
}
