import axios from 'axios';
import type {
  ApiResponse,
  DashboardOverview,
  DeviceInfo,
  DeviceDetail,
  AlertInfo,
  PaginatedResponse,
  DataFilter,
  AreaInfo,
  MeterData,
  ConsumptionStats,
  TrendReplayRequest,
  TrendReplayResponse
} from '../types';

const API_BASE_URL = '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const dataApi = {
  receiveMeterData: (data: any): Promise<ApiResponse> =>
    api.post('/data/receive', data),

  receiveBatchMeterData: (data: any): Promise<ApiResponse> =>
    api.post('/data/receive-batch', data),

  getDashboardOverview: (): Promise<ApiResponse<DashboardOverview>> =>
    api.get('/data/overview'),

  getHistoricalData: (filter: DataFilter): Promise<ApiResponse<MeterData[]>> =>
    api.get('/data/history', { params: filter }),

  getHourlyConsumption: (): Promise<ApiResponse<any[]>> =>
    api.get('/data/hourly-consumption'),

  getConsumptionStats: (filter?: { deviceId?: string; areaId?: string }): Promise<ApiResponse<ConsumptionStats>> =>
    api.get('/data/consumption-stats', { params: filter }),

  getTrendReplay: (request: TrendReplayRequest): Promise<ApiResponse<TrendReplayResponse>> =>
    api.get('/data/trend-replay', { params: request })
};

export const deviceApi = {
  getDevices: (filter: DataFilter): Promise<ApiResponse<PaginatedResponse<DeviceInfo>>> =>
    api.get('/devices', { params: filter }),

  getDeviceDetail: (id: string): Promise<ApiResponse<DeviceDetail>> =>
    api.get(`/devices/${id}`),

  createDevice: (data: any): Promise<ApiResponse> =>
    api.post('/devices', data),

  updateDevice: (id: string, data: any): Promise<ApiResponse> =>
    api.put(`/devices/${id}`, data),

  deleteDevice: (id: string): Promise<ApiResponse> =>
    api.delete(`/devices/${id}`),

  getAreas: (): Promise<ApiResponse<AreaInfo[]>> =>
    api.get('/devices/areas'),

  initializeMockData: (): Promise<ApiResponse> =>
    api.post('/devices/init-mock')
};

export const alertApi = {
  getAlerts: (filter: DataFilter): Promise<ApiResponse<PaginatedResponse<AlertInfo>>> =>
    api.get('/alerts', { params: filter }),

  handleAlert: (id: string, status: string): Promise<ApiResponse> =>
    api.put(`/alerts/${id}/handle`, { status }),

  getAlertStatistics: (): Promise<ApiResponse<any>> =>
    api.get('/alerts/statistics')
};
