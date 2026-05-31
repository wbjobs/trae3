const API_BASE = '/api';

class ApiClient {
    constructor() {
        this.baseURL = API_BASE;
        this.enableCompression = false;
    }

    _decompressResponse(data) {
        if (!data || !data._compressed) return data;
        try {
            const compressed = atob(data._data);
            const bytes = Uint8Array.from(compressed, c => c.charCodeAt(0));
            const decompressed = pako.ungzip(bytes, { to: 'string' });
            const result = JSON.parse(decompressed);
            result._decompressed = true;
            result._original_size = data._original_size;
            result._compressed_size = data._compressed_size;
            result._compression_ratio = data._ratio;
            return result;
        } catch (e) {
            console.warn('Decompression failed, using raw data:', e);
            return data;
        }
    }

    async request(url, options = {}) {
        const defaultOptions = {
            headers: { 'Content-Type': 'application/json' },
        };
        try {
            const response = await fetch(`${this.baseURL}${url}`, {
                ...defaultOptions,
                ...options,
                headers: { ...defaultOptions.headers, ...options.headers },
            });
            const data = await response.json();
            return this._decompressResponse(data);
        } catch (error) {
            console.error('API Request Error:', error);
            return { success: false, message: error.message || 'Network error' };
        }
    }

    async get(url, params = {}) {
        if (this.enableCompression && !params.hasOwnProperty('compress')) {
            params.compress = 'true';
        }
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        return this.request(fullUrl, { method: 'GET' });
    }

    async post(url, data = {}) {
        if (this.enableCompression && !data.hasOwnProperty('compress')) {
            data.compress = true;
        }
        return this.request(url, { method: 'POST', body: JSON.stringify(data) });
    }

    async put(url, data = {}) {
        return this.request(url, { method: 'PUT', body: JSON.stringify(data) });
    }

    async delete(url) {
        return this.request(url, { method: 'DELETE' });
    }

    async getHealth() { return this.get('/health'); }
    async getCacheStats() { return this.get('/cache/stats'); }
    async invalidateCache(type = 'timeseries') { return this.post('/cache/invalidate', { type }); }

    async getDevices(params = {}) { return this.get('/devices', params); }
    async getDevice(deviceId) { return this.get(`/devices/${deviceId}`); }
    async addDevice(deviceData) { return this.post('/devices', deviceData); }
    async updateDevice(deviceId, deviceData) { return this.put(`/devices/${deviceId}`, deviceData); }
    async deleteDevice(deviceId) { return this.delete(`/devices/${deviceId}`); }

    async getGroups() { return this.get('/groups'); }
    async getGroup(groupId) { return this.get(`/groups/${groupId}`); }
    async addGroup(groupData) { return this.post('/groups', groupData); }
    async updateGroup(groupId, groupData) { return this.put(`/groups/${groupId}`, groupData); }
    async deleteGroup(groupId) { return this.delete(`/groups/${groupId}`); }
    async getGroupStatistics(groupId) { return this.get(`/groups/${groupId}/statistics`); }

    async getDeviceTimeseries(deviceId, params = {}) {
        return this.get(`/data/timeseries/device/${deviceId}`, params);
    }

    async getIncrementalTimeseries(deviceId, params = {}) {
        return this.get(`/data/timeseries/incremental/${deviceId}`, params);
    }

    async getGroupTimeseries(groupId, params = {}) {
        return this.get(`/data/timeseries/group/${groupId}`, params);
    }

    async getHeatmapData(data = {}) {
        return this.post('/data/heatmap', data);
    }

    async getDeviceStatistics(deviceId, params = {}) {
        return this.get(`/data/statistics/device/${deviceId}`, params);
    }

    async getDataQuality(data = {}) {
        return this.post('/data/cleaning/quality', data);
    }

    async generateDeviceReport(deviceId, data = {}) {
        return this.post(`/reports/generate/device/${deviceId}`, data);
    }

    async generateGroupReport(groupId, data = {}) {
        return this.post(`/reports/generate/group/${groupId}`, data);
    }

    async getReports() { return this.get('/reports'); }

    downloadReport(filename) {
        window.open(`${this.baseURL}/reports/download/${filename}`, '_blank');
    }
}

const api = new ApiClient();
