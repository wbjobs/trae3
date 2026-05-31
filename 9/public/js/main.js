class GeologicalApp {
  constructor() {
    this.container = null;
    this.sceneRenderer = null;
    this.cameraController = null;
    this.dataLoader = null;
    this.modelBuilder = null;
    this.stratumEditor = null;
    this.sectionSlicer = null;
    this.strata = [];
    this.drillHoles = [];
    this.points = [];
    this.isPointCloudVisible = true;
    this.isDrillHoleVisible = true;
    this.animationId = null;
    this.configLoaded = false;
    this.lazyLoading = true;
  }

  async init() {
    this.container = document.getElementById('scene-container');
    if (!this.container) {
      console.error('Scene container not found');
      return;
    }

    this.showLoading('正在加载配置...');
    try {
      await AppConfig.loadFromServer();
      this.configLoaded = true;
    } catch (error) {
      console.warn('Using default configuration:', error);
    }

    this.showLoading('正在初始化场景...');
    this.sceneRenderer = new SceneRenderer(this.container);
    this.cameraController = new CameraController(
      this.sceneRenderer.camera,
      this.sceneRenderer.renderer.domElement
    );
    this.dataLoader = new StratumDataLoader('');
    this.modelBuilder = new StratumModelBuilder();
    this.stratumEditor = new StratumEditor(
      this.sceneRenderer,
      this.cameraController,
      this.dataLoader,
      this.modelBuilder
    );
    this.sectionSlicer = new SectionSlicer(this.sceneRenderer);

    this.sceneRenderer.onFpsUpdate = (fps) => {
      this.updateFpsDisplay(fps);
    };

    this.cameraController.onCameraChange = () => {
      this.sceneRenderer.markDirty();
    };

    this.setupUI();
    this.setupEditorCallbacks();
    this.setupSectionSlicerUI();
    this.setupAnnotationManagementUI();
    await this.loadData();
    this.hideLoading();
    this.animate();
  }

  setupUI() {
    document.getElementById('btn-reset-view').addEventListener('click', () => {
      this.cameraController.reset();
    });

    document.getElementById('btn-front-view').addEventListener('click', () => {
      this.cameraController.frontView();
    });

    document.getElementById('btn-top-view').addEventListener('click', () => {
      this.cameraController.topView();
    });

    document.getElementById('btn-side-view').addEventListener('click', () => {
      this.cameraController.sideView();
    });

    document.getElementById('btn-edit-mode').addEventListener('click', (e) => {
      const enabled = e.target.classList.toggle('active');
      this.stratumEditor.setEditMode(enabled);
      if (enabled) {
        document.getElementById('btn-annotation-mode').classList.remove('active');
        this.stratumEditor.setAnnotationMode(false);
      }
    });

    document.getElementById('btn-annotation-mode').addEventListener('click', (e) => {
      const enabled = e.target.classList.toggle('active');
      this.stratumEditor.setAnnotationMode(enabled);
      if (enabled) {
        document.getElementById('btn-edit-mode').classList.remove('active');
        this.stratumEditor.setEditMode(false);
      }
    });

    document.getElementById('btn-show-all').addEventListener('click', () => {
      this.stratumEditor.showAllStrata();
      this.updateStratumListCheckboxes(true);
    });

    document.getElementById('btn-toggle-points').addEventListener('click', (e) => {
      this.isPointCloudVisible = !this.isPointCloudVisible;
      e.target.classList.toggle('active', this.isPointCloudVisible);
      this.sceneRenderer.pointClouds.forEach(p => {
        if (p.userData.type === 'point_cloud') {
          p.visible = this.isPointCloudVisible;
        }
      });
      this.sceneRenderer.markDirty();
    });

    document.getElementById('btn-toggle-drill-holes').addEventListener('click', (e) => {
      this.isDrillHoleVisible = !this.isDrillHoleVisible;
      e.target.classList.toggle('active', this.isDrillHoleVisible);
      this.sceneRenderer.pointClouds.forEach(p => {
        if (p.userData.type === 'drill_hole') {
          p.visible = this.isDrillHoleVisible;
        }
      });
      this.sceneRenderer.markDirty();
    });

    document.getElementById('btn-reload').addEventListener('click', () => {
      this.loadData();
    });

    const lazyToggle = document.getElementById('btn-lazy-load');
    if (lazyToggle) {
      lazyToggle.addEventListener('click', (e) => {
        this.lazyLoading = !this.lazyLoading;
        e.target.classList.toggle('active', this.lazyLoading);
      });
    }
  }

  setupSectionSlicerUI() {
    const slicerPanel = document.getElementById('slicer-controls');
    if (!slicerPanel) return;

    ['x', 'y', 'z'].forEach(axis => {
      const toggle = document.getElementById(`slice-toggle-${axis}`);
      const slider = document.getElementById(`slice-position-${axis}`);
      const flipBtn = document.getElementById(`slice-flip-${axis}`);

      if (toggle) {
        toggle.addEventListener('change', (e) => {
          this.sectionSlicer.togglePlane(axis, e.target.checked);
        });
      }

      if (slider) {
        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          this.sectionSlicer.setPlanePosition(axis, value);
          const valueDisplay = document.getElementById(`slice-value-${axis}`);
          if (valueDisplay) valueDisplay.textContent = value.toFixed(0);
        });
      }

      if (flipBtn) {
        flipBtn.addEventListener('click', () => {
          this.sectionSlicer.flipPlane(axis);
        });
      }
    });

    const resetBtn = document.getElementById('slice-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.sectionSlicer.resetPlanes();
        ['x', 'y', 'z'].forEach(axis => {
          const toggle = document.getElementById(`slice-toggle-${axis}`);
          const slider = document.getElementById(`slice-position-${axis}`);
          if (toggle) toggle.checked = false;
          if (slider) slider.value = 200;
          const valueDisplay = document.getElementById(`slice-value-${axis}`);
          if (valueDisplay) valueDisplay.textContent = '200';
        });
      });
    }

    const exportBtn = document.getElementById('slice-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = this.sectionSlicer.exportSliceData();
        this.downloadJSON(data, 'section_slice_data.json');
      });
    }
  }

  setupAnnotationManagementUI() {
    const selectAllBtn = document.getElementById('btn-select-all-annotations');
    const deselectAllBtn = document.getElementById('btn-deselect-all-annotations');
    const deleteSelectedBtn = document.getElementById('btn-delete-selected-annotations');
    const toggleVisibilityBtn = document.getElementById('btn-toggle-annotations-visibility');
    const exportJsonBtn = document.getElementById('btn-export-annotations-json');
    const exportCsvBtn = document.getElementById('btn-export-annotations-csv');
    const searchInput = document.getElementById('annotation-search');

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        this.stratumEditor.selectAllAnnotations();
        this.updateAnnotationList();
      });
    }

    if (deselectAllBtn) {
      deselectAllBtn.addEventListener('click', () => {
        this.stratumEditor.deselectAllAnnotations();
        this.updateAnnotationList();
      });
    }

    if (deleteSelectedBtn) {
      deleteSelectedBtn.addEventListener('click', async () => {
        const selected = this.stratumEditor.getSelectedAnnotations();
        if (selected.length === 0) {
          this.showError('没有选中的标注');
          return;
        }
        if (!confirm(`确定删除 ${selected.length} 个标注？`)) return;
        await this.stratumEditor.deleteSelectedAnnotations();
        this.updateAnnotationList();
      });
    }

    if (toggleVisibilityBtn) {
      toggleVisibilityBtn.addEventListener('click', (e) => {
        const visible = e.target.classList.toggle('active');
        this.stratumEditor.toggleAnnotationsVisibility(visible);
        this.sceneRenderer.markDirty();
      });
    }

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', () => {
        const data = this.stratumEditor.exportAnnotations('json');
        this.downloadFile(data, 'annotations.json', 'application/json');
      });
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        const data = this.stratumEditor.exportAnnotations('csv');
        this.downloadFile(data, 'annotations.csv', 'text/csv');
      });
    }

    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const results = this.stratumEditor.filterAnnotations(e.target.value);
          this.updateAnnotationList(results);
        }, 250);
      });
    }
  }

  setupEditorCallbacks() {
    this.stratumEditor.onStratumSelect((stratum) => {
      this.updateStratumInfo(stratum);
      this.highlightStratumInList(stratum._id);
      this.updateAnnotationList();
    });

    this.stratumEditor.onAnnotationAdd((annotation) => {
      console.log('Annotation added:', annotation);
      this.updateAnnotationList();
    });

    this.stratumEditor.onAnnotationSelect(() => {
      this.updateAnnotationList();
    });

    this.stratumEditor.onAnnotationsBatchDelete(() => {
      this.updateAnnotationList();
    });
  }

  async loadData() {
    this.showLoading('正在加载地层数据...');
    try {
      const { strata, drillHoles, points } = await this.dataLoader.loadAllData();
      this.strata = strata;
      this.drillHoles = drillHoles;
      this.points = points;

      this.stratumEditor.setStrata(strata);

      if (this.lazyLoading) {
        this.buildSceneLazy();
      } else {
        this.buildScene();
      }

      this.buildStratumList();
      this.updateStats();
      this.updateAnnotationList();
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showError('数据加载失败,已使用本地模拟数据');
      this.buildScene();
      this.buildStratumList();
      this.updateStats();
    }
    this.hideLoading();
  }

  buildScene() {
    this.sceneRenderer.clearStrata();
    this.modelBuilder.dispose();

    const sortedStrata = [...this.strata].sort((a, b) => a.order - b.order);
    sortedStrata.forEach((stratum, index) => {
      const lowerStratum = sortedStrata[index + 1] || null;
      const mesh = this.modelBuilder.buildStratumMesh(stratum, lowerStratum);
      this.sceneRenderer.addStratumMesh(mesh);
    });

    this.buildPointClouds();
  }

  buildSceneLazy() {
    this.sceneRenderer.clearStrata();
    this.modelBuilder.dispose();

    const sortedStrata = [...this.strata].sort((a, b) => a.order - b.order);
    sortedStrata.forEach((stratum, index) => {
      const lowerStratum = sortedStrata[index + 1] || null;
      const placeholder = this.modelBuilder.buildStratumMeshLazy(
        stratum, lowerStratum
      );
      this.sceneRenderer.addStratumMesh(placeholder);
    });

    this.buildPointClouds();
    this.updateLoadProgress();

    const checkInterval = setInterval(() => {
      this.updateLoadProgress();
      const loaded = this.modelBuilder.getLoadedStrataIds().length;
      if (loaded >= this.strata.length) {
        clearInterval(checkInterval);
      }
    }, 500);
  }

  buildPointClouds() {
    if (this.points.length > 0) {
      const pointCloud = this.modelBuilder.createPointCloud(this.points);
      pointCloud.visible = this.isPointCloudVisible;
      this.sceneRenderer.addPointCloud(pointCloud);
    }

    if (this.drillHoles.length > 0) {
      this.drillHoles.forEach(hole => {
        const line = this.modelBuilder.createDrillHoleLine(hole);
        line.visible = this.isDrillHoleVisible;
        this.sceneRenderer.addPointCloud(line);
      });
    }
  }

  updateLoadProgress() {
    const loaded = this.modelBuilder.getLoadedStrataIds().length;
    const total = this.strata.length;
    const progressEl = document.getElementById('load-progress');
    if (progressEl) {
      progressEl.textContent = `${loaded}/${total}`;
      progressEl.style.color = loaded === total ? '#38a169' : '#4da6ff';
    }
  }

  updateFpsDisplay(fps) {
    const fpsEl = document.getElementById('fps-display');
    if (fpsEl) {
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.style.color = fps >= 50 ? '#38a169' : fps >= 30 ? '#ecc94b' : '#e53e3e';
    }
    const qualityEl = document.getElementById('quality-display');
    if (qualityEl) {
      const qualityMap = { high: '高', medium: '中', low: '低' };
      qualityEl.textContent = `质量: ${qualityMap[this.sceneRenderer.currentQuality] || '高'}`;
    }
  }

  updateAnnotationList(filteredAnnotations = null) {
    const listEl = document.getElementById('annotation-list');
    if (!listEl) return;

    const annotations = filteredAnnotations || this.getAllAnnotations();
    const selectedIds = this.stratumEditor.selectedAnnotations;

    listEl.innerHTML = '';
    if (annotations.length === 0) {
      listEl.innerHTML = '<div class="empty-annotation">暂无标注</div>';
      return;
    }

    annotations.forEach(ann => {
      const isSelected = selectedIds.has(ann.id);
      const item = document.createElement('div');
      item.className = `annotation-list-item${isSelected ? ' selected' : ''}`;
      item.dataset.annotationId = ann.id;
      item.innerHTML = `
        <div class="ann-item-header">
          <span class="ann-item-id">${ann.id}</span>
          <span class="ann-item-stratum">${ann.stratumCode || ''}</span>
        </div>
        <div class="ann-item-text">${ann.text}</div>
        <div class="ann-item-pos">(${ann.position.x.toFixed(1)}, ${ann.position.y.toFixed(1)}, ${ann.position.z.toFixed(1)})</div>
      `;
      item.addEventListener('click', (e) => {
        this.stratumEditor.selectAnnotation(ann.id, e.ctrlKey || e.metaKey);
        this.updateAnnotationList();
      });
      listEl.appendChild(item);
    });

    const countEl = document.getElementById('annotation-count');
    if (countEl) {
      countEl.textContent = `${annotations.length}${selectedIds.size > 0 ? ` (已选${selectedIds.size})` : ''}`;
    }
  }

  getAllAnnotations() {
    const annotations = [];
    this.strata.forEach(stratum => {
      if (stratum.annotations && Array.isArray(stratum.annotations)) {
        stratum.annotations.forEach(ann => {
          annotations.push({ ...ann, stratumId: stratum._id, stratumCode: stratum.code });
        });
      }
    });
    return annotations;
  }

  downloadJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    this.downloadFile(json, filename, 'application/json');
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  buildStratumList() {
    const listContainer = document.getElementById('stratum-list');
    listContainer.innerHTML = '';

    const sortedStrata = [...this.strata].sort((a, b) => a.order - b.order);

    sortedStrata.forEach(stratum => {
      const item = document.createElement('div');
      item.className = 'stratum-item';
      item.dataset.id = stratum._id;
      item.innerHTML = `
        <label class="checkbox-container">
          <input type="checkbox" checked data-stratum-id="${stratum._id}" class="stratum-checkbox">
          <span class="checkmark"></span>
        </label>
        <div class="stratum-color" style="background-color: ${stratum.color}"></div>
        <div class="stratum-info">
          <div class="stratum-name">${stratum.code} - ${stratum.name}</div>
          <div class="stratum-detail">厚度: ${stratum.thickness}m | 深度: ${stratum.depth}m</div>
        </div>
        <div class="stratum-actions">
          <button class="action-btn" title="单独查看" data-action="isolate" data-id="${stratum._id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <input type="color" class="color-picker" value="${stratum.color}" data-id="${stratum._id}" title="修改颜色">
        </div>
      `;
      listContainer.appendChild(item);
    });

    listContainer.querySelectorAll('.stratum-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const stratumId = e.target.dataset.stratumId;
        const visible = e.target.checked;
        this.stratumEditor.toggleStratumVisibility(stratumId, visible);
        this.sceneRenderer.markDirty();
      });
    });

    listContainer.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const stratumId = e.currentTarget.dataset.id;
        if (action === 'isolate') {
          this.stratumEditor.isolateStratum(stratumId);
          this.updateStratumListCheckboxes(false, stratumId);
        }
      });
    });

    listContainer.querySelectorAll('.color-picker').forEach(picker => {
      picker.addEventListener('input', (e) => {
        const stratumId = e.target.dataset.id;
        const color = e.target.value;
        this.stratumEditor.updateStratumColor(stratumId, color);
        const colorDiv = e.target.closest('.stratum-item').querySelector('.stratum-color');
        if (colorDiv) colorDiv.style.backgroundColor = color;
      });
    });
  }

  updateStratumListCheckboxes(checked, exceptId = null) {
    document.querySelectorAll('.stratum-checkbox').forEach(cb => {
      if (!exceptId || cb.dataset.stratumId === exceptId) {
        cb.checked = checked;
      } else {
        cb.checked = false;
      }
    });
  }

  updateStratumInfo(stratum) {
    const infoPanel = document.getElementById('stratum-details');
    const annotations = stratum.annotations || [];
    infoPanel.innerHTML = `
      <div class="detail-header">
        <div class="detail-color" style="background-color: ${stratum.color}"></div>
        <div>
          <h3>${stratum.code} - ${stratum.name}</h3>
          <span class="detail-subtitle">层序: ${stratum.order}</span>
        </div>
      </div>
      <div class="detail-content">
        <div class="detail-row">
          <span class="label">地层编码:</span>
          <span class="value">${stratum.code}</span>
        </div>
        <div class="detail-row">
          <span class="label">地层名称:</span>
          <span class="value">${stratum.name}</span>
        </div>
        <div class="detail-row">
          <span class="label">厚度:</span>
          <span class="value">${stratum.thickness} m</span>
        </div>
        <div class="detail-row">
          <span class="label">底界深度:</span>
          <span class="value">${stratum.depth} m</span>
        </div>
        <div class="detail-row">
          <span class="label">描述:</span>
          <span class="value">${stratum.description || '无'}</span>
        </div>
        <div class="detail-row">
          <span class="label">点位数:</span>
          <span class="value">${stratum.points ? stratum.points.length : 0}</span>
        </div>
        <div class="detail-row">
          <span class="label">标注数:</span>
          <span class="value">${annotations.length}</span>
        </div>
      </div>
      ${annotations.length > 0 ? `
        <div class="annotation-section">
          <h4>标注列表</h4>
          ${annotations.map(ann => `
            <div class="annotation-item">
              <div class="annotation-text">${ann.text}</div>
              <div class="annotation-meta">
                ID: ${ann.id} | 位置: (${ann.position.x.toFixed(1)}, ${ann.position.y.toFixed(1)}, ${ann.position.z.toFixed(1)})
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  highlightStratumInList(stratumId) {
    document.querySelectorAll('.stratum-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === stratumId);
    });
  }

  updateStats() {
    document.getElementById('stat-strata').textContent = this.strata.length;
    document.getElementById('stat-points').textContent = this.points.length;
    document.getElementById('stat-holes').textContent = this.drillHoles.length;
  }

  showLoading(message) {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    text.textContent = message;
    overlay.style.display = 'flex';
  }

  hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
  }

  showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.sceneRenderer.render();
  }

  dispose() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.stratumEditor.dispose();
    this.modelBuilder.dispose();
    this.sectionSlicer.dispose();
    this.sceneRenderer.dispose();
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  window.app = new GeologicalApp();
  await window.app.init();
});

window.addEventListener('beforeunload', () => {
  if (window.app) {
    window.app.dispose();
  }
});
