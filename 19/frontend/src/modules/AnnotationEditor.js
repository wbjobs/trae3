import * as THREE from 'three';
import { isValidAnnotation, sanitizeAnnotation } from '../../../shared/validators.js';

export class AnnotationEditor {
  constructor(sceneRenderer, dataLoader) {
    this.sceneRenderer = sceneRenderer;
    this.dataLoader = dataLoader;
    this.isActive = false;
    this.previewMarker = null;
    this.annotations = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.intersectionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    
    this.onAnnotationCreated = null;
    this.onAnnotationSelected = null;
    this.onAnnotationDeleted = null;
    
    this.hoveredAnnotation = null;
    this.selectedAnnotation = null;
    
    this.init();
  }

  init() {
    this.createPreviewMarker();
    
    this.sceneRenderer.renderer.domElement.addEventListener(
      'click',
      (e) => this.handleClick(e)
    );
    
    this.sceneRenderer.renderer.domElement.addEventListener(
      'mousemove',
      (e) => this.handleMouseMove(e)
    );
    
    this.sceneRenderer.renderer.domElement.addEventListener(
      'contextmenu',
      (e) => this.handleRightClick(e)
    );
  }

  createPreviewMarker() {
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });
    this.previewMarker = new THREE.Mesh(geometry, material);
    this.previewMarker.visible = false;
    this.sceneRenderer.scene.add(this.previewMarker);
    
    const ringGeometry = new THREE.RingGeometry(0.35, 0.45, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = -Math.PI / 2;
    this.previewMarker.add(ring);
  }

  activate() {
    this.isActive = true;
    this.previewMarker.visible = true;
    this.sceneRenderer.controls.enabled = false;
    document.body.style.cursor = 'crosshair';
  }

  deactivate() {
    this.isActive = false;
    this.previewMarker.visible = false;
    this.sceneRenderer.controls.enabled = true;
    document.body.style.cursor = 'default';
  }

  getIntersectionPoint(event) {
    const rect = this.sceneRenderer.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.sceneRenderer.camera);
    
    const intersectPoint = new THREE.Vector3();
    const success = this.raycaster.ray.intersectPlane(
      this.intersectionPlane,
      intersectPoint
    );
    
    if (!success) {
      return null;
    }
    
    if (intersectPoint.y > 50 || intersectPoint.y < -50) {
      return null;
    }
    
    return intersectPoint;
  }

  handleMouseMove(event) {
    if (this.isActive) {
      const pos = this.getIntersectionPoint(event);
      if (pos) {
        this.previewMarker.position.copy(pos);
        this.previewMarker.visible = true;
      } else {
        this.previewMarker.visible = false;
      }
    } else {
      this.checkAnnotationHover(event);
    }
  }

  checkAnnotationHover(event) {
    const intersects = this.sceneRenderer.getIntersects(
      event,
      this.sceneRenderer.annotationObjects
    );
    
    if (this.hoveredAnnotation) {
      this.setAnnotationHover(this.hoveredAnnotation, false);
      this.hoveredAnnotation = null;
    }
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isAnnotation) {
        obj = obj.parent;
      }
      
      if (obj.userData.isAnnotation) {
        this.hoveredAnnotation = obj;
        this.setAnnotationHover(obj, true);
        document.body.style.cursor = 'pointer';
      }
    } else {
      document.body.style.cursor = 'default';
    }
  }

  setAnnotationHover(annotationObj, isHovered) {
    annotationObj.traverse((child) => {
      if (child.isMesh && child.material) {
        if (isHovered) {
          child.material.emissiveIntensity = (child.material.emissiveIntensity || 0) * 1.5;
          child.scale.setScalar(1.1);
        } else {
          child.material.emissiveIntensity = (child.material.emissiveIntensity || 0) / 1.5;
          child.scale.setScalar(1);
        }
      }
    });
  }

  async handleClick(event) {
    if (this.isActive) {
      const pos = this.getIntersectionPoint(event);
      if (!pos) return;
      
      const annotationData = await this.showAnnotationDialog(pos);
      if (annotationData) {
        const cleanData = sanitizeAnnotation(annotationData);
        const savedAnnotation = await this.dataLoader.createAnnotation(cleanData);
        
        if (isValidAnnotation(savedAnnotation)) {
          this.annotations.push(savedAnnotation);
          this.sceneRenderer.createAnnotation(savedAnnotation);
          
          if (this.onAnnotationCreated) {
            this.onAnnotationCreated(savedAnnotation);
          }
        }
      }
      
      this.deactivate();
    } else {
      this.checkAnnotationClick(event);
    }
  }

  checkAnnotationClick(event) {
    const intersects = this.sceneRenderer.getIntersects(
      event,
      this.sceneRenderer.annotationObjects
    );
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isAnnotation) {
        obj = obj.parent;
      }
      
      if (obj.userData.isAnnotation) {
        this.selectedAnnotation = obj;
        
        if (this.onAnnotationSelected) {
          this.onAnnotationSelected(obj.userData, event);
        }
      }
    }
  }

  handleRightClick(event) {
    event.preventDefault();
    
    if (this.isActive) {
      this.deactivate();
      return;
    }
    
    const intersects = this.sceneRenderer.getIntersects(
      event,
      this.sceneRenderer.annotationObjects
    );
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isAnnotation) {
        obj = obj.parent;
      }
      
      if (obj.userData.isAnnotation) {
        const confirmed = confirm(`是否删除标注: ${obj.userData.name}?`);
        if (confirmed) {
          this.deleteAnnotation(obj.userData._id);
        }
      }
    }
  }

  async showAnnotationDialog(position) {
    return new Promise((resolve) => {
      const name = prompt('请输入标注名称:', '新建标注');
      if (!name || name.trim() === '') {
        resolve(null);
        return;
      }
      
      const type = prompt('请输入标注类型 (valve/joint/manhole/transformer/general):', 'general');
      const content = prompt('请输入标注内容:', '');
      
      resolve({
        name: name.trim(),
        type: type || 'general',
        x: position.x,
        y: position.y,
        z: position.z,
        content: content || '',
        author: '当前用户',
      });
    });
  }

  async loadAnnotations() {
    const rawAnnotations = await this.dataLoader.fetchAnnotations();
    
    this.annotations = [];
    this.sceneRenderer.clearAnnotations();
    
    rawAnnotations.forEach((ann) => {
      if (isValidAnnotation(ann)) {
        const cleanAnn = sanitizeAnnotation(ann);
        this.annotations.push(cleanAnn);
        this.sceneRenderer.createAnnotation(cleanAnn);
      } else {
        console.warn('Skipping invalid annotation:', ann);
      }
    });
    
    return this.annotations;
  }

  clearAnnotations() {
    this.annotations = [];
    this.sceneRenderer.clearAnnotations();
  }

  async deleteAnnotation(id) {
    try {
      await this.dataLoader.deleteAnnotation(id);
      this.annotations = this.annotations.filter((a) => a._id !== id);
      
      const obj = this.sceneRenderer.annotationObjects.find(
        (o) => o.userData._id === id
      );
      
      if (obj) {
        this.sceneRenderer.scene.remove(obj);
        obj.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        
        const index = this.sceneRenderer.annotationObjects.indexOf(obj);
        if (index > -1) {
          this.sceneRenderer.annotationObjects.splice(index, 1);
        }
      }
      
      if (this.onAnnotationDeleted) {
        this.onAnnotationDeleted(id);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      return false;
    }
  }

  getAnnotations() {
    return [...this.annotations];
  }

  getAnnotationCount() {
    return this.annotations.length;
  }

  updatePlaneHeight(y) {
    this.intersectionPlane.constant = -y;
  }

  dispose() {
    if (this.previewMarker) {
      this.sceneRenderer.scene.remove(this.previewMarker);
      this.previewMarker.geometry.dispose();
      this.previewMarker.material.dispose();
    }
  }
}
