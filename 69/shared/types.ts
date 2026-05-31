export type EquipmentStatus = 'normal' | 'warning' | 'alarm';

export type EquipmentType = 'pump' | 'motor' | 'compressor' | 'valve' | 'sensor' | 'turbine';

export interface EquipmentParameter {
  name: string;
  value: number;
  unit: string;
  status: EquipmentStatus;
}

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  status: EquipmentStatus;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  parameters: EquipmentParameter[];
  description: string;
  internalLayers?: InternalLayer[];
}

export interface InternalLayer {
  id: string;
  name: string;
  depth: number;
  color: string;
  visible: boolean;
}

export interface EquipmentData {
  equipmentId: string;
  parameters: EquipmentParameter[];
  timestamp: string;
}

export interface DeltaEquipmentData {
  equipmentId: string;
  changes: {
    paramIndex: number;
    value: number;
    status: EquipmentStatus;
  }[];
  timestamp: string;
  seq: number;
}

export interface HistoricalData {
  timestamp: string;
  values: Record<string, number>;
}

export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'query_history';
  payload: {
    equipmentId?: string;
    timeRange?: { start: string; end: string };
  };
}

export interface WebSocketDataMessage {
  type: 'equipment_data' | 'historical_data' | 'delta_data';
  payload: EquipmentData | HistoricalData[] | DeltaEquipmentData;
}

export interface MaintenancePoint {
  id: string;
  equipmentId: string;
  position: { x: number; y: number; z: number };
  label: string;
  type: 'inspection' | 'repair' | 'replacement' | 'calibration';
  description: string;
  createdAt: string;
  createdBy: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
}

export interface StoreState {
  equipments: Equipment[];
  selectedEquipment: Equipment | null;
  isConnected: boolean;
  maintenancePoints: MaintenancePoint[];
  clippingEnabled: boolean;
  clippingDirection: [number, number, number];
  clippingPosition: number;
  setEquipments: (equipments: Equipment[]) => void;
  selectEquipment: (equipment: Equipment | null) => void;
  updateEquipmentData: (data: EquipmentData) => void;
  setConnected: (connected: boolean) => void;
  addMaintenancePoint: (point: MaintenancePoint) => void;
  removeMaintenancePoint: (id: string) => void;
  updateMaintenancePoint: (id: string, updates: Partial<MaintenancePoint>) => void;
  setClippingEnabled: (enabled: boolean) => void;
  setClippingDirection: (direction: [number, number, number]) => void;
  setClippingPosition: (position: number) => void;
}
