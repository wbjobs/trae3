import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function setupScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)
  scene.fog = new THREE.Fog(0x0a1628, 30, 80)
  
  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  )
  camera.position.set(25, 20, 25)
  
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true 
  })
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  container.appendChild(renderer.domElement)
  
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 5
  controls.maxDistance = 60
  controls.maxPolarAngle = Math.PI / 2.1
  controls.target.set(0, 2, 0)
  
  const ambientLight = new THREE.AmbientLight(0x404060, 0.5)
  scene.add(ambientLight)
  
  const mainLight = new THREE.DirectionalLight(0xffffff, 1.2)
  mainLight.position.set(20, 30, 20)
  mainLight.castShadow = true
  mainLight.shadow.mapSize.width = 2048
  mainLight.shadow.mapSize.height = 2048
  mainLight.shadow.camera.near = 0.5
  mainLight.shadow.camera.far = 100
  mainLight.shadow.camera.left = -30
  mainLight.shadow.camera.right = 30
  mainLight.shadow.camera.top = 30
  mainLight.shadow.camera.bottom = -30
  scene.add(mainLight)
  
  const fillLight = new THREE.DirectionalLight(0x4080ff, 0.4)
  fillLight.position.set(-15, 15, -15)
  scene.add(fillLight)
  
  const pointLight1 = new THREE.PointLight(0x00aaff, 0.5, 30)
  pointLight1.position.set(-10, 8, -10)
  scene.add(pointLight1)
  
  const pointLight2 = new THREE.PointLight(0xff6600, 0.3, 25)
  pointLight2.position.set(15, 5, 10)
  scene.add(pointLight2)
  
  const gridHelper = new THREE.GridHelper(60, 60, 0x1a365d, 0x0d1b2a)
  gridHelper.position.y = 0.01
  scene.add(gridHelper)
  
  const floorGeometry = new THREE.PlaneGeometry(60, 60)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d1b2a,
    metalness: 0.8,
    roughness: 0.4
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  
  const factoryGeometry = new THREE.BoxGeometry(60, 12, 60)
  const factoryEdges = new THREE.EdgesGeometry(factoryGeometry)
  const factoryLine = new THREE.LineSegments(
    factoryEdges,
    new THREE.LineBasicMaterial({ color: 0x1a365d, transparent: true, opacity: 0.3 })
  )
  factoryLine.position.y = 6
  scene.add(factoryLine)
  
  const handleResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', handleResize)
  
  return {
    scene,
    camera,
    renderer,
    controls,
    dispose: () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }
}

export function updateDeviceStatus(deviceGroup, status) {
  const statusColors = {
    running: 0x00ff00,
    stopped: 0xffaa00,
    fault: 0xff0000,
    idle: 0x00aaff
  }
  
  const color = statusColors[status] || 0x888888
  
  deviceGroup.traverse((child) => {
    if (child.userData && child.userData.isStatusLight) {
      child.material.color.setHex(color)
      child.material.emissive.setHex(color)
      child.material.emissiveIntensity = status === 'fault' ? 1 : 0.5
    }
  })
  
  if (status === 'fault') {
    deviceGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.emissive = child.material.emissive || new THREE.Color(0)
        child.material.emissive.setHex(0x330000)
        child.material.emissiveIntensity = 0.3
      }
    })
  } else {
    deviceGroup.traverse((child) => {
      if (child.isMesh && child.material && !child.userData?.isStatusLight) {
        if (child.material.emissive) {
          child.material.emissive.setHex(0x000000)
        }
      }
    })
  }
}

export function animateDevice(deviceGroup, type, delta) {
  if (!deviceGroup) return
  
  switch (type) {
    case 'conveyor':
      deviceGroup.traverse((child) => {
        if (child.geometry && child.geometry.type === 'CylinderGeometry' && child.rotation.z === Math.PI / 2) {
          child.rotation.x += delta * 3
        }
      })
      break
      
    case 'robot':
      const arm1 = deviceGroup.children.find(c => c.position.y === 1.45)
      const arm2 = deviceGroup.children.find(c => c.position.x === 0.6)
      if (arm1) arm1.rotation.z = Math.sin(Date.now() * 0.001) * 0.2
      if (arm2) arm2.rotation.z = -Math.PI / 4 + Math.sin(Date.now() * 0.0015) * 0.3
      break
      
    case 'cnc':
      const statusLight = deviceGroup.userData.statusLight
      if (statusLight) {
        statusLight.scale.setScalar(1 + Math.sin(Date.now() * 0.005) * 0.2)
      }
      break
      
    case 'agv':
      deviceGroup.position.x += Math.sin(Date.now() * 0.0005) * 0.01
      break
  }
}
