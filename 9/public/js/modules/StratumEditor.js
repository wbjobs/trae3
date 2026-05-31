class StratumEditor {
  constructor(sceneRenderer, cameraController, dataLoader, modelBuilder) {
    this.sceneRenderer = sceneRenderer;
    this.cameraController = cameraController;
    this.dataLoader = dataLoader;
    this.modelBuilder = modelBuilder;
    this.strata = [];
    this.selectedStratumId = null;
    this.isEditMode = false;
    this.isAnnotationMode = false;
    this.hoveredMesh = null;
    this.originalMaterials = new Map();
    this.onStratumSelectCallback = null;
    this.onAnnotationAddCallback = null;
    this.selectedAnnotations = new Set();
    this.onAnnotationSelectCallback = null;
    this.onAnnotationsBatchDeleteCallback = null;
    this.init();
  }

  init() {
    this.domElement = this.sceneRenderer.renderer.domElement;
    this.domElement.addEventListener('click', (e) => this.onClick(e));
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
  }

  setStrata(strata) {
    this.strata = strata;
  }

  setEditMode(enabled) {
    this.isEditMode = enabled;
    this.domElement.style.cursor = enabled ? 'crosshair' : 'default';
  }

  setAnnotationMode(enabled) {
    this.isAnnotationMode = enabled;
    this.domElement.style.cursor = enabled ? 'pointer' : 'default';
  }

  onMouseMove(event) {
    if (this.isEditMode || this.isAnnotationMode) {
      const intersects = this.sceneRenderer.getIntersects(event);
      if (intersects.length > 0) {
        const mesh = this.findStratumMesh(intersects[0].object);
        if (mesh && mesh !== this.hoveredMesh) {
          this.restoreMaterial(this.hoveredMesh);
          this.hoveredMesh = mesh;
          this.highlightMesh(mesh);
        } else if (!mesh && this.hoveredMesh) {
          this.restoreMaterial(this.hoveredMesh);
          this.hoveredMesh = null;
        }
      } else if (this.hoveredMesh) {
        this.restoreMaterial(this.hoveredMesh);
        this.hoveredMesh = null;
      }
    }
  }

  onClick(event) {
    const intersects = this.sceneRenderer.getIntersects(event);
    if (intersects.length === 0) {
      this.clearSelection();
      return;
    }

    if (this.isAnnotationMode) {
      const annotationMesh = this.findAnnotationMesh(intersects[0].object);
      if (annotationMesh) {
        const annotationId = annotationMesh.userData.annotationId;
        const multiSelect = event.ctrlKey || event.metaKey;
        this.selectAnnotation(annotationId, multiSelect);
        return;
      }
    }

    const stratumMesh = this.findStratumMesh(intersects[0].object);
    if (!stratumMesh) return;

    const userData = stratumMesh.userData;

    if (this.isAnnotationMode && userData.stratumId) {
      const threePoint = intersects[0].point;
      const worldPos = CoordConverter.threeToWorld({
        x: threePoint.x,
        y: threePoint.y,
        z: threePoint.z
      });
      const normalizedPos = CoordConverter.normalizePoint(worldPos);
      this.addAnnotation(userData.stratumId, normalizedPos);
      return;
    }

    if (this.isEditMode || !this.isAnnotationMode) {
      this.selectStratum(userData.stratumId, stratumMesh);
    }
  }

  findAnnotationMesh(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.type === 'annotation' && current.userData.annotationId) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  selectAnnotation(annotationId, multiSelect) {
    if (!multiSelect) {
      this.selectedAnnotations.forEach(id => {
        if (id !== annotationId) {
          this.unhighlightAnnotation(id);
        }
      });
      this.selectedAnnotations.clear();
    }

    if (this.selectedAnnotations.has(annotationId)) {
      this.selectedAnnotations.delete(annotationId);
      this.unhighlightAnnotation(annotationId);
    } else {
      this.selectedAnnotations.add(annotationId);
      this.highlightAnnotation(annotationId);
    }

    if (this.onAnnotationSelectCallback) {
      this.onAnnotationSelectCallback(this.getSelectedAnnotations());
    }
  }

  selectAllAnnotations() {
    const stratum = this.strata.find(s => s._id === this.selectedStratumId);
    if (!stratum || !stratum.annotations) return;

    stratum.annotations.forEach(ann => {
      if (!this.selectedAnnotations.has(ann.id)) {
        this.selectedAnnotations.add(ann.id);
        this.highlightAnnotation(ann.id);
      }
    });

    if (this.onAnnotationSelectCallback) {
      this.onAnnotationSelectCallback(this.getSelectedAnnotations());
    }
  }

  deselectAllAnnotations() {
    this.selectedAnnotations.forEach(id => {
      this.unhighlightAnnotation(id);
    });
    this.selectedAnnotations.clear();

    if (this.onAnnotationSelectCallback) {
      this.onAnnotationSelectCallback([]);
    }
  }

  getSelectedAnnotations() {
    const result = [];
    this.strata.forEach(stratum => {
      if (stratum.annotations) {
        stratum.annotations.forEach(ann => {
          if (this.selectedAnnotations.has(ann.id)) {
            result.push({ ...ann, stratumId: stratum._id });
          }
        });
      }
    });
    return result;
  }

  highlightAnnotation(annotationId) {
    const mesh = this.findAnnotationMeshById(annotationId);
    if (!mesh) return;

    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.color.set(AppConfig.colors.highlight);
      }
    });
    mesh.scale.set(1.5, 1.5, 1.5);
  }

  unhighlightAnnotation(annotationId) {
    const mesh = this.findAnnotationMeshById(annotationId);
    if (!mesh) return;

    mesh.scale.set(1, 1, 1);

    const stratum = this.strata.find(s =>
      s.annotations && s.annotations.some(a => a.id === annotationId)
    );
    const stratumColor = stratum ? stratum.color : AppConfig.colors.annotation;

    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        if (child.geometry && child.geometry.type === 'SphereGeometry') {
          child.material.color.set(AppConfig.colors.annotation);
        }
      }
    });
  }

  findAnnotationMeshById(annotationId) {
    let found = null;
    this.sceneRenderer.strataMeshes.forEach(stratumGroup => {
      if (found) return;
      stratumGroup.traverse(child => {
        if (found) return;
        if (child.userData && child.userData.type === 'annotation' && child.userData.annotationId === annotationId) {
          found = child;
        }
      });
    });
    return found;
  }

  async deleteSelectedAnnotations() {
    const selected = this.getSelectedAnnotations();
    if (selected.length === 0) return;

    const idsToDelete = [...this.selectedAnnotations];

    for (const annotationId of idsToDelete) {
      const stratum = this.strata.find(s =>
        s.annotations && s.annotations.some(a => a.id === annotationId)
      );
      if (!stratum) continue;

      try {
        await this.dataLoader.deleteAnnotation(stratum._id, annotationId);

        if (stratum.annotations) {
          stratum.annotations = stratum.annotations.filter(a => a.id !== annotationId);
        }

        const annotationMesh = this.findAnnotationMeshById(annotationId);
        if (annotationMesh && annotationMesh.parent) {
          annotationMesh.parent.remove(annotationMesh);
          annotationMesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => mat.dispose());
              } else {
                child.material.dispose();
              }
            }
          });
        }
      } catch (error) {
        console.error('Failed to delete annotation:', annotationId, error);
      }
    }

    this.selectedAnnotations.clear();

    if (this.onAnnotationsBatchDeleteCallback) {
      this.onAnnotationsBatchDeleteCallback(idsToDelete);
    }
  }

  toggleAnnotationsVisibility(visible, annotationIds) {
    const ids = annotationIds || this.getAllAnnotationIds();
    ids.forEach(annotationId => {
      const mesh = this.findAnnotationMeshById(annotationId);
      if (mesh) {
        mesh.visible = visible;
      }
    });
  }

  getAllAnnotationIds() {
    const ids = [];
    this.strata.forEach(stratum => {
      if (stratum.annotations) {
        stratum.annotations.forEach(ann => {
          ids.push(ann.id);
        });
      }
    });
    return ids;
  }

  filterAnnotations(query) {
    if (!query || typeof query !== 'string') return [];
    const lowerQuery = query.toLowerCase();
    const results = [];
    this.strata.forEach(stratum => {
      if (stratum.annotations) {
        stratum.annotations.forEach(ann => {
          if (ann.text && ann.text.toLowerCase().includes(lowerQuery)) {
            results.push({ ...ann, stratumId: stratum._id });
          }
        });
      }
    });
    return results;
  }

  exportAnnotations(format) {
    const allAnnotations = [];
    this.strata.forEach(stratum => {
      if (stratum.annotations) {
        stratum.annotations.forEach(ann => {
          allAnnotations.push({
            id: ann.id,
            stratumId: stratum._id,
            text: ann.text || '',
            x: ann.position ? ann.position.x : '',
            y: ann.position ? ann.position.y : '',
            z: ann.position ? ann.position.z : '',
          });
        });
      }
    });

    if (format === 'csv') {
      const header = 'id,stratumId,text,x,y,z';
      const rows = allAnnotations.map(a =>
        `${a.id},${a.stratumId},"${a.text}",${a.x},${a.y},${a.z}`
      );
      return header + '\n' + rows.join('\n');
    }

    return JSON.stringify(allAnnotations, null, 2);
  }

  findStratumMesh(object) {
    let current = object;
    while (current) {
      if (current.userData && current.userData.stratumId) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  highlightMesh(mesh) {
    mesh.traverse(child => {
      if (child.isMesh && child.material) {
        if (!this.originalMaterials.has(child.uuid)) {
          this.originalMaterials.set(child.uuid, child.material.clone());
        }
        const highlightMat = child.material.clone();
        highlightMat.emissive = new THREE.Color(0x444444);
        highlightMat.opacity = Math.min(1, highlightMat.opacity + 0.15);
        child.material = highlightMat;
      }
    });
  }

  restoreMaterial(mesh) {
    if (!mesh) return;
    mesh.traverse(child => {
      if (child.isMesh && this.originalMaterials.has(child.uuid)) {
        child.material.dispose();
        child.material = this.originalMaterials.get(child.uuid);
        this.originalMaterials.delete(child.uuid);
      }
    });
  }

  selectStratum(stratumId, mesh) {
    this.clearSelection();
    this.selectedStratumId = stratumId;

    if (mesh) {
      this.highlightMesh(mesh);
      this.cameraController.zoomTo(mesh);
    }

    const stratum = this.strata.find(s => s._id === stratumId);
    if (stratum && this.onStratumSelectCallback) {
      this.onStratumSelectCallback(stratum);
    }
  }

  clearSelection() {
    this.restoreMaterial(this.hoveredMesh);
    this.hoveredMesh = null;
    this.selectedStratumId = null;
  }

  async addAnnotation(stratumId, worldPosition) {
    const text = prompt('请输入标注内容:');
    if (!text) return;

    const validation = CoordConverter.validatePoint(worldPosition);
    if (!validation.valid) {
      alert(`标注位置无效: ${validation.message}`);
      return;
    }

    const annotation = {
      id: `ann_${Date.now()}`,
      position: worldPosition,
      text,
    };

    try {
      const result = await this.dataLoader.addAnnotation(stratumId, annotation);
      if (result && result.id) {
        const stratum = this.strata.find(s => s._id === stratumId);
        if (stratum) {
          if (!stratum.annotations) stratum.annotations = [];
          stratum.annotations.push(result);
        }

        const annotationMesh = this.modelBuilder.createAnnotation(result, stratum.color);
        annotationMesh.userData = {
          type: 'annotation',
          annotationId: result.id,
          stratumId,
          worldPosition: result.position,
        };

        const stratumGroup = this.sceneRenderer.strataMeshes.find(
          m => m.userData.stratumId === stratumId
        );
        if (stratumGroup) {
          stratumGroup.add(annotationMesh);
        }

        if (this.onAnnotationAddCallback) {
          this.onAnnotationAddCallback(result);
        }

        alert('标注添加成功!');
      } else if (result && result.status === 'error') {
        alert(`标注添加失败: ${result.message || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to add annotation:', error);
      alert('标注添加失败');
    }
  }

  toggleStratumVisibility(stratumId, visible) {
    const mesh = this.sceneRenderer.strataMeshes.find(
      m => m.userData.stratumId === stratumId
    );
    if (mesh) {
      mesh.visible = visible;
    }
  }

  isolateStratum(stratumId) {
    this.sceneRenderer.strataMeshes.forEach(mesh => {
      mesh.visible = mesh.userData.stratumId === stratumId;
    });
  }

  showAllStrata() {
    this.sceneRenderer.strataMeshes.forEach(mesh => {
      mesh.visible = true;
    });
  }

  async updateStratumColor(stratumId, color) {
    const stratum = this.strata.find(s => s._id === stratumId);
    if (!stratum) return;

    if (!AppConfig.validateColor(color)) {
      alert('颜色格式无效');
      return;
    }

    try {
      await this.dataLoader.updateStratum(stratumId, { color });
      stratum.color = color;

      const mesh = this.sceneRenderer.strataMeshes.find(
        m => m.userData.stratumId === stratumId
      );
      if (mesh) {
        mesh.traverse(child => {
          if (child.isMesh && child.material && child.material.color) {
            child.material.color.set(color);
          }
        });
      }
    } catch (error) {
      console.error('Failed to update stratum color:', error);
    }
  }

  onStratumSelect(callback) {
    this.onStratumSelectCallback = callback;
  }

  onAnnotationAdd(callback) {
    this.onAnnotationAddCallback = callback;
  }

  onAnnotationSelect(callback) {
    this.onAnnotationSelectCallback = callback;
  }

  onAnnotationsBatchDelete(callback) {
    this.onAnnotationsBatchDeleteCallback = callback;
  }

  dispose() {
    this.clearSelection();
    this.originalMaterials.clear();
    this.selectedAnnotations.clear();
  }
}

window.StratumEditor = StratumEditor;
