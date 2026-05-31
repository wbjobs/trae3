import * as THREE from 'three';
import { PIPELINE_COLORS, PIPELINE_TYPE_NAMES } from '../../../shared/types.js';

export class LayerManager {
  constructor(sceneRenderer, dataLoader) {
    this.sceneRenderer = sceneRenderer;
    this.dataLoader = dataLoader;
    this.layers = {};
    this.loadedTypes = new Set();
    this.loadingTypes = new Set();
    this.onLayerLoaded = null;
    this.onLayerUnloaded = null;
    this.onLoadProgress = null;
    
    this.initLayers();
  }
  
  initLayers() {
    const types = ['water', 'sewage', 'electric', 'gas', 'heat'];
    types.forEach(type => {
      this.layers[type] = {
        type,
        name: PIPELINE_TYPE_NAMES[type],
        color: '#' + (PIPELINE_COLORS[type] || 0x888888).toString(16).padStart(6, '0'),
        loaded: false,
        visible: true,
        pipelineCount: 0,
        pointCount: 0,
      };
    });
  }
  
  async loadLayer(type, forceReload = false) {
    if (!this.layers[type]) {
      console.warn(`LayerManager: Unknown layer type: ${type}`);
      return { success: false, error: 'Unknown layer type' };
    }
    
    if (this.loadedTypes.has(type) && !forceReload) {
      return { success: true, alreadyLoaded: true };
    }
    
    if (this.loadingTypes.has(type)) {
      return { success: false, error: 'Layer is currently loading' };
    }
    
    this.loadingTypes.add(type);
    
    try {
      if (this.onLoadProgress) {
        this.onLoadProgress(type, 0, '开始加载...');
      }
      
      const pipelines = await this.dataLoader.fetchPipelines(type, true);
      
      if (this.onLoadProgress) {
        this.onLoadProgress(type, 50, '数据已获取，正在渲染...');
      }
      
      if (!this.sceneRenderer.pipelineGroups[type]) {
        const group = new THREE.Group();
        group.name = `pipeline_${type}`;
        this.sceneRenderer.scene.add(group);
        this.sceneRenderer.pipelineGroups[type] = group;
      } else {
        this.clearLayerFromScene(type);
      }
      
      const result = this.sceneRenderer.createPipelinesBatch(pipelines);
      
      let totalPoints = 0;
      pipelines.forEach(p => { totalPoints += p.points.length; });
      
      this.layers[type].loaded = true;
      this.layers[type].visible = true;
      this.layers[type].pipelineCount = result.valid;
      this.layers[type].pointCount = totalPoints;
      this.loadedTypes.add(type);
      
      this.sceneRenderer.toggleLayer(type, true);
      
      if (this.onLoadProgress) {
        this.onLoadProgress(type, 100, '加载完成');
      }
      
      if (this.onLayerLoaded) {
        this.onLayerLoaded(type, this.layers[type]);
      }
      
      return { success: true, pipelineCount: result.valid, pointCount: totalPoints };
      
    } catch (error) {
      console.error(`LayerManager: Failed to load layer ${type}:`, error);
      return { success: false, error: error.message };
    } finally {
      this.loadingTypes.delete(type);
    }
  }
  
  async loadLayers(types, forceReload = false) {
    const results = {};
    
    for (const type of types) {
      results[type] = await this.loadLayer(type, forceReload);
      
      if (this.onLoadProgress) {
        const progress = Math.round(((types.indexOf(type) + 1) / types.length) * 100);
        this.onLoadProgress(type, progress, `加载图层 ${types.indexOf(type) + 1}/${types.length}`);
      }
    }
    
    return results;
  }
  
  async loadAllLayers(forceReload = false) {
    return this.loadLayers(Object.keys(this.layers), forceReload);
  }
  
  unloadLayer(type) {
    if (!this.layers[type] || !this.loadedTypes.has(type)) {
      return;
    }
    
    this.clearLayerFromScene(type);
    
    this.layers[type].loaded = false;
    this.layers[type].pipelineCount = 0;
    this.layers[type].pointCount = 0;
    this.loadedTypes.delete(type);
    
    if (this.onLayerUnloaded) {
      this.onLayerUnloaded(type, this.layers[type]);
    }
  }
  
  clearLayerFromScene(type) {
    const group = this.sceneRenderer.pipelineGroups[type];
    if (!group) return;
    
    while (group.children.length > 0) {
      const child = group.children[0];
      this.sceneRenderer.disposeObject(child);
      group.remove(child);
    }
  }
  
  setLayerVisible(type, visible) {
    if (!this.layers[type]) return;
    
    this.layers[type].visible = visible;
    
    if (visible && !this.loadedTypes.has(type)) {
      this.loadLayer(type);
      return;
    }
    
    this.sceneRenderer.toggleLayer(type, visible);
  }
  
  toggleLayer(type) {
    if (!this.layers[type]) return;
    this.setLayerVisible(type, !this.layers[type].visible);
  }
  
  getLayerInfo(type) {
    return this.layers[type] ? { ...this.layers[type] } : null;
  }
  
  getAllLayers() {
    return Object.keys(this.layers).map(type => ({ ...this.layers[type] }));
  }
  
  getLoadedLayerCount() {
    return this.loadedTypes.size;
  }
  
  getTotalPipelineCount() {
    let total = 0;
    this.loadedTypes.forEach(type => {
      total += this.layers[type].pipelineCount;
    });
    return total;
  }
  
  getTotalPointCount() {
    let total = 0;
    this.loadedTypes.forEach(type => {
      total += this.layers[type].pointCount;
    });
    return total;
  }
  
  getVisibleLayerTypes() {
    return Object.keys(this.layers).filter(type => this.layers[type].visible);
  }
  
  setAllLayersVisible(visible) {
    Object.keys(this.layers).forEach(type => {
      this.setLayerVisible(type, visible);
    });
  }
  
  async reloadLayer(type) {
    this.unloadLayer(type);
    return this.loadLayer(type, true);
  }
  
  async reloadAllLayers() {
    const types = [...this.loadedTypes];
    types.forEach(type => this.unloadLayer(type));
    
    for (const type of types) {
      await this.loadLayer(type, true);
    }
  }
}
