import React, { useEffect, useState } from 'react';
import { useDashboardStore } from '../stores/dashboardStore';
import { DataFilterPanel } from '../components/DataFilter/DataFilterPanel';
import { DeviceTable } from '../components/Dashboard/DeviceTable';
import type { DataFilter, AreaInfo } from '../types';
import { deviceApi } from '../services/api';

export default function Devices() {
  const { devices, loading, fetchDevices } = useDashboardStore();
  const [areas, setAreas] = useState<AreaInfo[]>([]);
  const [deviceFilter, setDeviceFilter] = useState<DataFilter>({});

  useEffect(() => {
    fetchDevices();
    loadAreas();
  }, [fetchDevices]);

  const loadAreas = async () => {
    try {
      const response = await deviceApi.getAreas();
      setAreas(response.data);
    } catch (error) {
      console.error('Failed to load areas:', error);
    }
  };

  const handleFilterChange = (filter: DataFilter) => {
    setDeviceFilter(filter);
    fetchDevices(filter);
  };

  const handlePageChange = (page: number) => {
    fetchDevices({ ...deviceFilter, page });
  };

  return (
    <div className="space-y-6">
      <DataFilterPanel areas={areas} onFilterChange={handleFilterChange} />

      {devices && <DeviceTable data={devices} onPageChange={handlePageChange} />}
    </div>
  );
}
