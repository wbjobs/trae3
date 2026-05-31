class UserManager {
  constructor() {
    this.users = new Map()
  }

  addUser(userId, userName, socketId) {
    const user = {
      id: userId,
      name: userName,
      socketId,
      selectedDevice: null,
      connectedAt: Date.now()
    }
    
    this.users.set(userId, user)
    console.log(`👤 用户上线: ${userName} (${userId})`)
    return user
  }

  removeUser(userId) {
    const user = this.users.get(userId)
    if (user) {
      this.users.delete(userId)
      console.log(`👤 用户下线: ${user.name} (${userId})`)
    }
  }

  getUser(userId) {
    return this.users.get(userId)
  }

  getAllUsers() {
    return Array.from(this.users.values())
  }

  getUserCount() {
    return this.users.size
  }

  setSelectedDevice(userId, deviceId) {
    const user = this.users.get(userId)
    if (user) {
      user.selectedDevice = deviceId
      return user
    }
    return null
  }

  getSelectedDevice(userId) {
    const user = this.users.get(userId)
    return user ? user.selectedDevice : null
  }

  getUsersByDevice(deviceId) {
    return Array.from(this.users.values()).filter(
      user => user.selectedDevice === deviceId
    )
  }

  broadcastToDevice(deviceId, event, data) {
    const users = this.getUsersByDevice(deviceId)
    users.forEach(user => {
      if (user.socketId) {
        this.io?.to(user.socketId).emit(event, data)
      }
    })
  }

  setIO(io) {
    this.io = io
  }
}

export default UserManager
