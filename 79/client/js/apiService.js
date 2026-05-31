const API_BASE_URL = '/api';

export class ApiService {
  static async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API 请求失败 ${endpoint}:`, error);
      throw error;
    }
  }

  static async getTanks() {
    return this.request('/tanks');
  }

  static async getTank(tankId) {
    return this.request(`/tanks/${tankId}`);
  }

  static async getTankHistory(tankId, startTime = null, endTime = null) {
    const params = new URLSearchParams();
    if (startTime) params.append('startTime', startTime);
    if (endTime) params.append('endTime', endTime);
    
    const queryString = params.toString();
    return this.request(`/tanks/${tankId}/history${queryString ? '?' + queryString : ''}`);
  }

  static async getTankAlerts(tankId) {
    return this.request(`/tanks/${tankId}/alerts`);
  }
}
