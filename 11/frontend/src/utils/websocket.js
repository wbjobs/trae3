class WebSocketClient {
  constructor() {
    this.ws = null
    this.url = this.getWebSocketUrl()
    this.listeners = new Map()
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.isManualClose = false
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}`
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    this.isManualClose = false

    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('WebSocket 连接成功')
        this.reconnectAttempts = 0
        this.emit('connected', {})
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.emit(data.type, data.payload)
        } catch (e) {
          console.error('WebSocket 消息解析失败', e)
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket 错误', error)
        this.emit('error', error)
      }

      this.ws.onclose = () => {
        console.log('WebSocket 连接关闭')
        this.emit('disconnected', {})
        
        if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
          setTimeout(() => this.connect(), this.reconnectDelay)
        }
      }
    } catch (e) {
      console.error('WebSocket 连接失败', e)
    }
  }

  disconnect() {
    this.isManualClose = true
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return
    
    if (callback) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    } else {
      this.listeners.delete(event)
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return
    
    this.listeners.get(event).forEach(callback => {
      try {
        callback(data)
      } catch (e) {
        console.error('WebSocket 事件回调错误', e)
      }
    })
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }
}

const wsClient = new WebSocketClient()
export default wsClient
