import * as THREE from 'three';
import { EventDispatcher } from 'three';
import { ObjectFactory } from './ObjectFactory.js';

const LOD_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  HIDDEN: 'hidden'
};

const LOD_DISTANCES = {
  [LOD_LEVELS.HIGH]: 50,
  [LOD_LEVELS.MEDIUM]: 150,
  [LOD_LEVELS.LOW]: 300,
  [LOD_LEVELS.HIDDEN]: Infinity
};

const ELEVATION_LAYERS = [-100, -200, -300, -400, -500];

export class LazyLoader extends EventDispatcher {
  constructor(scene, camera, options = {}) {
    super();

    this.scene = scene;
    this.camera = camera;

    this.options = {
      enabled: true,
      updateInterval: 1,
      maxLoadsPerFrame: 5,
      useRequestIdleCallback: true,
      enableFrustumCulling: true,
      enableLOD: true,
      enableLayerLoading: true,
      adjacentLayerPreload: true,
      geometryPoolSize: 50,
      ...options
    };

    this.registeredObjects = new Map();
    this.layerObjects = new Map();
    this.layerConfigs = new Map();
    this.activeLayers = new Set();
    this.loadingQueue = [];
    this.loadingPromises = new Map();
    this.geometryPool = [];
    this.loadStateCache = new WeakMap();
    this.objectBoundingBoxes = new WeakMap();

    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.tempVector = new THREE.Vector3();
    this.tempBox = new THREE.Box3();

    this.frameCount = 0;
    this.lastCameraPosition = new THREE.Vector3();
    this.cameraVelocity = new THREE.Vector3();

    this.stats = {
      totalObjects: 0,
      loadedObjects: 0,
      culledObjects: 0,
      highDetailCount: 0,
      mediumDetailCount: 0,
      lowDetailCount: 0,
      hiddenCount: 0,
      layersLoaded: 0,
      layersUnloaded: 0,
      queueSize: 0
    };

    this._initElevationLayers();
    this._initGeometryPool();
  }

  _initElevationLayers() {
    ELEVATION_LAYERS.forEach(elev => {
      const layerId = `elevation_${elev}m`;
      this.layerConfigs.set(layerId, {
        type: 'elevation',
        value: elev,
        loaded: false,
        loading: false,
        priority: 0
      });
      this.layerObjects.set(layerId, new Set());
    });
  }

  _initGeometryPool() {
    for (let i = 0; i < this.options.geometryPoolSize; i++) {
      this.geometryPool.push({
        geometry: null,
        available: true,
        lastUsed: 0
      });
    }
  }

  registerObject(object, data = {}) {
    if (!object || !object.isObject3D) {
      console.warn('Invalid object for lazy loading');
      return null;
    }

    const id = object.uuid || THREE.MathUtils.generateUUID();
    
    if (this.registeredObjects.has(id)) {
      return this.registeredObjects.get(id);
    }

    const objectData = {
      id,
      object,
      data,
      layerId: data.layerId || this._getElevationLayerId(object),
      diameter: data.diameter || this._getObjectDiameter(object),
      bounds: this._computeBoundingBox(object),
      currentLOD: LOD_LEVELS.HIDDEN,
      targetLOD: LOD_LEVELS.HIDDEN,
      isInFrustum: false,
      distance: Infinity,
      screenPosition: new THREE.Vector2(),
      priority: 0,
      loaded: false,
      loading: false,
      lastUpdate: 0
    };

    this.registeredObjects.set(id, objectData);
    this.stats.totalObjects++;

    if (objectData.layerId) {
      this._addObjectToLayer(objectData, objectData.layerId);
    }

    object.userData.lazyLoaderId = id;
    object.visible = false;

    return objectData;
  }

  registerObjectsByLayer(layerId, objects) {
    if (!Array.isArray(objects)) {
      objects = [objects];
    }

    const results = [];
    objects.forEach(object => {
      const data = object.userData?.lazyData || {};
      data.layerId = layerId;
      const result = this.registerObject(object, data);
      if (result) results.push(result);
    });

    return results;
  }

  setActiveLayers(layerIds) {
    if (!Array.isArray(layerIds)) {
      layerIds = [layerIds];
    }

    this.activeLayers.clear();
    layerIds.forEach(id => {
      if (this.layerConfigs.has(id)) {
        this.activeLayers.add(id);
        const config = this.layerConfigs.get(id);
        config.priority = 10;
        
        if (!config.loaded && !config.loading) {
          this._loadLayer(id);
        }
      }
    });

    if (this.options.adjacentLayerPreload) {
      this._preloadAdjacentLayers();
    }

    this._updateLayerPriorities();
  }

  preloadLayer(layerId, callback) {
    const config = this.layerConfigs.get(layerId);
    if (!config) {
      console.warn(`Layer ${layerId} not found`);
      callback?.(false);
      return;
    }

    if (config.loaded) {
      callback?.(true);
      return;
    }

    const layerPromise = this._loadLayer(layerId);
    if (callback && layerPromise) {
      layerPromise.then(() => callback(true)).catch(() => callback(false));
    }
  }

  unloadLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.loaded = false;
    config.loading = false;

    const objects = this.layerObjects.get(layerId);
    if (objects) {
      objects.forEach(objectData => {
        this._unloadObject(objectData);
      });
    }

    this.stats.layersUnloaded++;
    this.dispatchEvent({
      type: 'layerUnloaded',
      layerId,
      config
    });
  }

  update() {
    if (!this.options.enabled) return;

    this.frameCount++;
    if (this.frameCount % this.options.updateInterval !== 0) return;

    this._updateCameraState();
    this._updateFrustum();

    this.registeredObjects.forEach(objectData => {
      this._updateObjectState(objectData);
    });

    if (this.options.enableLOD) {
      this._updateLODTransitions();
    }

    this._processLoadingQueue();
    this._updateStats();
  }

  getStats() {
    return { ...this.stats };
  }

  _getElevationLayerId(object) {
    const elevation = object.userData?.elevation ?? object.position.y;
    const layerElev = ELEVATION_LAYERS.reduce((closest, elev) => {
      return Math.abs(elev - elevation) < Math.abs(closest - elevation) ? elev : closest;
    }, ELEVATION_LAYERS[0]);
    return `elevation_${layerElev}m`;
  }

  _getObjectDiameter(object) {
    if (object.userData?.diameter) return object.userData.diameter;
    if (object.userData?.data?.diameter) return object.userData.data.diameter;
    
    const box = this._computeBoundingBox(object);
    if (box) {
      return box.getSize(this.tempVector).length();
    }
    return 1;
  }

  _computeBoundingBox(object) {
    if (this.objectBoundingBoxes.has(object)) {
      return this.objectBoundingBoxes.get(object);
    }

    const box = new THREE.Box3();
    try {
      box.setFromObject(object);
      this.objectBoundingBoxes.set(object, box);
    } catch (e) {
      box.setFromCenterAndSize(object.position, new THREE.Vector3(1, 1, 1));
    }
    
    return box;
  }

  _addObjectToLayer(objectData, layerId) {
    if (!this.layerObjects.has(layerId)) {
      this.layerObjects.set(layerId, new Set());
      this.layerConfigs.set(layerId, {
        type: 'custom',
        value: layerId,
        loaded: false,
        loading: false,
        priority: 0
      });
    }
    this.layerObjects.get(layerId).add(objectData);
  }

  _updateCameraState() {
    const currentPos = this.camera.position;
    this.cameraVelocity.subVectors(currentPos, this.lastCameraPosition);
    this.lastCameraPosition.copy(currentPos);

    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  _updateFrustum() {
    this.projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
  }

  _updateObjectState(objectData) {
    const { object, bounds } = objectData;

    objectData.distance = object.position.distanceTo(this.camera.position);

    if (this.options.enableFrustumCulling) {
      objectData.isInFrustum = this.frustum.intersectsBox(bounds);
    } else {
      objectData.isInFrustum = true;
    }

    this._computeScreenPosition(objectData);
    this._computePriority(objectData);
    objectData.targetLOD = this._determineTargetLOD(objectData);
  }

  _computeScreenPosition(objectData) {
    const { object, screenPosition } = objectData;
    this.tempVector.copy(object.position).project(this.camera);
    screenPosition.set(
      (this.tempVector.x + 1) / 2,
      (-this.tempVector.y + 1) / 2
    );
  }

  _computePriority(objectData) {
    const { distance, screenPosition, diameter, isInFrustum, layerId } = objectData;

    let priority = 0;

    const distanceFactor = Math.max(0, 1 - distance / 500);
    priority += distanceFactor * 50;

    if (isInFrustum) {
      const centerDistance = Math.sqrt(
        Math.pow(screenPosition.x - 0.5, 2) +
        Math.pow(screenPosition.y - 0.5, 2)
      );
      const centerFactor = Math.max(0, 1 - centerDistance * 2);
      priority += centerFactor * 30;
    } else {
      priority -= 20;
    }

    const sizeFactor = Math.min(1, diameter / 20);
    priority += sizeFactor * 15;

    const layerConfig = this.layerConfigs.get(layerId);
    if (layerConfig) {
      priority += layerConfig.priority;
    }

    if (this.activeLayers.has(layerId)) {
      priority += 20;
    }

    objectData.priority = priority;
  }

  _determineTargetLOD(objectData) {
    const { distance, isInFrustum } = objectData;

    if (!isInFrustum || distance > LOD_DISTANCES[LOD_LEVELS.LOW]) {
      return LOD_LEVELS.HIDDEN;
    }

    if (distance < LOD_DISTANCES[LOD_LEVELS.HIGH]) {
      return LOD_LEVELS.HIGH;
    } else if (distance < LOD_DISTANCES[LOD_LEVELS.MEDIUM]) {
      return LOD_LEVELS.MEDIUM;
    } else {
      return LOD_LEVELS.LOW;
    }
  }

  _updateLODTransitions() {
    const transitionQueue = [];

    this.registeredObjects.forEach(objectData => {
      if (objectData.currentLOD !== objectData.targetLOD) {
        transitionQueue.push(objectData);
      }
    });

    transitionQueue.sort((a, b) => b.priority - a.priority);

    const maxTransitions = Math.min(
      this.options.maxLoadsPerFrame,
      transitionQueue.length
    );

    for (let i = 0; i < maxTransitions; i++) {
      const objectData = transitionQueue[i];
      this._transitionLOD(objectData, objectData.targetLOD);
    }
  }

  _transitionLOD(objectData, targetLOD) {
    if (objectData.loading) return;
    if (objectData.currentLOD === targetLOD) return;

    const { object } = objectData;

    if (targetLOD === LOD_LEVELS.HIDDEN) {
      this._unloadObject(objectData);
      return;
    }

    objectData.loading = true;

    const performTransition = () => {
      try {
        this._applyLODLevel(objectData, targetLOD);
        objectData.currentLOD = targetLOD;
        objectData.loaded = true;
        objectData.loading = false;
        object.visible = true;

        this.dispatchEvent({
          type: 'objectLoaded',
          object,
          objectData,
          lodLevel: targetLOD
        });
      } catch (e) {
        console.error('LOD transition error:', e);
        objectData.loading = false;
      }
    };

    if (this.options.useRequestIdleCallback && 'requestIdleCallback' in window) {
      requestIdleCallback(performTransition, { timeout: 1000 });
    } else {
      performTransition();
    }
  }

  _applyLODLevel(objectData, lodLevel) {
    const { object, data } = objectData;

    if (object.userData?.isLOD || object.isLOD) {
      object.currentLevel = this._getLODIndex(lodLevel);
      return;
    }

    const points = data.points || object.userData?.points;
    const diameter = data.diameter || object.userData?.diameter || 5;
    const color = data.color || object.userData?.color || 0x4a90d9;

    this._removeObjectMeshes(object);

    if (points && points.length >= 2) {
      let newMesh;
      
      if (lodLevel === LOD_LEVELS.LOW) {
        newMesh = this._createLowDetailRepresentation(points, diameter, color);
      } else {
        newMesh = ObjectFactory.createPipe(points, diameter, color, lodLevel);
      }

      if (newMesh) {
        object.add(newMesh);
      }
    }
  }

  _createLowDetailRepresentation(points, diameter, color) {
    const curvePoints = points.map(p =>
      p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p)
    );

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const geometry = new THREE.TubeGeometry(curve, 16, diameter / 2, 4, false);

    const material = ObjectFactory.getOrCreateMaterial('pipeWireframe', {
      color,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false
    }, THREE.MeshBasicMaterial);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = true;
    mesh.userData.lowDetail = true;

    return mesh;
  }

  _removeObjectMeshes(object) {
    const toRemove = [];
    object.traverse(child => {
      if (child.isMesh || child.isLineSegments) {
        toRemove.push(child);
      }
    });

    toRemove.forEach(child => {
      object.remove(child);
      if (child.geometry) {
        this._returnGeometryToPool(child.geometry);
      }
    });
  }

  _returnGeometryToPool(geometry) {
    const poolEntry = this.geometryPool.find(e => e.available);
    if (poolEntry) {
      if (poolEntry.geometry) {
        poolEntry.geometry.dispose();
      }
      poolEntry.geometry = geometry;
      poolEntry.available = false;
      poolEntry.lastUsed = Date.now();
    } else {
      geometry.dispose();
    }
  }

  _getGeometryFromPool() {
    const poolEntry = this.geometryPool.find(e => e.available && e.geometry);
    if (poolEntry) {
      poolEntry.available = true;
      return poolEntry.geometry;
    }
    return null;
  }

  _unloadObject(objectData) {
    const { object } = objectData;
    
    this._removeObjectMeshes(object);
    object.visible = false;
    objectData.currentLOD = LOD_LEVELS.HIDDEN;
    objectData.loaded = false;

    this.dispatchEvent({
      type: 'objectUnloaded',
      object,
      objectData
    });
  }

  _loadLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config || config.loaded || config.loading) {
      return null;
    }

    config.loading = true;

    const layerObjects = this.layerObjects.get(layerId);
    if (!layerObjects || layerObjects.size === 0) {
      config.loaded = true;
      config.loading = false;
      this.stats.layersLoaded++;
      this.dispatchEvent({
        type: 'layerLoaded',
        layerId,
        config
      });
      return Promise.resolve();
    }

    const objects = Array.from(layerObjects);
    objects.sort((a, b) => b.priority - a.priority);

    const promise = new Promise((resolve) => {
      let loadedCount = 0;
      const totalObjects = objects.length;

      const loadNext = (index) => {
        if (index >= totalObjects) {
          config.loaded = true;
          config.loading = false;
          this.stats.layersLoaded++;
          this.dispatchEvent({
            type: 'layerLoaded',
            layerId,
            config
          });
          resolve();
          return;
        }

        const objectData = objects[index];
        if (objectData.isInFrustum || this.activeLayers.has(layerId)) {
          this._transitionLOD(objectData, objectData.targetLOD);
        }

        if (this.options.useRequestIdleCallback && 'requestIdleCallback' in window) {
          requestIdleCallback(() => loadNext(index + 1), { timeout: 500 });
        } else {
          setTimeout(() => loadNext(index + 1), 0);
        }
      };

      loadNext(0);
    });

    this.loadingPromises.set(layerId, promise);
    return promise;
  }

  _preloadAdjacentLayers() {
    const activeElevations = [];
    this.activeLayers.forEach(id => {
      const config = this.layerConfigs.get(id);
      if (config && config.type === 'elevation') {
        activeElevations.push(config.value);
      }
    });

    if (activeElevations.length === 0) return;

    const avgElevation = activeElevations.reduce((a, b) => a + b, 0) / activeElevations.length;
    
    const moveDirection = this.cameraVelocity.y;
    const predictedElevation = avgElevation + (moveDirection * 100);

    const adjacentElevations = ELEVATION_LAYERS.filter(elev => {
      const diff = Math.abs(elev - predictedElevation);
      return diff <= 100 && !this.activeLayers.has(`elevation_${elev}m`);
    });

    adjacentElevations.forEach(elev => {
      const layerId = `elevation_${elev}m`;
      const config = this.layerConfigs.get(layerId);
      if (config && !config.loaded && !config.loading) {
        config.priority = 5;
        this._loadLayer(layerId);
      }
    });
  }

  _updateLayerPriorities() {
    const cameraElevation = this.camera.position.y;

    this.layerConfigs.forEach((config, layerId) => {
      if (config.type === 'elevation') {
        const distance = Math.abs(config.value - cameraElevation);
        config.priority = Math.max(0, 10 - distance / 50);
      }
    });
  }

  _processLoadingQueue() {
    const queue = [];
    this.registeredObjects.forEach(objectData => {
      if (!objectData.loaded && !objectData.loading && objectData.isInFrustum) {
        queue.push(objectData);
      }
    });

    queue.sort((a, b) => b.priority - a.priority);
    this.loadingQueue = queue;
    this.stats.queueSize = queue.length;

    const maxLoads = Math.min(this.options.maxLoadsPerFrame, queue.length);
    for (let i = 0; i < maxLoads; i++) {
      const objectData = queue[i];
      this._transitionLOD(objectData, objectData.targetLOD);
    }
  }

  _getLODIndex(lodLevel) {
    switch (lodLevel) {
      case LOD_LEVELS.HIGH: return 0;
      case LOD_LEVELS.MEDIUM: return 1;
      case LOD_LEVELS.LOW: return 2;
      default: return 2;
    }
  }

  _updateStats() {
    let high = 0, medium = 0, low = 0, hidden = 0, culled = 0, loaded = 0;

    this.registeredObjects.forEach(objectData => {
      if (!objectData.isInFrustum) culled++;
      if (objectData.loaded) loaded++;

      switch (objectData.currentLOD) {
        case LOD_LEVELS.HIGH: high++; break;
        case LOD_LEVELS.MEDIUM: medium++; break;
        case LOD_LEVELS.LOW: low++; break;
        case LOD_LEVELS.HIDDEN: hidden++; break;
      }
    });

    this.stats.loadedObjects = loaded;
    this.stats.culledObjects = culled;
    this.stats.highDetailCount = high;
    this.stats.mediumDetailCount = medium;
    this.stats.lowDetailCount = low;
    this.stats.hiddenCount = hidden;
  }

  dispose() {
    this.registeredObjects.forEach(objectData => {
      this._unloadObject(objectData);
    });

    this.geometryPool.forEach(entry => {
      if (entry.geometry) {
        entry.geometry.dispose();
      }
    });

    this.registeredObjects.clear();
    this.layerObjects.clear();
    this.layerConfigs.clear();
    this.activeLayers.clear();
    this.loadingQueue = [];
    this.loadingPromises.clear();
    this.geometryPool = [];
    this.objectBoundingBoxes = new WeakMap();
    this.loadStateCache = new WeakMap();
  }
}

export default LazyLoader;
