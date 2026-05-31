import * as THREE from 'three';

export class SceneManager {
  constructor(container, options = {}) {
    this.container = container;
    this.performanceLevel = 'medium';
    
    this.options = {
      backgroundColor: 0x1a1a2e,
      fogEnabled: true,
      fogColor: 0x1a1a2e,
      fogNear: 100,
      fogFar: 1000,
      cameraFov: 75,
      cameraNear: 0.1,
      cameraFar: 2000,
      cameraPosition: new THREE.Vector3(100, 100, 100),
      cameraLookAt: new THREE.Vector3(0, 0, 0),
      enableShadow: true,
      ...options
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationId = null;
    this.animationCallbacks = [];
    this.clock = new THREE.Clock();
    this.isRunning = false;
    this.lights = {};

    this.init();
  }

  init() {
    this.createScene();
    this.createCamera();
    this.createRenderer();
    this.createLights();
    this.setupFog();
    this.setupResizeHandler();
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor);
  }

  createCamera() {
    const { clientWidth, clientHeight } = this.container;
    this.camera = new THREE.PerspectiveCamera(
      this.options.cameraFov,
      clientWidth / clientHeight,
      this.options.cameraNear,
      this.options.cameraFar
    );
    this.camera.position.copy(this.options.cameraPosition);
    this.camera.lookAt(this.options.cameraLookAt);
  }

  createRenderer() {
    const { clientWidth, clientHeight } = this.container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(clientWidth, clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    
    if (this.options.enableShadow) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.container.appendChild(this.renderer.domElement);
  }

  createLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);
    this.lights.ambient = ambientLight;

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(200, 300, 200);
    directionalLight.castShadow = this.options.enableShadow;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    this.scene.add(directionalLight);
    this.lights.directional = directionalLight;

    const pointLight1 = new THREE.PointLight(0xffffff, 0.5, 500);
    pointLight1.position.set(100, 100, 100);
    pointLight1.castShadow = false;
    this.scene.add(pointLight1);
    this.lights.point1 = pointLight1;

    const pointLight2 = new THREE.PointLight(0x88ccff, 0.3, 400);
    pointLight2.position.set(-100, 80, -100);
    pointLight2.castShadow = false;
    this.scene.add(pointLight2);
    this.lights.point2 = pointLight2;
  }

  setupFog() {
    if (this.options.fogEnabled) {
      this.scene.fog = new THREE.Fog(
        this.options.fogColor,
        this.options.fogNear,
        this.options.fogFar
      );
    }
  }

  setPerformanceMode(level) {
    const levels = ['low', 'medium', 'high', 'ultra'];
    if (!levels.includes(level)) {
      console.warn(`Invalid performance level: ${level}. Using 'medium'.`);
      level = 'medium';
    }

    this.performanceLevel = level;

    switch (level) {
      case 'low':
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.enabled = false;
        this.lights.directional.castShadow = false;
        this.lights.ambient.intensity = 0.6;
        this.lights.directional.intensity = 0.6;
        this.lights.point1.visible = false;
        this.lights.point2.visible = false;
        break;

      case 'medium':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
        this.renderer.shadowMap.enabled = this.options.enableShadow;
        this.lights.directional.castShadow = this.options.enableShadow;
        this.lights.directional.shadow.mapSize.set(1024, 1024);
        this.lights.ambient.intensity = 0.4;
        this.lights.directional.intensity = 0.8;
        this.lights.point1.visible = true;
        this.lights.point2.visible = true;
        break;

      case 'high':
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.shadowMap.enabled = true;
        this.lights.directional.castShadow = true;
        this.lights.directional.shadow.mapSize.set(2048, 2048);
        this.lights.ambient.intensity = 0.4;
        this.lights.directional.intensity = 1.0;
        this.lights.point1.visible = true;
        this.lights.point2.visible = true;
        break;

      case 'ultra':
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.lights.directional.castShadow = true;
        this.lights.directional.shadow.mapSize.set(4096, 4096);
        this.lights.ambient.intensity = 0.5;
        this.lights.directional.intensity = 1.2;
        this.lights.point1.visible = true;
        this.lights.point2.visible = true;
        this.lights.point1.castShadow = true;
        break;
    }

    this.lights.directional.shadow.needsUpdate = true;
  }

  getPerformanceMode() {
    return this.performanceLevel;
  }

  setBackgroundColor(color) {
    this.scene.background = new THREE.Color(color);
    if (this.scene.fog) {
      this.scene.fog.color = new THREE.Color(color);
    }
  }

  setFog(enabled, near, far, color) {
    if (enabled) {
      this.scene.fog = new THREE.Fog(
        color || this.options.fogColor,
        near || this.options.fogNear,
        far || this.options.fogFar
      );
    } else {
      this.scene.fog = null;
    }
  }

  add(object) {
    this.scene.add(object);
  }

  remove(object) {
    this.scene.remove(object);
  }

  clear() {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      if (child.isLight) {
        this.scene.remove(child);
      } else {
        this.scene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    }
    this.createLights();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    this.animate();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  animate() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.scene.traverse((object) => {
      if (object.isLOD) {
        object.update(this.camera);
      }
    });

    this.animationCallbacks.forEach(callback => {
      try {
        callback(delta, elapsed);
      } catch (e) {
        console.error('Animation callback error:', e);
      }
    });

    this.render();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  onAnimate(callback) {
    if (typeof callback === 'function') {
      this.animationCallbacks.push(callback);
      return () => {
        const index = this.animationCallbacks.indexOf(callback);
        if (index > -1) {
          this.animationCallbacks.splice(index, 1);
        }
      };
    }
    return () => {};
  }

  removeAnimationCallback(callback) {
    const index = this.animationCallbacks.indexOf(callback);
    if (index > -1) {
      this.animationCallbacks.splice(index, 1);
    }
  }

  clearAnimationCallbacks() {
    this.animationCallbacks = [];
  }

  setupResizeHandler() {
    this.handleResize = () => {
      const { clientWidth, clientHeight } = this.container;
      this.camera.aspect = clientWidth / clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(clientWidth, clientHeight);
    };
    window.addEventListener('resize', this.handleResize);
  }

  resize() {
    this.handleResize();
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }

    this.clear();
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationCallbacks = [];
    this.lights = {};
  }

  getScene() {
    return this.scene;
  }

  getCamera() {
    return this.camera;
  }

  getRenderer() {
    return this.renderer;
  }

  getDomElement() {
    return this.renderer ? this.renderer.domElement : null;
  }
}
