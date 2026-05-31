import cron from 'node-cron'
import { NodeCollectTaskRepository } from 'persistence'
import hardwareCollector from '../collector/HardwareCollector.js'
import dataProcessor from '../processor/DataProcessor.js'
import auditReporter from '../reporter/AuditReporter.js'
import config from '../config/index.js'
import { TraceLogger } from '../utils/logger.js'

class CollectScheduler {
  constructor() {
    this.tasks = new Map()
    this.isRunning = false
    this.collectInterval = config.collectInterval
  }

  async start() {
    const traceLogger = new TraceLogger()
    traceLogger.info('启动节点数据采集调度器')

    try {
      await this.loadActiveTasks(traceLogger)
      this.scheduleMainLoop(traceLogger)
      this.isRunning = true

      await auditReporter.reportCollectorStatus('running', traceLogger)
      traceLogger.info('节点数据采集调度器启动成功', {
        taskCount: this.tasks.size,
        interval: this.collectInterval
      })
    } catch (error) {
      traceLogger.error('采集调度器启动失败', { error: error.message })
      throw error
    }
  }

  async stop() {
    const traceLogger = new TraceLogger()
    traceLogger.info('停止节点数据采集调度器')

    this.tasks.forEach((task, nodeId) => {
      if (task.timer) {
        clearTimeout(task.timer)
      }
    })

    if (this.mainLoopTask) {
      this.mainLoopTask.stop()
    }

    this.isRunning = false
    await auditReporter.reportCollectorStatus('stopped', traceLogger)
    traceLogger.info('节点数据采集调度器已停止')
  }

  async loadActiveTasks(traceLogger) {
    traceLogger.debug('加载活跃采集任务')

    const activeTasks = await NodeCollectTaskRepository.findActiveTasks()

    activeTasks.forEach(task => {
      this.tasks.set(task.nodeId, {
        id: task.id,
        nodeId: task.nodeId,
        interval: task.interval,
        node: task.node,
        timer: null,
        lastRun: task.lastRun,
        nextRun: task.nextRun
      })
    })

    traceLogger.debug(`已加载 ${activeTasks.length} 个采集任务`)
  }

  scheduleMainLoop(traceLogger) {
    traceLogger.debug('启动主循环调度')

    const cronExpression = this.getCronExpression()
    traceLogger.debug(`Cron 表达式: ${cronExpression}`)

    this.mainLoopTask = cron.schedule(cronExpression, async () => {
      await this.executeDueTasks()
    })

    this.executeDueTasks()
  }

  getCronExpression() {
    const seconds = Math.floor(this.collectInterval / 1000)
    if (seconds < 60) {
      return `*/${seconds} * * * * *`
    } else {
      const minutes = Math.floor(seconds / 60)
      return `0 */${minutes} * * * *`
    }
  }

  async executeDueTasks() {
    const currentTime = Date.now()
    const dueTasks = await NodeCollectTaskRepository.findDueTasks(currentTime)

    if (dueTasks.length === 0) {
      return
    }

    const traceLogger = new TraceLogger()
    traceLogger.debug(`执行 ${dueTasks.length} 个到期采集任务`)

    for (const task of dueTasks) {
      await this.executeSingleTask(task.node, traceLogger)
      await NodeCollectTaskRepository.updateLastRun(
        task.id,
        new Date(),
        new Date(currentTime + task.interval)
      )
    }
  }

  async executeSingleTask(node, parentLogger) {
    const traceLogger = new TraceLogger()
    const spans = []

    try {
      traceLogger.info(`开始采集: ${node.name} (${node.ip})`)

      const collectResult = await hardwareCollector.collectNodeData(node, traceLogger)
      spans.push(collectResult.span)

      const processResult = dataProcessor.process(node, collectResult.metrics, traceLogger)
      spans.push(processResult.span)

      const saveSpan = await dataProcessor.saveToDatabase(
        node.id,
        processResult.processed,
        processResult.status,
        traceLogger
      )
      spans.push(saveSpan)

      await auditReporter.reportCollection(node, collectResult, spans, traceLogger)

      traceLogger.info(`采集完成: ${node.name}`, {
        status: processResult.status,
        anomalies: processResult.anomalies.length
      })

      return {
        success: true,
        nodeId: node.id,
        status: processResult.status,
        metrics: processResult.processed
      }
    } catch (error) {
      traceLogger.error(`采集任务异常: ${node.name}`, { error: error.message })
      return {
        success: false,
        nodeId: node.id,
        error: error.message
      }
    }
  }

  async manualCollect(nodeId) {
    const traceLogger = new TraceLogger()
    traceLogger.info(`手动触发采集: ${nodeId}`)

    const task = this.tasks.get(nodeId)
    if (!task || !task.node) {
      traceLogger.warn(`未找到采集任务: ${nodeId}`)
      return null
    }

    return this.executeSingleTask(task.node, traceLogger)
  }

  addTask(nodeId, interval, node) {
    if (this.tasks.has(nodeId)) {
      this.removeTask(nodeId)
    }

    this.tasks.set(nodeId, {
      nodeId,
      interval,
      node,
      timer: null,
      lastRun: null,
      nextRun: new Date(Date.now() + interval)
    })

    NodeCollectTaskRepository.createForNode(nodeId, interval)
  }

  removeTask(nodeId) {
    const task = this.tasks.get(nodeId)
    if (task && task.timer) {
      clearTimeout(task.timer)
    }
    this.tasks.delete(nodeId)
    NodeCollectTaskRepository.updateStatus(nodeId, 'disabled')
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      taskCount: this.tasks.size,
      collectInterval: this.collectInterval,
      tasks: Array.from(this.tasks.values()).map(t => ({
        nodeId: t.nodeId,
        nodeName: t.node?.name,
        interval: t.interval,
        lastRun: t.lastRun,
        nextRun: t.nextRun
      }))
    }
  }
}

export default new CollectScheduler()
