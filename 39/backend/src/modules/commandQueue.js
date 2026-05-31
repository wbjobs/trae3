import { EventEmitter } from 'events'

class CommandQueue extends EventEmitter {
  constructor(options = {}) {
    super()
    this.queue = []
    this.processing = new Map()
    this.completed = []
    this.failed = []
    
    this.maxConcurrent = options.maxConcurrent || 3
    this.maxRetries = options.maxRetries || 3
    this.timeout = options.timeout || 30000
    this.maxHistory = options.maxHistory || 100
    
    this.isRunning = false
    this.commandHandlers = new Map()
  }

  registerCommand(command, handler, options = {}) {
    this.commandHandlers.set(command, {
      handler,
      priority: options.priority || 0,
      timeout: options.timeout || this.timeout
    })
  }

  enqueue(deviceId, command, params = {}, userId = 'system') {
    const handlerInfo = this.commandHandlers.get(command)
    if (!handlerInfo) {
      return { success: false, error: `未知指令: ${command}` }
    }

    const task = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceId,
      command,
      params,
      userId,
      priority: handlerInfo.priority,
      status: 'pending',
      retries: 0,
      maxRetries: this.maxRetries,
      timeout: handlerInfo.timeout,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null
    }

    this.insertSorted(task)
    this.emit('queued', task)
    
    if (!this.isRunning) {
      this.process()
    }

    return { success: true, taskId: task.id }
  }

  insertSorted(task) {
    const index = this.queue.findIndex(
      t => t.priority < task.priority || 
           (t.priority === task.priority && t.createdAt > task.createdAt)
    )
    
    if (index === -1) {
      this.queue.push(task)
    } else {
      this.queue.splice(index, 0, task)
    }
  }

  async process() {
    if (this.isRunning) return
    this.isRunning = true

    while (this.queue.length > 0 && this.processing.size < this.maxConcurrent) {
      const task = this.queue.shift()
      this.executeTask(task)
    }

    this.isRunning = false
  }

  async executeTask(task) {
    task.status = 'processing'
    task.startedAt = Date.now()
    this.processing.set(task.id, task)
    this.emit('processing', task)

    const handlerInfo = this.commandHandlers.get(task.command)
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('指令执行超时')), task.timeout)
    })

    try {
      const result = await Promise.race([
        handlerInfo.handler(task.deviceId, task.params, task),
        timeoutPromise
      ])
      
      task.status = 'completed'
      task.result = result
      task.completedAt = Date.now()
      
      this.addToHistory(task)
      this.emit('completed', task)
      
      return { success: true, result }
    } catch (error) {
      task.retries++
      task.error = error.message
      
      if (task.retries < task.maxRetries) {
        task.status = 'retrying'
        this.emit('retrying', task)
        this.insertSorted(task)
      } else {
        task.status = 'failed'
        task.completedAt = Date.now()
        this.addToFailed(task)
        this.emit('failed', task)
      }
      
      return { success: false, error: error.message }
    } finally {
      this.processing.delete(task.id)
      setImmediate(() => this.process())
    }
  }

  addToHistory(task) {
    this.completed.unshift(task)
    if (this.completed.length > this.maxHistory) {
      this.completed.pop()
    }
  }

  addToFailed(task) {
    this.failed.unshift(task)
    if (this.failed.length > this.maxHistory) {
      this.failed.pop()
    }
  }

  getStatus(taskId) {
    if (this.processing.has(taskId)) {
      return this.processing.get(taskId)
    }
    
    const inQueue = this.queue.find(t => t.id === taskId)
    if (inQueue) return inQueue
    
    const completed = this.completed.find(t => t.id === taskId)
    if (completed) return completed
    
    const failed = this.failed.find(t => t.id === taskId)
    if (failed) return failed
    
    return null
  }

  cancelTask(taskId) {
    const index = this.queue.findIndex(t => t.id === taskId)
    if (index !== -1) {
      const [task] = this.queue.splice(index, 1)
      task.status = 'cancelled'
      this.emit('cancelled', task)
      return true
    }
    return false
  }

  getStats() {
    return {
      pending: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.length,
      failed: this.failed.length,
      byPriority: this.countByPriority()
    }
  }

  countByPriority() {
    const counts = { high: 0, medium: 0, low: 0 }
    this.queue.forEach(t => {
      if (t.priority >= 10) counts.high++
      else if (t.priority >= 0) counts.medium++
      else counts.low++
    })
    return counts
  }

  clearHistory() {
    this.completed = []
    this.failed = []
  }
}

export default CommandQueue
