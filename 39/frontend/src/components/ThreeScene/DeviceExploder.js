import * as THREE from 'three'

class DeviceExploder {
  constructor() {
    this.explodedDevices = new Map()
    this.animationProgress = new Map()
    this.partInfo = new Map()
    this.highlightedPart = null
  }

  registerDevice(deviceId, group) {
    const parts = []
    
    group.traverse((child) => {
      if (child.isMesh || child.isGroup) {
        const originalPosition = child.position.clone()
        const originalRotation = child.rotation.clone()
        
        parts.push({
          id: child.uuid,
          name: child.name || child.userData.partName || `部件_${parts.length}`,
          object: child,
          originalPosition,
          originalRotation,
          explodedPosition: this.calculateExplodedPosition(child, parts.length),
          info: child.userData.partInfo || this.generatePartInfo(child, parts.length)
        })
      }
    })
    
    this.explodedDevices.set(deviceId, {
      group,
      parts,
      isExploded: false,
      targetProgress: 0,
      currentProgress: 0
    })
    
    return parts
  }

  calculateExplodedPosition(child, index) {
    const direction = new THREE.Vector3(
      Math.sin(index * 0.8) * 2,
      Math.sin(index * 0.5) * 1.5 + 1,
      Math.cos(index * 0.8) * 2
    )
    return direction
  }

  generatePartInfo(child, index) {
    const types = ['电机组件', '传动机构', '控制系统', '传感器模块', '机械结构', '液压系统']
    const descriptions = [
      '高精度伺服驱动，额定功率2.5kW',
      '精密齿轮传动系统，减速比1:50',
      'PLC控制单元，支持16路IO',
      '高精度位置/温度传感器',
      '高强度铝合金结构件',
      '紧凑型液压驱动模块'
    ]
    
    return {
      type: types[index % types.length],
      description: descriptions[index % descriptions.length],
      weight: (Math.random() * 20 + 5).toFixed(1) + 'kg',
      manufacturer: '工业自动化',
      maintenanceDate: '2025-12-01'
    }
  }

  explodeDevice(deviceId, animate = true) {
    const deviceData = this.explodedDevices.get(deviceId)
    if (!deviceData) return false
    
    deviceData.targetProgress = 1
    
    if (!animate) {
      deviceData.currentProgress = 1
      this.applyExplosion(deviceData, 1)
    }
    
    deviceData.isExploded = true
    return true
  }

  assembleDevice(deviceId, animate = true) {
    const deviceData = this.explodedDevices.get(deviceId)
    if (!deviceData) return false
    
    deviceData.targetProgress = 0
    
    if (!animate) {
      deviceData.currentProgress = 0
      this.applyExplosion(deviceData, 0)
    }
    
    deviceData.isExploded = false
    return true
  }

  toggleExplode(deviceId) {
    const deviceData = this.explodedDevices.get(deviceId)
    if (!deviceData) return false
    
    if (deviceData.isExploded) {
      this.assembleDevice(deviceId)
    } else {
      this.explodeDevice(deviceId)
    }
    
    return !deviceData.isExploded
  }

  applyExplosion(deviceData, progress) {
    const easeProgress = this.easeInOutCubic(progress)
    
    deviceData.parts.forEach((part) => {
      const targetPos = part.originalPosition.clone().add(
        part.explodedPosition.clone().multiplyScalar(easeProgress)
      )
      
      part.object.position.lerp(targetPos, 0.1)
      
      if (easeProgress > 0.5) {
        part.object.rotation.y = easeProgress * Math.PI * 0.3
      }
    })
  }

  easeInOutCubic(t) {
    return t < 0.5 
      ? 4 * t * t * t 
      : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  update(delta) {
    this.explodedDevices.forEach((deviceData) => {
      if (deviceData.currentProgress !== deviceData.targetProgress) {
        const diff = deviceData.targetProgress - deviceData.currentProgress
        const speed = 2 * delta
        
        if (Math.abs(diff) < speed) {
          deviceData.currentProgress = deviceData.targetProgress
        } else {
          deviceData.currentProgress += Math.sign(diff) * speed
        }
        
        this.applyExplosion(deviceData, deviceData.currentProgress)
      }
    })
  }

  highlightPart(deviceId, partId) {
    const deviceData = this.explodedDevices.get(deviceId)
    if (!deviceData) return null
    
    if (this.highlightedPart) {
      this.restorePartMaterial(this.highlightedPart)
    }
    
    const part = deviceData.parts.find(p => p.id === partId)
    if (part && part.object.isMesh) {
      this.highlightedPart = part
      
      if (!part.object.userData.originalMaterial) {
        part.object.userData.originalMaterial = part.object.material.clone()
      }
      
      part.object.material = part.object.material.clone()
      part.object.material.emissive = new THREE.Color(0x00ff88)
      part.object.material.emissiveIntensity = 0.5
      
      return part.info
    }
    
    return null
  }

  restorePartMaterial(part) {
    if (part && part.object.userData.originalMaterial) {
      part.object.material.dispose()
      part.object.material = part.object.userData.originalMaterial
      part.object.userData.originalMaterial = null
    }
  }

  getPartsInfo(deviceId) {
    const deviceData = this.explodedDevices.get(deviceId)
    if (!deviceData) return []
    
    return deviceData.parts.map(part => ({
      id: part.id,
      name: part.name,
      info: part.info
    }))
  }

  isExploded(deviceId) {
    const deviceData = this.explodedDevices.get(deviceId)
    return deviceData ? deviceData.isExploded : false
  }

  dispose() {
    this.explodedDevices.clear()
    this.animationProgress.clear()
    this.partInfo.clear()
  }
}

export default new DeviceExploder()
export { DeviceExploder }
