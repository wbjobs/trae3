import * as THREE from 'three'

class ResourceOptimizer {
  constructor() {
    this.geometryCache = new Map()
    this.materialCache = new Map()
    this.lodObjects = new Map()
    this.disposed = false
  }

  getCachedGeometry(key, factory) {
    if (this.disposed) return factory()
    
    if (!this.geometryCache.has(key)) {
      this.geometryCache.set(key, factory())
    }
    return this.geometryCache.get(key)
  }

  getCachedMaterial(key, factory) {
    if (this.disposed) return factory()
    
    if (!this.materialCache.has(key)) {
      this.materialCache.set(key, factory())
    }
    return this.materialCache.get(key)
  }

  optimizeGeometry(geometry) {
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    
    if (geometry.index) {
      geometry.index.needsUpdate = false
    }
    
    Object.values(geometry.attributes).forEach(attr => {
      if (attr) attr.needsUpdate = false
    })
    
    return geometry
  }

  createLOD(object, distances = [5, 15, 30]) {
    const lod = new THREE.LOD()
    
    const highDetail = object.clone()
    lod.addLevel(highDetail, distances[0])
    
    const mediumDetail = this.simplifyObject(object, 0.7)
    lod.addLevel(mediumDetail, distances[1])
    
    const lowDetail = this.createBillboard(object)
    lod.addLevel(lowDetail, distances[2])
    
    this.lodObjects.set(object.uuid, lod)
    
    return lod
  }

  simplifyObject(object, quality = 0.5) {
    const simplified = object.clone()
    
    simplified.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry
        
        if (geo.type === 'CylinderGeometry' || geo.type === 'BoxGeometry') {
          child.material = child.material.clone()
          child.material.wireframe = quality < 0.5
        }
      }
    })
    
    return simplified
  }

  createBillboard(object) {
    const box = new THREE.Box3().setFromObject(object)
    const size = new THREE.Vector3()
    box.getSize(size)
    
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    
    ctx.fillStyle = 'rgba(100, 150, 200, 0.8)'
    ctx.fillRect(32, 32, 64, 64)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(32, 32, 64, 64)
    
    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    
    sprite.scale.set(size.x, size.y, 1)
    
    return sprite
  }

  createInstancedMesh(geometry, material, count) {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return instancedMesh
  }

  batchDispose(object) {
    object.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) {
          child.geometry.dispose()
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        }
      }
    })
  }

  clearCache() {
    this.geometryCache.forEach(geo => geo.dispose())
    this.geometryCache.clear()
    
    this.materialCache.forEach(mat => {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    })
    this.materialCache.clear()
    
    this.lodObjects.clear()
  }

  dispose() {
    this.disposed = true
    this.clearCache()
  }

  static getSharedMaterials() {
    return {
      metal: new THREE.MeshStandardMaterial({
        color: 0x4a5568,
        metalness: 0.8,
        roughness: 0.3
      }),
      plastic: new THREE.MeshStandardMaterial({
        color: 0x2d3748,
        metalness: 0.3,
        roughness: 0.7
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.5
      }),
      ledGreen: new THREE.MeshStandardMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5
      }),
      ledRed: new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5
      })
    }
  }
}

export default new ResourceOptimizer()
export { ResourceOptimizer }
