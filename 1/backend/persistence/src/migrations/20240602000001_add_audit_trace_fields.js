import { sequelize } from '../config/database.js'

export async function up() {
  const queryInterface = sequelize.getQueryInterface()

  const auditLogDesc = await queryInterface.describeTable('audit_log')

  if (!auditLogDesc.content) {
    await queryInterface.addColumn('audit_log', 'content', {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true,
      comment: '操作描述'
    })
    console.log('audit_log.content 字段添加成功')
  }

  if (!auditLogDesc.userAgent) {
    await queryInterface.addColumn('audit_log', 'userAgent', {
      type: sequelize.Sequelize.STRING(500),
      allowNull: true,
      comment: '请求 User-Agent'
    })
    console.log('audit_log.userAgent 字段添加成功')
  }

  if (!auditLogDesc.duration) {
    await queryInterface.addColumn('audit_log', 'duration', {
      type: sequelize.Sequelize.INTEGER,
      allowNull: true,
      comment: '请求耗时（毫秒）'
    })
    console.log('audit_log.duration 字段添加成功')
  }

  if (!auditLogDesc.errorMessage) {
    await queryInterface.addColumn('audit_log', 'errorMessage', {
      type: sequelize.Sequelize.TEXT,
      allowNull: true,
      comment: '错误信息'
    })
    console.log('audit_log.errorMessage 字段添加成功')
  }

  if (!auditLogDesc.nodeId) {
    await queryInterface.addColumn('audit_log', 'nodeId', {
      type: sequelize.Sequelize.STRING(36),
      allowNull: true,
      comment: '关联节点ID'
    })
    console.log('audit_log.nodeId 字段添加成功')
  }

  if (!auditLogDesc.roomId) {
    await queryInterface.addColumn('audit_log', 'roomId', {
      type: sequelize.Sequelize.STRING(36),
      allowNull: true,
      comment: '关联机房ID'
    })
    console.log('audit_log.roomId 字段添加成功')
  }

  const existingIndexes = await queryInterface.showIndex('audit_log')
  const indexNames = existingIndexes.map(idx => idx.name)

  if (!indexNames.includes('idx_module')) {
    await queryInterface.addIndex('audit_log', ['module'], { name: 'idx_module' })
    console.log('audit_log idx_module 索引添加成功')
  }
  if (!indexNames.includes('idx_result')) {
    await queryInterface.addIndex('audit_log', ['result'], { name: 'idx_result' })
    console.log('audit_log idx_result 索引添加成功')
  }
  if (!indexNames.includes('idx_node')) {
    await queryInterface.addIndex('audit_log', ['nodeId'], { name: 'idx_node' })
    console.log('audit_log idx_node 索引添加成功')
  }
  if (!indexNames.includes('idx_room')) {
    await queryInterface.addIndex('audit_log', ['roomId'], { name: 'idx_room' })
    console.log('audit_log idx_room 索引添加成功')
  }

  const traceSpanDesc = await queryInterface.describeTable('trace_span')

  if (!traceSpanDesc.parentSpanId) {
    await queryInterface.addColumn('trace_span', 'parentSpanId', {
      type: sequelize.Sequelize.STRING(36),
      allowNull: true,
      comment: '父 Span ID'
    })
    console.log('trace_span.parentSpanId 字段添加成功')
  }

  if (!traceSpanDesc.errorMessage) {
    await queryInterface.addColumn('trace_span', 'errorMessage', {
      type: sequelize.Sequelize.TEXT,
      allowNull: true,
      comment: '错误信息'
    })
    console.log('trace_span.errorMessage 字段添加成功')
  }

  if (!traceSpanDesc.nodeId) {
    await queryInterface.addColumn('trace_span', 'nodeId', {
      type: sequelize.Sequelize.STRING(36),
      allowNull: true,
      comment: '关联节点ID'
    })
    console.log('trace_span.nodeId 字段添加成功')
  }

  const existingSpanIndexes = await queryInterface.showIndex('trace_span')
  const spanIndexNames = existingSpanIndexes.map(idx => idx.name)

  if (!spanIndexNames.includes('idx_parent_span')) {
    await queryInterface.addIndex('trace_span', ['parentSpanId'], { name: 'idx_parent_span' })
    console.log('trace_span idx_parent_span 索引添加成功')
  }
  if (!spanIndexNames.includes('idx_service')) {
    await queryInterface.addIndex('trace_span', ['service'], { name: 'idx_service' })
    console.log('trace_span idx_service 索引添加成功')
  }

  console.log('增量迁移完成')
}

export async function down() {
  const queryInterface = sequelize.getQueryInterface()

  await queryInterface.removeColumn('audit_log', 'content').catch(() => {})
  await queryInterface.removeColumn('audit_log', 'userAgent').catch(() => {})
  await queryInterface.removeColumn('audit_log', 'duration').catch(() => {})
  await queryInterface.removeColumn('audit_log', 'errorMessage').catch(() => {})
  await queryInterface.removeColumn('audit_log', 'nodeId').catch(() => {})
  await queryInterface.removeColumn('audit_log', 'roomId').catch(() => {})
  await queryInterface.removeColumn('trace_span', 'parentSpanId').catch(() => {})
  await queryInterface.removeColumn('trace_span', 'errorMessage').catch(() => {})
  await queryInterface.removeColumn('trace_span', 'nodeId').catch(() => {})

  console.log('回滚迁移完成')
}

if (process.argv[1] === import.meta.url.substring(7)) {
  up()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('增量迁移失败:', err)
      process.exit(1)
    })
}
