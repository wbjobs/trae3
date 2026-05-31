import { create } from 'zustand';
import { Equipment, EquipmentData, StoreState, MaintenancePoint, DeltaEquipmentData } from '@/types';

interface ExtendedStoreState extends StoreState {
  batchUpdateEquipmentData: (dataList: EquipmentData[]) => void;
  applyDeltaData: (delta: DeltaEquipmentData) => void;
}

export const useEquipmentStore = create<ExtendedStoreState>((set) => ({
  equipments: [],
  selectedEquipment: null,
  isConnected: false,
  maintenancePoints: [],
  clippingEnabled: false,
  clippingDirection: [0, -1, 0] as [number, number, number],
  clippingPosition: 0.5,

  setEquipments: (equipments: Equipment[]) => set({ equipments }),

  selectEquipment: (equipment: Equipment | null) => set({ selectedEquipment: equipment }),

  updateEquipmentData: (data: EquipmentData) =>
    set((state) => {
      const updatedEquipments = state.equipments.map((eq) => {
        if (eq.id !== data.equipmentId) return eq;
        return {
          ...eq,
          parameters: data.parameters,
          status: data.parameters.some((p) => p.status === 'alarm')
            ? 'alarm'
            : data.parameters.some((p) => p.status === 'warning')
              ? 'warning'
              : 'normal',
        };
      });

      const selectedEquipment =
        state.selectedEquipment?.id === data.equipmentId
          ? {
              ...state.selectedEquipment,
              parameters: data.parameters,
              status: data.parameters.some((p) => p.status === 'alarm')
                ? 'alarm'
                : data.parameters.some((p) => p.status === 'warning')
                  ? 'warning'
                  : 'normal',
            }
          : state.selectedEquipment;

      return { equipments: updatedEquipments, selectedEquipment };
    }),

  applyDeltaData: (delta: DeltaEquipmentData) =>
    set((state) => {
      const updatedEquipments = state.equipments.map((eq) => {
        if (eq.id !== delta.equipmentId) return eq;
        const newParams = [...eq.parameters];
        for (const change of delta.changes) {
          if (newParams[change.paramIndex]) {
            newParams[change.paramIndex] = {
              ...newParams[change.paramIndex],
              value: change.value,
              status: change.status,
            };
          }
        }
        return {
          ...eq,
          parameters: newParams,
          status: newParams.some((p) => p.status === 'alarm')
            ? 'alarm'
            : newParams.some((p) => p.status === 'warning')
              ? 'warning'
              : 'normal',
        };
      });

      let selectedEquipment = state.selectedEquipment;
      if (selectedEquipment?.id === delta.equipmentId) {
        const eq = updatedEquipments.find((e) => e.id === delta.equipmentId);
        if (eq) selectedEquipment = eq;
      }

      return { equipments: updatedEquipments, selectedEquipment };
    }),

  batchUpdateEquipmentData: (dataList: EquipmentData[]) =>
    set((state) => {
      if (dataList.length === 0) return state;

      const dataMap = new Map<string, EquipmentData>();
      dataList.forEach((data) => {
        const existing = dataMap.get(data.equipmentId);
        if (!existing || new Date(data.timestamp) > new Date(existing.timestamp)) {
          dataMap.set(data.equipmentId, data);
        }
      });

      let selectedEquipment = state.selectedEquipment;

      const updatedEquipments = state.equipments.map((eq) => {
        const data = dataMap.get(eq.id);
        if (!data) return eq;

        const updated = {
          ...eq,
          parameters: data.parameters,
          status: data.parameters.some((p) => p.status === 'alarm')
            ? 'alarm'
            : data.parameters.some((p) => p.status === 'warning')
              ? 'warning'
              : 'normal',
        };

        if (selectedEquipment?.id === eq.id) {
          selectedEquipment = updated;
        }

        return updated;
      });

      return { equipments: updatedEquipments, selectedEquipment };
    }),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  addMaintenancePoint: (point: MaintenancePoint) =>
    set((state) => ({ maintenancePoints: [...state.maintenancePoints, point] })),

  removeMaintenancePoint: (id: string) =>
    set((state) => ({ maintenancePoints: state.maintenancePoints.filter((p) => p.id !== id) })),

  updateMaintenancePoint: (id: string, updates: Partial<MaintenancePoint>) =>
    set((state) => ({
      maintenancePoints: state.maintenancePoints.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  setClippingEnabled: (enabled: boolean) => set({ clippingEnabled: enabled }),
  setClippingDirection: (direction: [number, number, number]) => set({ clippingDirection: direction }),
  setClippingPosition: (position: number) => set({ clippingPosition: position }),
}));
