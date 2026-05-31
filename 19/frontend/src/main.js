import { SceneRenderer } from './modules/SceneRenderer.js';
import { DataLoader } from './modules/DataLoader.js';
import { CameraController } from './modules/CameraController.js';
import { AnnotationEditor } from './modules/AnnotationEditor.js';
import { LayerManager } from './modules/LayerManager.js';
import { PerformanceMonitor, FrustumCuller } from './modules/PerformanceMonitor.js';
import { SectionPlanner } from './modules/SectionPlanner.js';
import { BatchAnnotationManager } from './modules/BatchAnnotationManager.js';
import { isValidPipeline, sanitizePipeline } from '../../shared/validators.js';

class Pipeline3DSystem {
  constructor() {
    this.sceneRenderer = null;
    this.dataLoader = null;
    this.cameraController = null;
    this.annotationEditor = null;
    this.layerManager = null;
    this.perfMonitor = null;
    this.frustumCuller = null;
    this.sectionPlanner = null;
    this.batchAnnotationManager = null;
    this.pipelines = [];
    this.currentMode = 'browse';
    this.isLoading = false;
    
    this.init();
  }

  async init() {
    try {
      const container = document.getElementById('canvas-container');
      
      this.sceneRenderer = new SceneRenderer(container);
      
      this.dataLoader = new DataLoader();
      
      this.cameraController = new CameraController(
        this.sceneRenderer.camera,
        this.sceneRenderer.controls,
        this.sceneRenderer.renderer
      );
      
      this.annotationEditor = new AnnotationEditor(
        this.sceneRenderer,
        this.dataLoader
      );
      
      this.layerManager = new LayerManager(this.sceneRenderer, this.dataLoader);
      
      this.perfMonitor = new PerformanceMonitor(this.sceneRenderer);
      this.perfMonitor.onFpsUpdate = (fps, stats) => {
        this.updateFpsDisplay(fps, stats);
      };
      this.perfMonitor.onQualityChange = (level) => {
        this.updateQualityDisplay(level);
      };
      this.sceneRenderer.setPerformanceMonitor(this.perfMonitor);
      
      this.frustumCuller = new FrustumCuller(this.sceneRenderer);
      this.sceneRenderer.setFrustumCuller(this.frustumCuller);
      
      this.sectionPlanner = new SectionPlanner(this.sceneRenderer);
      this.sectionPlanner.onSectionComplete = (results) => {
        this.updateSectionResults(results);
      };
      this.sectionPlanner.onSectionClear = () => {
        this.clearSectionResults();
      };
      
      this.batchAnnotationManager = new BatchAnnotationManager(
        this.sceneRenderer,
        this.dataLoader,
        this.annotationEditor
      );
      this.batchAnnotationManager.onBatchOperationComplete = (op, results) => {
        this.updateInfo();
        this.showSuccess(`${op} 操作完成: 成功${results.created || results.deleted || results.updated || results.moved || 0}条`);
      };
      this.batchAnnotationManager.onSelectionChange = (selectedIds) => {
        this.updateSelectionInfo(selectedIds.length);
      };
      
      this.setupEventListeners();
      
      await this.loadData();
      
      this.updateInfo();
      
      console.log('🚀 地下管廊管线三维拓扑系统启动成功');
      console.log(`📊 加载管线数量: ${this.pipelines.length}`);
      console.log(`📍 加载标注数量: ${this.annotationEditor.getAnnotationCount()}`);
      console.log(`🎯 渲染帧率: ${this.perfMonitor.getFps()} FPS`);
      
    } catch (error) {
      console.error('系统初始化失败:', error);
      this.showError('系统初始化失败，请刷新页面重试');
    }
  }

  async loadData() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoading(true);
    
    try {
      console.log('📥 正在加载管线数据（分层懒加载模式）...');
      
      const layerResults = await this.layerManager.loadAllLayers();
      
      const totalPipelines = this.layerManager.getTotalPipelineCount();
      const totalPoints = this.layerManager.getTotalPointCount();
      
      console.log(`✅ 分层加载完成: ${totalPipelines}条管线, ${totalPoints}个点位`);
      
      this.pipelines = [];
      Object.keys(this.layerManager.layers).forEach(type => {
        const layer = this.layerManager.layers[type];
        if (layer.loaded) {
          const group = this.sceneRenderer.pipelineGroups[type];
          if (group) {
            group.children.forEach(child => {
              if (child.userData.isPipeline) {
                this.pipelines.push(child.userData);
              }
            });
          }
        }
      });
      
      console.log('📥 正在加载标注数据...');
      await this.annotationEditor.loadAnnotations();
      
      if (totalPipelines > 0) {
        this.fitViewToData();
      }
      
    } catch (error) {
      console.error('加载数据失败:', error);
      this.showError('数据加载失败，使用本地模拟数据');
      
      try {
        this.pipelines = this.dataLoader.getMockPipelines();
        this.sceneRenderer.createPipelinesBatch(this.pipelines);
        
        const mockAnnotations = this.dataLoader.getMockAnnotations();
        this.annotationEditor.annotations = mockAnnotations;
        mockAnnotations.forEach(ann => this.sceneRenderer.createAnnotation(ann));
        
        if (this.pipelines.length > 0) {
          this.fitViewToData();
        }
      } catch (fallbackError) {
        console.error('加载模拟数据也失败:', fallbackError);
      }
    } finally {
      this.isLoading = false;
      this.showLoading(false);
      this.updateInfo();
    }
  }

  fitViewToData() {
    if (this.pipelines.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    this.pipelines.forEach(pipeline => {
      if (pipeline.points) {
        pipeline.points.forEach(point => {
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
          minZ = Math.min(minZ, point.z);
          maxZ = Math.max(maxZ, point.z);
        });
      }
    });
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    const distance = Math.max(size * 1.5, 30);
    
    this.sceneRenderer.controls.target.set(centerX, centerY, centerZ);
    this.sceneRenderer.camera.position.set(centerX + distance, centerY + distance, centerZ + distance);
    this.sceneRenderer.camera.lookAt(centerX, centerY, centerZ);
    this.sceneRenderer.controls.update();
  }

  setupEventListeners() {
    const layerControls = [
      { id: 'layer-water', type: 'water' },
      { id: 'layer-sewage', type: 'sewage' },
      { id: 'layer-electric', type: 'electric' },
      { id: 'layer-gas', type: 'gas' },
      { id: 'layer-heat', type: 'heat' },
    ];
    
    layerControls.forEach(({ id, type }) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          this.layerManager.setLayerVisible(type, e.target.checked);
          this.updateInfo();
        });
      }
    });
    
    const btnRotate = document.getElementById('btn-rotate');
    const btnPan = document.getElementById('btn-pan');
    const btnZoom = document.getElementById('btn-zoom');
    const btnAnnotation = document.getElementById('btn-annotation');
    const btnReset = document.getElementById('btn-reset');
    const btnSection = document.getElementById('btn-section');
    const btnBatchAnnotation = document.getElementById('btn-batch-annotation');
    const btnExportAnnotations = document.getElementById('btn-export-annotations');
    
    if (btnRotate) btnRotate.addEventListener('click', () => {
      this.setMode('rotate');
      this.cameraController.setMode('rotate');
    });
    
    if (btnPan) btnPan.addEventListener('click', () => {
      this.setMode('pan');
      this.cameraController.setMode('pan');
    });
    
    if (btnZoom) btnZoom.addEventListener('click', () => {
      this.setMode('zoom');
      this.cameraController.setMode('zoom');
    });
    
    if (btnAnnotation) btnAnnotation.addEventListener('click', () => {
      this.setMode('annotation');
      this.annotationEditor.activate();
      this.updateModeDisplay('标注');
    });
    
    if (btnReset) btnReset.addEventListener('click', () => {
      this.cameraController.resetView();
    });
    
    if (btnSection) btnSection.addEventListener('click', () => {
      const isActive = this.sectionPlanner.toggle();
      btnSection.classList.toggle('active', isActive);
      this.updateModeDisplay(isActive ? '剖面截取' : '浏览');
      const sectionPanel = document.getElementById('section-panel');
      if (sectionPanel) sectionPanel.style.display = isActive ? 'block' : 'none';
    });
    
    const sectionApply = document.getElementById('section-apply');
    if (sectionApply) sectionApply.addEventListener('click', () => {
      const w = parseFloat(document.getElementById('section-width').value) || 20;
      const h = parseFloat(document.getElementById('section-height').value) || 20;
      const d = parseFloat(document.getElementById('section-depth').value) || 20;
      this.sectionPlanner.setSectionSize(w, h, d);
      this.sectionPlanner.computeIntersection();
    });
    
    const sectionExport = document.getElementById('section-export');
    if (sectionExport) sectionExport.addEventListener('click', () => {
      const data = this.sectionPlanner.exportSectionData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `section_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showSuccess('剖面数据导出成功');
    });
    
    if (btnBatchAnnotation) btnBatchAnnotation.addEventListener('click', () => {
      this.showBatchAnnotationPanel();
    });
    
    if (btnExportAnnotations) btnExportAnnotations.addEventListener('click', () => {
      this.batchAnnotationManager.downloadExport('json');
      this.showSuccess('标注数据导出成功');
    });
    
    this.annotationEditor.onAnnotationCreated = (annotation) => {
      this.updateInfo();
      this.setMode('browse');
      this.showSuccess('标注创建成功');
    };
    
    this.annotationEditor.onAnnotationSelected = (annotation, event) => {
      this.showAnnotationPopup(annotation, event);
    };
    
    this.annotationEditor.onAnnotationDeleted = (id) => {
      this.updateInfo();
      this.showSuccess('标注删除成功');
    };
    
    this.layerManager.onLayerLoaded = (type, info) => {
      const checkbox = document.getElementById(`layer-${type}`);
      if (checkbox) checkbox.checked = true;
      this.updateInfo();
    };
    
    this.layerManager.onLayerUnloaded = (type, info) => {
      const checkbox = document.getElementById(`layer-${type}`);
      if (checkbox) checkbox.checked = false;
      this.updateInfo();
    };
    
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 'Escape') {
        this.annotationEditor.deactivate();
        if (this.sectionPlanner.isActive) {
          this.sectionPlanner.deactivate();
          const sectionPanel = document.getElementById('section-panel');
          if (sectionPanel) sectionPanel.style.display = 'none';
        }
        const btnSection = document.getElementById('btn-section');
        if (btnSection) btnSection.classList.remove('active');
        this.setMode('browse');
        this.hideAnnotationPopup();
      }
      if (e.key === 'r' || e.key === 'R') {
        this.setMode('rotate');
        this.cameraController.setMode('rotate');
      }
      if (e.key === 'p' || e.key === 'P') {
        this.setMode('pan');
        this.cameraController.setMode('pan');
      }
      if (e.key === 'z' || e.key === 'Z') {
        this.setMode('zoom');
        this.cameraController.setMode('zoom');
      }
      if (e.key === 'f' || e.key === 'F') {
        this.fitViewToData();
      }
      if (e.key === 's' || e.key === 'S') {
        const isActive = this.sectionPlanner.toggle();
        const btnSection = document.getElementById('btn-section');
        if (btnSection) btnSection.classList.toggle('active', isActive);
      }
      if (e.key === 'a' || e.key === 'A') {
        if (e.ctrlKey) {
          e.preventDefault();
          this.batchAnnotationManager.selectAll();
        }
      }
      if (e.key === 'Delete') {
        const selectedIds = this.batchAnnotationManager.getSelectedIds();
        if (selectedIds.length > 0) {
          if (confirm(`确定要删除选中的 ${selectedIds.length} 个标注?`)) {
            this.batchAnnotationManager.batchDelete(selectedIds);
            this.updateInfo();
          }
        }
      }
    });
    
    window.addEventListener('resize', () => {
      if (this.sceneRenderer) this.sceneRenderer.onWindowResize();
    });
    
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('annotation-popup');
      if (popup && popup.style.display === 'block') {
        if (!popup.contains(e.target)) {
          this.hideAnnotationPopup();
        }
      }
    });
  }

  setMode(mode) {
    this.currentMode = mode;
    
    document.querySelectorAll('.toolbar button').forEach(btn => btn.classList.remove('active'));
    
    const modeBtnId = {
      rotate: 'btn-rotate',
      pan: 'btn-pan',
      zoom: 'btn-zoom',
      annotation: 'btn-annotation',
      section: 'btn-section',
    };
    
    const activeBtn = document.getElementById(modeBtnId[mode]);
    if (activeBtn) activeBtn.classList.add('active');
    
    const modeNames = {
      rotate: '旋转',
      pan: '平移',
      zoom: '缩放',
      annotation: '标注',
      section: '剖面截取',
      browse: '浏览',
    };
    
    this.updateModeDisplay(modeNames[mode] || '浏览');
    
    if (mode !== 'annotation') {
      this.annotationEditor.deactivate();
    }
  }

  showAnnotationPopup(annotation, event) {
    const popup = document.getElementById('annotation-popup');
    const title = document.getElementById('popup-title');
    const content = document.getElementById('popup-content');
    
    if (!popup || !title || !content) return;
    
    title.textContent = annotation.name || '标注';
    
    const typeNames = { valve: '阀门', joint: '接头', manhole: '检查井', transformer: '变压器', general: '通用' };
    const typeText = typeNames[annotation.type] || annotation.type;
    const positionText = `位置: (${annotation.x.toFixed(1)}, ${annotation.y.toFixed(1)}, ${annotation.z.toFixed(1)})`;
    
    let html = '';
    if (annotation.content) html += `<p>${annotation.content}</p>`;
    html += `<p style="margin-top:8px;font-size:11px;color:#888">${positionText}</p>`;
    html += `<p style="font-size:11px;color:#888">类型: ${typeText}</p>`;
    if (annotation.author) html += `<p style="font-size:11px;color:#888">作者: ${annotation.author}</p>`;
    html += `<div style="margin-top:8px;display:flex;gap:6px">`;
    html += `<button onclick="window.pipelineSystem.batchAnnotationManager.selectAnnotation('${annotation._id}')" style="padding:3px 8px;background:#4a90d9;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px">选中</button>`;
    html += `<button onclick="window.pipelineSystem.annotationEditor.deleteAnnotation('${annotation._id}')" style="padding:3px 8px;background:#e74c3c;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px">删除</button>`;
    html += `</div>`;
    
    content.innerHTML = html;
    
    let left = event.clientX + 15;
    let top = event.clientY + 15;
    if (left + 220 > window.innerWidth) left = event.clientX - 220;
    if (top + 180 > window.innerHeight) top = event.clientY - 180;
    
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.style.display = 'block';
  }

  hideAnnotationPopup() {
    const popup = document.getElementById('annotation-popup');
    if (popup) popup.style.display = 'none';
  }

  updateSectionResults(results) {
    const sectionInfo = document.getElementById('section-info');
    const sectionList = document.getElementById('section-list');
    
    if (sectionInfo) {
      const totalPoints = results.reduce((sum, r) => sum + r.intersectedPointCount, 0);
      sectionInfo.textContent = `截取 ${results.length} 条管线, ${totalPoints} 个点位`;
    }
    
    if (sectionList) {
      sectionList.innerHTML = results.map(r => 
        `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:12px">` +
        `<span style="color:${r.color}">●</span> ${r.name} (${r.typeName}) - ${r.intersectedPointCount}点` +
        `</div>`
      ).join('');
    }
  }

  clearSectionResults() {
    const sectionInfo = document.getElementById('section-info');
    const sectionList = document.getElementById('section-list');
    if (sectionInfo) sectionInfo.textContent = '';
    if (sectionList) sectionList.innerHTML = '';
  }

  showBatchAnnotationPanel() {
    let panel = document.getElementById('batch-annotation-panel');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      return;
    }
    
    panel = document.createElement('div');
    panel.id = 'batch-annotation-panel';
    panel.style.cssText = `
      position:absolute;top:80px;right:20px;background:rgba(0,0,0,0.85);
      color:white;padding:16px;border-radius:8px;z-index:150;min-width:240px;
      max-height:400px;overflow-y:auto;
    `;
    
    const stats = this.batchAnnotationManager.getAnnotationStats();
    
    panel.innerHTML = `
      <h4 style="margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,0.3);padding-bottom:8px">批量标注管理</h4>
      <div style="margin-bottom:8px;font-size:13px">总计: ${stats.total} 个标注 | 选中: <span id="batch-selected-count">${stats.selected}</span></div>
      <div style="margin-bottom:12px;font-size:12px;color:#aaa">
        ${Object.entries(stats.byType).map(([t, c]) => `${t}: ${c}`).join(' | ')}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button id="batch-select-all" style="padding:6px 12px;background:#4a90d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">全选</button>
        <button id="batch-deselect-all" style="padding:6px 12px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">取消全选</button>
        <button id="batch-delete-selected" style="padding:6px 12px;background:#e74c3c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">删除选中</button>
        <button id="batch-export-json" style="padding:6px 12px;background:#2ecc71;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">导出 JSON</button>
        <button id="batch-export-csv" style="padding:6px 12px;background:#2ecc71;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">导出 CSV</button>
        <button id="batch-import" style="padding:6px 12px;background:#f39c12;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">导入标注</button>
      </div>
      <input type="file" id="batch-import-file" accept=".json" style="display:none">
    `;
    
    document.getElementById('app').appendChild(panel);
    
    document.getElementById('batch-select-all').addEventListener('click', () => {
      this.batchAnnotationManager.selectAll();
      this.updateSelectionInfo(this.batchAnnotationManager.getSelectedCount());
    });
    document.getElementById('batch-deselect-all').addEventListener('click', () => {
      this.batchAnnotationManager.deselectAll();
      this.updateSelectionInfo(0);
    });
    document.getElementById('batch-delete-selected').addEventListener('click', async () => {
      const ids = this.batchAnnotationManager.getSelectedIds();
      if (ids.length === 0) { this.showError('请先选中标注'); return; }
      if (confirm(`确定删除 ${ids.length} 个标注?`)) {
        await this.batchAnnotationManager.batchDelete(ids);
        this.updateInfo();
      }
    });
    document.getElementById('batch-export-json').addEventListener('click', () => {
      this.batchAnnotationManager.downloadExport('json');
    });
    document.getElementById('batch-export-csv').addEventListener('click', () => {
      this.batchAnnotationManager.downloadExport('csv');
    });
    document.getElementById('batch-import').addEventListener('click', () => {
      document.getElementById('batch-import-file').click();
    });
    document.getElementById('batch-import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const result = await this.batchAnnotationManager.importAnnotations(text);
      this.showSuccess(`导入完成: 成功 ${result.created} 条`);
      this.updateInfo();
    });
  }

  updateSelectionInfo(count) {
    const el = document.getElementById('batch-selected-count');
    if (el) el.textContent = count;
    
    const modeEl = document.getElementById('current-mode');
    if (modeEl && count > 0) {
      modeEl.textContent = `浏览 (选中${count}个)`;
    }
  }

  updateFpsDisplay(fps, stats) {
    const fpsEl = document.getElementById('fps-display');
    if (fpsEl) {
      fpsEl.textContent = fps;
      fpsEl.style.color = fps >= 50 ? '#2ecc71' : fps >= 30 ? '#f39c12' : '#e74c3c';
    }
    
    const drawCallsEl = document.getElementById('draw-calls');
    if (drawCallsEl) drawCallsEl.textContent = stats.drawCalls;
    
    const trianglesEl = document.getElementById('triangles');
    if (trianglesEl) trianglesEl.textContent = stats.triangles > 1000 ? (stats.triangles / 1000).toFixed(1) + 'K' : stats.triangles;
  }

  updateQualityDisplay(level) {
    const qualityEl = document.getElementById('quality-level');
    if (qualityEl) {
      qualityEl.textContent = level === 'high' ? '高' : level === 'medium' ? '中' : '低';
      qualityEl.style.color = level === 'high' ? '#2ecc71' : level === 'medium' ? '#f39c12' : '#e74c3c';
    }
  }

  updateModeDisplay(mode) {
    const modeElement = document.getElementById('current-mode');
    if (modeElement) modeElement.textContent = mode;
  }

  updateInfo() {
    const pipelineCount = document.getElementById('pipeline-count');
    const annotationCount = document.getElementById('annotation-count');
    
    if (pipelineCount) pipelineCount.textContent = this.layerManager ? this.layerManager.getTotalPipelineCount() : this.pipelines.length;
    if (annotationCount) annotationCount.textContent = this.annotationEditor.getAnnotationCount();
  }

  showLoading(show) {
    let loadingEl = document.getElementById('loading-indicator');
    if (!loadingEl && show) {
      loadingEl = document.createElement('div');
      loadingEl.id = 'loading-indicator';
      loadingEl.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.8);color:white;padding:20px 40px;border-radius:8px;z-index:1000;font-size:16px;`;
      document.body.appendChild(loadingEl);
    }
    if (loadingEl) {
      loadingEl.textContent = show ? '🔄 数据加载中...' : '';
      loadingEl.style.display = show ? 'block' : 'none';
    }
  }

  showError(msg) { this.showToast(msg, 'error'); }
  showSuccess(msg) { this.showToast(msg, 'success'); }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? '#e74c3c' : type === 'success' ? '#2ecc71' : '#3498db';
    toast.style.cssText = `position:fixed;top:20px;right:20px;background:${bgColor};color:white;padding:12px 24px;border-radius:6px;z-index:2000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);transform:translateX(120%);transition:transform 0.3s ease;`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
    setTimeout(() => { toast.style.transform = 'translateX(120%)'; setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300); }, 3000);
  }

  destroy() {
    if (this.sectionPlanner) this.sectionPlanner.dispose();
    if (this.batchAnnotationManager) this.batchAnnotationManager.dispose();
    if (this.cameraController) this.cameraController.dispose();
    if (this.annotationEditor) this.annotationEditor.dispose();
    if (this.sceneRenderer) this.sceneRenderer.destroy();
  }
}

window.addEventListener('DOMContentLoaded', () => { window.pipelineSystem = new Pipeline3DSystem(); });
window.addEventListener('beforeunload', () => { if (window.pipelineSystem) window.pipelineSystem.destroy(); });
