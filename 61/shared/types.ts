export interface Sensor {
  id: string;
  name: string;
  type: string;
  protocol: string;
  frequency: number;
  unit: string;
  rangeMin: number;
  rangeMax: number;
  tags: string[];
  status: 'online' | 'offline' | 'alarm';
  createdAt: string;
  updatedAt: string;
}

export interface SensorData {
  id: number;
  sensorId: string;
  value: number;
  quality: 'good' | 'uncertain' | 'bad';
  timestamp: string;
}

export type ComponentType = 'gauge' | 'chart' | 'indicator' | 'button' | 'text' | 'valve' | 'pipe';

export interface PanelComponent {
  id: string;
  type: ComponentType;
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  sensorBindings: string[];
}

export interface PanelLayout {
  cols: number;
  rows: number;
  gridGap: number;
}

export interface ScadaPanel {
  id: string;
  name: string;
  description: string;
  layout: PanelLayout;
  components: PanelComponent[];
  createdAt: string;
  updatedAt: string;
}

export interface MetadataSnapshot {
  version: number;
  sensors: Sensor[];
  timestamp: string;
}

export type Role = 'admin' | 'engineer' | 'analyst';
export type Permission = 'sensor:read' | 'sensor:write' | 'panel:read' | 'panel:write' | 'data:read' | 'data:export' | 'metadata:read' | 'metadata:write' | 'system:admin';

export interface User {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

export interface AuthToken {
  userId: string;
  username: string;
  role: Role;
}

export type ClientMessage =
  | { type: 'subscribe'; sensorIds: string[] }
  | { type: 'unsubscribe'; sensorIds: string[] }
  | { type: 'ping' }
  | { type: 'set_priority'; priority: 'high' | 'medium' | 'low' };

export type ServerMessage =
  | { type: 'data'; sensorId: string; value: number; timestamp: string }
  | { type: 'status'; sensorId: string; status: 'online' | 'offline' | 'alarm' }
  | { type: 'metadata_updated'; version: number }
  | { type: 'pong' }
  | { type: 'batch_data'; items: { sensorId: string; value: number; timestamp: string }[] };
