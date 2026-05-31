import * as THREE from 'three';
import { tunnels, pipes, fans, annotations, data as dataApi } from '../api';
import { DATA_FIELDS, DATA_DEFAULTS, TYPE_MAPPINGS } from '../utils/constants';
import workerManager, {
  simplifyPath,
  decimatePointCloud,
  calculateBounds,
  filterByDistance,
  processTunnels,
  processPipes,
  processAllData,
  terminateWorkers
} from '../workers';

class DataLoader {
  constructor(options = {}) {
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000;
    this.pageSize = options.pageSize || 100;
    this.useWebWorker = options.useWebWorker !== false;
    this.workerManager = this.useWebWorker ? workerManager : null;
    this.loadingPromises = new Map();
    this.onProgress = options.onProgress || null;
    this.defaultProcessOptions = options.processOptions || {
      simplify: true,
      simplifyTolerance: 0.5,
      decimate: false,
      decimateRatio: 0.3
    };
  }

  normalizePoint3D(point) {
    if (!point) {
      return { x: 0, y: 0, z: 0 };
    }
    if (Array.isArray(point)) {
      return {
        x: point[0] ?? 0,
        y: point[1] ?? 0,
        z: point[2] ?? 0
      };
    }
    return {
      x: point.x ?? point.X ?? 0,
      y: point.y ?? point.Y ?? 0,
      z: point.z ?? point.Z ?? 0
    };
  }

  normalizeTimeField(time) {
    if (!time) return null;
    if (time instanceof Date) return time;
    return new Date(time);
  }

  normalizeTunnelData(data) {
    if (!data) return null;
    const normalized = { ...DATA_DEFAULTS.TUNNEL, ...data };
    normalized.createTime = this.normalizeTimeField(normalized.createTime ?? normalized.createdAt);
    normalized.updateTime = this.normalizeTimeField(normalized.updateTime ?? normalized.updatedAt);
    delete normalized.createdAt;
    delete normalized.updatedAt;
    normalized.startPoint = this.normalizePoint3D(normalized.startPoint);
    normalized.endPoint = this.normalizePoint3D(normalized.endPoint);
    if (normalized.pathPoints && Array.isArray(normalized.pathPoints)) {
      normalized.pathPoints = normalized.pathPoints.map(p => this.normalizePoint3D(p));
    } else if (normalized.points && Array.isArray(normalized.points)) {
      normalized.pathPoints = normalized.points.map(p => this.normalizePoint3D(p));
      delete normalized.points;
    } else {
      normalized.pathPoints = [];
    }
    if (!this.validateTunnel(normalized)) {
      console.warn('Tunnel validation failed, data may be incomplete:', normalized.id);
    }
    return normalized;
  }

  normalizePipeData(data) {
    if (!data) return null;
    const normalized = { ...DATA_DEFAULTS.PIPE, ...data };
    normalized.createTime = this.normalizeTimeField(normalized.createTime ?? normalized.createdAt);
    normalized.updateTime = this.normalizeTimeField(normalized.updateTime ?? normalized.updatedAt);
    delete normalized.createdAt;
    delete normalized.updatedAt;
    normalized.startPoint = this.normalizePoint3D(normalized.startPoint);
    normalized.endPoint = this.normalizePoint3D(normalized.endPoint);
    if (normalized.points && Array.isArray(normalized.points)) {
      normalized.points = normalized.points.map(p => this.normalizePoint3D(p));
    } else if (normalized.pathPoints && Array.isArray(normalized.pathPoints)) {
      normalized.points = normalized.pathPoints.map(p => this.normalizePoint3D(p));
      delete normalized.pathPoints;
    } else {
      normalized.points = [];
    }
    if (!this.validatePipe(normalized)) {
      console.warn('Pipe validation failed, data may be incomplete:', normalized.id);
    }
    return normalized;
  }

  normalizeFanData(data) {
    if (!data) return null;
    const normalized = { ...DATA_DEFAULTS.FAN, ...data };
    normalized.createTime = this.normalizeTimeField(normalized.createTime ?? normalized.createdAt);
    normalized.updateTime = this.normalizeTimeField(normalized.updateTime ?? normalized.updatedAt);
    delete normalized.createdAt;
    delete normalized.updatedAt;
    normalized.position = this.normalizePoint3D(normalized.position);
    if (!this.validateFan(normalized)) {
      console.warn('Fan validation failed, data may be incomplete:', normalized.id);
    }
    return normalized;
  }

  normalizeAnnotationData(data) {
    if (!data) return null;
    const normalized = { ...DATA_DEFAULTS.ANNOTATION, ...data };
    normalized.createTime = this.normalizeTimeField(normalized.createTime ?? normalized.createdAt);
    normalized.updateTime = this.normalizeTimeField(normalized.updateTime ?? normalized.updatedAt);
    delete normalized.createdAt;
    delete normalized.updatedAt;
    normalized.position = this.normalizePoint3D(normalized.position);
    if (!this.validateAnnotation(normalized)) {
      console.warn('Annotation validation failed, data may be incomplete:', normalized.id);
    }
    return normalized;
  }

  validatePoint3D(point) {
    if (!point) return false;
    const hasValidCoords = (
      typeof point.x === 'number' &&
      typeof point.y === 'number' &&
      typeof point.z === 'number'
    );
    if (!hasValidCoords) return false;
    const hasFiniteCoords = (
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      Number.isFinite(point.z)
    );
    return hasFiniteCoords;
  }

  validateTunnel(tunnel) {
    if (!tunnel) return false;
    const requiredFields = DATA_FIELDS.TUNNEL.required;
    for (const field of requiredFields) {
      if (tunnel[field] === null || tunnel[field] === undefined) {
        console.warn(`Tunnel missing required field: ${field}`);
        return false;
      }
    }
    if (tunnel.pathPoints && tunnel.pathPoints.length > 0) {
      const validPoints = tunnel.pathPoints.every(p => this.validatePoint3D(p));
      if (!validPoints) {
        console.warn('Tunnel contains invalid path points');
        return false;
      }
    }
    return true;
  }

  validatePipe(pipe) {
    if (!pipe) return false;
    const requiredFields = DATA_FIELDS.PIPE.required;
    for (const field of requiredFields) {
      if (pipe[field] === null || pipe[field] === undefined) {
        console.warn(`Pipe missing required field: ${field}`);
        return false;
      }
    }
    if (pipe.points && pipe.points.length > 0) {
      const validPoints = pipe.points.every(p => this.validatePoint3D(p));
      if (!validPoints) {
        console.warn('Pipe contains invalid points');
        return false;
      }
    }
    return true;
  }

  validateFan(fan) {
    if (!fan) return false;
    const requiredFields = DATA_FIELDS.FAN.required;
    for (const field of requiredFields) {
      if (fan[field] === null || fan[field] === undefined) {
        console.warn(`Fan missing required field: ${field}`);
        return false;
      }
    }
    return this.validatePoint3D(fan.position);
  }

  validateAnnotation(annotation) {
    if (!annotation) return false;
    const requiredFields = DATA_FIELDS.ANNOTATION.required;
    for (const field of requiredFields) {
      if (annotation[field] === null || annotation[field] === undefined) {
        console.warn(`Annotation missing required field: ${field}`);
        return false;
      }
    }
    return this.validatePoint3D(annotation.position);
  }

  normalizeData(type, data) {
    if (!Array.isArray(data)) {
      data = [data];
    }
    const normalizers = {
      tunnels: this.normalizeTunnelData.bind(this),
      pipes: this.normalizePipeData.bind(this),
      fans: this.normalizeFanData.bind(this),
      annotations: this.normalizeAnnotationData.bind(this)
    };
    const normalizer = normalizers[type];
    if (!normalizer) return data;
    return data.map(item => normalizer(item)).filter(Boolean);
  }

  async loadAll(types = ['tunnels', 'pipes', 'fans', 'annotations'], onProgress) {
    const progress = { loaded: 0, total: types.length, type: null };
    const results = {};

    for (const type of types) {
      progress.type = type;
      try {
        results[type] = await this.loadType(type);
        progress.loaded++;
        onProgress?.(progress);
        this.onProgress?.(progress);
      } catch (error) {
        console.error(`Failed to load ${type}:`, error);
        results[type] = [];
      }
    }

    return results;
  }

  async loadType(type, forceRefresh = false) {
    const cacheKey = `all_${type}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached && !forceRefresh) {
      return cached;
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    const apiMap = { tunnels, pipes, fans, annotations };
    const api = apiMap[type];
    
    if (!api) {
      throw new Error(`Unknown data type: ${type}`);
    }

    const promise = api.getAll()
      .then(async data => {
        const normalizedData = this.normalizeData(type, data);
        let processedData = normalizedData;
        
        if (this.useWebWorker && (type === 'tunnels' || type === 'pipes')) {
          try {
            if (type === 'tunnels') {
              processedData = await processTunnels(normalizedData, this.defaultProcessOptions);
            } else if (type === 'pipes') {
              processedData = await processPipes(normalizedData, this.defaultProcessOptions);
            }
          } catch (workerError) {
            console.warn(`Worker processing failed, using normalized data:`, workerError);
            processedData = normalizedData;
          }
        }
        
        const threeObjects = this.convertToThreeObjects(type, processedData);
        this.setCache(cacheKey, { raw: processedData, three: threeObjects });
        this.loadingPromises.delete(cacheKey);
        return { raw: processedData, three: threeObjects };
      })
      .catch(error => {
        this.loadingPromises.delete(cacheKey);
        throw error;
      });

    this.loadingPromises.set(cacheKey, promise);
    return promise;
  }

  async loadPaginated(type, page = 1, pageSize = this.pageSize) {
    const apiMap = { tunnels, pipes, fans, annotations };
    const api = apiMap[type];
    
    if (!api) {
      throw new Error(`Unknown data type: ${type}`);
    }

    const allData = await this.loadType(type);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      raw: allData.raw.slice(start, end),
      three: allData.three.slice(start, end),
      total: allData.raw.length,
      page,
      pageSize,
      totalPages: Math.ceil(allData.raw.length / pageSize)
    };
  }

  async loadIncremental(type, lastId = null, limit = 50) {
    const allData = await this.loadType(type);
    let startIndex = 0;
    
    if (lastId) {
      startIndex = allData.raw.findIndex(item => item.id === lastId) + 1;
    }
    
    const endIndex = Math.min(startIndex + limit, allData.raw.length);
    
    return {
      raw: allData.raw.slice(startIndex, endIndex),
      three: allData.three.slice(startIndex, endIndex),
      hasMore: endIndex < allData.raw.length,
      loadedCount: endIndex
    };
  }

  async loadTunnelDetail(tunnelId, forceRefresh = false) {
    const cacheKey = `tunnel_detail_${tunnelId}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached && !forceRefresh) {
      return cached;
    }

    const data = await dataApi.getTunnelDetail(tunnelId);
    
    let processedPipes = data.pipes || [];
    if (this.useWebWorker && processedPipes.length > 0) {
      try {
        processedPipes = await processPipes(processedPipes, this.defaultProcessOptions);
      } catch (e) {
        processedPipes = data.pipes || [];
      }
    }
    
    const result = {
      tunnel: data.tunnel,
      pipes: this.convertToThreeObjects('pipes', processedPipes),
      fans: this.convertToThreeObjects('fans', data.fans || []),
      annotations: this.convertToThreeObjects('annotations', data.annotations || [])
    };

    this.setCache(cacheKey, result);
    return result;
  }

  convertToThreeObjects(type, data) {
    if (!data || !Array.isArray(data)) return [];
    
    return data.map(item => this.createThreeObject(type, item)).filter(Boolean);
  }

  createThreeObject(type, item) {
    switch (type) {
      case 'tunnels':
        return this.createTunnelMesh(item);
      case 'pipes':
        return this.createPipeMesh(item);
      case 'fans':
        return this.createFanMesh(item);
      case 'annotations':
        return this.createAnnotationPlaceholder(item);
      default:
        return null;
    }
  }

  createTunnelMesh(tunnel) {
    if (!tunnel.pathPoints || tunnel.pathPoints.length < 2) return null;

    const points = tunnel.pathPoints.map(
      p => new THREE.Vector3(p.x, p.y, p.z)
    );

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.max(points.length * 2, 20),
      Math.min(tunnel.width, tunnel.height) / 2,
      8,
      false
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x8B7355,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { type: 'tunnel', data: tunnel };
    mesh.name = `tunnel_${tunnel.id}`;

    return mesh;
  }

  createPipeMesh(pipe) {
    if (!pipe.points || pipe.points.length < 2) return null;

    const points = pipe.points.map(
      p => new THREE.Vector3(p.x, p.y, p.z)
    );

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.max(points.length * 2, 10),
      (pipe.diameter || 0.8) / 2,
      12,
      false
    );

    const color = pipe.type === 'air_return' ? 0xFF6B6B : 0x4ECDC4;
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.3,
      roughness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { type: 'pipe', data: pipe };
    mesh.name = `pipe_${pipe.id}`;

    return mesh;
  }

  createFanMesh(fan) {
    if (!fan.position) return null;

    const group = new THREE.Group();
    
    const baseGeometry = new THREE.CylinderGeometry(
      (fan.impellerDiameter || 2) / 2 + 0.2,
      (fan.impellerDiameter || 2) / 2 + 0.3,
      0.5,
      16
    );
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.25;
    group.add(base);

    const housingGeometry = new THREE.CylinderGeometry(
      (fan.impellerDiameter || 2) / 2,
      (fan.impellerDiameter || 2) / 2,
      1,
      16
    );
    const housingMaterial = new THREE.MeshStandardMaterial({ 
      color: fan.status === 'running' ? 0x4CAF50 : 0x9E9E9E,
      metalness: 0.5,
      roughness: 0.3
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.position.y = 1;
    group.add(housing);

    const bladeGeometry = new THREE.BoxGeometry(
      (fan.impellerDiameter || 2) * 0.8,
      0.05,
      0.15
    );
    const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x2196F3 });
    const bladeCount = fan.bladeNumber || 8;
    
    for (let i = 0; i < bladeCount; i++) {
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.rotation.y = (i / bladeCount) * Math.PI * 2;
      blade.position.y = 1;
      group.add(blade);
    }

    group.position.set(fan.position.x, fan.position.y, fan.position.z);
    group.userData = { type: 'fan', data: fan };
    group.name = `fan_${fan.id}`;

    return group;
  }

  createAnnotationPlaceholder(annotation) {
    if (!annotation.position) return null;

    const placeholder = new THREE.Object3D();
    placeholder.position.set(
      annotation.position.x,
      annotation.position.y,
      annotation.position.z
    );
    placeholder.userData = { type: 'annotation', data: annotation };
    placeholder.name = `annotation_${annotation.id}`;

    return placeholder;
  }

  async processWithWorker(data, operation, options = {}) {
    if (!this.useWebWorker || !this.workerManager) {
      return this.processData(data, operation, options);
    }

    try {
      switch (operation) {
        case 'simplifyPath':
          return await simplifyPath(data, options.tolerance || 0.5);
        case 'decimatePointCloud':
          return await decimatePointCloud(data, options.ratio || 0.1);
        case 'calculateBounds':
          return await calculateBounds(data);
        case 'filterByDistance':
          return await filterByDistance(data, options.center, options.maxDistance);
        case 'processTunnels':
          return await processTunnels(data, options);
        case 'processPipes':
          return await processPipes(data, options);
        case 'processAll':
          return await processAllData(data, options);
        default:
          return data;
      }
    } catch (error) {
      console.warn(`Worker operation ${operation} failed, falling back to main thread:`, error);
      return this.processData(data, operation, options);
    }
  }

  processData(data, operation, options = {}) {
    switch (operation) {
      case 'simplifyPath':
        return this.simplifyPath(data, options.tolerance || 0.5);
      case 'calculateBounds':
        return this.calculateBounds(data);
      default:
        return data;
    }
  }

  simplifyPath(points, tolerance = 0.5) {
    if (points.length <= 2) return points;
    const result = [points[0]];
    let lastPoint = points[0];
    
    for (let i = 1; i < points.length - 1; i++) {
      const dx = points[i].x - lastPoint.x;
      const dy = points[i].y - lastPoint.y;
      const dz = points[i].z - lastPoint.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (dist >= tolerance) {
        result.push(points[i]);
        lastPoint = points[i];
      }
    }
    
    result.push(points[points.length - 1]);
    return result;
  }

  calculateBounds(objects) {
    if (!objects || objects.length === 0) return null;
    
    const box = new THREE.Box3();
    for (const obj of objects) {
      if (obj.isObject3D) {
        box.expandByObject(obj);
      }
    }
    
    return {
      min: { x: box.min.x, y: box.min.y, z: box.min.z },
      max: { x: box.max.x, y: box.max.y, z: box.max.z },
      center: {
        x: (box.min.x + box.max.x) / 2,
        y: (box.min.y + box.max.y) / 2,
        z: (box.min.z + box.max.z) / 2
      }
    };
  }

  getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  setCache(key, value) {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  clearCache(prefix = null) {
    if (prefix) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(prefix)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getWorkerStatus() {
    if (this.workerManager) {
      return this.workerManager.getStatus();
    }
    return { isSupported: false };
  }

  dispose() {
    terminateWorkers();
    this.clearCache();
    this.loadingPromises.clear();
  }
}

export default DataLoader;
