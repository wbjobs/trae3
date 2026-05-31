const API_BASE = '/api';

const API = {
    _requestCache: new Map(),
    _cacheTTL: 5000,

    async _fetch(url, options = {}) {
        const cacheKey = url + JSON.stringify(options);
        const now = Date.now();
        const cached = this._requestCache.get(cacheKey);
        if (cached && now - cached.time < this._cacheTTL && !options.method) {
            return cached.data;
        }

        const response = await fetch(url, options);
        const data = await response.json();

        if (!options.method) {
            this._requestCache.set(cacheKey, { data, time: now });
            if (this._requestCache.size > 100) {
                const firstKey = this._requestCache.keys().next().value;
                this._requestCache.delete(firstKey);
            }
        }

        return data;
    },

    async getDashboardOverview() {
        return this._fetch(`${API_BASE}/dashboard/overview/`);
    },

    async getZones() {
        return this._fetch(`${API_BASE}/zones/list/`);
    },

    async getDevices(zone = '') {
        const params = new URLSearchParams();
        if (zone) params.append('zone', zone);
        return this._fetch(`${API_BASE}/devices/list/?${params}`);
    },

    async getPressureData(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/data/pressure/?${query}`);
    },

    async getFlowData(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/data/flow/?${query}`);
    },

    async getRealtimeData() {
        return this._fetch(`${API_BASE}/data/realtime/`);
    },

    async getLatestDeviceData(deviceId) {
        return this._fetch(`${API_BASE}/data/latest/?device_id=${encodeURIComponent(deviceId)}`);
    },

    async getBatchLatestData(deviceIds) {
        return this._fetch(`${API_BASE}/data/batch-latest/?device_ids=${deviceIds.join(',')}`);
    },

    async getFaultPoints(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/data/fault-points/?${query}`);
    },

    async getZoneOverview() {
        return this._fetch(`${API_BASE}/zone/overview/`);
    },

    async getZoneStatistics(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/zone/statistics/?${query}`);
    },

    async getZoneComparison(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/zone/comparison/?${query}`);
    },

    async getFaultList(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/fault/list/?${query}`);
    },

    async getFaultStatistics() {
        return this._fetch(`${API_BASE}/fault/statistics/`);
    },

    async checkFaults() {
        const response = await fetch(`${API_BASE}/fault/check/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return response.json();
    },

    async resolveFault(faultId) {
        const response = await fetch(`${API_BASE}/fault/${faultId}/resolve/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        return response.json();
    },

    async getDataQuality(params = {}) {
        const query = new URLSearchParams(params);
        return this._fetch(`${API_BASE}/data/quality/?${query}`);
    },

    async cleanData(data = {}) {
        const response = await fetch(`${API_BASE}/data/clean/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    },

    async generateReport(reportDate) {
        const response = await fetch(`${API_BASE}/report/generate/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report_date: reportDate })
        });
        return response.json();
    },

    async getReports() {
        return this._fetch(`${API_BASE}/reports/`);
    },

    async getDeviceMapData() {
        return this._fetch(`${API_BASE}/devices/map/`);
    },

    clearCache() {
        this._requestCache.clear();
    }
};
