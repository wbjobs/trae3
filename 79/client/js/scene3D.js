import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const GEOMETRY_CACHE = new Map();
const MATERIAL_CACHE = new Map();

export class TankScene3D {
  constructor(container) {
    this.container = container;
    this.tanks = new Map();
    this.tankMeshes = new Map();
    this.liquidMeshes = new Map();
    this.cutPlanes = new Map();
    this.measurePoints = new Map();
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedTank = null;
    this.onTankSelect = null;
    this.onMeasurePointClick = null;
    this.isLoaded = false;
    this.isCutMode = false;
    this.cutAngle = 0;
    
    this.init();
  }

  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    this.scene.fog = new THREE.Fog(0x0a0a1a, 100, 300);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(80, 60, 100);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = Math.PI / 2.2;

    this.setupLights();
    this.createGround();
    this.createEnvironment();
    this.setupEventListeners();
    this.animate();
  }

  getOrCreateGeometry(key, factory) {
    if (!GEOMETRY_CACHE.has(key)) {
      GEOMETRY_CACHE.set(key, factory());
    }
    return GEOMETRY_CACHE.get(key);
  }

  getOrCreateMaterial(key, factory) {
    if (!MATERIAL_CACHE.has(key)) {
      MATERIAL_CACHE.set(key, factory());
    }
    return MATERIAL_CACHE.get(key);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d26, 0.3);
    this.scene.add(hemisphereLight);
  }

  createGround() {
    const groundGeometry = this.getOrCreateGeometry('ground', () => 
      new THREE.PlaneGeometry(400, 400)
    );
    
    const groundMaterial = this.getOrCreateMaterial('ground', () => 
      new THREE.MeshStandardMaterial({
        color: 0x1a2744,
        roughness: 0.8,
        metalness: 0.2
      })
    );
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(400, 40, 0x2a4a7a, 0x1a3a5a);
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);
  }

  createEnvironment() {
    const platformGeometry = this.getOrCreateGeometry('platform', () =>
      new THREE.BoxGeometry(150, 2, 80)
    );
    
    const platformMaterial = this.getOrCreateMaterial('platform', () =>
      new THREE.MeshStandardMaterial({
        color: 0x2a3a5a,
        roughness: 0.7,
        metalness: 0.3
      })
    );
    
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.set(0, -1, -20);
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);

    const buildingGeometry = this.getOrCreateGeometry('building', () =>
      new THREE.BoxGeometry(20, 25, 15)
    );
    
    const buildingMaterial = this.getOrCreateMaterial('building', () =>
      new THREE.MeshStandardMaterial({
        color: 0x3a4a6a,
        roughness: 0.6,
        metalness: 0.2
      })
    );
    
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building.position.set(-70, 12.5, 30);
    building.castShadow = true;
    building.receiveShadow = true;
    this.scene.add(building);
  }

  createOptimizedTank(tankData, lodLevel = 'high') {
    if (this.tanks.has(tankData.id)) {
      return this.tanks.get(tankData.id);
    }

    const group = new THREE.Group();
    group.position.set(tankData.position.x, tankData.position.y, tankData.position.z);
    group.userData = { tankId: tankData.id };

    const radius = tankData.diameter / 2;
    const height = tankData.height;
    const segments = lodLevel === 'high' ? 32 : (lodLevel === 'medium' ? 16 : 8);

    const tankGeometry = this.getOrCreateGeometry(`tank-body-${tankData.diameter}-${height}-${segments}`, () =>
      new THREE.CylinderGeometry(radius, radius, height, segments, 1, true)
    );

    const tankMaterial = new THREE.MeshStandardMaterial({
      color: tankData.color,
      roughness: 0.4,
      metalness: 0.6,
      side: THREE.DoubleSide
    });

    const tankBody = new THREE.Mesh(tankGeometry, tankMaterial);
    tankBody.position.y = height / 2;
    tankBody.castShadow = true;
    tankBody.receiveShadow = true;
    group.add(tankBody);

    const bottomGeometry = this.getOrCreateGeometry(`tank-bottom-${tankData.diameter}-${segments}`, () =>
      new THREE.CircleGeometry(radius, segments)
    );

    const bottomMaterial = new THREE.MeshStandardMaterial({
      color: tankData.color,
      roughness: 0.4,
      metalness: 0.6,
      side: THREE.DoubleSide
    });

    const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
    bottom.rotation.x = -Math.PI / 2;
    bottom.receiveShadow = true;
    group.add(bottom);

    const topGeometry = this.getOrCreateGeometry(`tank-top-${tankData.diameter}-${segments}`, () =>
      new THREE.CylinderGeometry(radius * 0.95, radius, 1, segments)
    );

    const topMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tankData.color).multiplyScalar(0.7),
      roughness: 0.3,
      metalness: 0.7
    });

    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = height + 0.5;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const liquidHeight = height * 0.5;
    const liquidGeometry = new THREE.CylinderGeometry(
      radius * 0.98,
      radius * 0.98,
      liquidHeight,
      segments
    );

    const liquidColor = this.getLiquidColor(tankData.type);
    const liquidMaterial = new THREE.MeshStandardMaterial({
      color: liquidColor,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
      metalness: 0.1
    });

    const liquid = new THREE.Mesh(liquidGeometry, liquidMaterial);
    liquid.position.y = liquidHeight / 2;
    group.add(liquid);

    this.createMeasurePoints(group, tankData, radius, height);

    this.tanks.set(tankData.id, group);
    this.tankMeshes.set(tankData.id, { body: tankBody, liquid, bottom, top });
    this.liquidMeshes.set(tankData.id, { liquid, height, radius });
    this.scene.add(group);

    return group;
  }

  createMeasurePoints(group, tankData, radius, height) {
    const points = [];
    
    const measureConfigs = [
      { id: 'level-top', name: '液位计-顶部', type: 'level', position: [radius * 0.8, height * 0.9, 0] },
      { id: 'level-mid', name: '液位计-中部', type: 'level', position: [radius * 0.8, height * 0.5, 0] },
      { id: 'level-bottom', name: '液位计-底部', type: 'level', position: [radius * 0.8, height * 0.1, 0] },
      { id: 'pressure-top', name: '压力传感器-顶部', type: 'pressure', position: [0, height * 0.95, radius * 0.8] },
      { id: 'temp-top', name: '温度传感器-上部', type: 'temperature', position: [-radius * 0.8, height * 0.7, 0] },
      { id: 'temp-bottom', name: '温度传感器-下部', type: 'temperature', position: [-radius * 0.8, height * 0.3, 0] },
      { id: 'thickness-top', name: '壁厚测点-上部', type: 'thickness', position: [0, height * 0.8, -radius * 0.95] },
      { id: 'thickness-bot', name: '壁厚测点-下部', type: 'thickness', position: [0, height * 0.2, -radius * 0.95] }
    ];

    measureConfigs.forEach(config => {
      const pointGroup = new THREE.Group();
      pointGroup.position.set(...config.position);
      pointGroup.userData = { 
        tankId: tankData.id,
        pointId: config.id,
        pointName: config.name,
        pointType: config.type,
        value: config.type === 'thickness' ? 12 + Math.random() * 3 : null
      };

      const sphereGeometry = new THREE.SphereGeometry(0.5, 8, 8);
      const colors = {
        level: 0x00d4ff,
        pressure: 0xff6b6b,
        temperature: 0xffd93d,
        thickness: 0x6bcb77
      };
      const sphereMaterial = new THREE.MeshBasicMaterial({ 
        color: colors[config.type] || 0xffffff
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      pointGroup.add(sphere);

      const ringGeometry = new THREE.RingGeometry(0.6, 0.8, 16);
      const ringMaterial = new THREE.MeshBasicMaterial({ 
        color: colors[config.type] || 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.lookAt(this.camera.position);
      pointGroup.add(ring);

      group.add(pointGroup);
      points.push(pointGroup);
    });

    this.measurePoints.set(tankData.id, points);
  }

  createTank(tankData) {
    return this.createOptimizedTank(tankData, 'high');
  }

  createTanksLazy(tanksData, batchSize = 2) {
    let index = 0;
    
    const createBatch = () => {
      const end = Math.min(index + batchSize, tanksData.length);
      for (let i = index; i < end; i++) {
        this.createOptimizedTank(tanksData[i], 'medium');
      }
      index = end;
      
      if (index < tanksData.length) {
        requestAnimationFrame(createBatch);
      } else {
        this.isLoaded = true;
      }
    };

    requestAnimationFrame(createBatch);
  }

  toggleCutMode(tankId, enable = true) {
    this.isCutMode = enable;
    const tank = this.tanks.get(tankId);
    if (!tank) return;

    if (enable) {
      const cutPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
      this.cutPlanes.set(tankId, cutPlane);
      
      const tankMeshes = this.tankMeshes.get(tankId);
      if (tankMeshes) {
        Object.values(tankMeshes).forEach(mesh => {
          if (mesh && mesh.material) {
            mesh.material.clippingPlanes = [cutPlane];
            mesh.material.clipShadows = true;
          }
        });
      }

      this.renderer.localClippingEnabled = true;
    } else {
      this.cutPlanes.delete(tankId);
      
      const tankMeshes = this.tankMeshes.get(tankId);
      if (tankMeshes) {
        Object.values(tankMeshes).forEach(mesh => {
          if (mesh && mesh.material) {
            mesh.material.clippingPlanes = [];
          }
        });
      }

      if (this.cutPlanes.size === 0) {
        this.renderer.localClippingEnabled = false;
      }
    }
  }

  rotateCutPlane(tankId, angle) {
    const cutPlane = this.cutPlanes.get(tankId);
    if (!cutPlane) return;
    
    this.cutAngle = angle;
    cutPlane.normal.set(Math.cos(angle), 0, Math.sin(angle)).normalize();
  }

  showThicknessLabels(tankId, show = true) {
    const points = this.measurePoints.get(tankId);
    if (!points) return;

    points.forEach(point => {
      if (point.userData.pointType === 'thickness') {
        point.visible = show;
      }
    });
  }

  getLiquidColor(type) {
    const colors = {
      '原油': 0x2d1f1a,
      '成品油': 0x8b4513,
      '化工原料': 0xff6347,
      '废水': 0x4a4a4a,
      '消防水': 0x4169e1
    };
    return colors[type] || 0x336699;
  }

  updateTankLevel(tankId, levelPercent) {
    const liquidData = this.liquidMeshes.get(tankId);
    if (!liquidData) return;

    const { liquid, height, radius } = liquidData;
    const newHeight = Math.max(0.1, height * (levelPercent / 100) * 0.95);

    liquid.scale.y = newHeight / (height * 0.5);
    liquid.position.y = newHeight / 2;
  }

  updateMeasurePointValue(tankId, pointType, value) {
    const points = this.measurePoints.get(tankId);
    if (!points) return;

    points.forEach(point => {
      if (point.userData.pointType === pointType) {
        point.userData.value = value;
      }
    });
  }

  highlightTank(tankId) {
    this.tanks.forEach((group, id) => {
      const meshData = this.tankMeshes.get(id);
      if (meshData && meshData.body.material) {
        meshData.body.material.emissive = new THREE.Color(
          id === tankId ? 0x00d4ff : 0x000000
        );
        meshData.body.material.emissiveIntensity = id === tankId ? 0.3 : 0;
      }
    });
    this.selectedTank = tankId;
  }

  setupEventListeners() {
    let clickTimeout = null;
    let isDragging = false;
    let startPos = { x: 0, y: 0 };

    this.renderer.domElement.addEventListener('mousedown', (event) => {
      startPos = { x: event.clientX, y: event.clientY };
      isDragging = false;
    });

    this.renderer.domElement.addEventListener('mousemove', (event) => {
      const deltaX = Math.abs(event.clientX - startPos.x);
      const deltaY = Math.abs(event.clientY - startPos.y);
      if (deltaX > 5 || deltaY > 5) {
        isDragging = true;
      }

      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      
      const allMeshes = [];
      this.tankMeshes.forEach((data) => {
        if (data.body) allMeshes.push(data.body);
      });
      this.measurePoints.forEach((points) => {
        points.forEach(p => allMeshes.push(p.children[0]));
      });

      const intersects = this.raycaster.intersectObjects(allMeshes);
      this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'grab';
    });

    this.renderer.domElement.addEventListener('click', (event) => {
      if (isDragging) return;

      clearTimeout(clickTimeout);
      clickTimeout = setTimeout(() => {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        const allMeshes = [];
        const meshToTank = new Map();
        
        this.tankMeshes.forEach((data, id) => {
          if (data.body) {
            allMeshes.push(data.body);
            meshToTank.set(data.body, { type: 'tank', id });
          }
        });

        this.measurePoints.forEach((points, tankId) => {
          points.forEach(p => {
            allMeshes.push(p.children[0]);
            meshToTank.set(p.children[0], { type: 'measurePoint', tankId, data: p.userData });
          });
        });

        const intersects = this.raycaster.intersectObjects(allMeshes);

        if (intersects.length > 0) {
          const clicked = intersects[0].object;
          const info = meshToTank.get(clicked);
          
          if (info) {
            if (info.type === 'tank' && this.onTankSelect) {
              this.onTankSelect(info.id);
            } else if (info.type === 'measurePoint' && this.onMeasurePointClick) {
              this.onMeasurePointClick(info.tankId, info.data);
            }
          }
        }
      }, 100);
    });

    window.addEventListener('resize', () => {
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.measurePoints.forEach((points) => {
      points.forEach(point => {
        if (point.visible && point.children[1]) {
          point.children[1].lookAt(this.camera.position);
        }
      });
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this.tanks.forEach(group => {
      group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });

    GEOMETRY_CACHE.clear();
    MATERIAL_CACHE.clear();
  }

  getStats() {
    return {
      tankCount: this.tanks.size,
      geometryCacheSize: GEOMETRY_CACHE.size,
      materialCacheSize: MATERIAL_CACHE.size,
      isLoaded: this.isLoaded,
      isCutMode: this.isCutMode
    };
  }
}
