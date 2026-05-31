export interface DeviceParam {
  key: string;
  label: string;
  value: number;
  unit: string;
  threshold?: {
    min: number;
    max: number;
  };
  timestamp: number;
  changed?: boolean;
}

export interface Device {
  id: string;
  name: string;
  code: string;
  type: 'hvac' | 'plumbing' | 'electrical' | 'fire';
  floor: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
  status: 'online' | 'offline' | 'alarm';
  healthScore: number;
  params: DeviceParam[];
}

export interface Alert {
  id: string;
  deviceId: string;
  deviceName: string;
  level: 'critical' | 'major' | 'minor';
  message: string;
  paramKey: string;
  paramValue: number;
  threshold: number;
  status: 'active' | 'confirmed' | 'resolved';
  createdAt: number;
  confirmedAt?: number;
  confirmedBy?: string;
  remark?: string;
}

export interface AlertRule {
  id: string;
  deviceType: 'hvac' | 'plumbing' | 'electrical' | 'fire';
  paramKey: string;
  level: 'critical' | 'major' | 'minor';
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  enabled: boolean;
}

export interface DashboardStats {
  total: number;
  online: number;
  offline: number;
  alarm: number;
  alertsByLevel: {
    critical: number;
    major: number;
    minor: number;
  };
}

export interface WSMessage {
  type: 'device_status' | 'device_params' | 'device_updates' | 'alert' | 'health_update' | 'ping' | 'connection';
  payload: unknown;
  timestamp?: number;
}

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface LayerVisibility {
  hvac: boolean;
  plumbing: boolean;
  electrical: boolean;
  fire: boolean;
}

export interface CutPlane {
  enabled: boolean;
  axis: 'x' | 'y' | 'z';
  position: number;
  inverse: boolean;
}

export interface MarkerPoint {
  id: string;
  type: 'inspection' | 'maintenance' | 'danger' | 'note';
  position: { x: number; y: number; z: number };
  title: string;
  description: string;
  floor: number;
  createdAt: number;
  createdBy: string;
}
