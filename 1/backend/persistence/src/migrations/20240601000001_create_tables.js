import { sequelize } from '../config/database.js'
import '../models/index.js'

export async function up() {
  await sequelize.sync({ force: true })
  console.log('所有数据表创建成功')
}

export async function down() {
  await sequelize.drop()
  console.log('所有数据表删除成功')
}

if (process.argv[1] === import.meta.url.substring(7)) {
  up()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('迁移失败:', err)
      process.exit(1)
    })
}
