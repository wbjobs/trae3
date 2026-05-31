import * as THREE from 'three';

export class PerformanceMonitor {
  constructor(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    this.fps = 0;
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 500;
    this.targetFps = 60;
    this.minFps = 30;
    this.qualityLevel = 'high';
    this.isAutoOptimize = true;
    this.stats = {
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      fps: 0,
      frameTime: 0,
    };
    this.onFpsUpdate = null;
    this.onQualityChange = null;
  }
  
  beginFrame() {
    this.frameCount++;
    this.lastTime = performance.now();
  }
  
  endFrame() {
    const now = performance.now();
    const frameTime = now - this.lastTime;
    this.stats.frameTime = frameTime;
    
    if (now - this.lastFpsUpdate >= this.fpsUpdateInterval) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.stats.fps = this.fps;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
      
      this.updateRendererStats();
      
      if (this.isAutoOptimize) {
        this.autoOptimize();
      }
      
      if (this.onFpsUpdate) {
        this.onFpsUpdate(this.fps, this.stats);
      }
    }
  }
  
  updateRendererStats() {
    if (!this.sceneRenderer.renderer) return;
    
    const info = this.sceneRenderer.renderer.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
  }
  
  autoOptimize() {
    if (this.fps < this.minFps && this.qualityLevel !== 'low') {
      this.degradeQuality();
    } else if (this.fps > this.targetFps * 0.9 && this.qualityLevel !== 'high') {
      this.improveQuality();
    }
  }
  
  degradeQuality() {
    const levels = ['high', 'medium', 'low'];
    const currentIndex = levels.indexOf(this.qualityLevel);
    
    if (currentIndex >= levels.length - 1) return;
    
    const newLevel = levels[currentIndex + 1];
    this.setQualityLevel(newLevel);
  }
  
  improveQuality() {
    const levels = ['high', 'medium', 'low'];
    const currentIndex = levels.indexOf(this.qualityLevel);
    
    if (currentIndex <= 0) return;
    
    const newLevel = levels[currentIndex - 1];
    this.setQualityLevel(newLevel);
  }
  
  setQualityLevel(level) {
    this.qualityLevel = level;
    const renderer = this.sceneRenderer.renderer;
    
    switch (level) {
      case 'high':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        this.setSceneDetailLevel(2);
        break;
      case 'medium':
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.shadowMap.enabled = true;
        this.setSceneDetailLevel(1);
        break;
      case 'low':
        renderer.setPixelRatio(1);
        renderer.shadowMap.enabled = false;
        this.setSceneDetailLevel(0);
        break;
    }
    
    if (this.onQualityChange) {
      this.onQualityChange(level);
    }
  }
  
  setSceneDetailLevel(level) {
    const pipelineGroups = this.sceneRenderer.pipelineGroups;
    
    Object.keys(pipelineGroups).forEach(type => {
      const group = pipelineGroups[type];
      if (!group || !group.visible) return;
      
      group.traverse(child => {
        if (child.isMesh) {
          if (level === 0) {
            child.castShadow = false;
            child.receiveShadow = false;
          } else if (level === 1) {
            child.castShadow = false;
            child.receiveShadow = true;
          } else {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        }
      });
    });
  }
  
  getStats() {
    return { ...this.stats, qualityLevel: this.qualityLevel, fps: this.fps };
  }
  
  getFps() {
    return this.fps;
  }
  
  setAutoOptimize(enabled) {
    this.isAutoOptimize = enabled;
  }
  
  setTargetFps(fps) {
    this.targetFps = Math.max(15, Math.min(120, fps));
  }
  
  setMinFps(fps) {
    this.minFps = Math.max(10, Math.min(this.targetFps - 5, fps));
  }
}

export class FrustumCuller {
  constructor(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.enabled = true;
    this.cullingInterval = 100;
    this.lastCullTime = 0;
  }
  
  update() {
    if (!this.enabled) return;
    
    const now = performance.now();
    if (now - this.lastCullTime < this.cullingInterval) return;
    this.lastCullTime = now;
    
    this.projScreenMatrix.multiplyMatrices(
      this.sceneRenderer.camera.projectionMatrix,
      this.sceneRenderer.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    
    const groups = this.sceneRenderer.pipelineGroups;
    
    Object.keys(groups).forEach(type => {
      const group = groups[type];
      if (!group || !group.visible) return;
      
      group.traverse(child => {
        if (child.isGroup && child.userData.isPipeline) {
          if (this.isGroupInFrustum(child)) {
            child.visible = true;
          } else {
            child.visible = false;
          }
        }
      });
    });
  }
  
  isGroupInFrustum(group) {
    const box = new THREE.Box3();
    
    group.traverse(child => {
      if (child.isMesh) {
        const meshBox = new THREE.Box3().setFromObject(child);
        box.union(meshBox);
      }
    });
    
    if (box.isEmpty()) return true;
    
    return this.frustum.intersectsBox(box);
  }
  
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.showAll();
    }
  }
  
  showAll() {
    const groups = this.sceneRenderer.pipelineGroups;
    Object.keys(groups).forEach(type => {
      const group = groups[type];
      if (!group) return;
      group.traverse(child => {
        if (child.isGroup) {
          child.visible = true;
        }
      });
    });
  }
  
  setCullingInterval(ms) {
    this.cullingInterval = Math.max(16, ms);
  }
}
