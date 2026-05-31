import * as THREE from 'three';

export const LAYER_TYPES = {
  LAYER_100: 100,
  LAYER_200: 200,
  LAYER_300: 300,
  LAYER_400: 400,
  LAYER_500: 500
};

export const DATA_LEVEL_TO_LAYER = {
  'level-1': LAYER_TYPES.LAYER_100,
  'level-2': LAYER_TYPES.LAYER_200,
  'level-3': LAYER_TYPES.LAYER_300,
  'level-4': LAYER_TYPES.LAYER_400,
  'level-5': LAYER_TYPES.LAYER_500
};

export const OBJECT_TYPE_TO_LAYER = {
  'tunnel': LAYER_TYPES.LAYER_100,
  'pipe': LAYER_TYPES.LAYER_200,
  'fan': LAYER_TYPES.LAYER_300,
  'annotation': LAYER_TYPES.LAYER_400,
  'label': LAYER_TYPES.LAYER_500,
  'helper': LAYER_TYPES.LAYER_500
};

export class RenderLayer {
  constructor(camera = null) {
    this.camera = camera;
    this.layers = new Map();
    this.layerObjects = new Map();
    this.enabledLayers = new Set();

    this.initDefaultLayers();
  }

  initDefaultLayers() {
    const defaultLayers = [
      { id: LAYER_TYPES.LAYER_100, name: '巷道层', description: '矿井巷道模型', visible: true },
      { id: LAYER_TYPES.LAYER_200, name: '管道层', description: '通风管道模型', visible: true },
      { id: LAYER_TYPES.LAYER_300, name: '设备层', description: '风机、设备模型', visible: true },
      { id: LAYER_TYPES.LAYER_400, name: '标注层', description: '标注、标记', visible: true },
      { id: LAYER_TYPES.LAYER_500, name: '辅助层', description: '坐标轴、网格、标签', visible: true }
    ];

    defaultLayers.forEach(layer => {
      this.registerLayer(layer.id, layer.name, layer.description, layer.visible);
    });
  }

  registerLayer(layerId, name, description = '', visible = true) {
    const bitIndex = this.layerIdToBitIndex(layerId);
    
    this.layers.set(layerId, {
      id: layerId,
      bitIndex,
      name,
      description,
      visible
    });

    this.layerObjects.set(layerId, []);

    if (visible) {
      this.enabledLayers.add(layerId);
      if (this.camera) {
        this.camera.layers.enable(bitIndex);
      }
    }

    return this;
  }

  layerIdToBitIndex(layerId) {
    const baseLayers = Object.values(LAYER_TYPES);
    const index = baseLayers.indexOf(layerId);
    return index >= 0 ? index : Math.floor(layerId / 100);
  }

  getLayerBitMask(layerId) {
    const bitIndex = this.layerIdToBitIndex(layerId);
    return 1 << bitIndex;
  }

  assignLayer(object, layerId) {
    if (!object || !object.isObject3D) {
      console.warn('Invalid 3D object for layer assignment');
      return;
    }

    const layer = this.layers.get(layerId);
    if (!layer) {
      console.warn(`Layer ${layerId} not registered`);
      return;
    }

    object.traverse((child) => {
      child.layers.set(layer.bitIndex);
    });

    object.userData.layerId = layerId;

    if (!this.layerObjects.has(layerId)) {
      this.layerObjects.set(layerId, []);
    }
    
    const objects = this.layerObjects.get(layerId);
    if (!objects.includes(object)) {
      objects.push(object);
    }

    if (this.camera && !layer.visible) {
      this.hideObjectInAllCameras(object);
    }

    return this;
  }

  assignLayerByDataLevel(object, dataLevel) {
    const layerId = DATA_LEVEL_TO_LAYER[dataLevel] || LAYER_TYPES.LAYER_100;
    return this.assignLayer(object, layerId);
  }

  assignLayerByObjectType(object, objectType) {
    const layerId = OBJECT_TYPE_TO_LAYER[objectType] || LAYER_TYPES.LAYER_100;
    return this.assignLayer(object, layerId);
  }

  autoAssignLayer(object) {
    if (object.userData && object.userData.type) {
      return this.assignLayerByObjectType(object, object.userData.type);
    }
    if (object.userData && object.userData.dataLevel) {
      return this.assignLayerByDataLevel(object, object.userData.dataLevel);
    }
    return this.assignLayer(object, LAYER_TYPES.LAYER_100);
  }

  showLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    layer.visible = true;
    this.enabledLayers.add(layerId);

    if (this.camera) {
      this.camera.layers.enable(layer.bitIndex);
    }

    const objects = this.layerObjects.get(layerId) || [];
    objects.forEach(obj => {
      obj.visible = true;
    });

    return this;
  }

  hideLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    layer.visible = false;
    this.enabledLayers.delete(layerId);

    if (this.camera) {
      this.camera.layers.disable(layer.bitIndex);
    }

    const objects = this.layerObjects.get(layerId) || [];
    objects.forEach(obj => {
      obj.visible = false;
    });

    return this;
  }

  toggleLayer(layerId) {
    const layer = this.layers.get(layerId);
    if (!layer) return;

    if (layer.visible) {
      this.hideLayer(layerId);
    } else {
      this.showLayer(layerId);
    }

    return this;
  }

  showAllLayers() {
    this.layers.forEach((layer, layerId) => {
      this.showLayer(layerId);
    });
    return this;
  }

  hideAllLayers() {
    this.layers.forEach((layer, layerId) => {
      this.hideLayer(layerId);
    });
    return this;
  }

  showOnlyLayers(layerIds) {
    this.hideAllLayers();
    layerIds.forEach(layerId => {
      this.showLayer(layerId);
    });
    return this;
  }

  isLayerVisible(layerId) {
    const layer = this.layers.get(layerId);
    return layer ? layer.visible : false;
  }

  getLayerObjects(layerId) {
    return this.layerObjects.get(layerId) || [];
  }

  getAllLayerObjects() {
    const allObjects = [];
    this.layerObjects.forEach(objects => {
      allObjects.push(...objects);
    });
    return allObjects;
  }

  getLayers() {
    return Array.from(this.layers.values());
  }

  getEnabledLayers() {
    return Array.from(this.enabledLayers);
  }

  getLayerInfo(layerId) {
    return this.layers.get(layerId) || null;
  }

  setCamera(camera) {
    this.camera = camera;
    
    this.layers.forEach((layer, layerId) => {
      if (layer.visible) {
        camera.layers.enable(layer.bitIndex);
      } else {
        camera.layers.disable(layer.bitIndex);
      }
    });

    return this;
  }

  removeObject(object) {
    if (!object) return;

    this.layerObjects.forEach((objects, layerId) => {
      const index = objects.indexOf(object);
      if (index > -1) {
        objects.splice(index, 1);
      }
    });

    return this;
  }

  clearLayer(layerId) {
    const objects = this.layerObjects.get(layerId) || [];
    objects.forEach(obj => {
      if (obj.userData) {
        delete obj.userData.layerId;
      }
    });
    this.layerObjects.set(layerId, []);
    return this;
  }

  clearAllLayers() {
    this.layerObjects.forEach((objects, layerId) => {
      objects.forEach(obj => {
        if (obj.userData) {
          delete obj.userData.layerId;
        }
      });
    });
    this.layerObjects.clear();
    this.layers.forEach(layer => {
      this.layerObjects.set(layer.id, []);
    });
    return this;
  }

  filterObjects(predicate) {
    const results = [];
    this.layerObjects.forEach((objects, layerId) => {
      objects.forEach(obj => {
        if (predicate(obj, layerId)) {
          results.push({ object: obj, layerId });
        }
      });
    });
    return results;
  }

  findObjectsByName(name) {
    return this.filterObjects((obj) => 
      obj.name && obj.name.includes(name)
    );
  }

  findObjectsByType(type) {
    return this.filterObjects((obj) => 
      obj.userData && obj.userData.type === type
    );
  }

  getObjectLayerId(object) {
    return object && object.userData ? object.userData.layerId : null;
  }

  moveObjectToLayer(object, newLayerId) {
    this.removeObject(object);
    this.assignLayer(object, newLayerId);
    return this;
  }

  setLayerOpacity(layerId, opacity) {
    const objects = this.layerObjects.get(layerId) || [];
    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    
    objects.forEach(obj => {
      obj.traverse((child) => {
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => {
              m.opacity = clampedOpacity;
              m.transparent = clampedOpacity < 1;
            });
          } else {
            child.material.opacity = clampedOpacity;
            child.material.transparent = clampedOpacity < 1;
          }
        }
      });
    });

    return this;
  }

  setLayerColor(layerId, color) {
    const objects = this.layerObjects.get(layerId) || [];
    
    objects.forEach(obj => {
      obj.traverse((child) => {
        if (child.material && child.material.color) {
          child.material.color.set(color);
        }
      });
    });

    return this;
  }

  highlightLayer(layerId, highlight = true) {
    const objects = this.layerObjects.get(layerId) || [];
    
    objects.forEach(obj => {
      obj.traverse((child) => {
        if (child.material) {
          if (highlight) {
            child.material.emissive = child.material.emissive || new THREE.Color(0x000000);
            child.material.emissive.setHex(0x333333);
            child.material.emissiveIntensity = 0.3;
          } else {
            if (child.material.emissive) {
              child.material.emissive.setHex(0x000000);
              child.material.emissiveIntensity = 0;
            }
          }
        }
      });
    });

    return this;
  }

  hideObjectInAllCameras(object) {
    object.traverse((child) => {
      child.visible = false;
    });
  }

  toJSON() {
    const layerConfigs = [];
    this.layers.forEach((layer) => {
      layerConfigs.push({
        id: layer.id,
        name: layer.name,
        description: layer.description,
        visible: layer.visible
      });
    });
    return {
      layers: layerConfigs,
      enabledLayers: Array.from(this.enabledLayers)
    };
  }

  fromJSON(json) {
    if (json.layers) {
      json.layers.forEach(layerConfig => {
        if (this.layers.has(layerConfig.id)) {
          const layer = this.layers.get(layerConfig.id);
          layer.name = layerConfig.name || layer.name;
          layer.description = layerConfig.description || layer.description;
          if (layerConfig.visible !== undefined) {
            if (layerConfig.visible) {
              this.showLayer(layerConfig.id);
            } else {
              this.hideLayer(layerConfig.id);
            }
          }
        }
      });
    }
    return this;
  }

  dispose() {
    this.clearAllLayers();
    this.layers.clear();
    this.enabledLayers.clear();
    this.camera = null;
  }
}
