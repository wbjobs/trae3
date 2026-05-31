import * as THREE from 'three'

export function createConveyorBelt(position, rotation = [0, 0, 0], length = 10) {
  const group = new THREE.Group()
  
  const frameGeometry = new THREE.BoxGeometry(0.8, 0.3, length)
  const frameMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a5568,
    metalness: 0.8,
    roughness: 0.3
  })
  const frame = new THREE.Mesh(frameGeometry, frameMaterial)
  frame.position.y = -0.15
  frame.castShadow = true
  frame.receiveShadow = true
  group.add(frame)
  
  const beltGeometry = new THREE.BoxGeometry(0.7, 0.05, length - 0.2)
  const beltMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.3,
    roughness: 0.8
  })
  const belt = new THREE.Mesh(beltGeometry, beltMaterial)
  belt.position.y = 0.025
  belt.castShadow = true
  belt.receiveShadow = true
  group.add(belt)
  
  const rollerGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 16)
  const rollerMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x718096,
    metalness: 0.9,
    roughness: 0.2
  })
  
  for (let i = 0; i < Math.floor(length / 2); i++) {
    const roller = new THREE.Mesh(rollerGeometry, rollerMaterial)
    roller.rotation.z = Math.PI / 2
    roller.position.set(0, -0.05, -length/2 + 1 + i * 2)
    roller.castShadow = true
    group.add(roller)
  }
  
  const legGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1)
  const legMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.7,
    roughness: 0.4
  })
  
  const legPositions = [
    [-0.35, -0.65, -length/2 + 0.5],
    [0.35, -0.65, -length/2 + 0.5],
    [-0.35, -0.65, length/2 - 0.5],
    [0.35, -0.65, length/2 - 0.5]
  ]
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial)
    leg.position.set(...pos)
    leg.castShadow = true
    group.add(leg)
  })
  
  group.position.set(...position)
  group.rotation.set(...rotation)
  group.userData.type = 'conveyor'
  
  return group
}

export function createRobotArm(position, rotation = [0, 0, 0]) {
  const group = new THREE.Group()
  
  const baseGeometry = new THREE.CylinderGeometry(0.6, 0.8, 0.3, 32)
  const baseMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xe53e3e,
    metalness: 0.7,
    roughness: 0.3
  })
  const base = new THREE.Mesh(baseGeometry, baseMaterial)
  base.position.y = 0.15
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)
  
  const joint1Geometry = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 16)
  const jointMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.8,
    roughness: 0.2
  })
  const joint1 = new THREE.Mesh(joint1Geometry, jointMaterial)
  joint1.position.y = 0.5
  joint1.castShadow = true
  group.add(joint1)
  
  const arm1Geometry = new THREE.BoxGeometry(0.2, 1.5, 0.2)
  const armMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xe53e3e,
    metalness: 0.6,
    roughness: 0.4
  })
  const arm1 = new THREE.Mesh(arm1Geometry, armMaterial)
  arm1.position.set(0, 1.45, 0)
  arm1.castShadow = true
  group.add(arm1)
  
  const joint2 = new THREE.Mesh(joint1Geometry, jointMaterial)
  joint2.position.y = 2.2
  joint2.castShadow = true
  group.add(joint2)
  
  const arm2Geometry = new THREE.BoxGeometry(0.15, 1.2, 0.15)
  const arm2 = new THREE.Mesh(arm2Geometry, armMaterial)
  arm2.position.set(0.6, 2.6, 0)
  arm2.rotation.z = -Math.PI / 4
  arm2.castShadow = true
  group.add(arm2)
  
  const gripperBaseGeometry = new THREE.SphereGeometry(0.15, 16, 16)
  const gripperMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a5568,
    metalness: 0.9,
    roughness: 0.1
  })
  const gripperBase = new THREE.Mesh(gripperBaseGeometry, gripperMaterial)
  gripperBase.position.set(1.2, 2.1, 0)
  gripperBase.castShadow = true
  group.add(gripperBase)
  
  const fingerGeometry = new THREE.BoxGeometry(0.05, 0.3, 0.03)
  const finger1 = new THREE.Mesh(fingerGeometry, gripperMaterial)
  finger1.position.set(1.35, 2.05, 0.08)
  finger1.castShadow = true
  group.add(finger1)
  
  const finger2 = new THREE.Mesh(fingerGeometry, gripperMaterial)
  finger2.position.set(1.35, 2.05, -0.08)
  finger2.castShadow = true
  group.add(finger2)
  
  group.position.set(...position)
  group.rotation.set(...rotation)
  group.userData.type = 'robot'
  
  return group
}

export function createCNCMachine(position, rotation = [0, 0, 0]) {
  const group = new THREE.Group()
  
  const bodyGeometry = new THREE.BoxGeometry(2, 1.8, 2.5)
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a365d,
    metalness: 0.5,
    roughness: 0.5
  })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = 0.9
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  
  const doorGeometry = new THREE.BoxGeometry(0.1, 1.4, 1.2)
  const doorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.7,
    roughness: 0.3,
    transparent: true,
    opacity: 0.3
  })
  const door = new THREE.Mesh(doorGeometry, doorMaterial)
  door.position.set(1.01, 1, 0)
  group.add(door)
  
  const frameGeometry = new THREE.BoxGeometry(0.05, 1.5, 1.3)
  const frameMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a5568,
    metalness: 0.8,
    roughness: 0.2
  })
  const frame = new THREE.Mesh(frameGeometry, frameMaterial)
  frame.position.set(1.03, 1, 0)
  group.add(frame)
  
  const panelGeometry = new THREE.BoxGeometry(0.3, 0.4, 0.6)
  const panelMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.6,
    roughness: 0.4
  })
  const panel = new THREE.Mesh(panelGeometry, panelMaterial)
  panel.position.set(-0.85, 1.8, 0)
  panel.castShadow = true
  group.add(panel)
  
  const screenGeometry = new THREE.PlaneGeometry(0.25, 0.15)
  const screenMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.3
  })
  const screen = new THREE.Mesh(screenGeometry, screenMaterial)
  screen.position.set(-0.7, 1.9, 0)
  screen.rotation.y = Math.PI / 2
  group.add(screen)
  
  const basePlateGeometry = new THREE.BoxGeometry(2.2, 0.2, 2.7)
  const basePlateMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a5568,
    metalness: 0.9,
    roughness: 0.1
  })
  const basePlate = new THREE.Mesh(basePlateGeometry, basePlateMaterial)
  basePlate.position.y = 0.1
  basePlate.receiveShadow = true
  group.add(basePlate)
  
  const statusGeometry = new THREE.SphereGeometry(0.08, 16, 16)
  const statusMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5
  })
  const statusLight = new THREE.Mesh(statusGeometry, statusMaterial)
  statusLight.position.set(0, 1.85, 1.1)
  statusLight.userData.isStatusLight = true
  group.add(statusLight)
  
  group.position.set(...position)
  group.rotation.set(...rotation)
  group.userData.type = 'cnc'
  group.userData.statusLight = statusLight
  
  return group
}

export function createStorageShelf(position, rotation = [0, 0, 0]) {
  const group = new THREE.Group()
  
  const shelfGeometry = new THREE.BoxGeometry(2, 0.05, 1)
  const shelfMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4a5568,
    metalness: 0.7,
    roughness: 0.3
  })
  
  for (let i = 0; i < 4; i++) {
    const shelf = new THREE.Mesh(shelfGeometry, shelfMaterial)
    shelf.position.y = 0.5 + i * 0.8
    shelf.castShadow = true
    shelf.receiveShadow = true
    group.add(shelf)
  }
  
  const legGeometry = new THREE.BoxGeometry(0.08, 3, 0.08)
  const legMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2d3748,
    metalness: 0.8,
    roughness: 0.2
  })
  
  const legPositions = [
    [-0.95, 1.5, -0.45],
    [0.95, 1.5, -0.45],
    [-0.95, 1.5, 0.45],
    [0.95, 1.5, 0.45]
  ]
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeometry, legMaterial)
    leg.position.set(...pos)
    leg.castShadow = true
    group.add(leg)
  })
  
  const boxGeometry = new THREE.BoxGeometry(0.4, 0.4, 0.4)
  const boxColors = [0xe53e3e, 0x38a169, 0x3182ce, 0xd69e2e, 0x805ad5]
  
  for (let i = 0; i < 6; i++) {
    const boxMaterial = new THREE.MeshStandardMaterial({ 
      color: boxColors[i % boxColors.length],
      metalness: 0.3,
      roughness: 0.7
    })
    const box = new THREE.Mesh(boxGeometry, boxMaterial)
    const shelfIndex = Math.floor(i / 2)
    const boxOffset = (i % 2) * 0.6 - 0.3
    box.position.set(boxOffset, 0.75 + shelfIndex * 0.8, 0)
    box.castShadow = true
    group.add(box)
  }
  
  group.position.set(...position)
  group.rotation.set(...rotation)
  group.userData.type = 'shelf'
  
  return group
}

export function createAGV(position, rotation = [0, 0, 0]) {
  const group = new THREE.Group()
  
  const bodyGeometry = new THREE.BoxGeometry(1.2, 0.4, 0.8)
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3182ce,
    metalness: 0.6,
    roughness: 0.4
  })
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
  body.position.y = 0.3
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)
  
  const wheelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16)
  const wheelMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a202c,
    metalness: 0.3,
    roughness: 0.8
  })
  
  const wheelPositions = [
    [0.5, 0.15, 0.35],
    [-0.5, 0.15, 0.35],
    [0.5, 0.15, -0.35],
    [-0.5, 0.15, -0.35]
  ]
  
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
    wheel.rotation.x = Math.PI / 2
    wheel.position.set(...pos)
    wheel.castShadow = true
    group.add(wheel)
  })
  
  const sensorGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 16)
  const sensorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xe53e3e,
    emissive: 0xe53e3e,
    emissiveIntensity: 0.3
  })
  const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial)
  sensor.position.set(0, 0.55, 0)
  group.add(sensor)
  
  const lightGeometry = new THREE.SphereGeometry(0.05, 16, 16)
  const lightMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5
  })
  const statusLight = new THREE.Mesh(lightGeometry, lightMaterial)
  statusLight.position.set(0.4, 0.5, 0.3)
  statusLight.userData.isStatusLight = true
  group.add(statusLight)
  
  group.position.set(...position)
  group.rotation.set(...rotation)
  group.userData.type = 'agv'
  group.userData.statusLight = statusLight
  
  return group
}
