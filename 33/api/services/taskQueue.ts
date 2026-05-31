type Task = () => Promise<void> | void

class TaskQueue {
  private queue: Task[] = []
  private processing = false

  enqueue(task: Task): void {
    this.queue.push(task)
    this.process()
  }

  private async process(): Promise<void> {
    if (this.processing) return
    this.processing = true
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      try {
        await task()
      } catch (err) {
        console.error('Task queue error:', err)
      }
    }
    this.processing = false
  }
}

export const taskQueue = new TaskQueue()
