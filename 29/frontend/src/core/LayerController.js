import * as THREE from 'three';
import { EventDispatcher } from 'three';

export class LayerController extends EventDispatcher {
  constructor(scene, options = {}) {
    super();
    
    this.scene = scene;
    this.options = {
      defaultOpacity: 1,
      ...options
    };

    this.layerObjects = new Map();
    this.layerConfigs = new Map();
    this.originalMaterials = new WeakMap();
    
    this.elevationLayers = new Set();
    this.typeLayers = new Set();
    
    this.isolatedLayer = null;

    this._initDefaultLayers();
  }

  _initDefaultLayers() {
    const defaultElevations = [-100, -200, -300, -400, -500];
    const defaultTypes = ['tunnel', 'pipe', 'fan', 'annotation'];

    defaultElevations.forEach(elev => {
      this.registerLayer(`elevation_${elev}m`, {
        type: 'elevation',
        value: elev,
        visible: true,
        opacity: 1,
        color: null
      });
      this.elevationLayers.add(`elevation_${elev}m`);
    });

    defaultTypes.forEach(type => {
      this.registerLayer(`type_${type}`, {
        type: 'type',
        value: type,
        visible: true,
        opacity: 1,
        color: null
      });
      this.typeLayers.add(`type_${type}`);
    });
  }

  registerLayer(layerId, config = {}) {
    if (this.layerConfigs.has(layerId)) {
      return this.layerConfigs.get(layerId);
    }

    const defaultConfig = {
      type: 'custom',
      value: layerId,
      visible: true,
      opacity: this.options.defaultOpacity,
      color: null,
      name: layerId
    };

    const layerConfig = { ...defaultConfig, ...config };
    this.layerConfigs.set(layerId, layerConfig);
    this.layerObjects.set(layerId, new Set());

    this.dispatchEvent({
      type: 'layerRegistered',
      layerId,
      config: layerConfig
    });

    return layerConfig;
  }

  addObjectToLayer(object, layerId) {
    if (!this.layerConfigs.has(layerId)) {
      this.registerLayer(layerId);
    }

    this.layerObjects.get(layerId).add(object);

    if (!object.userData.layers) {
      object.userData.layers = new Set();
    }
    object.userData.layers.add(layerId);

    this._applyLayerConfigToObject(object, layerId);

    this.dispatchEvent({
      type: 'objectAdded',
      layerId,
      object
    });
  }

  addObjectToElevationLayer(object, elevation) {
    const layerId = `elevation_${elevation}m`;
    object.userData.elevation = elevation;
    this.addObjectToLayer(object, layerId);
  }

  addObjectToTypeLayer(object, type) {
    const layerId = `type_${type}`;
    object.userData.objectType = type;
    this.addObjectToLayer(object, layerId);
  }

  removeObjectFromLayer(object, layerId) {
    const layerObjects = this.layerObjects.get(layerId);
    if (layerObjects) {
      layerObjects.delete(object);
    }
    
    if (object.userData.layers) {
      object.userData.layers.delete(layerId);
    }

    this.dispatchEvent({
      type: 'objectRemoved',
      layerId,
      object
    });
  }

  removeObjectFromAllLayers(object) {
    if (object.userData.layers) {
      object.userData.layers.forEach(layerId => {
        this.removeObjectFromLayer(object, layerId);
      });
    }
  }

  showLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.visible = true;
    
    if (this.isolatedLayer && this.isolatedLayer !== layerId) {
      return;
    }

    this._setLayerVisibility(layerId, true);

    this.dispatchEvent({
      type: 'layerVisibilityChanged',
      layerId,
      visible: true
    });
  }

  hideLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.visible = false;
    this._setLayerVisibility(layerId, false);

    this.dispatchEvent({
      type: 'layerVisibilityChanged',
      layerId,
      visible: false
    });
  }

  toggleLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    if (config.visible) {
      this.hideLayer(layerId);
    } else {
      this.showLayer(layerId);
    }
  }

  _setLayerVisibility(layerId, visible) {
    const objects = this.layerObjects.get(layerId);
    if (!objects) return;

    objects.forEach(object => {
      const shouldBeVisible = this._calculateObjectVisibility(object);
      object.visible = shouldBeVisible;
    });
  }

  _calculateObjectVisibility(object) {
    if (!object.userData.layers || object.userData.layers.size === 0) {
      return true;
    }

    if (this.isolatedLayer) {
      return object.userData.layers.has(this.isolatedLayer);
    }

    let hasVisibleLayer = false;
    let hasHiddenLayer = false;

    object.userData.layers.forEach(layerId => {
      const config = this.layerConfigs.get(layerId);
      if (config) {
        if (config.visible) {
          hasVisibleLayer = true;
        } else {
          hasHiddenLayer = true;
        }
      }
    });

    if (hasVisibleLayer && !hasHiddenLayer) {
      return true;
    }

    if (hasHiddenLayer) {
      return false;
    }

    return true;
  }

  setLayerOpacity(layerId, opacity) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.opacity = Math.max(0, Math.min(1, opacity));
    
    const objects = this.layerObjects.get(layerId);
    if (!objects) return;

    objects.forEach(object => {
      this._applyOpacityToObject(object, layerId);
    });

    this.dispatchEvent({
      type: 'layerOpacityChanged',
      layerId,
      opacity: config.opacity
    });
  }

  _applyOpacityToObject(object, layerId) {
    const layers = object.userData.layers;
    if (!layers) return;

    let minOpacity = 1;
    layers.forEach(lid => {
      const config = this.layerConfigs.get(lid);
      if (config && config.opacity < minOpacity) {
        minOpacity = config.opacity;
      }
    });

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!this.originalMaterials.has(child)) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          this.originalMaterials.set(child, materials.map(m => ({
            opacity: m.opacity,
            transparent: m.transparent,
            color: m.color.clone()
          })));
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(m => {
          m.opacity = minOpacity;
          m.transparent = minOpacity < 1;
        });
      }
    });
  }

  setLayerColor(layerId, color) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.color = color ? new THREE.Color(color) : null;
    
    const objects = this.layerObjects.get(layerId);
    if (!objects) return;

    objects.forEach(object => {
      this._applyColorToObject(object, layerId);
    });

    this.dispatchEvent({
      type: 'layerColorChanged',
      layerId,
      color: config.color
    });
  }

  _applyColorToObject(object, layerId) {
    const layers = object.userData.layers;
    if (!layers) return;

    let layerColor = null;
    layers.forEach(lid => {
      const config = this.layerConfigs.get(lid);
      if (config && config.color) {
        layerColor = config.color;
      }
    });

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!this.originalMaterials.has(child)) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          this.originalMaterials.set(child, materials.map(m => ({
            opacity: m.opacity,
            transparent: m.transparent,
            color: m.color.clone()
          })));
        }

        const original = this.originalMaterials.get(child);
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((m, i) => {
          if (layerColor) {
            m.color.copy(layerColor);
          } else if (original && original[i]) {
            m.color.copy(original[i].color);
          }
        });
      }
    });
  }

  _applyLayerConfigToObject(object, layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    this._applyOpacityToObject(object, layerId);
    this._applyColorToObject(object, layerId);
    object.visible = this._calculateObjectVisibility(object);
  }

  isolateLayer(layerId) {
    this.isolatedLayer = layerId;

    this.layerConfigs.forEach((config, lid) => {
      if (lid === layerId) {
        this._setLayerVisibility(lid, true);
      } else {
        this._setLayerVisibility(lid, false);
      }
    });

    this.dispatchEvent({
      type: 'layerIsolated',
      layerId
    });
  }

  exitIsolation() {
    const prevIsolated = this.isolatedLayer;
    this.isolatedLayer = null;

    this.layerConfigs.forEach((config, lid) => {
      this._setLayerVisibility(lid, config.visible);
    });

    this.dispatchEvent({
      type: 'layerIsolationEnded',
      layerId: prevIsolated
    });
  }

  showAllLayers() {
    this.isolatedLayer = null;
    this.layerConfigs.forEach((config, lid) => {
      config.visible = true;
      this._setLayerVisibility(lid, true);
    });

    this.dispatchEvent({ type: 'allLayersShown' });
  }

  hideAllLayers() {
    this.isolatedLayer = null;
    this.layerConfigs.forEach((config, lid) => {
      config.visible = false;
      this._setLayerVisibility(lid, false);
    });

    this.dispatchEvent({ type: 'allLayersHidden' });
  }

  getLayerConfig(layerId) {
    return this.layerConfigs.get(layerId);
  }

  getLayerObjects(layerId) {
    const objects = this.layerObjects.get(layerId);
    return objects ? Array.from(objects) : [];
  }

  getAllLayers() {
    const layers = [];
    this.layerConfigs.forEach((config, id) => {
      layers.push({
        id,
        ...config,
        objectCount: this.layerObjects.get(id)?.size || 0
      });
    });
    return layers;
  }

  getElevationLayers() {
    return Array.from(this.elevationLayers).map(id => ({
      id,
      ...this.layerConfigs.get(id),
      objectCount: this.layerObjects.get(id)?.size || 0
    }));
  }

  getTypeLayers() {
    return Array.from(this.typeLayers).map(id => ({
      id,
      ...this.layerConfigs.get(id),
      objectCount: this.layerObjects.get(id)?.size || 0
    }));
  }

  getObjectLayers(object) {
    if (!object.userData.layers) return [];
    return Array.from(object.userData.layers);
  }

  getIsolatedLayer() {
    return this.isolatedLayer;
  }

  resetLayer(layerId) {
    const config = this.layerConfigs.get(layerId);
    if (!config) return;

    config.visible = true;
    config.opacity = 1;
    config.color = null;

    const objects = this.layerObjects.get(layerId);
    if (objects) {
      objects.forEach(object => {
        this._resetObjectMaterials(object);
        object.visible = this._calculateObjectVisibility(object);
      });
    }

    this.dispatchEvent({
      type: 'layerReset',
      layerId
    });
  }

  _resetObjectMaterials(object) {
    object.traverse((child) => {
      if (child.isMesh && child.material && this.originalMaterials.has(child)) {
        const original = this.originalMaterials.get(child);
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        
        materials.forEach((m, i) => {
          if (original[i]) {
            m.opacity = original[i].opacity;
            m.transparent = original[i].transparent;
            m.color.copy(original[i].color);
          }
        });
      }
    });
  }

  unregisterLayer(layerId) {
    const objects = this.layerObjects.get(layerId);
    if (objects) {
      objects.forEach(object => {
        if (object.userData.layers) {
          object.userData.layers.delete(layerId);
        }
        this._resetObjectMaterials(object);
        object.visible = this._calculateObjectVisibility(object);
      });
    }

    this.layerObjects.delete(layerId);
    this.layerConfigs.delete(layerId);
    this.elevationLayers.delete(layerId);
    this.typeLayers.delete(layerId);

    if (this.isolatedLayer === layerId) {
      this.exitIsolation();
    }

    this.dispatchEvent({
      type: 'layerUnregistered',
      layerId
    });
  }

  dispose() {
    this.layerObjects.clear();
    this.layerConfigs.clear();
    this.elevationLayers.clear();
    this.typeLayers.clear();
    this.originalMaterials = new WeakMap();
    this.isolatedLayer = null;
  }
}
