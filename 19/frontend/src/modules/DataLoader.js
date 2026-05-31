import type { Pipeline, Annotation, PipelineType, AnnotationType } from '../../../shared/types.js';
import { 
  validatePipelineData, 
  validateAnnotationData, 
  sanitizePipeline, 
  sanitizeAnnotation,
  isValidPipeline,
  isValidAnnotation
} from '../../../shared/validators.js';
import { PIPELINE_TYPE_NAMES, PIPELINE_MATERIALS } from '../../../shared/types.js';

const API_BASE_URL = 'http://localhost:3000/api';

export class DataLoader {
  constructor(apiBaseUrl = API_BASE_URL) {
    this.apiBaseUrl = apiBaseUrl;
    this.cache = {
      pipelines: null,
      annotations: null,
      pipelineTypes: null,
      stats: null,
    };
    this.cacheTimeout = 60000;
    this.lastFetchTime = {};
  }

  async fetchPipelines(type = null, useCache = false) {
    const cacheKey = type ? `pipelines_${type}` : 'pipelines_all';
    
    if (useCache && this.cache[cacheKey] && this.isCacheValid(cacheKey)) {
      return [...this.cache[cacheKey]];
    }
    
    try {
      const url = type 
        ? `${this.apiBaseUrl}/pipelines?type=${encodeURIComponent(type)}`
        : `${this.apiBaseUrl}/pipelines`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
      }
      
      const rawData = await response.json();
      
      const { valid, invalid } = validatePipelineData(Array.isArray(rawData) ? rawData : []);
      
      if (invalid.length > 0) {
        console.warn(`DataLoader: Found ${invalid.length} invalid pipeline records`);
      }
      
      this.cache[cacheKey] = valid;
      this.lastFetchTime[cacheKey] = Date.now();
      
      return valid;
    } catch (error) {
      console.warn('DataLoader: Failed to fetch pipelines from backend, using mock data:', error.message);
      const mockData = this.getMockPipelines(type);
      
      if (useCache) {
        this.cache[cacheKey] = mockData;
        this.lastFetchTime[cacheKey] = Date.now();
      }
      
      return mockData;
    }
  }

  async fetchPipelineTypes(useCache = false) {
    if (useCache && this.cache.pipelineTypes && this.isCacheValid('pipelineTypes')) {
      return [...this.cache.pipelineTypes];
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/pipelines/types`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const types = await response.json();
      const validTypes = types.filter(t => ['water', 'sewage', 'electric', 'gas', 'heat'].includes(t));
      
      this.cache.pipelineTypes = validTypes;
      this.lastFetchTime['pipelineTypes'] = Date.now();
      
      return validTypes;
    } catch (error) {
      console.warn('DataLoader: Failed to fetch pipeline types:', error.message);
      const defaultTypes = ['water', 'sewage', 'electric', 'gas', 'heat'];
      
      if (useCache) {
        this.cache.pipelineTypes = defaultTypes;
        this.lastFetchTime['pipelineTypes'] = Date.now();
      }
      
      return defaultTypes;
    }
  }

  async fetchPipelineStats() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/pipelines/stats`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.warn('DataLoader: Failed to fetch pipeline stats:', error.message);
      return [];
    }
  }

  async fetchAnnotations(pipelineId = null, useCache = false) {
    const cacheKey = pipelineId ? `annotations_${pipelineId}` : 'annotations_all';
    
    if (useCache && this.cache[cacheKey] && this.isCacheValid(cacheKey)) {
      return [...this.cache[cacheKey]];
    }
    
    try {
      const url = pipelineId
        ? `${this.apiBaseUrl}/annotations?pipelineId=${encodeURIComponent(pipelineId)}`
        : `${this.apiBaseUrl}/annotations`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const rawData = await response.json();
      
      const { valid, invalid } = validateAnnotationData(Array.isArray(rawData) ? rawData : []);
      
      if (invalid.length > 0) {
        console.warn(`DataLoader: Found ${invalid.length} invalid annotation records`);
      }
      
      this.cache[cacheKey] = valid;
      this.lastFetchTime[cacheKey] = Date.now();
      
      return valid;
    } catch (error) {
      console.warn('DataLoader: Failed to fetch annotations from backend, using mock data:', error.message);
      const mockData = this.getMockAnnotations();
      
      if (useCache) {
        this.cache[cacheKey] = mockData;
        this.lastFetchTime[cacheKey] = Date.now();
      }
      
      return mockData;
    }
  }

  async createAnnotation(annotationData) {
    const cleanData = sanitizeAnnotation(annotationData);
    
    if (!isValidAnnotation(cleanData)) {
      throw new Error('Invalid annotation data');
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/annotations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const savedData = await response.json();
      const result = sanitizeAnnotation(savedData);
      
      this.invalidateCache('annotations');
      
      return result;
    } catch (error) {
      console.warn('DataLoader: Failed to create annotation on backend:', error.message);
      
      const mockResult = { 
        ...cleanData, 
        _id: 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        createdAt: new Date()
      };
      
      this.invalidateCache('annotations');
      
      return mockResult;
    }
  }

  async updateAnnotation(id, annotationData) {
    const cleanData = sanitizeAnnotation(annotationData);
    
    if (!isValidAnnotation(cleanData)) {
      throw new Error('Invalid annotation data');
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/annotations/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const savedData = await response.json();
      const result = sanitizeAnnotation(savedData);
      
      this.invalidateCache('annotations');
      
      return result;
    } catch (error) {
      console.warn('DataLoader: Failed to update annotation on backend:', error.message);
      
      this.invalidateCache('annotations');
      
      return { ...cleanData, _id: id };
    }
  }

  async deleteAnnotation(id) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/annotations/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      this.invalidateCache('annotations');
      
      return await response.json();
    } catch (error) {
      console.warn('DataLoader: Failed to delete annotation on backend:', error.message);
      
      this.invalidateCache('annotations');
      
      return { success: true, id };
    }
  }

  async createPipeline(pipelineData) {
    const cleanData = sanitizePipeline(pipelineData);
    
    if (!isValidPipeline(cleanData)) {
      throw new Error('Invalid pipeline data');
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/pipelines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanData),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const savedData = await response.json();
      const result = sanitizePipeline(savedData);
      
      this.invalidateCache('pipelines');
      
      return result;
    } catch (error) {
      console.warn('DataLoader: Failed to create pipeline on backend:', error.message);
      
      const mockResult = { 
        ...cleanData, 
        _id: 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
        createdAt: new Date()
      };
      
      this.invalidateCache('pipelines');
      
      return mockResult;
    }
  }

  async batchCreatePipelines(pipelines) {
    const cleanPipelines = [];
    const invalidPipelines = [];
    
    pipelines.forEach((pipeline, index) => {
      const clean = sanitizePipeline(pipeline);
      if (isValidPipeline(clean)) {
        cleanPipelines.push(clean);
      } else {
        invalidPipelines.push({ index, pipeline, error: 'Invalid pipeline data' });
      }
    });
    
    if (invalidPipelines.length > 0) {
      console.warn(`DataLoader: ${invalidPipelines.length} invalid pipelines will be skipped`);
    }
    
    if (cleanPipelines.length === 0) {
      return { created: 0, invalid: invalidPipelines.length, results: [] };
    }
    
    try {
      const response = await fetch(`${this.apiBaseUrl}/pipelines/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cleanPipelines),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const savedData = await response.json();
      const results = savedData.map(d => sanitizePipeline(d));
      
      this.invalidateCache('pipelines');
      
      return { 
        created: results.length, 
        invalid: invalidPipelines.length, 
        results 
      };
    } catch (error) {
      console.warn('DataLoader: Failed to batch create pipelines on backend:', error.message);
      
      const mockResults = cleanPipelines.map((p, i) => ({
        ...p,
        _id: 'mock_' + Date.now() + '_' + i,
        createdAt: new Date()
      }));
      
      this.invalidateCache('pipelines');
      
      return { 
        created: mockResults.length, 
        invalid: invalidPipelines.length, 
        results: mockResults 
      };
    }
  }

  async importPipelineData(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target.result;
          const data = JSON.parse(content);
          
          let pipelines = [];
          if (Array.isArray(data)) {
            pipelines = data;
          } else if (data.pipelines && Array.isArray(data.pipelines)) {
            pipelines = data.pipelines;
          } else {
            throw new Error('Invalid file format: expected array or object with pipelines array');
          }
          
          const { valid, invalid } = validatePipelineData(pipelines);
          
          resolve({
            valid,
            invalid,
            total: pipelines.length
          });
        } catch (error) {
          reject(new Error(`Failed to parse file: ${error.message}`));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  isCacheValid(key) {
    const lastFetch = this.lastFetchTime[key];
    if (!lastFetch) return false;
    return Date.now() - lastFetch < this.cacheTimeout;
  }

  invalidateCache(prefix) {
    Object.keys(this.cache).forEach(key => {
      if (key.startsWith(prefix)) {
        this.cache[key] = null;
        delete this.lastFetchTime[key];
      }
    });
  }

  clearCache() {
    this.cache = {
      pipelines: null,
      annotations: null,
      pipelineTypes: null,
      stats: null,
    };
    this.lastFetchTime = {};
  }

  getMockPipelines(type = null) {
    const pipelines = [];
    const types = type ? [type] : ['water', 'sewage', 'electric', 'gas', 'heat'];
    
    types.forEach((type, typeIndex) => {
      const baseY = -5 - typeIndex * 2;
      
      for (let i = 0; i < 5; i++) {
        const startX = -40 + i * 20;
        const points = [];
        const segments = 5 + Math.floor(Math.random() * 5);
        
        for (let j = 0; j < segments; j++) {
          points.push({
            x: Number((startX + j * 8).toFixed(2)),
            y: Number((baseY + (Math.random() - 0.5) * 2).toFixed(2)),
            z: Number((-30 + typeIndex * 15 + (Math.random() - 0.5) * 5).toFixed(2)),
          });
        }
        
        const pipeline = {
          _id: `pipeline_${type}_${i}`,
          name: `${PIPELINE_TYPE_NAMES[type]}管线-${i + 1}`,
          type: type,
          diameter: Number((0.3 + Math.random() * 0.5).toFixed(2)),
          material: PIPELINE_MATERIALS[type],
          points: points,
          depth: Math.abs(baseY),
          description: `这是一条${PIPELINE_TYPE_NAMES[type]}管线，用于城市地下管网系统`,
          createdAt: new Date(),
        };
        
        if (isValidPipeline(pipeline)) {
          pipelines.push(sanitizePipeline(pipeline));
        }
      }
    });
    
    return pipelines;
  }

  getMockAnnotations() {
    const rawAnnotations = [
      {
        _id: 'ann_1',
        name: '阀门节点',
        type: 'valve',
        x: 0,
        y: -5,
        z: 0,
        content: '主供水阀门，型号: DN200，上次检修: 2024-01-15',
        author: '系统管理员',
        createdAt: new Date(),
      },
      {
        _id: 'ann_2',
        name: '转弯接头',
        type: 'joint',
        x: 20,
        y: -7,
        z: 10,
        content: '90度弯头，材质: 球墨铸铁',
        author: '系统管理员',
        createdAt: new Date(),
      },
      {
        _id: 'ann_3',
        name: '检查井',
        type: 'manhole',
        x: -20,
        y: -9,
        z: -15,
        content: '排水检查井，直径: 1000mm',
        author: '系统管理员',
        createdAt: new Date(),
      },
      {
        _id: 'ann_4',
        name: '变压器连接点',
        type: 'transformer',
        x: 10,
        y: -11,
        z: 25,
        content: '10kV电力接入点',
        author: '系统管理员',
        createdAt: new Date(),
      },
    ];
    
    return rawAnnotations
      .filter(isValidAnnotation)
      .map(sanitizeAnnotation);
  }

  getTypeName(type) {
    return PIPELINE_TYPE_NAMES[type] || type;
  }

  getMaterial(type) {
    return PIPELINE_MATERIALS[type] || '未知';
  }
}
