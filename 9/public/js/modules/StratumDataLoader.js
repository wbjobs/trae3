class StratumDataLoader {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.strata = [];
    this.drillHoles = [];
    this.points = [];
    this.loadingStates = new Map();
    this.strataCache = new Map();
    this.loadQueue = [];
    this.isProcessingQueue = false;
  }

  async loadAllData() {
    try {
      const [strata, drillHoles, points] = await Promise.all([
        this.loadStrata(),
        this.loadDrillHoles(),
        this.loadPoints(),
      ]);
      return { strata, drillHoles, points };
    } catch (error) {
      console.error('Data loading error:', error);
      throw error;
    }
  }

  async loadStrata() {
    const response = await fetch(`${this.baseUrl}/api/strata`);
    const result = await response.json();
    if (result && result.status === 'success' && Array.isArray(result.data)) {
      this.strata = result.data;
    } else if (Array.isArray(result)) {
      this.strata = result;
    } else {
      this.strata = [];
    }
    return this.strata;
  }

  async loadDrillHoles() {
    const response = await fetch(`${this.baseUrl}/api/drill-holes`);
    const result = await response.json();
    if (result && result.status === 'success' && Array.isArray(result.data)) {
      this.drillHoles = result.data;
    } else if (Array.isArray(result)) {
      this.drillHoles = result;
    } else {
      this.drillHoles = [];
    }
    return this.drillHoles;
  }

  async loadPoints() {
    const response = await fetch(`${this.baseUrl}/api/drill-holes/points/all`);
    const result = await response.json();
    if (result && result.status === 'success' && Array.isArray(result.data)) {
      this.points = result.data;
    } else if (Array.isArray(result)) {
      this.points = result;
    } else {
      this.points = [];
    }
    return this.points;
  }

  async loadStratumById(stratumId) {
    const response = await fetch(`${this.baseUrl}/api/strata/${stratumId}`);
    const result = await response.json();
    let stratum;
    if (result && result.status === 'success' && result.data) {
      stratum = result.data;
    } else if (result && !result.status) {
      stratum = result;
    } else {
      stratum = null;
    }
    if (stratum) {
      this.strataCache.set(stratumId, stratum);
      this.setLoadingState(stratumId, 'loaded');
    }
    return stratum;
  }

  getLoadingState(stratumId) {
    return this.loadingStates.get(stratumId) || 'unloaded';
  }

  isLoaded(stratumId) {
    return this.getLoadingState(stratumId) === 'loaded';
  }

  setLoadingState(stratumId, state) {
    this.loadingStates.set(stratumId, state);
  }

  getCachedStratum(stratumId) {
    return this.strataCache.get(stratumId) || null;
  }

  invalidateCache(stratumId) {
    this.strataCache.delete(stratumId);
    this.loadingStates.delete(stratumId);
  }

  clearCache() {
    this.strataCache.clear();
    this.loadingStates.clear();
  }

  enqueueStratumLoad(stratumId, priority = 1) {
    if (this.isLoaded(stratumId) || this.loadQueue.some(item => item.stratumId === stratumId)) {
      return;
    }
    this.loadQueue.push({ stratumId, priority });
    this.loadQueue.sort((a, b) => a.priority - b.priority);
    this.processLoadQueue();
  }

  async processLoadQueue() {
    if (this.isProcessingQueue || this.loadQueue.length === 0) {
      return;
    }
    this.isProcessingQueue = true;
    const item = this.loadQueue.shift();
    if (item) {
      this.setLoadingState(item.stratumId, 'loading');
      try {
        await this.loadStratumById(item.stratumId);
      } catch (error) {
        this.setLoadingState(item.stratumId, 'error');
        console.error('Failed to load stratum:', item.stratumId, error);
      }
    }
    this.isProcessingQueue = false;
    this.processLoadQueue();
  }

  clearLoadQueue() {
    this.loadQueue = [];
    this.isProcessingQueue = false;
  }

  async batchDeleteAnnotations(stratumId, annotationIds) {
    const results = [];
    for (const annotationId of annotationIds) {
      try {
        const result = await this.deleteAnnotation(stratumId, annotationId);
        results.push({ annotationId, success: true, data: result });
      } catch (error) {
        results.push({ annotationId, success: false, error: error.message });
      }
    }
    return results;
  }

  async addAnnotation(stratumId, annotation) {
    const cleanAnnotation = {
      ...annotation,
      position: CoordConverter.normalizePoint(annotation.position)
    };
    const response = await fetch(
      `${this.baseUrl}/api/strata/${stratumId}/annotations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanAnnotation),
      }
    );
    const result = await response.json();
    if (result && result.status === 'success') {
      return result.data;
    }
    return result;
  }

  async deleteAnnotation(stratumId, annotationId) {
    const response = await fetch(
      `${this.baseUrl}/api/strata/${stratumId}/annotations/${annotationId}`,
      { method: 'DELETE' }
    );
    const result = await response.json();
    if (result && result.status === 'success') {
      return result.data;
    }
    return result;
  }

  async updateStratum(stratumId, data) {
    const cleanData = {};
    if (data.color !== undefined) cleanData.color = data.color;
    if (data.name !== undefined) cleanData.name = data.name;
    if (data.description !== undefined) cleanData.description = data.description;

    const response = await fetch(
      `${this.baseUrl}/api/strata/${stratumId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanData),
      }
    );
    const result = await response.json();
    if (result && result.status === 'success') {
      return result.data;
    }
    return result;
  }

  async loadConfig() {
    try {
      const response = await fetch(`${this.baseUrl}/api/config`);
      const result = await response.json();
      return result;
    } catch (error) {
      console.warn('Failed to load config from server, using defaults:', error);
      return null;
    }
  }

  getStrata() { return this.strata; }
  getDrillHoles() { return this.drillHoles; }
  getPoints() { return this.points; }
}

window.StratumDataLoader = StratumDataLoader;
