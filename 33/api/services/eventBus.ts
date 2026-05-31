import { EventEmitter } from 'events'

type EventMap = {
  'transfer:created': { transferId: number; toLabId: number; sampleId: number }
  'transfer:approved': { transferId: number; approved: boolean; appliedBy: number }
  'transfer:received': { transferId: number; receivedBy: number }
}

class EventBus extends EventEmitter {
  emitEvent<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.emit(event, data)
  }

  onEvent<K extends keyof EventMap>(event: K, handler: (data: EventMap[K]) => void): void {
    this.on(event, handler)
  }
}

export const eventBus = new EventBus()
