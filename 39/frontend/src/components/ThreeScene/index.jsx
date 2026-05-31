import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { setupScene, updateDeviceStatus, animateDevice } from './SceneSetup'
import { createConveyorBelt, createRobotArm, createCNCMachine, createStorageShelf, createAGV } from './DeviceModels'
import useStore from '../../store/useStore'
import socketService from '../../services/socket'
import resourceOptimizer from './ResourceOptimizer'
import deviceExploder from './DeviceExploder'

const deviceConfigs = [
  { id: 'conveyor-1', type: 'conveyor', name: '主传送带', position: [0, 0.8, 0], rotation: [0, 0, 0], length: 12 },
  { id: 'conveyor-2', type: 'conveyor', name: '分拣传送带', position: [-8, 0.8, 5], rotation: [0, Math.PI / 2], length: 8 },
  { id: 'robot-1', type: 'robot', name: '机械臂A', position: [5, 0, 0] },
  { id: 'cnc-1', type: 'cnc', name: 'CNC机床1', position: [-5, 0, -6], rotation: [0, Math.PI / 4] },
  { id: 'cnc-2', type: 'cnc', name: 'CNC机床2', position: [-8, 0, 6], rotation: [0, -Math.PI / 4] },
  { id: 'shelf-1', type: 'shelf', name: '货架A', position: [8, 0, -8] },
  { id: 'shelf-2', type: 'shelf', name: '货架B', position: [8, 0, 8] },
  { id: 'agv-1', type: 'agv', name: 'AGV小车', position: [3, 0, 3] },
]

export default function ThreeScene() {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const devicesRef = useRef({})
  const selectedDeviceMeshesRef = useRef(new Map())
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const clockRef = useRef(new THREE.Clock())
  const animationIdRef = useRef(null)
  const devicesDataRef = useRef({})
  const selectedDeviceRef = useRef(null)
  
  const selectedDevice = useStore(state => state.selectedDevice)
  const devices = useStore(state => state.devices)
  const setSelectedDevice = useStore(state => state.setSelectedDevice)

  useEffect(() => {
    devicesDataRef.current = devices
  }, [devices])

  useEffect(() => {
    selectedDeviceRef.current = selectedDevice
  }, [selectedDevice])

  const createDeviceModels = useCallback((scene) => {
    deviceConfigs.forEach(config => {
      let deviceGroup
      
      switch (config.type) {
        case 'conveyor':
          deviceGroup = createConveyorBelt(config.position, config.rotation, config.length)
          break
        case 'robot':
          deviceGroup = createRobotArm(config.position, config.rotation)
          break
        case 'cnc':
          deviceGroup = createCNCMachine(config.position, config.rotation)
          break
        case 'shelf':
          deviceGroup = createStorageShelf(config.position, config.rotation)
          break
        case 'agv':
          deviceGroup = createAGV(config.position, config.rotation)
          break
        default:
          return
      }
      
      deviceGroup.userData.deviceId = config.id
      deviceGroup.userData.deviceType = config.type
      deviceGroup.userData.deviceName = config.name
      
      deviceGroup.traverse((child) => {
        if (child.isMesh && child.geometry) {
          resourceOptimizer.optimizeGeometry(child.geometry)
        }
      })
      
      scene.add(deviceGroup)
      devicesRef.current[config.id] = deviceGroup
      
      deviceExploder.registerDevice(config.id, deviceGroup)
      
      deviceGroup.traverse((child) => {
        if (child.isMesh) {
          child.userData.deviceId = config.id
          selectedDeviceMeshesRef.current.set(child.uuid, config.id)
        }
      })
    })
  }, [])

  const handleClick = useCallback((event) => {
    if (!containerRef.current || !sceneRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    raycasterRef.current.setFromCamera(mouseRef.current, sceneRef.current.camera)
    
    const meshes = []
    Object.values(devicesRef.current).forEach(group => {
      group.traverse((child) => {
        if (child.isMesh) meshes.push(child)
      })
    })
    
    const intersects = raycasterRef.current.intersectObjects(meshes)
    
    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object
      const deviceId = clickedMesh.userData.deviceId
      
      if (deviceId) {
        setSelectedDevice(deviceId)
        socketService.selectDevice(deviceId)
      }
    } else {
      setSelectedDevice(null)
    }
  }, [setSelectedDevice])

  useEffect(() => {
    if (!containerRef.current) return
    
    sceneRef.current = setupScene(containerRef.current)
    createDeviceModels(sceneRef.current.scene)
    
    containerRef.current.addEventListener('click', handleClick)
    
    const animate = () => {
      const delta = clockRef.current.getDelta()
      const currentDevices = devicesDataRef.current
      const currentSelected = selectedDeviceRef.current
      
      Object.entries(devicesRef.current).forEach(([id, group]) => {
        const deviceData = currentDevices[id]
        if (deviceData) {
          updateDeviceStatus(group, deviceData.status)
          if (deviceData.status === 'running') {
            animateDevice(group, group.userData.deviceType, delta)
          }
        }
      })
      
      Object.entries(devicesRef.current).forEach(([id, group]) => {
        group.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material.emissiveIntensity = child.material.emissiveIntensity || 0
            if (currentSelected === id) {
              if (!child.userData.originalEmissive) {
                child.userData.originalEmissive = child.material.emissive?.clone() || new THREE.Color(0)
              }
              child.material.emissive = new THREE.Color(0x0066ff)
              child.material.emissiveIntensity = 0.3
            } else if (!child.userData?.isStatusLight) {
              if (child.userData.originalEmissive) {
                child.material.emissive = child.userData.originalEmissive.clone()
                child.material.emissiveIntensity = 0
              }
            }
          }
        })
      })
      
      deviceExploder.update(delta)
      
      sceneRef.current.controls.update()
      sceneRef.current.renderer.render(
        sceneRef.current.scene,
        sceneRef.current.camera
      )
      
      animationIdRef.current = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      containerRef.current?.removeEventListener('click', handleClick)
      cancelAnimationFrame(animationIdRef.current)
      resourceOptimizer.dispose()
      deviceExploder.dispose()
      sceneRef.current?.dispose()
    }
  }, [createDeviceModels, handleClick])

  return (
    <div 
      ref={containerRef} 
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  )
}
