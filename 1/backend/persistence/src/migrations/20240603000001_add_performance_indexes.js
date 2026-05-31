import { sequelize } from '../config/database.js'

const INDEXES = [
  {
    table: 'node',
    name: 'idx_node_room_status',
    fields: ['roomId', 'status']
  },
  {
    table: 'node',
    name: 'idx_node_status_updated',
    fields: ['status', 'updatedAt']
  },
  {
    table: 'node',
    name: 'idx_node_parent_room',
    fields: ['parentId', 'roomId']
  },
  {
    table: 'node_metric',
    name: 'idx_metric_node_time_desc',
    fields: ['nodeId', { name: 'timestamp', order: 'DESC' }]
  },
  {
    table: 'audit_log',
    name: 'idx_audit_module_created',
    fields: ['module', 'createdAt']
  },
  {
    table: 'audit_log',
    name: 'idx_audit_result_created',
    fields: ['result', 'createdAt']
  }
]

export async function up() {
  const queryInterface = sequelize.getQueryInterface()

  for (const idx of INDEXES) {
    const existingIndexes = await queryInterface.showIndex(idx.table)
    const indexNames = existingIndexes.map(i => i.name)

    if (!indexNames.includes(idx.name)) {
      await queryInterface.addIndex(idx.table, idx.fields, { name: idx.name })
      console.log(`索引 ${idx.name} 添加成功`)
    } else {
      console.log(`索引 ${idx.name} 已存在，跳过`)
    }
  }

  console.log('性能索引迁移完成')
}

export async function down() {
  const queryInterface = sequelize.getQueryInterface()

  for (const idx of INDEXES) {
    const existingIndexes = await queryInterface.showIndex(idx.table)
    const indexNames = existingIndexes.map(i => i.name)

    if (indexNames.includes(idx.name)) {
      await queryInterface.removeIndex(idx.table, idx.name)
      console.log(`索引 ${idx.name} 删除成功`)
    }
  }

  console.log('性能索引回滚完成')
}

if (process.argv[1] === import.meta.url.substring(7)) {
  up()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('性能索引迁移失败:', err)
      process.exit(1)
    })
}
