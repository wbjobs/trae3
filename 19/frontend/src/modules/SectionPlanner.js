import * as THREE from 'three';
import { PIPELINE_COLORS, PIPELINE_TYPE_NAMES } from '../../../shared/types.js';

export class SectionPlanner {
  constructor(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    this.isActive = false;
    this.clippingPlanes = [];
    this.clippingPlaneHelpers = [];
    this.sectionBox = null;
    this.sectionBoxHelper = null;
    this.intersectedPipelines = [];
    this.sectionResults = [];
    
    this.onSectionComplete = null;
    this.onSectionClear = null;
    
    this.sectionOrigin = new THREE.Vector3(0, 0, 0);
    this.sectionSize = { width: 20, height: 20, depth: 20 };
    
    this.dragStart = null;
    this.isDragging = false;
    this.dragMode = null;
    
    this.renderer = sceneRenderer.renderer;
    this.originalClippingPlanes = this.renderer.clippingPlanes;
    
    this.init();
  }
  
  init() {
    this.createSectionBox();
    this.createClippingPlanes();
    this.setupDragControls();
  }
  
  createSectionBox() {
    const { width, height, depth } = this.sectionSize;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    
    this.sectionBox = new THREE.Mesh(geometry, material);
    this.sectionBox.visible = false;
    this.sectionBox.userData.isSectionBox = true;
    this.sceneRenderer.scene.add(this.sectionBox);
    
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      linewidth: 2,
    });
    this.sectionBoxHelper = new THREE.LineSegments(edges, lineMaterial);
    this.sectionBoxHelper.visible = false;
    this.sectionBoxHelper.userData.isSectionBox = true;
    this.sectionBox.add(this.sectionBoxHelper);
    
    this.createCornerHandles();
  }
  
  createCornerHandles() {
    const handleGeometry = new THREE.SphereGeometry(0.4, 8, 8);
    const handleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      depthTest: false,
    });
    
    const positions = [
      [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
      [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
    ];
    
    this.handles = [];
    
    positions.forEach(pos => {
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      const { width, height, depth } = this.sectionSize;
      handle.position.set(
        pos[0] * width / 2,
        pos[1] * height / 2,
        pos[2] * depth / 2
      );
      handle.userData.isSectionHandle = true;
      handle.userData.handleIndex = this.handles.length;
      this.sectionBox.add(handle);
      this.handles.push(handle);
    });
  }
  
  createClippingPlanes() {
    this.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), this.sectionSize.width / 2),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), this.sectionSize.width / 2),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), this.sectionSize.height / 2),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), this.sectionSize.height / 2),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), this.sectionSize.depth / 2),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), this.sectionSize.depth / 2),
    ];
    
    this.updateClippingPlanes();
  }
  
  updateClippingPlanes() {
    const origin = this.sectionBox.position;
    const { width, height, depth } = this.sectionSize;
    
    this.clippingPlanes[0].set(new THREE.Vector3(1, 0, 0), -(origin.x + width / 2));
    this.clippingPlanes[1].set(new THREE.Vector3(-1, 0, 0), origin.x - width / 2);
    this.clippingPlanes[2].set(new THREE.Vector3(0, 1, 0), -(origin.y + height / 2));
    this.clippingPlanes[3].set(new THREE.Vector3(0, -1, 0), origin.y - height / 2);
    this.clippingPlanes[4].set(new THREE.Vector3(0, 0, 1), -(origin.z + depth / 2));
    this.clippingPlanes[5].set(new THREE.Vector3(0, 0, -1), origin.z - depth / 2);
  }
  
  setupDragControls() {
    const canvas = this.sceneRenderer.renderer.domElement;
    
    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
  }
  
  onMouseDown(event) {
    if (!this.isActive) return;
    
    const intersects = this.sceneRenderer.getIntersects(event, [this.sectionBox]);
    
    if (intersects.length > 0) {
      const hitObject = intersects[0].object;
      
      if (hitObject.userData.isSectionHandle) {
        this.dragMode = 'resize';
        this.dragStart = intersects[0].point.clone();
        this.activeHandle = hitObject;
        this.sceneRenderer.controls.enabled = false;
        return;
      }
      
      this.dragMode = 'move';
      this.dragStart = intersects[0].point.clone();
      this.sceneRenderer.controls.enabled = false;
    }
  }
  
  onMouseMove(event) {
    if (!this.isActive || !this.dragStart) return;
    
    const intersects = this.sceneRenderer.getIntersects(event, [this.sceneRenderer.scene.children.find(c => c.type === 'Mesh')]);
    
    const point = this.sceneRenderer.screenToWorld(event);
    if (!point) return;
    
    if (this.dragMode === 'move') {
      const delta = point.clone().sub(this.dragStart);
      this.sectionBox.position.add(delta);
      this.dragStart = point.clone();
      this.updateClippingPlanes();
    } else if (this.dragMode === 'resize' && this.activeHandle) {
      const delta = point.clone().sub(this.sectionBox.position);
      const index = this.activeHandle.userData.handleIndex;
      const sign = index < 4 ? -1 : 1;
      
      const axis = index % 2 === 0 ? 'x' : (index % 4 < 2 ? 'z' : 'y');
      
      const newSize = Math.max(5, Math.abs(delta[axis]) * 2);
      
      if (axis === 'x') this.sectionSize.width = newSize;
      else if (axis === 'y') this.sectionSize.height = newSize;
      else this.sectionSize.depth = newSize;
      
      this.updateSectionBoxGeometry();
      this.updateClippingPlanes();
    }
  }
  
  onMouseUp() {
    this.dragStart = null;
    this.dragMode = null;
    this.activeHandle = null;
    this.sceneRenderer.controls.enabled = true;
  }
  
  updateSectionBoxGeometry() {
    const { width, height, depth } = this.sectionSize;
    
    this.sectionBox.geometry.dispose();
    this.sectionBox.geometry = new THREE.BoxGeometry(width, height, depth);
    
    const edges = new THREE.EdgesGeometry(this.sectionBox.geometry);
    if (this.sectionBoxHelper) {
      this.sectionBoxHelper.geometry.dispose();
      this.sectionBoxHelper.geometry = edges;
    }
    
    const positions = [
      [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
      [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
    ];
    
    this.handles.forEach((handle, i) => {
      handle.position.set(
        positions[i][0] * width / 2,
        positions[i][1] * height / 2,
        positions[i][2] * depth / 2
      );
    });
  }
  
  activate(position = null) {
    this.isActive = true;
    
    if (position) {
      this.sectionBox.position.copy(position);
    } else {
      this.sectionBox.position.copy(this.sceneRenderer.controls.target);
    }
    
    this.sectionBox.visible = true;
    this.sectionBoxHelper.visible = true;
    
    this.enableClipping();
    this.updateClippingPlanes();
    this.computeIntersection();
  }
  
  deactivate() {
    this.isActive = false;
    this.sectionBox.visible = false;
    this.sectionBoxHelper.visible = false;
    this.disableClipping();
    this.intersectedPipelines = [];
    this.sectionResults = [];
    
    if (this.onSectionClear) {
      this.onSectionClear();
    }
  }
  
  enableClipping() {
    this.renderer.clippingPlanes = this.clippingPlanes;
    this.renderer.localClippingEnabled = true;
    
    Object.keys(this.sceneRenderer.pipelineGroups).forEach(type => {
      const group = this.sceneRenderer.pipelineGroups[type];
      if (!group) return;
      
      group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.clippingPlanes = this.clippingPlanes;
          child.material.clipShadows = true;
          child.material.needsUpdate = true;
        }
      });
    });
  }
  
  disableClipping() {
    this.renderer.clippingPlanes = [];
    this.renderer.localClippingEnabled = false;
    
    Object.keys(this.sceneRenderer.pipelineGroups).forEach(type => {
      const group = this.sceneRenderer.pipelineGroups[type];
      if (!group) return;
      
      group.traverse(child => {
        if (child.isMesh && child.material) {
          child.material.clippingPlanes = [];
          child.material.clipShadows = false;
          child.material.needsUpdate = true;
        }
      });
    });
  }
  
  computeIntersection() {
    this.intersectedPipelines = [];
    this.sectionResults = [];
    
    const box = new THREE.Box3().setFromObject(this.sectionBox);
    
    const groups = this.sceneRenderer.pipelineGroups;
    
    Object.keys(groups).forEach(type => {
      const group = groups[type];
      if (!group || !group.visible) return;
      
      group.children.forEach(pipelineGroup => {
        if (!pipelineGroup.userData.isPipeline) return;
        
        const pipelineBox = new THREE.Box3().setFromObject(pipelineGroup);
        
        if (box.intersectsBox(pipelineBox)) {
          const pipelineData = pipelineGroup.userData;
          const intersectedPoints = this.getIntersectedPoints(pipelineData, box);
          
          if (intersectedPoints.length > 0) {
            const result = {
              id: pipelineData._id,
              name: pipelineData.name,
              type: pipelineData.type,
              typeName: PIPELINE_TYPE_NAMES[pipelineData.type] || pipelineData.type,
              diameter: pipelineData.diameter,
              material: pipelineData.material,
              depth: pipelineData.depth,
              totalPoints: pipelineData.points.length,
              intersectedPoints: intersectedPoints,
              intersectedPointCount: intersectedPoints.length,
              color: '#' + (PIPELINE_COLORS[pipelineData.type] || 0x888888).toString(16).padStart(6, '0'),
            };
            
            this.intersectedPipelines.push(pipelineGroup);
            this.sectionResults.push(result);
          }
        }
      });
    });
    
    if (this.onSectionComplete) {
      this.onSectionComplete(this.sectionResults);
    }
    
    return this.sectionResults;
  }
  
  getIntersectedPoints(pipelineData, box) {
    const intersected = [];
    
    pipelineData.points.forEach(point => {
      const v = new THREE.Vector3(point.x, point.y, point.z);
      if (box.containsPoint(v)) {
        intersected.push({
          x: Number(point.x.toFixed(2)),
          y: Number(point.y.toFixed(2)),
          z: Number(point.z.toFixed(2)),
        });
      }
    });
    
    return intersected;
  }
  
  setSectionSize(width, height, depth) {
    this.sectionSize.width = Math.max(5, width);
    this.sectionSize.height = Math.max(5, height);
    this.sectionSize.depth = Math.max(5, depth);
    
    this.updateSectionBoxGeometry();
    this.updateClippingPlanes();
    
    if (this.isActive) {
      this.computeIntersection();
    }
  }
  
  setSectionPosition(x, y, z) {
    this.sectionBox.position.set(x, y, z);
    this.updateClippingPlanes();
    
    if (this.isActive) {
      this.computeIntersection();
    }
  }
  
  getSectionResults() {
    return [...this.sectionResults];
  }
  
  getSectionBounds() {
    const pos = this.sectionBox.position;
    const { width, height, depth } = this.sectionSize;
    
    return {
      minX: pos.x - width / 2,
      maxX: pos.x + width / 2,
      minY: pos.y - height / 2,
      maxY: pos.y + height / 2,
      minZ: pos.z - depth / 2,
      maxZ: pos.z + depth / 2,
      width,
      height,
      depth,
    };
  }
  
  exportSectionData() {
    return {
      bounds: this.getSectionBounds(),
      position: {
        x: this.sectionBox.position.x,
        y: this.sectionBox.position.y,
        z: this.sectionBox.position.z,
      },
      pipelines: this.sectionResults,
      totalPipelines: this.sectionResults.length,
      totalPoints: this.sectionResults.reduce((sum, r) => sum + r.intersectedPointCount, 0),
    };
  }
  
  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
    return this.isActive;
  }
  
  dispose() {
    this.deactivate();
    
    if (this.sectionBox) {
      this.sectionBox.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.sceneRenderer.scene.remove(this.sectionBox);
    }
  }
}
