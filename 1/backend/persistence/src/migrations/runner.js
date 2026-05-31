import { up } from './20240601000001_create_tables.js'

async function runMigrations() {
  console.log('开始执行数据库迁移...')
  try {
    await up()
    console.log('数据库迁移完成')
  } catch (err) {
    console.error('数据库迁移失败:', err)
    process.exit(1)
  }
}

runMigrations()
