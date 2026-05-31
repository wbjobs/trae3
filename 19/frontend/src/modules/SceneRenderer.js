import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PIPELINE_COLORS } from '../../../shared/types.js';
import { isValidPipeline, isValidAnnotation, sanitizePipeline, sanitizeAnnotation } from '../../../shared/validators.js';

export class SceneRenderer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.pipelineGroups = {};
    this.annotationObjects = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.isAnimating = false;
    this.animationFrameId = null;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    
    this.cylinderGeometries = {};
    this.sphereGeometries = {};
    this.materials = {};
    
    this.MIN_DISTANCE = 2;
    this.MAX_DISTANCE = 300;
    this.MIN_POLAR_ANGLE = 0.1;
    this.MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
    
    this.init();
  }
  
  init() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createControls();
    this.createLights();
    this.createGround();
    this.createGrid();
    this.startAnimation();
    
    window.addEventListener('resize', () => this.onWindowResize());
  }
  
  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 150, 500);
  }
  
  createCamera() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.5, 1000);
    this.camera.position.set(60, 60, 60);
    this.camera.lookAt(0, -5, 0);
  }
  
  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);
  }
  
  createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = this.MIN_DISTANCE;
    this.controls.maxDistance = this.MAX_DISTANCE;
    this.controls.minPolarAngle = this.MIN_POLAR_ANGLE;
    this.controls.maxPolarAngle = this.MAX_POLAR_ANGLE;
    this.controls.zoomSpeed = 1.0;
    this.controls.rotateSpeed = 0.8;
    this.controls.panSpeed = 1.0;
    this.controls.target.set(0, -5, 0);
    
    this.controls.addEventListener('change', () => {
      this.clampCameraPosition();
    });
  }
  
  clampCameraPosition() {
    const distance = this.camera.position.length();
    if (distance < this.MIN_DISTANCE) {
      const direction = this.camera.position.clone().normalize();
      this.camera.position.copy(direction.multiplyScalar(this.MIN_DISTANCE));
    } else if (distance > this.MAX_DISTANCE) {
      const direction = this.camera.position.clone().normalize();
      this.camera.position.copy(direction.multiplyScalar(this.MAX_DISTANCE));
    }
  }
  
  createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(80, 120, 80);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -150;
    directionalLight.shadow.camera.right = 150;
    directionalLight.shadow.camera.top = 150;
    directionalLight.shadow.camera.bottom = -150;
    directionalLight.shadow.bias = -0.0001;
    this.scene.add(directionalLight);
    
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x2d3436, 0.3);
    this.scene.add(hemisphereLight);
  }
  
  createGround() {
    const groundGeometry = new THREE.PlaneGeometry(300, 300);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    ground.receiveShadow = true;
    this.scene.add(ground);
    
    this.plane.constant = 10;
  }
  
  createGrid() {
    const gridHelper = new THREE.GridHelper(300, 60, 0x444444, 0x333333);
    gridHelper.position.y = -9.9;
    this.scene.add(gridHelper);
  }
  
  getOrCreateCylinderGeometry(diameter, length) {
    const key = `${diameter.toFixed(2)}_${length.toFixed(2)}`;
    if (!this.cylinderGeometries[key]) {
      this.cylinderGeometries[key] = new THREE.CylinderGeometry(
        diameter / 2,
        diameter / 2,
        length,
        8
      );
    }
    return this.cylinderGeometries[key];
  }
  
  getOrCreateSphereGeometry(diameter) {
    const key = diameter.toFixed(2);
    if (!this.sphereGeometries[key]) {
      this.sphereGeometries[key] = new THREE.SphereGeometry(diameter / 1.5, 8, 8);
    }
    return this.sphereGeometries[key];
  }
  
  getOrCreateMaterial(type) {
    if (!this.materials[type]) {
      const color = PIPELINE_COLORS[type] || 0x888888;
      this.materials[type] = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.4,
        metalness: 0.6,
        transparent: true,
        opacity: 0.92,
      });
    }
    return this.materials[type];
  }
  
  createPipeline(pipelineData) {
    if (!isValidPipeline(pipelineData)) {
      console.warn('Invalid pipeline data, sanitizing:', pipelineData);
      pipelineData = sanitizePipeline(pipelineData);
    }
    
    const { type, points, diameter = 0.5 } = pipelineData;
    const material = this.getOrCreateMaterial(type);
    
    const group = new THREE.Group();
    group.userData = { ...pipelineData, isPipeline: true };
    group.matrixAutoUpdate = false;
    
    const curvePoints = points.map(p => new THREE.Vector3(p.x, p.y, p.z));
    
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const start = curvePoints[i];
      const end = curvePoints[i + 1];
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      
      if (length < 0.01) continue;
      
      const cylinderGeometry = this.getOrCreateCylinderGeometry(diameter, length);
      
      const cylinder = new THREE.Mesh(cylinderGeometry, material);
      
      const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      cylinder.position.copy(center);
      cylinder.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      );
      cylinder.castShadow = true;
      cylinder.receiveShadow = true;
      cylinder.matrixAutoUpdate = false;
      cylinder.updateMatrix();
      
      group.add(cylinder);
    }
    
    const sphereGeometry = this.getOrCreateSphereGeometry(diameter);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: PIPELINE_COLORS[type] || 0x888888,
      roughness: 0.3,
      metalness: 0.7,
      emissive: PIPELINE_COLORS[type] || 0x888888,
      emissiveIntensity: 0.15,
    });
    
    points.forEach((p) => {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(p.x, p.y, p.z);
      sphere.castShadow = true;
      sphere.matrixAutoUpdate = false;
      sphere.updateMatrix();
      group.add(sphere);
    });
    
    if (!this.pipelineGroups[type]) {
      this.pipelineGroups[type] = new THREE.Group();
      this.pipelineGroups[type].name = `pipeline_${type}`;
      this.scene.add(this.pipelineGroups[type]);
    }
    
    group.updateMatrix();
    this.pipelineGroups[type].add(group);
    return group;
  }
  
  createPipelinesBatch(pipelinesData) {
    const validPipelines = [];
    const invalidPipelines = [];
    
    pipelinesData.forEach((data, index) => {
      if (isValidPipeline(data)) {
        validPipelines.push(sanitizePipeline(data));
      } else {
        invalidPipelines.push({ index, data });
      }
    });
    
    if (invalidPipelines.length > 0) {
      console.warn(`Found ${invalidPipelines.length} invalid pipelines`);
    }
    
    validPipelines.forEach(pipeline => this.createPipeline(pipeline));
    
    return { valid: validPipelines.length, invalid: invalidPipelines.length };
  }
  
  createAnnotation(annotationData) {
    if (!isValidAnnotation(annotationData)) {
      console.warn('Invalid annotation data, sanitizing:', annotationData);
      annotationData = sanitizeAnnotation(annotationData);
    }
    
    const { x, y, z, name, content, type } = annotationData;
    
    const group = new THREE.Group();
    group.userData = { ...annotationData, isAnnotation: true };
    
    const markerGeometry = new THREE.ConeGeometry(0.4, 1.5, 6);
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6b6b,
      emissive: 0xff6b6b,
      emissiveIntensity: 0.4,
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.set(0, 1.5, 0);
    marker.rotation.x = Math.PI;
    marker.castShadow = true;
    group.add(marker);
    
    const sphereGeometry = new THREE.SphereGeometry(0.25, 12, 12);
    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff6b6b,
      emissiveIntensity: 0.6,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 0.25, 0);
    group.add(sphere);
    
    group.position.set(x, y, z);
    group.userData.baseY = y;
    
    this.annotationObjects.push(group);
    this.scene.add(group);
    return group;
  }
  
  createAnnotationsBatch(annotationsData) {
    const validAnnotations = [];
    const invalidAnnotations = [];
    
    annotationsData.forEach((data, index) => {
      if (isValidAnnotation(data)) {
        validAnnotations.push(sanitizeAnnotation(data));
      } else {
        invalidAnnotations.push({ index, data });
      }
    });
    
    if (invalidAnnotations.length > 0) {
      console.warn(`Found ${invalidAnnotations.length} invalid annotations`);
    }
    
    validAnnotations.forEach(annotation => this.createAnnotation(annotation));
    
    return { valid: validAnnotations.length, invalid: invalidAnnotations.length };
  }
  
  clearPipelines() {
    Object.keys(this.pipelineGroups).forEach((type) => {
      const group = this.pipelineGroups[type];
      while (group.children.length > 0) {
        const child = group.children[0];
        this.disposeObject(child);
        group.remove(child);
      }
    });
    
    Object.values(this.cylinderGeometries).forEach(geo => geo.dispose());
    Object.values(this.sphereGeometries).forEach(geo => geo.dispose());
    Object.values(this.materials).forEach(mat => mat.dispose());
    
    this.cylinderGeometries = {};
    this.sphereGeometries = {};
    this.materials = {};
  }
  
  clearAnnotations() {
    this.annotationObjects.forEach((obj) => {
      this.scene.remove(obj);
      this.disposeObject(obj);
    });
    this.annotationObjects = [];
  }
  
  disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry && child.geometry !== this.cylinderGeometries[Object.keys(this.cylinderGeometries)[0]]) {
        child.geometry.dispose();
      }
      if (child.material && !Object.values(this.materials).includes(child.material)) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
  
  toggleLayer(type, visible) {
    if (this.pipelineGroups[type]) {
      this.pipelineGroups[type].visible = visible;
    }
  }
  
  resetCamera() {
    this.camera.position.set(60, 60, 60);
    this.controls.target.set(0, -5, 0);
    this.camera.lookAt(0, -5, 0);
    this.controls.update();
  }
  
  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
  }
  
  getIntersects(event, objects) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.params.Line.threshold = 0.5;
    return this.raycaster.intersectObjects(objects, true);
  }
  
  screenToWorld(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    const vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vector.unproject(this.camera);
    
    const dir = vector.sub(this.camera.position).normalize();
    
    const targetY = 0;
    const distance = (targetY - this.camera.position.y) / dir.y;
    
    if (distance < 0 || distance > 1000) {
      return null;
    }
    
    const pos = this.camera.position.clone().add(dir.multiplyScalar(Math.max(0, distance)));
    
    return pos;
  }
  
  startAnimation() {
    if (this.isAnimating) return;
    this.isAnimating = true;
    
    this.perfMonitor = null;
    this.frustumCuller = null;
    
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      
      if (this.perfMonitor) this.perfMonitor.beginFrame();
      
      this.controls.update();
      this.clampCameraPosition();
      
      if (this.frustumCuller) this.frustumCuller.update();
      
      const time = Date.now() * 0.001;
      this.annotationObjects.forEach((obj, index) => {
        const marker = obj.children[0];
        if (marker) {
          marker.position.y = 1.5 + Math.sin(time * 2 + index * 0.5) * 0.15;
        }
      });
      
      this.renderer.render(this.scene, this.camera);
      
      if (this.perfMonitor) this.perfMonitor.endFrame();
    };
    
    animate();
  }
  
  setPerformanceMonitor(monitor) {
    this.perfMonitor = monitor;
  }
  
  setFrustumCuller(culler) {
    this.frustumCuller = culler;
  }
  
  stopAnimation() {
    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  destroy() {
    this.stopAnimation();
    this.clearPipelines();
    this.clearAnnotations();
    this.renderer.dispose();
    this.controls.dispose();
    
    if (this.renderer.domElement.parentNode) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
