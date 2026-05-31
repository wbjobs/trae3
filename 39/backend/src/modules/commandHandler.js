class CommandHandler {
  constructor(db, io) {
    this.db = db
    this.io = io
    this.commandHistory = []
    
    this.commandValidators = {
      start: this._validateStart,
      stop: this._validateStop,
      reset: this._validateReset,
      setSpeed: this._validateSetSpeed,
      setMode: this._validateSetMode
    }
    
    this.commandExecutors = {
      start: this._executeStart,
      stop: this._executeStop,
      reset: this._executeReset,
      setSpeed: this._executeSetSpeed,
      setMode: this._executeSetMode
    }
  }

  execute(deviceId, command, params = {}) {
    const device = this.db.getDevice(deviceId)
    
    if (!device) {
      return {
        success: false,
        deviceId,
        command,
        error: '设备不存在'
      }
    }
    
    const validator = this.commandValidators[command]
    if (validator && !validator.call(this, device, params)) {
      return {
        success: false,
        deviceId,
        command,
        error: '参数验证失败'
      }
    }
    
    const executor = this.commandExecutors[command]
    if (executor) {
      return executor.call(this, deviceId, device, params)
    }
    
    return {
      success: false,
      deviceId,
      command,
      error: '未知指令'
    }
  }

  _validateStart(device, params) {
    return device.status !== 'fault'
  }

  _validateStop(device, params) {
    return device.status === 'running'
  }

  _validateReset(device, params) {
    return true
  }

  _validateSetSpeed(device, params) {
    return params.speed !== undefined && 
           params.speed >= 0 && 
           params.speed <= 100
  }

  _validateSetMode(device, params) {
    return ['auto', 'manual', 'maintenance'].includes(params.mode)
  }

  _executeStart(deviceId, device, params) {
    const updatedDevice = this.db.updateDevice(deviceId, {
      status: 'running',
      speed: device.speed || 50
    })
    
    this._recordHistory(deviceId, 'start', params)
    
    return {
      success: true,
      deviceId,
      command: 'start',
      message: '设备启动成功',
      device: updatedDevice
    }
  }

  _executeStop(deviceId, device, params) {
    const updatedDevice = this.db.updateDevice(deviceId, {
      status: 'stopped',
      speed: 0
    })
    
    this._recordHistory(deviceId, 'stop', params)
    
    return {
      success: true,
      deviceId,
      command: 'stop',
      message: '设备停止成功',
      device: updatedDevice
    }
  }

  _executeReset(deviceId, device, params) {
    const updatedDevice = this.db.updateDevice(deviceId, {
      status: 'idle',
      speed: 0,
      temperature: 25,
      mode: 'auto'
    })
    
    this._recordHistory(deviceId, 'reset', params)
    
    return {
      success: true,
      deviceId,
      command: 'reset',
      message: '设备重置成功',
      device: updatedDevice
    }
  }

  _executeSetSpeed(deviceId, device, params) {
    const updatedDevice = this.db.updateDevice(deviceId, {
      speed: params.speed
    })
    
    this._recordHistory(deviceId, 'setSpeed', params)
    
    return {
      success: true,
      deviceId,
      command: 'setSpeed',
      message: "速度已设置为 " + params.speed + "%",
      device: updatedDevice
    }
  }

  _executeSetMode(deviceId, device, params) {
    const updatedDevice = this.db.updateDevice(deviceId, {
      mode: params.mode
    })
    
    const modeNames = {
      auto: '自动模式',
      manual: '手动模式',
      maintenance: '维护模式'
    }
    
    this._recordHistory(deviceId, 'setMode', params)
    
    return {
      success: true,
      deviceId,
      command: 'setMode',
      message: "模式已切换为 " + modeNames[params.mode],
      device: updatedDevice
    }
  }

  _recordHistory(deviceId, command, params) {
    const record = {
      id: `cmd-${Date.now()}`,
      deviceId,
      command,
      params,
      timestamp: Date.now()
    }
    
    this.commandHistory.unshift(record)
    
    if (this.commandHistory.length > 1000) {
      this.commandHistory = this.commandHistory.slice(0, 1000)
    }
  }

  getHistory(deviceId = null) {
    if (deviceId) {
      return this.commandHistory.filter(h => h.deviceId === deviceId)
    }
    return this.commandHistory
  }

  clearHistory() {
    this.commandHistory = []
  }
}

export default CommandHandler
