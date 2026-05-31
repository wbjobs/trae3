class SceneRenderer {
  constructor(container) {
    this.container = container;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.strataMeshes = [];
    this.pointClouds = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.ambientLight = null;
    this.directionalLight = null;
    this.gridHelper = null;

    this.needsRender = true;
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsTime = performance.now();
    this.fpsUpdateInterval = 500;
    this.onFpsUpdate = null;

    this.adaptiveQuality = true;
    this.currentQuality = 'high';
    this.qualityLevels = {
      high: { pixelRatio: window.devicePixelRatio, shadowMap: true, antialias: true },
      medium: { pixelRatio: Math.min(window.devicePixelRatio, 1.5), shadowMap: true, antialias: true },
      low: { pixelRatio: 1, shadowMap: false, antialias: false },
    };

    this.clippingPlanes = [];
    this.clippingEnabled = false;
    this.localClippingEnabled = false;

    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 300, 800);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    this.camera.position.set(150, 200, 250);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.setupGrid();
    this.setupAxes();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(100, 200, 100);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 1000;
    this.scene.add(this.directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x2d5016, 0.3);
    this.scene.add(hemisphereLight);
  }

  setupGrid() {
    const gridSize = 400;
    const gridDivisions = 40;
    this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
    this.gridHelper.position.y = -0.5;
    this.scene.add(this.gridHelper);

    const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x16213e,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const groundPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.5;
    groundPlane.receiveShadow = true;
    this.scene.add(groundPlane);
  }

  setupAxes() {
    const axesGroup = new THREE.Group();
    const axisLength = 30;
    const axisMaterialX = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const axisMaterialY = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const axisMaterialZ = new THREE.LineBasicMaterial({ color: 0x0000ff });

    const xGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(axisLength, 0, 0),
    ]);
    const yGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, axisLength, 0),
    ]);
    const zGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, axisLength),
    ]);

    axesGroup.add(new THREE.Line(xGeom, axisMaterialX));
    axesGroup.add(new THREE.Line(yGeom, axisMaterialY));
    axesGroup.add(new THREE.Line(zGeom, axisMaterialZ));
    axesGroup.position.set(-180, 0, -180);
    this.scene.add(axesGroup);
  }

  markDirty() {
    this.needsRender = true;
  }

  updateFps() {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastFpsTime;
    if (elapsed >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsTime = now;
      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.fps);
      }
      if (this.adaptiveQuality) {
        this.adjustQuality(this.fps);
      }
    }
  }

  adjustQuality(fps) {
    let newQuality = this.currentQuality;
    if (fps < 20) {
      newQuality = 'low';
    } else if (fps < 40) {
      newQuality = 'medium';
    } else {
      newQuality = 'high';
    }

    if (newQuality !== this.currentQuality) {
      this.currentQuality = newQuality;
      this.applyQuality(newQuality);
    }
  }

  applyQuality(level) {
    const config = this.qualityLevels[level];
    if (!config) return;

    this.renderer.setPixelRatio(config.pixelRatio);
    this.renderer.shadowMap.enabled = config.shadowMap;

    this.directionalLight.castShadow = config.shadowMap;

    this.strataMeshes.forEach(group => {
      if (!group) return;
      group.traverse(child => {
        if (child.isMesh) {
          child.castShadow = config.shadowMap;
          child.receiveShadow = config.shadowMap;
        }
      });
    });

    this.markDirty();
  }

  setClippingPlanes(planes) {
    this.clippingPlanes = planes || [];
    this.clippingEnabled = this.clippingPlanes.length > 0;
    this.applyClippingToMaterials();
    this.markDirty();
  }

  applyClippingToMaterials() {
    const planes = this.clippingEnabled ? this.clippingPlanes : [];
    this.strataMeshes.forEach(group => {
      if (!group) return;
      group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.clippingPlanes = planes;
          child.material.clipShadows = true;
          child.material.needsUpdate = true;
        }
      });
    });
    this.pointClouds.forEach(obj => {
      if (obj && obj.material) {
        obj.material.clippingPlanes = planes;
        obj.material.needsUpdate = true;
      }
    });
  }

  addStratumMesh(mesh) {
    this.strataMeshes.push(mesh);
    this.scene.add(mesh);
    if (this.clippingEnabled) {
      this.applyClippingToMaterials();
    }
    this.markDirty();
  }

  addPointCloud(points) {
    this.pointClouds.push(points);
    this.scene.add(points);
    if (this.clippingEnabled) {
      this.applyClippingToMaterials();
    }
    this.markDirty();
  }

  removeStratumMesh(stratumId) {
    const index = this.strataMeshes.findIndex(
      m => m.userData && m.userData.stratumId === stratumId
    );
    if (index !== -1) {
      const mesh = this.strataMeshes[index];
      this.scene.remove(mesh);
      this.strataMeshes.splice(index, 1);
      if (mesh.traverse) {
        mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else if (!this.isSharedMaterial(child.material)) {
              child.material.dispose();
            }
          }
        });
      }
      this.markDirty();
      return true;
    }
    return false;
  }

  isSharedMaterial(material) {
    return material && material._isShared;
  }

  clearStrata() {
    this.strataMeshes.forEach(m => this.scene.remove(m));
    this.pointClouds.forEach(p => this.scene.remove(p));
    this.strataMeshes = [];
    this.pointClouds = [];
    this.markDirty();
  }

  getStratumMesh(stratumId) {
    return this.strataMeshes.find(
      m => m.userData && m.userData.stratumId === stratumId
    );
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.markDirty();
  }

  getIntersects(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(this.strataMeshes, true);
  }

  render() {
    this.updateFps();
    if (this.needsRender || this.clippingEnabled) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }
  }

  forceRender() {
    this.needsRender = true;
    this.renderer.render(this.scene, this.camera);
  }

  getSceneStats() {
    let triangles = 0;
    let vertices = 0;
    let objects = 0;
    this.scene.traverse(obj => {
      objects++;
      if (obj.isMesh && obj.geometry) {
        const geo = obj.geometry;
        if (geo.index) {
          triangles += geo.index.count / 3;
        } else if (geo.attributes.position) {
          triangles += geo.attributes.position.count / 3;
        }
        if (geo.attributes.position) {
          vertices += geo.attributes.position.count;
        }
      }
    });
    return { triangles: Math.round(triangles), vertices, objects };
  }

  dispose() {
    this.renderer.dispose();
  }
}

window.SceneRenderer = SceneRenderer;
