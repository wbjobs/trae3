import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { annotations as annotationApi } from '../api';

class AnnotationManager {
  constructor(scene, camera, options = {}) {
    this.scene = scene;
    this.camera = camera;
    this.options = {
      defaultStyle: {
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid #333'
      },
      iconSize: 32,
      dragEnabled: true,
      container: null,
      ...options
    };

    this.container = this.options.container;
    this.annotations = new Map();
    this.labelRenderer = null;
    this.dragging = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.enabled = true;
    this.xzPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.selectedAnnotations = new Set();
    this.boxSelection = null;
    this.isBoxSelecting = false;
    this.boxStartPoint = null;
    this.boxEndPoint = null;
    this.batchToolbar = null;
    this.clipboard = [];
    this.dragStartPositions = new Map();
    this.draggingAnnotations = [];

    this._initLabelRenderer();
    this._bindEvents();
  }

  _initLabelRenderer() {
    if (typeof document !== 'undefined') {
      this.labelRenderer = new CSS2DRenderer();
      
      const width = this.container ? this.container.clientWidth : window.innerWidth;
      const height = this.container ? this.container.clientHeight : window.innerHeight;
      this.labelRenderer.setSize(width, height);
      
      this.labelRenderer.domElement.style.position = 'absolute';
      this.labelRenderer.domElement.style.top = '0';
      this.labelRenderer.domElement.style.left = '0';
      this.labelRenderer.domElement.style.pointerEvents = 'none';
      this.labelRenderer.domElement.style.zIndex = '10';
      
      if (this.container) {
        this.container.appendChild(this.labelRenderer.domElement);
      } else {
        document.body.appendChild(this.labelRenderer.domElement);
      }
    }
  }

  _bindEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('mousedown', this._onMouseDown.bind(this));
    window.addEventListener('mousemove', this._onMouseMove.bind(this));
    window.addEventListener('mouseup', this._onMouseUp.bind(this));
    window.addEventListener('resize', this._onResize.bind(this));
  }

  _getContainerRect() {
    if (this.container) {
      return this.container.getBoundingClientRect();
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
  }

  _updateMouseCoords(event) {
    const rect = this._getContainerRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _getIntersectionPoint(event) {
    this._updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const point = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.xzPlane, point);
    
    return point;
  }

  _onMouseDown(event) {
    if (!this.enabled) return;

    if (event.button === 0 && event.shiftKey && this.options.dragEnabled) {
      this.startBoxSelection({ x: event.clientX, y: event.clientY });
      event.preventDefault();
      return;
    }

    this._updateMouseCoords(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const objects = Array.from(this.annotations.values())
      .map(a => a.sprite || a.marker)
      .filter(Boolean);
    
    const intersects = this.raycaster.intersectObjects(objects, true);
    
    if (intersects.length > 0) {
      const clicked = intersects[0].object;
      const annotation = Array.from(this.annotations.values()).find(
        a => a.sprite === clicked || a.marker === clicked
      );
      
      if (annotation) {
        const isCtrl = event.ctrlKey || event.metaKey;
        const isSelected = this.selectedAnnotations.has(annotation.id);

        if (isCtrl) {
          if (isSelected) {
            this.deselectAnnotation(annotation.id);
          } else {
            this.selectAnnotation(annotation.id, true);
          }
        } else if (!isSelected) {
          this.selectAnnotation(annotation.id, false);
        }

        if (annotation.draggable && this.options.dragEnabled) {
          if (this.selectedAnnotations.size > 1 && isSelected) {
            this.draggingAnnotations = this.getSelectedAnnotations();
          } else {
            this.draggingAnnotations = [annotation];
          }
          
          this.dragStartPositions.clear();
          this.draggingAnnotations.forEach(anno => {
            const pos = anno.object3D?.position || anno.sprite?.position;
            if (pos) {
              this.dragStartPositions.set(anno.id, pos.clone());
            }
          });
          
          this.dragStartPoint = this._getIntersectionPoint(event);
          this.dragging = annotation;
          event.preventDefault();
        }
      }
    } else {
      this.clearSelection();
      this.hideBatchToolbar();
    }
  }

  _onMouseMove(event) {
    if (this.isBoxSelecting) {
      this.updateBoxSelection({ x: event.clientX, y: event.clientY });
      return;
    }

    if (!this.dragging || this.draggingAnnotations.length === 0) return;

    const currentPos = this._getIntersectionPoint(event);
    
    if (currentPos && this.dragStartPoint) {
      const offset = new THREE.Vector3().subVectors(currentPos, this.dragStartPoint);
      
      this.draggingAnnotations.forEach(anno => {
        const startPos = this.dragStartPositions.get(anno.id);
        if (startPos) {
          const newPos = startPos.clone().add(offset);
          this._updateAnnotationPosition(anno, newPos);
        }
      });
    }
  }

  _updateAnnotationPosition(annotation, position) {
    if (!annotation || !position) return;

    if (annotation.object3D) {
      annotation.object3D.position.copy(position);
    }
    if (annotation.label) {
      annotation.label.position.copy(position);
    }
    if (annotation.sprite) {
      annotation.sprite.position.copy(position);
    }
  }

  _updateAnnotationPositionById(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    const position = annotation.object3D?.position || annotation.sprite?.position;
    if (!position) return;

    this._updateAnnotationPosition(annotation, position);
  }

  _onMouseUp(event) {
    if (this.isBoxSelecting) {
      const isCtrl = event?.ctrlKey || event?.metaKey;
      const selected = this.endBoxSelection(isCtrl);
      
      if (selected.length > 0) {
        const rect = this._getContainerRect();
        this.showBatchToolbar({
          x: Math.min(this.boxStartPoint?.x || 0, this.boxEndPoint?.x || 0),
          y: Math.min(this.boxStartPoint?.y || 0, this.boxEndPoint?.y || 0) - 50
        });
      }
      return;
    }

    if (this.dragging) {
      this.draggingAnnotations.forEach(anno => {
        if (anno.onDragEnd) {
          anno.onDragEnd(anno);
        }
      });
      
      if (this.selectedAnnotations.size > 1) {
        const pos = this.dragging.object3D?.position || this.dragging.sprite?.position;
        if (pos) {
          this.showBatchToolbar({
            x: event.clientX,
            y: event.clientY - 50
          });
        }
      }
    }
    
    this.dragging = null;
    this.draggingAnnotations = [];
    this.dragStartPositions.clear();
    this.dragStartPoint = null;
  }

  _onResize() {
    this.updateSize();
  }

  updateSize(width, height) {
    if (!this.labelRenderer) return;

    if (width !== undefined && height !== undefined) {
      this.labelRenderer.setSize(width, height);
    } else if (this.container) {
      this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
    } else {
      this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  setContainer(container) {
    if (this.container === container) return;

    if (this.labelRenderer && this.labelRenderer.domElement.parentNode) {
      this.labelRenderer.domElement.parentNode.removeChild(this.labelRenderer.domElement);
    }

    this.container = container;
    this.options.container = container;

    if (this.labelRenderer && container) {
      container.appendChild(this.labelRenderer.domElement);
    }

    this.updateSize();
  }

  async createTextAnnotation(options) {
    const {
      position,
      text,
      title,
      style = {},
      draggable = false,
      data = {},
      onDragEnd = null
    } = options;

    const pos = new THREE.Vector3(position.x, position.y, position.z);

    const div = document.createElement('div');
    div.className = 'annotation-label';
    div.style.cssText = this._buildStyleString({
      ...this.options.defaultStyle,
      ...style
    });

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.style.fontWeight = 'bold';
      titleEl.style.marginBottom = '2px';
      titleEl.textContent = title;
      div.appendChild(titleEl);
    }

    const contentEl = document.createElement('div');
    contentEl.textContent = text;
    div.appendChild(contentEl);

    const label = new CSS2DObject(div);
    label.position.copy(pos);

    const markerGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: style.color || '#4CAF50',
      transparent: true,
      opacity: 0.8
    });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(pos);

    const annotation = {
      id: data.id || `anno_${Date.now()}`,
      type: 'text',
      object3D: marker,
      label,
      marker,
      data,
      draggable,
      onDragEnd,
      visible: true
    };

    this.annotations.set(annotation.id, annotation);
    this.scene.add(marker);
    this.scene.add(label);

    return annotation;
  }

  async createIconAnnotation(options) {
    const {
      position,
      icon,
      title,
      size = this.options.iconSize,
      color = '#ffffff',
      draggable = false,
      data = {},
      onDragEnd = null
    } = options;

    const pos = new THREE.Vector3(position.x, position.y, position.z);

    let sprite;
    if (icon.startsWith('data:') || icon.startsWith('http')) {
      const textureLoader = new THREE.TextureLoader();
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(icon, resolve, undefined, reject);
      });
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        color: color,
        transparent: true
      });
      sprite = new THREE.Sprite(spriteMaterial);
    } else {
      const canvas = this._createIconCanvas(icon, size, color);
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true
      });
      sprite = new THREE.Sprite(spriteMaterial);
    }

    const scale = size / 100;
    sprite.scale.set(scale, scale, 1);
    sprite.position.copy(pos);

    let label = null;
    if (title) {
      const div = document.createElement('div');
      div.className = 'annotation-icon-label';
      div.style.cssText = `
        color: #fff;
        font-size: 12px;
        background: rgba(0,0,0,0.6);
        padding: 2px 6px;
        border-radius: 3px;
        white-space: nowrap;
        margin-top: ${size / 2 + 5}px;
      `;
      div.textContent = title;
      label = new CSS2DObject(div);
      label.position.copy(pos);
    }

    const annotation = {
      id: data.id || `anno_${Date.now()}`,
      type: 'icon',
      object3D: sprite,
      sprite,
      label,
      data,
      draggable,
      onDragEnd,
      visible: true
    };

    this.annotations.set(annotation.id, annotation);
    this.scene.add(sprite);
    if (label) this.scene.add(label);

    return annotation;
  }

  _createIconCanvas(icon, size, color) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;

    switch (icon) {
      case 'pin':
        ctx.beginPath();
        ctx.arc(size / 2, size / 3, size / 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(size / 2, size / 3 + size / 3);
        ctx.lineTo(size / 2, size);
        ctx.lineTo(size / 2 - size / 6, size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'warning':
        ctx.beginPath();
        ctx.moveTo(size / 2, size / 6);
        ctx.lineTo(size - size / 6, size - size / 6);
        ctx.lineTo(size / 6, size - size / 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${size / 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', size / 2, size / 2);
        break;
      case 'info':
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${size / 2}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('i', size / 2, size / 2);
        break;
      case 'danger':
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(size / 3, size / 3);
        ctx.lineTo(size - size / 3, size - size / 3);
        ctx.moveTo(size - size / 3, size / 3);
        ctx.lineTo(size / 3, size - size / 3);
        ctx.stroke();
        break;
      default:
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    return canvas;
  }

  _buildStyleString(style) {
    return Object.entries(style)
      .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
      .join('; ');
  }

  async addAnnotation(annotationData) {
    const saved = await annotationApi.create(annotationData);
    
    const options = {
      position: annotationData.position,
      text: annotationData.content || annotationData.description,
      title: annotationData.title || annotationData.name,
      data: saved,
      draggable: true,
      onDragEnd: (anno) => this._saveAnnotationPosition(anno)
    };

    if (annotationData.type === 'monitoring_point' || annotationData.type === 'safety') {
      return this.createIconAnnotation({
        ...options,
        icon: annotationData.type === 'safety' ? 'danger' : 'info',
        color: this._getStatusColor(annotationData.status)
      });
    } else if (annotationData.type === 'defect') {
      return this.createIconAnnotation({
        ...options,
        icon: 'warning',
        color: this._getStatusColor(annotationData.status)
      });
    } else {
      return this.createTextAnnotation({
        ...options,
        style: {
          backgroundColor: this._getStatusColor(annotationData.status, true)
        }
      });
    }
  }

  async updateAnnotation(id, updates) {
    const annotation = this.annotations.get(id);
    if (!annotation) return null;

    const updated = await annotationApi.update(id, updates);
    
    Object.assign(annotation.data, updated);
    
    if (annotation.label && annotation.label.element) {
      const contentEl = annotation.label.element.querySelector('div:last-child');
      if (contentEl && updates.content) {
        contentEl.textContent = updates.content;
      }
      const titleEl = annotation.label.element.querySelector('div:first-child');
      if (titleEl && updates.title) {
        titleEl.textContent = updates.title;
      }
    }

    return annotation;
  }

  async deleteAnnotation(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return false;

    await annotationApi.delete(id);

    if (annotation.object3D) {
      this.scene.remove(annotation.object3D);
      annotation.object3D.geometry?.dispose();
      annotation.object3D.material?.dispose();
    }
    if (annotation.label) {
      this.scene.remove(annotation.label);
    }
    if (annotation.sprite) {
      this.scene.remove(annotation.sprite);
      annotation.sprite.material?.map?.dispose();
      annotation.sprite.material?.dispose();
    }

    this.annotations.delete(id);
    return true;
  }

  async _saveAnnotationPosition(annotation) {
    const pos = annotation.object3D?.position || annotation.sprite?.position;
    if (!pos) return;

    const updates = {
      position: {
        x: pos.x,
        y: pos.y,
        z: pos.z
      }
    };

    await annotationApi.update(annotation.id, updates);
    Object.assign(annotation.data, updates);
  }

  showAnnotation(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    if (annotation.object3D) annotation.object3D.visible = true;
    if (annotation.label) annotation.label.visible = true;
    if (annotation.sprite) annotation.sprite.visible = true;
    annotation.visible = true;
  }

  hideAnnotation(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    if (annotation.object3D) annotation.object3D.visible = false;
    if (annotation.label) annotation.label.visible = false;
    if (annotation.sprite) annotation.sprite.visible = false;
    annotation.visible = false;
  }

  showAll() {
    this.annotations.forEach((_, id) => this.showAnnotation(id));
  }

  hideAll() {
    this.annotations.forEach((_, id) => this.hideAnnotation(id));
  }

  toggleVisibility(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;
    
    if (annotation.visible) {
      this.hideAnnotation(id);
    } else {
      this.showAnnotation(id);
    }
  }

  searchAnnotations(query) {
    const q = query.toLowerCase();
    return Array.from(this.annotations.values()).filter(anno => {
      const data = anno.data;
      return (
        data.name?.toLowerCase().includes(q) ||
        data.title?.toLowerCase().includes(q) ||
        data.description?.toLowerCase().includes(q) ||
        data.content?.toLowerCase().includes(q) ||
        data.tags?.some(tag => tag.toLowerCase().includes(q))
      );
    });
  }

  filterAnnotations(filters) {
    return Array.from(this.annotations.values()).filter(anno => {
      const data = anno.data;
      
      if (filters.type && data.type !== filters.type) return false;
      if (filters.status && data.status !== filters.status) return false;
      if (filters.priority && data.priority !== filters.priority) return false;
      if (filters.targetType && data.targetType !== filters.targetType) return false;
      if (filters.targetId && data.targetId !== filters.targetId) return false;
      if (filters.level !== undefined && data.level !== filters.level) return false;
      
      if (filters.minSeverity !== undefined) {
        const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        if ((severityOrder[data.severity] || 0) < filters.minSeverity) return false;
      }

      return true;
    });
  }

  getAnnotationById(id) {
    return this.annotations.get(id);
  }

  getAllAnnotations() {
    return Array.from(this.annotations.values());
  }

  /**
   * 选择指定的标注
   * @param {string} id - 标注ID
   * @param {boolean} [multi=false] - 是否为多选模式（按住Ctrl）
   */
  selectAnnotation(id, multi = false) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    if (!multi) {
      this.clearSelection();
    }

    this.selectedAnnotations.add(id);
    this._updateAnnotationHighlight(annotation, true);
  }

  /**
   * 取消选择指定的标注
   * @param {string} id - 标注ID
   */
  deselectAnnotation(id) {
    const annotation = this.annotations.get(id);
    if (!annotation) return;

    this.selectedAnnotations.delete(id);
    this._updateAnnotationHighlight(annotation, false);
  }

  /**
   * 清除所有选择
   */
  clearSelection() {
    this.selectedAnnotations.forEach(id => {
      const annotation = this.annotations.get(id);
      if (annotation) {
        this._updateAnnotationHighlight(annotation, false);
      }
    });
    this.selectedAnnotations.clear();
  }

  /**
   * 获取所有选中的标注
   * @returns {Array<Object>} 选中的标注数组
   */
  getSelectedAnnotations() {
    return Array.from(this.selectedAnnotations)
      .map(id => this.annotations.get(id))
      .filter(Boolean);
  }

  /**
   * 更新标注高亮状态
   * @private
   * @param {Object} annotation - 标注对象
   * @param {boolean} selected - 是否选中
   */
  _updateAnnotationHighlight(annotation, selected) {
    const object = annotation.marker || annotation.sprite;
    if (!object) return;

    if (selected) {
      if (object.userData.originalScale === undefined) {
        object.userData.originalScale = object.scale.clone();
      }
      object.scale.multiplyScalar(1.2);
      if (object.material) {
        object.userData.originalEmissive = object.material.emissive ? object.material.emissive.clone() : new THREE.Color(0x000000);
        object.material.emissive = object.material.emissive || new THREE.Color(0x000000);
        object.material.emissive.setHex(0x00ff00);
        object.material.emissiveIntensity = 0.5;
      }
    } else {
      if (object.userData.originalScale !== undefined) {
        object.scale.copy(object.userData.originalScale);
        delete object.userData.originalScale;
      }
      if (object.material && object.userData.originalEmissive !== undefined) {
        object.material.emissive.copy(object.userData.originalEmissive);
        object.material.emissiveIntensity = 0;
        delete object.userData.originalEmissive;
      }
    }
  }

  /**
   * 批量删除标注
   * @param {Array<string>} ids - 标注ID数组
   * @returns {Promise<boolean>} 是否成功
   */
  async batchDelete(ids) {
    const validIds = ids.filter(id => this.annotations.has(id));
    if (validIds.length === 0) return false;

    try {
      await Promise.all(validIds.map(id => this.deleteAnnotation(id)));
      validIds.forEach(id => this.selectedAnnotations.delete(id));
      return true;
    } catch (error) {
      console.error('Batch delete failed:', error);
      return false;
    }
  }

  /**
   * 批量更新标注属性
   * @param {Array<string>} ids - 标注ID数组
   * @param {Object} updates - 更新的属性
   * @returns {Promise<Array<Object>>} 更新后的标注数组
   */
  async batchUpdate(ids, updates) {
    const validIds = ids.filter(id => this.annotations.has(id));
    const results = [];

    for (const id of validIds) {
      const updated = await this.updateAnnotation(id, updates);
      if (updated) results.push(updated);
    }

    return results;
  }

  /**
   * 批量移动标注
   * @param {Array<string>} ids - 标注ID数组
   * @param {Object} offset - 偏移量 {x, y, z}
   */
  batchMove(ids, offset) {
    const offsetVec = new THREE.Vector3(offset.x || 0, offset.y || 0, offset.z || 0);

    ids.forEach(id => {
      const annotation = this.annotations.get(id);
      if (!annotation) return;

      const currentPos = annotation.object3D?.position || annotation.sprite?.position;
      if (!currentPos) return;

      const newPos = currentPos.clone().add(offsetVec);
      this._updateAnnotationPosition(annotation, newPos);
    });
  }

  /**
   * 批量设置标注样式
   * @param {Array<string>} ids - 标注ID数组
   * @param {Object} style - 样式对象
   */
  batchSetStyle(ids, style) {
    ids.forEach(id => {
      this.setAnnotationStyle(id, style);
    });
  }

  /**
   * 批量导出标注
   * @param {Array<string>} ids - 标注ID数组
   * @param {string} [format='json'] - 导出格式
   * @returns {string|Object} 导出的数据
   */
  batchExport(ids, format = 'json') {
    const annotations = ids
      .map(id => this.annotations.get(id))
      .filter(Boolean)
      .map(anno => ({
        id: anno.id,
        type: anno.type,
        position: anno.object3D?.position || anno.sprite?.position,
        data: anno.data,
        visible: anno.visible
      }));

    if (format === 'json') {
      return JSON.stringify(annotations, null, 2);
    }

    return annotations;
  }

  /**
   * 开始框选标注
   * @param {Object} startPoint - 起点 {x, y} 屏幕坐标
   */
  startBoxSelection(startPoint) {
    this.isBoxSelecting = true;
    this.boxStartPoint = { ...startPoint };
    this.boxEndPoint = { ...startPoint };
    this._createBoxSelectionElement();
  }

  /**
   * 更新框选范围
   * @param {Object} endPoint - 终点 {x, y} 屏幕坐标
   */
  updateBoxSelection(endPoint) {
    if (!this.isBoxSelecting) return;
    this.boxEndPoint = { ...endPoint };
    this._updateBoxSelectionElement();
  }

  /**
   * 结束框选
   * @param {boolean} [additive=false] - 是否为追加选择模式
   * @returns {Array<Object>} 选中的标注数组
   */
  endBoxSelection(additive = false) {
    if (!this.isBoxSelecting) return [];

    const selectedIds = this._getAnnotationsInBox();
    const selected = selectedIds.map(id => this.annotations.get(id)).filter(Boolean);

    if (!additive) {
      this.clearSelection();
    }

    selectedIds.forEach(id => {
      this.selectedAnnotations.add(id);
      const annotation = this.annotations.get(id);
      if (annotation) {
        this._updateAnnotationHighlight(annotation, true);
      }
    });

    this._removeBoxSelectionElement();
    this.isBoxSelecting = false;
    this.boxStartPoint = null;
    this.boxEndPoint = null;

    return selected;
  }

  /**
   * 取消框选
   */
  cancelBoxSelection() {
    this._removeBoxSelectionElement();
    this.isBoxSelecting = false;
    this.boxStartPoint = null;
    this.boxEndPoint = null;
  }

  /**
   * 创建框选DOM元素
   * @private
   */
  _createBoxSelectionElement() {
    if (this.boxSelection) return;

    this.boxSelection = document.createElement('div');
    this.boxSelection.style.cssText = `
      position: absolute;
      border: 2px dashed #00ff00;
      background: rgba(0, 255, 0, 0.1);
      pointer-events: none;
      z-index: 1000;
    `;

    const container = this.container || document.body;
    container.appendChild(this.boxSelection);
  }

  /**
   * 更新框选DOM元素位置
   * @private
   */
  _updateBoxSelectionElement() {
    if (!this.boxSelection || !this.boxStartPoint || !this.boxEndPoint) return;

    const left = Math.min(this.boxStartPoint.x, this.boxEndPoint.x);
    const top = Math.min(this.boxStartPoint.y, this.boxEndPoint.y);
    const width = Math.abs(this.boxEndPoint.x - this.boxStartPoint.x);
    const height = Math.abs(this.boxEndPoint.y - this.boxStartPoint.y);

    this.boxSelection.style.left = `${left}px`;
    this.boxSelection.style.top = `${top}px`;
    this.boxSelection.style.width = `${width}px`;
    this.boxSelection.style.height = `${height}px`;
  }

  /**
   * 移除框选DOM元素
   * @private
   */
  _removeBoxSelectionElement() {
    if (this.boxSelection) {
      this.boxSelection.remove();
      this.boxSelection = null;
    }
  }

  /**
   * 获取框选范围内的标注ID
   * @private
   * @returns {Array<string>} 标注ID数组
   */
  _getAnnotationsInBox() {
    if (!this.boxStartPoint || !this.boxEndPoint) return [];

    const rect = this._getContainerRect();
    const left = Math.min(this.boxStartPoint.x, this.boxEndPoint.x) - rect.left;
    const right = Math.max(this.boxStartPoint.x, this.boxEndPoint.x) - rect.left;
    const top = Math.min(this.boxStartPoint.y, this.boxEndPoint.y) - rect.top;
    const bottom = Math.max(this.boxStartPoint.y, this.boxEndPoint.y) - rect.top;

    const x1 = (left / rect.width) * 2 - 1;
    const x2 = (right / rect.width) * 2 - 1;
    const y1 = -(top / rect.height) * 2 + 1;
    const y2 = -(bottom / rect.height) * 2 + 1;

    const selectedIds = [];

    this.annotations.forEach((annotation, id) => {
      const object = annotation.marker || annotation.sprite;
      if (!object || !annotation.visible) return;

      const v = object.position.clone().project(this.camera);
      if (v.x >= x1 && v.x <= x2 && v.y >= y2 && v.y <= y1) {
        selectedIds.push(id);
      }
    });

    return selectedIds;
  }

  /**
   * 对齐标注
   * @param {Array<string>} ids - 标注ID数组
   * @param {string} alignment - 对齐方式
   *   'left' | 'right' | 'top' | 'bottom' | 'centerV' | 'centerH' | 'spaceV' | 'spaceH'
   */
  alignAnnotations(ids, alignment) {
    const annotations = ids
      .map(id => this.annotations.get(id))
      .filter(a => a && (a.object3D || a.sprite));

    if (annotations.length < 2) return;

    const positions = annotations.map(a => (a.object3D || a.sprite).position.clone());

    switch (alignment) {
      case 'left': {
        const minX = Math.min(...positions.map(p => p.x));
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.x = minX;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'right': {
        const maxX = Math.max(...positions.map(p => p.x));
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.x = maxX;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'top': {
        const maxZ = Math.max(...positions.map(p => p.z));
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.z = maxZ;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'bottom': {
        const minZ = Math.min(...positions.map(p => p.z));
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.z = minZ;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'centerV': {
        const avgX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.x = avgX;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'centerH': {
        const avgZ = positions.reduce((sum, p) => sum + p.z, 0) / positions.length;
        annotations.forEach((a, i) => {
          const pos = positions[i].clone();
          pos.z = avgZ;
          this._updateAnnotationPosition(a, pos);
        });
        break;
      }
      case 'spaceV': {
        const sorted = annotations
          .map((a, i) => ({ a, pos: positions[i] }))
          .sort((a, b) => a.pos.x - b.pos.x);

        const minX = sorted[0].pos.x;
        const maxX = sorted[sorted.length - 1].pos.x;
        const spacing = (maxX - minX) / (sorted.length - 1 || 1);

        sorted.forEach((item, i) => {
          const pos = item.pos.clone();
          pos.x = minX + i * spacing;
          this._updateAnnotationPosition(item.a, pos);
        });
        break;
      }
      case 'spaceH': {
        const sorted = annotations
          .map((a, i) => ({ a, pos: positions[i] }))
          .sort((a, b) => a.pos.z - b.pos.z);

        const minZ = sorted[0].pos.z;
        const maxZ = sorted[sorted.length - 1].pos.z;
        const spacing = (maxZ - minZ) / (sorted.length - 1 || 1);

        sorted.forEach((item, i) => {
          const pos = item.pos.clone();
          pos.z = minZ + i * spacing;
          this._updateAnnotationPosition(item.a, pos);
        });
        break;
      }
    }
  }

  /**
   * 显示批量操作工具栏
   * @param {Object} position - 位置 {x, y}
   */
  showBatchToolbar(position) {
    this.hideBatchToolbar();

    this.batchToolbar = document.createElement('div');
    this.batchToolbar.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      background: rgba(30, 30, 30, 0.95);
      border: 1px solid #444;
      border-radius: 6px;
      padding: 8px;
      z-index: 2000;
      display: flex;
      gap: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    `;

    const buttons = [
      { icon: '⇦', title: '左对齐', action: () => this.alignSelected('left') },
      { icon: '⇨', title: '右对齐', action: () => this.alignSelected('right') },
      { icon: '⇧', title: '上对齐', action: () => this.alignSelected('top') },
      { icon: '⇩', title: '下对齐', action: () => this.alignSelected('bottom') },
      { icon: '↔', title: '水平居中', action: () => this.alignSelected('centerV') },
      { icon: '↕', title: '垂直居中', action: () => this.alignSelected('centerH') },
      { icon: '═', title: '水平等距', action: () => this.alignSelected('spaceH') },
      { icon: '‖', title: '垂直等距', action: () => this.alignSelected('spaceV') },
      { icon: '📋', title: '复制', action: () => this.copySelected() },
      { icon: '📄', title: '粘贴', action: () => this.pasteSelected() },
      { icon: '🗑️', title: '删除', action: () => this.deleteSelected() }
    ];

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.icon;
      button.title = btn.title;
      button.style.cssText = `
        width: 32px;
        height: 32px;
        background: #444;
        color: #fff;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      button.addEventListener('mouseenter', () => {
        button.style.background = '#555';
      });
      button.addEventListener('mouseleave', () => {
        button.style.background = '#444';
      });
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.action();
      });
      this.batchToolbar.appendChild(button);
    });

    document.body.appendChild(this.batchToolbar);
  }

  /**
   * 隐藏批量操作工具栏
   */
  hideBatchToolbar() {
    if (this.batchToolbar) {
      this.batchToolbar.remove();
      this.batchToolbar = null;
    }
  }

  /**
   * 对齐选中的标注
   * @param {string} alignment - 对齐方式
   */
  alignSelected(alignment) {
    const ids = Array.from(this.selectedAnnotations);
    this.alignAnnotations(ids, alignment);
  }

  /**
   * 删除选中的标注
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteSelected() {
    const ids = Array.from(this.selectedAnnotations);
    const success = await this.batchDelete(ids);
    if (success) {
      this.hideBatchToolbar();
    }
    return success;
  }

  /**
   * 复制选中的标注到剪贴板
   */
  copySelected() {
    this.clipboard = this.getSelectedAnnotations().map(anno => ({
      type: anno.type,
      position: (anno.object3D || anno.sprite).position.clone(),
      data: { ...anno.data },
      style: anno.label ? { ...anno.label.element.style } : null
    }));
  }

  /**
   * 粘贴剪贴板中的标注
   * @param {Object} [position] - 粘贴位置，默认为剪贴板位置+偏移
   */
  async pasteSelected(position) {
    const offset = position ? new THREE.Vector3(
      position.x - (this.clipboard[0]?.position?.x || 0),
      position.y - (this.clipboard[0]?.position?.y || 0),
      position.z - (this.clipboard[0]?.position?.z || 0)
    ) : new THREE.Vector3(2, 0, 2);

    const newAnnotations = [];

    for (const item of this.clipboard) {
      const newPos = item.position.clone().add(offset);
      const options = {
        position: { x: newPos.x, y: newPos.y, z: newPos.z },
        data: { ...item.data, id: undefined },
        draggable: true,
        onDragEnd: (anno) => this._saveAnnotationPosition(anno)
      };

      if (item.type === 'icon') {
        options.icon = item.data.type === 'safety' ? 'danger' :
          item.data.type === 'defect' ? 'warning' : 'info';
        options.color = this._getStatusColor(item.data.status);
        options.title = item.data.title || item.data.name;
        const anno = await this.createIconAnnotation(options);
        newAnnotations.push(anno);
      } else {
        options.text = item.data.content || item.data.description;
        options.title = item.data.title || item.data.name;
        options.style = item.style || {};
        const anno = await this.createTextAnnotation(options);
        newAnnotations.push(anno);
      }
    }

    this.clearSelection();
    newAnnotations.forEach(anno => this.selectAnnotation(anno.id, true));
  }

  setAnnotationStyle(id, style) {
    const annotation = this.annotations.get(id);
    if (!annotation || !annotation.label) return;

    Object.assign(annotation.label.element.style, style);
  }

  setGlobalStyle(style) {
    this.options.defaultStyle = { ...this.options.defaultStyle, ...style };
  }

  _getStatusColor(status, asBg = false) {
    const colors = {
      normal: asBg ? 'rgba(76, 175, 80, 0.7)' : '#4CAF50',
      warning: asBg ? 'rgba(255, 152, 0, 0.7)' : '#FF9800',
      alarm: asBg ? 'rgba(244, 67, 54, 0.7)' : '#F44336',
      standby: asBg ? 'rgba(158, 158, 158, 0.7)' : '#9E9E9E'
    };
    return colors[status] || colors.normal;
  }

  async loadAnnotations(filters = {}) {
    try {
      let data;
      if (filters.tunnelId) {
        data = await annotationApi.getByTunnelId(filters.tunnelId);
      } else if (filters.type) {
        data = await annotationApi.getByType(filters.type);
      } else if (filters.status) {
        data = await annotationApi.getByStatus(filters.status);
      } else {
        data = await annotationApi.getAll();
      }

      for (const item of data) {
        if (!this.annotations.has(item.id)) {
          await this.addAnnotation(item);
        }
      }

      return this.getAllAnnotations();
    } catch (error) {
      console.error('Failed to load annotations:', error);
      return [];
    }
  }

  update() {
    if (this.labelRenderer && this.camera) {
      this.labelRenderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', this._onMouseDown);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('mouseup', this._onMouseUp);
      window.removeEventListener('resize', this._onResize);
    }

    this.annotations.forEach(annotation => {
      if (annotation.object3D) {
        this.scene.remove(annotation.object3D);
        annotation.object3D.geometry?.dispose();
        annotation.object3D.material?.dispose();
      }
      if (annotation.label) {
        this.scene.remove(annotation.label);
      }
      if (annotation.sprite) {
        this.scene.remove(annotation.sprite);
        annotation.sprite.material?.map?.dispose();
        annotation.sprite.material?.dispose();
      }
    });

    this.annotations.clear();
    this.selectedAnnotations.clear();
    this.dragStartPositions.clear();
    this.draggingAnnotations = [];
    this.clipboard = [];

    this._removeBoxSelectionElement();
    this.hideBatchToolbar();

    if (this.labelRenderer) {
      this.labelRenderer.domElement.remove();
      this.labelRenderer = null;
    }
  }
}

export default AnnotationManager;
