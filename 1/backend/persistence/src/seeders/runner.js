import { up } from './20240601000001_init_data.js'

async function runSeeders() {
  console.log('开始执行数据初始化...')
  try {
    await up()
    console.log('数据初始化完成')
  } catch (err) {
    console.error('数据初始化失败:', err)
    process.exit(1)
  }
}

runSeeders()
