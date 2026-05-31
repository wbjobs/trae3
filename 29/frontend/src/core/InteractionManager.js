import * as THREE from 'three';
import { EventDispatcher } from 'three';

export class InteractionManager extends EventDispatcher {
  constructor(camera, domElement, options = {}) {
    super();
    
    this.camera = camera;
    this.domElement = domElement;
    this.options = {
      hoverEnabled: true,
      clickEnabled: true,
      doubleClickEnabled: true,
      boxSelectEnabled: true,
      hoverColor: 0xffff00,
      selectColor: 0x00ff00,
      threshold: 1,
      ...options
    };

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = this.options.threshold;
    this.raycaster.params.Points.threshold = this.options.threshold;

    this.mouse = new THREE.Vector2();
    this.objects = [];
    
    this.hoveredObject = null;
    this.selectedObject = null;
    this.selectedObjects = new Set();
    this.boxSelection = null;
    this.isBoxSelecting = false;
    this.boxStart = new THREE.Vector2();
    this.boxEnd = new THREE.Vector2();
    this.lastClickedObject = null;

    this.originalColors = new WeakMap();
    this.originalMaterials = new WeakMap();
    this.hoveredMaterials = new WeakMap();
    this.selectedMaterials = new WeakMap();
    this.glowMeshes = new WeakMap();

    this.tooltipElement = null;
    this._createTooltip();
    this._bindEvents();
  }

  _createTooltip() {
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
      display: none;
      max-width: 250px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    document.body.appendChild(this.tooltipElement);
  }

  _bindEvents() {
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onDoubleClick = this._onDoubleClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    this.domElement.addEventListener('mousemove', this._onMouseMove);
    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('mouseup', this._onMouseUp);
    this.domElement.addEventListener('click', this._onClick);
    this.domElement.addEventListener('dblclick', this._onDoubleClick);
    document.addEventListener('keydown', this._onKeyDown);
  }

  _unbindEvents() {
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('mouseup', this._onMouseUp);
    this.domElement.removeEventListener('click', this._onClick);
    this.domElement.removeEventListener('dblclick', this._onDoubleClick);
    document.removeEventListener('keydown', this._onKeyDown);
  }

  _updateMouse(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _onMouseMove(event) {
    this._updateMouse(event);
    this._updateTooltipPosition(event);

    if (this.isBoxSelecting) {
      this.boxEnd.set(event.clientX, event.clientY);
      this._updateBoxSelection();
      return;
    }

    if (!this.options.hoverEnabled) return;

    const intersects = this._raycast();
    
    if (intersects.length > 0) {
      const object = intersects[0].object;
      if (this.hoveredObject !== object) {
        this._setHovered(object);
      }
      this._showTooltip(object, event);
    } else if (this.hoveredObject) {
      this._clearHovered();
      this._hideTooltip();
    }
  }

  _onMouseDown(event) {
    if (event.button !== 0) return;
    
    if (event.shiftKey && this.options.boxSelectEnabled) {
      this.isBoxSelecting = true;
      this.boxStart.set(event.clientX, event.clientY);
      this.boxEnd.set(event.clientX, event.clientY);
      this._createBoxSelection();
      this.dispatchEvent({
        type: 'boxSelectStart',
        startPoint: { x: event.clientX, y: event.clientY }
      });
    }
  }

  _onMouseUp(event) {
    if (this.isBoxSelecting) {
      this.isBoxSelecting = false;
      const selectedObjects = this._getBoxSelectionObjects();
      const isCtrl = event.ctrlKey || event.metaKey;
      
      this._removeBoxSelection();
      
      if (selectedObjects.length > 0) {
        if (!isCtrl) {
          this._clearSelection();
        }
        selectedObjects.forEach(obj => this._selectObject(obj, true));
        
        this.dispatchEvent({
          type: 'boxSelect',
          objects: selectedObjects
        });
        
        this.dispatchEvent({
          type: 'boxSelectEnd',
          objects: this.getSelectedObjects()
        });
        
        if (this.selectedObjects.size > 1) {
          this.dispatchEvent({
            type: 'batchSelect',
            objects: this.getSelectedObjects()
          });
        }
      }
    }
  }

  _onClick(event) {
    if (this.isBoxSelecting) return;
    if (!this.options.clickEnabled) return;

    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const object = intersects[0].object;
      const isCtrl = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      if (isCtrl) {
        if (this.selectedObjects.has(object)) {
          this._deselectObject(object);
        } else {
          this._selectObject(object, true);
        }
        this.lastClickedObject = object;
      } else if (isShift && this.lastClickedObject) {
        this._selectRange(this.lastClickedObject, object);
      } else {
        this._clearSelection();
        this._selectObject(object, false);
        this.lastClickedObject = object;
      }

      this.dispatchEvent({
        type: 'select',
        object,
        objects: this.getSelectedObjects(),
        intersection: intersects[0]
      });

      if (this.selectedObjects.size > 1) {
        this.dispatchEvent({
          type: 'batchSelect',
          objects: this.getSelectedObjects()
        });
      }
    } else {
      const deselectedObjects = this.getSelectedObjects();
      this._clearSelection();
      this.lastClickedObject = null;
      this.dispatchEvent({ type: 'deselect' });
      
      if (deselectedObjects.length > 1) {
        this.dispatchEvent({
          type: 'batchDeselect',
          objects: deselectedObjects
        });
      }
    }
  }

  _onDoubleClick(event) {
    if (!this.options.doubleClickEnabled) return;

    this._updateMouse(event);
    const intersects = this._raycast();

    if (intersects.length > 0) {
      const object = intersects[0].object;
      this.dispatchEvent({
        type: 'doubleClick',
        object,
        intersection: intersects[0]
      });
    }
  }

  _onKeyDown(event) {
    if (event.key === 'Escape') {
      const deselectedObjects = this.getSelectedObjects();
      this._clearSelection();
      this._clearHovered();
      this.lastClickedObject = null;
      this.dispatchEvent({ type: 'deselect' });
      
      if (deselectedObjects.length > 1) {
        this.dispatchEvent({
          type: 'batchDeselect',
          objects: deselectedObjects
        });
      }
    }
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.preventDefault();
      this.selectAll();
    }
    
    if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
      event.preventDefault();
      this.invertSelection();
    }
  }

  _raycast() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.intersectObjects(this.objects, true);
  }

  /**
   * 为对象创建外发光效果
   * @private
   * @param {THREE.Object3D} object - 目标对象
   * @param {number} color - 发光颜色
   * @param {number} intensity - 发光强度
   */
  _createGlowEffect(object, color, intensity = 0.5) {
    object.traverse((child) => {
      if (child.isMesh && child.geometry) {
        if (!this.originalMaterials.has(child)) {
          this.originalMaterials.set(child, child.material);
        }

        const glowMaterial = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: intensity,
          side: THREE.BackSide,
          depthWrite: false
        });

        const glowMesh = new THREE.Mesh(child.geometry, glowMaterial);
        glowMesh.scale.multiplyScalar(1.1);
        glowMesh.renderOrder = 999;
        child.add(glowMesh);
        
        this.glowMeshes.set(child, glowMesh);
      }
    });
  }

  /**
   * 移除对象的外发光效果
   * @private
   * @param {THREE.Object3D} object - 目标对象
   */
  _removeGlowEffect(object) {
    object.traverse((child) => {
      if (child.isMesh && this.glowMeshes.has(child)) {
        const glowMesh = this.glowMeshes.get(child);
        child.remove(glowMesh);
        glowMesh.geometry?.dispose();
        glowMesh.material?.dispose();
        this.glowMeshes.delete(child);
      }
    });
  }

  _setHovered(object) {
    this._clearHovered();
    this.hoveredObject = object;

    if (!this.selectedObjects.has(object)) {
      this._createGlowEffect(object, this.options.hoverColor, 0.4);
    }

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!this.originalColors.has(child)) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          this.originalColors.set(child, materials.map(m => m.color.clone()));
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const hoverMaterials = materials.map(m => {
          const hoverMat = m.clone();
          hoverMat.emissive = hoverMat.emissive || new THREE.Color(0x000000);
          hoverMat.emissive.setHex(this.options.hoverColor);
          hoverMat.emissiveIntensity = 0.2;
          return hoverMat;
        });
        this.hoveredMaterials.set(child, hoverMaterials);
        child.material = hoverMaterials.length === 1 ? hoverMaterials[0] : hoverMaterials;
      }
    });

    this.dispatchEvent({ type: 'hover', object });
  }

  _clearHovered() {
    if (!this.hoveredObject) return;

    if (!this.selectedObjects.has(this.hoveredObject)) {
      this._removeGlowEffect(this.hoveredObject);
    }

    this.hoveredObject.traverse((child) => {
      if (child.isMesh && this.hoveredMaterials.has(child)) {
        const originalColors = this.originalColors.get(child);
        if (originalColors) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((m, i) => {
            if (originalColors[i]) {
              m.color.copy(originalColors[i]);
              if (m.emissive) m.emissive.setHex(0x000000);
              m.emissiveIntensity = 0;
            }
          });
        }
        this.hoveredMaterials.delete(child);
      }
    });

    const prevObject = this.hoveredObject;
    this.hoveredObject = null;
    this.dispatchEvent({ type: 'hoverOut', object: prevObject });
  }

  /**
   * 选择单个对象
   * @private
   * @param {THREE.Object3D} object - 要选择的对象
   * @param {boolean} [additive=false] - 是否追加选择
   */
  _selectObject(object, additive = false) {
    if (!additive) {
      this._clearSelection();
    }

    if (this.selectedObjects.has(object)) return;

    this.selectedObjects.add(object);
    this.selectedObject = this.selectedObjects.size === 1 ? object : Array.from(this.selectedObjects);

    if (this.hoveredObject === object) {
      this._removeGlowEffect(object);
    }
    this._createGlowEffect(object, this.options.selectColor, 0.5);

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!this.originalColors.has(child)) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          this.originalColors.set(child, materials.map(m => m.color.clone()));
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const selectMaterials = materials.map(m => {
          const selectMat = m.clone();
          selectMat.emissive = selectMat.emissive || new THREE.Color(0x000000);
          selectMat.emissive.setHex(this.options.selectColor);
          selectMat.emissiveIntensity = 0.3;
          return selectMat;
        });
        this.selectedMaterials.set(child, selectMaterials);
        child.material = selectMaterials.length === 1 ? selectMaterials[0] : selectMaterials;
      }
    });
  }

  /**
   * 取消选择单个对象
   * @private
   * @param {THREE.Object3D} object - 要取消选择的对象
   */
  _deselectObject(object) {
    if (!this.selectedObjects.has(object)) return;

    this.selectedObjects.delete(object);
    this.selectedObject = this.selectedObjects.size === 1 ? 
      Array.from(this.selectedObjects)[0] : 
      (this.selectedObjects.size > 1 ? Array.from(this.selectedObjects) : null);

    this._removeGlowEffect(object);

    if (this.hoveredObject === object) {
      this._createGlowEffect(object, this.options.hoverColor, 0.4);
    }

    object.traverse((child) => {
      if (child.isMesh && this.selectedMaterials.has(child)) {
        const originalColors = this.originalColors.get(child);
        if (originalColors) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((m, i) => {
            if (originalColors[i]) {
              m.color.copy(originalColors[i]);
              if (m.emissive) m.emissive.setHex(0x000000);
              m.emissiveIntensity = 0;
            }
          });
        }
        this.selectedMaterials.delete(child);
      }
    });
  }

  /**
   * 范围选择（Shift+点击）
   * @private
   * @param {THREE.Object3D} startObject - 起始对象
   * @param {THREE.Object3D} endObject - 结束对象
   */
  _selectRange(startObject, endObject) {
    const startIndex = this.objects.indexOf(startObject);
    const endIndex = this.objects.indexOf(endObject);
    
    if (startIndex === -1 || endIndex === -1) return;

    this._clearSelection();
    
    const min = Math.min(startIndex, endIndex);
    const max = Math.max(startIndex, endIndex);
    
    for (let i = min; i <= max; i++) {
      this._selectObject(this.objects[i], true);
    }
  }

  _clearSelection() {
    this.selectedObjects.forEach(obj => {
      this._removeGlowEffect(obj);
      
      obj.traverse((child) => {
        if (child.isMesh && this.selectedMaterials.has(child)) {
          const originalColors = this.originalColors.get(child);
          if (originalColors) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((m, i) => {
              if (originalColors[i]) {
                m.color.copy(originalColors[i]);
                if (m.emissive) m.emissive.setHex(0x000000);
                m.emissiveIntensity = 0;
              }
            });
          }
          this.selectedMaterials.delete(child);
        }
      });
    });

    this.selectedObjects.clear();
    this.selectedObject = null;
  }

  /**
   * 获取所有选中的对象
   * @returns {Array<THREE.Object3D>} 选中的对象数组
   */
  getSelectedObjects() {
    return Array.from(this.selectedObjects);
  }

  /**
   * 设置选中的对象
   * @param {Array<THREE.Object3D>|THREE.Object3D} objects - 要选中的对象或对象数组
   */
  setSelectedObjects(objects) {
    this._clearSelection();
    const objectArray = Array.isArray(objects) ? objects : [objects];
    objectArray.forEach(obj => {
      if (this.objects.includes(obj)) {
        this._selectObject(obj, true);
      }
    });
  }

  /**
   * 反选
   */
  invertSelection() {
    const currentSelected = new Set(this.selectedObjects);
    this._clearSelection();
    
    this.objects.forEach(obj => {
      if (!currentSelected.has(obj)) {
        this._selectObject(obj, true);
      }
    });

    if (this.selectedObjects.size > 0) {
      this.dispatchEvent({
        type: this.selectedObjects.size > 1 ? 'batchSelect' : 'select',
        objects: this.getSelectedObjects(),
        object: this.selectedObjects.size === 1 ? this.getSelectedObjects()[0] : null
      });
    }
  }

  /**
   * 全选
   * @param {Function} [filter] - 可选的过滤函数
   */
  selectAll(filter) {
    this._clearSelection();
    
    this.objects.forEach(obj => {
      if (!filter || filter(obj)) {
        this._selectObject(obj, true);
      }
    });

    if (this.selectedObjects.size > 0) {
      this.dispatchEvent({
        type: this.selectedObjects.size > 1 ? 'batchSelect' : 'select',
        objects: this.getSelectedObjects(),
        object: this.selectedObjects.size === 1 ? this.getSelectedObjects()[0] : null
      });
    }
  }

  _createBoxSelection() {
    this._removeBoxSelection();
    this.boxSelection = document.createElement('div');
    this.boxSelection.style.cssText = `
      position: absolute;
      border: 1px solid #00ffff;
      background: rgba(0, 255, 255, 0.1);
      pointer-events: none;
      z-index: 999;
    `;
    document.body.appendChild(this.boxSelection);
    this._updateBoxSelection();
  }

  _updateBoxSelection() {
    if (!this.boxSelection) return;

    const left = Math.min(this.boxStart.x, this.boxEnd.x);
    const top = Math.min(this.boxStart.y, this.boxEnd.y);
    const width = Math.abs(this.boxEnd.x - this.boxStart.x);
    const height = Math.abs(this.boxEnd.y - this.boxStart.y);

    this.boxSelection.style.left = `${left}px`;
    this.boxSelection.style.top = `${top}px`;
    this.boxSelection.style.width = `${width}px`;
    this.boxSelection.style.height = `${height}px`;
  }

  _removeBoxSelection() {
    if (this.boxSelection) {
      this.boxSelection.remove();
      this.boxSelection = null;
    }
  }

  _getBoxSelectionObjects() {
    const rect = this.domElement.getBoundingClientRect();
    const left = Math.min(this.boxStart.x, this.boxEnd.x) - rect.left;
    const right = Math.max(this.boxStart.x, this.boxEnd.x) - rect.left;
    const top = Math.min(this.boxStart.y, this.boxEnd.y) - rect.top;
    const bottom = Math.max(this.boxStart.y, this.boxEnd.y) - rect.top;

    const selected = [];
    const frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();

    const x1 = (left / rect.width) * 2 - 1;
    const x2 = (right / rect.width) * 2 - 1;
    const y1 = -(top / rect.height) * 2 + 1;
    const y2 = -(bottom / rect.height) * 2 + 1;

    const min = new THREE.Vector4(x1, y1, -1, 1);
    const max = new THREE.Vector4(x2, y2, 1, 1);

    projScreenMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );

    const nfc = new THREE.Vector3().setFromMatrixPosition(this.camera.matrixWorld);
    
    this.objects.forEach(object => {
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return;

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const sphere = new THREE.Sphere(center, maxDim * 0.5);

      if (frustum.intersectsSphere(sphere)) {
        const v = center.clone().project(this.camera);
        if (v.x >= x1 && v.x <= x2 && v.y >= y2 && v.y <= y1) {
          selected.push(object);
        }
      }
    });

    return selected;
  }

  _showTooltip(object, event) {
    const info = object.userData?.info || object.name || 'Object';
    let content = '';
    
    if (typeof info === 'string') {
      content = info;
    } else if (typeof info === 'object') {
      content = Object.entries(info)
        .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
        .join('');
    }

    if (content) {
      this.tooltipElement.innerHTML = content;
      this.tooltipElement.style.display = 'block';
      this._updateTooltipPosition(event);
    }
  }

  _updateTooltipPosition(event) {
    if (!this.tooltipElement) return;
    this.tooltipElement.style.left = `${event.clientX + 15}px`;
    this.tooltipElement.style.top = `${event.clientY + 15}px`;
  }

  _hideTooltip() {
    if (this.tooltipElement) {
      this.tooltipElement.style.display = 'none';
    }
  }

  addObjects(objects) {
    const objectArray = Array.isArray(objects) ? objects : [objects];
    this.objects.push(...objectArray);
  }

  removeObjects(objects) {
    const objectArray = Array.isArray(objects) ? objects : [objects];
    objectArray.forEach(obj => {
      const index = this.objects.indexOf(obj);
      if (index > -1) {
        this.objects.splice(index, 1);
      }
      if (this.selectedObjects.has(obj)) {
        this._deselectObject(obj);
      }
      if (this.hoveredObject === obj) {
        this._clearHovered();
      }
      if (this.lastClickedObject === obj) {
        this.lastClickedObject = null;
      }
    });
  }

  clearObjects() {
    this.selectedObjects.forEach(obj => this._removeGlowEffect(obj));
    if (this.hoveredObject) {
      this._removeGlowEffect(this.hoveredObject);
    }
    this.objects = [];
    this._clearSelection();
    this._clearHovered();
    this.lastClickedObject = null;
  }

  getSelected() {
    return this.selectedObject;
  }

  getHovered() {
    return this.hoveredObject;
  }

  update() {}

  dispose() {
    this._unbindEvents();
    
    this.selectedObjects.forEach(obj => this._removeGlowEffect(obj));
    if (this.hoveredObject) {
      this._removeGlowEffect(this.hoveredObject);
    }
    
    this._clearSelection();
    this._clearHovered();
    this._removeBoxSelection();
    this._hideTooltip();
    
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }
    
    this.objects = [];
    this.selectedObjects.clear();
    this.lastClickedObject = null;
    this.originalColors = new WeakMap();
    this.originalMaterials = new WeakMap();
    this.hoveredMaterials = new WeakMap();
    this.selectedMaterials = new WeakMap();
    this.glowMeshes = new WeakMap();
  }
}
