import * as THREE from 'three';
import { isValidAnnotation, sanitizeAnnotation } from '../../../shared/validators.js';
import { ANNOTATION_TYPE_NAMES } from '../../../shared/types.js';

export class BatchAnnotationManager {
  constructor(sceneRenderer, dataLoader, annotationEditor) {
    this.sceneRenderer = sceneRenderer;
    this.dataLoader = dataLoader;
    this.annotationEditor = annotationEditor;
    this.selectedAnnotations = new Set();
    this.filterCriteria = {};
    this.sortField = 'createdAt';
    this.sortOrder = 'desc';
    
    this.onSelectionChange = null;
    this.onBatchOperationComplete = null;
  }
  
  async batchCreate(annotationsData) {
    const results = { created: 0, failed: 0, errors: [] };
    
    for (const data of annotationsData) {
      try {
        const cleanData = sanitizeAnnotation(data);
        
        if (!isValidAnnotation(cleanData)) {
          results.failed++;
          results.errors.push({ data, error: 'Invalid annotation data' });
          continue;
        }
        
        const saved = await this.dataLoader.createAnnotation(cleanData);
        
        if (saved) {
          this.annotationEditor.annotations.push(saved);
          this.sceneRenderer.createAnnotation(saved);
          results.created++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ data, error: error.message });
      }
    }
    
    if (this.onBatchOperationComplete) {
      this.onBatchOperationComplete('create', results);
    }
    
    return results;
  }
  
  async batchDelete(ids) {
    const results = { deleted: 0, failed: 0, errors: [] };
    
    for (const id of ids) {
      try {
        const success = await this.annotationEditor.deleteAnnotation(id);
        if (success) {
          results.deleted++;
          this.selectedAnnotations.delete(id);
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ id, error: error.message });
      }
    }
    
    if (this.onBatchOperationComplete) {
      this.onBatchOperationComplete('delete', results);
    }
    
    return results;
  }
  
  async batchUpdate(ids, updateData) {
    const results = { updated: 0, failed: 0, errors: [] };
    
    for (const id of ids) {
      try {
        const updated = await this.dataLoader.updateAnnotation(id, updateData);
        
        if (updated) {
          const annotationObj = this.sceneRenderer.annotationObjects.find(
            obj => obj.userData._id === id
          );
          
          if (annotationObj) {
            this.sceneRenderer.scene.remove(annotationObj);
            const index = this.sceneRenderer.annotationObjects.indexOf(annotationObj);
            if (index > -1) {
              this.sceneRenderer.annotationObjects.splice(index, 1);
            }
            
            this.sceneRenderer.createAnnotation(updated);
            
            const annIndex = this.annotationEditor.annotations.findIndex(a => a._id === id);
            if (annIndex > -1) {
              this.annotationEditor.annotations[annIndex] = updated;
            }
          }
          
          results.updated++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ id, error: error.message });
      }
    }
    
    if (this.onBatchOperationComplete) {
      this.onBatchOperationComplete('update', results);
    }
    
    return results;
  }
  
  async batchMove(ids, offset) {
    const results = { moved: 0, failed: 0, errors: [] };
    
    for (const id of ids) {
      try {
        const annotation = this.annotationEditor.annotations.find(a => a._id === id);
        if (!annotation) {
          results.failed++;
          continue;
        }
        
        const updatedData = {
          ...annotation,
          x: annotation.x + (offset.x || 0),
          y: annotation.y + (offset.y || 0),
          z: annotation.z + (offset.z || 0),
        };
        
        const updated = await this.dataLoader.updateAnnotation(id, updatedData);
        
        if (updated) {
          const obj = this.sceneRenderer.annotationObjects.find(o => o.userData._id === id);
          if (obj) {
            obj.position.set(updated.x, updated.y, updated.z);
            obj.userData.x = updated.x;
            obj.userData.y = updated.y;
            obj.userData.z = updated.z;
            obj.userData.baseY = updated.y;
          }
          
          const annIndex = this.annotationEditor.annotations.findIndex(a => a._id === id);
          if (annIndex > -1) {
            this.annotationEditor.annotations[annIndex] = updated;
          }
          
          results.moved++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ id, error: error.message });
      }
    }
    
    if (this.onBatchOperationComplete) {
      this.onBatchOperationComplete('move', results);
    }
    
    return results;
  }
  
  selectAnnotation(id) {
    this.selectedAnnotations.add(id);
    this.highlightAnnotation(id, true);
    
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedIds());
    }
  }
  
  deselectAnnotation(id) {
    this.selectedAnnotations.delete(id);
    this.highlightAnnotation(id, false);
    
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedIds());
    }
  }
  
  toggleSelection(id) {
    if (this.selectedAnnotations.has(id)) {
      this.deselectAnnotation(id);
    } else {
      this.selectAnnotation(id);
    }
  }
  
  selectAll() {
    this.annotationEditor.annotations.forEach(ann => {
      this.selectedAnnotations.add(ann._id);
      this.highlightAnnotation(ann._id, true);
    });
    
    if (this.onSelectionChange) {
      this.onSelectionChange(this.getSelectedIds());
    }
  }
  
  deselectAll() {
    this.selectedAnnotations.forEach(id => {
      this.highlightAnnotation(id, false);
    });
    this.selectedAnnotations.clear();
    
    if (this.onSelectionChange) {
      this.onSelectionChange([]);
    }
  }
  
  highlightAnnotation(id, highlight) {
    const obj = this.sceneRenderer.annotationObjects.find(o => o.userData._id === id);
    if (!obj) return;
    
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        if (highlight) {
          child.material.emissiveIntensity = 1.0;
          child.scale.setScalar(1.3);
        } else {
          child.material.emissiveIntensity = 0.4;
          child.scale.setScalar(1.0);
        }
      }
    });
  }
  
  getSelectedIds() {
    return [...this.selectedAnnotations];
  }
  
  getSelectedAnnotations() {
    return this.annotationEditor.annotations.filter(ann => this.selectedAnnotations.has(ann._id));
  }
  
  getSelectedCount() {
    return this.selectedAnnotations.size;
  }
  
  filterAnnotations(criteria) {
    this.filterCriteria = criteria;
    return this.applyFilter();
  }
  
  applyFilter() {
    let annotations = [...this.annotationEditor.annotations];
    
    if (this.filterCriteria.type) {
      annotations = annotations.filter(a => a.type === this.filterCriteria.type);
    }
    
    if (this.filterCriteria.nameContains) {
      const search = this.filterCriteria.nameContains.toLowerCase();
      annotations = annotations.filter(a => 
        a.name.toLowerCase().includes(search) || 
        (a.content && a.content.toLowerCase().includes(search))
      );
    }
    
    if (this.filterCriteria.author) {
      annotations = annotations.filter(a => a.author === this.filterCriteria.author);
    }
    
    if (this.filterCriteria.bounds) {
      const b = this.filterCriteria.bounds;
      annotations = annotations.filter(a => 
        a.x >= b.minX && a.x <= b.maxX &&
        a.y >= b.minY && a.y <= b.maxY &&
        a.z >= b.minZ && a.z <= b.maxZ
      );
    }
    
    if (this.filterCriteria.pipelineId) {
      annotations = annotations.filter(a => a.pipelineId === this.filterCriteria.pipelineId);
    }
    
    annotations = this.sortAnnotations(annotations);
    
    return annotations;
  }
  
  sortAnnotations(annotations) {
    const field = this.sortField;
    const order = this.sortOrder === 'asc' ? 1 : -1;
    
    return annotations.sort((a, b) => {
      const valA = a[field];
      const valB = b[field];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * order;
      }
      
      return ((valA || 0) - (valB || 0)) * order;
    });
  }
  
  setSortField(field, order = 'desc') {
    this.sortField = field;
    this.sortOrder = order;
  }
  
  getAnnotationStats() {
    const annotations = this.annotationEditor.annotations;
    
    const typeCounts = {};
    const authorCounts = {};
    
    annotations.forEach(ann => {
      typeCounts[ann.type] = (typeCounts[ann.type] || 0) + 1;
      if (ann.author) {
        authorCounts[ann.author] = (authorCounts[ann.author] || 0) + 1;
      }
    });
    
    return {
      total: annotations.length,
      byType: typeCounts,
      byAuthor: authorCounts,
      selected: this.selectedAnnotations.size,
    };
  }
  
  exportAnnotations(format = 'json') {
    const annotations = this.filterCriteria ? this.applyFilter() : this.annotationEditor.annotations;
    
    switch (format) {
      case 'json':
        return JSON.stringify(annotations, null, 2);
      
      case 'csv':
        return this.convertToCSV(annotations);
      
      default:
        return JSON.stringify(annotations, null, 2);
    }
  }
  
  convertToCSV(annotations) {
    const headers = ['_id', 'name', 'type', 'x', 'y', 'z', 'content', 'author', 'pipelineId'];
    const typeNames = ANNOTATION_TYPE_NAMES;
    
    const rows = annotations.map(ann => [
      ann._id,
      ann.name,
      typeNames[ann.type] || ann.type,
      ann.x.toFixed(2),
      ann.y.toFixed(2),
      ann.z.toFixed(2),
      `"${(ann.content || '').replace(/"/g, '""')}"`,
      ann.author || '',
      ann.pipelineId || '',
    ]);
    
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
  
  async importAnnotations(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const annotations = Array.isArray(data) ? data : [data];
      
      return await this.batchCreate(annotations);
    } catch (error) {
      return { created: 0, failed: 0, errors: [{ error: `Import failed: ${error.message}` }] };
    }
  }
  
  downloadExport(format = 'json') {
    const content = this.exportAnnotations(format);
    const mimeType = format === 'csv' ? 'text/csv' : 'application/json';
    const extension = format === 'csv' ? 'csv' : 'json';
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations_export_${new Date().toISOString().slice(0, 10)}.${extension}`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  getAnnotationById(id) {
    return this.annotationEditor.annotations.find(a => a._id === id) || null;
  }
  
  findNearestAnnotation(point, maxDistance = 5) {
    let nearest = null;
    let minDist = maxDistance;
    
    this.annotationEditor.annotations.forEach(ann => {
      const dist = Math.sqrt(
        Math.pow(ann.x - point.x, 2) +
        Math.pow(ann.y - point.y, 2) +
        Math.pow(ann.z - point.z, 2)
      );
      
      if (dist < minDist) {
        minDist = dist;
        nearest = ann;
      }
    });
    
    return nearest;
  }
  
  findAnnotationsInRadius(point, radius) {
    return this.annotationEditor.annotations.filter(ann => {
      const dist = Math.sqrt(
        Math.pow(ann.x - point.x, 2) +
        Math.pow(ann.y - point.y, 2) +
        Math.pow(ann.z - point.z, 2)
      );
      return dist <= radius;
    });
  }
  
  dispose() {
    this.deselectAll();
    this.selectedAnnotations.clear();
    this.filterCriteria = {};
  }
}
