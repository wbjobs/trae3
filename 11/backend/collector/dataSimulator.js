class DataSimulator {
  constructor() {
    this.devices = [
      { device_id: 'ap-core-001', device_type: 'ap', base_signal: -40, base_cpu: 30 },
      { device_id: 'ap-core-002', device_type: 'ap', base_signal: -42, base_cpu: 25 },
      { device_id: 'repeater-001', device_type: 'repeater', base_signal: -55, base_cpu: 20 },
      { device_id: 'repeater-002', device_type: 'repeater', base_signal: -58, base_cpu: 22 },
      { device_id: 'repeater-003', device_type: 'repeater', base_signal: -52, base_cpu: 18 },
      { device_id: 'repeater-004', device_type: 'repeater', base_signal: -54, base_cpu: 19 },
      { device_id: 'end-device-001', device_type: 'endpoint', base_signal: -65, base_cpu: 15 },
      { device_id: 'end-device-002', device_type: 'endpoint', base_signal: -68, base_cpu: 12 },
      { device_id: 'end-device-003', device_type: 'endpoint', base_signal: -62, base_cpu: 14 },
      { device_id: 'end-device-004', device_type: 'endpoint', base_signal: -90, base_cpu: 10 }
    ];
  }

  randomVariation(base, variance) {
    return base + (Math.random() * variance * 2 - variance);
  }

  generateDeviceData(deviceInfo) {
    const now = new Date();
    const isOffline = deviceInfo.device_id === 'end-device-004' && Math.random() > 0.3;

    return {
      time: now.toISOString(),
      device_id: deviceInfo.device_id,
      signal_strength: isOffline ? null : Math.round(this.randomVariation(deviceInfo.base_signal, 10)),
      snr: isOffline ? null : Math.round(this.randomVariation(30, 10)),
      channel: Math.floor(this.randomVariation(6, 2)),
      bandwidth: isOffline ? 0 : Math.round(this.randomVariation(100, 30)),
      connected_clients: isOffline ? 0 : Math.floor(this.randomVariation(5, 3)),
      cpu_usage: isOffline ? 0 : Math.round(this.randomVariation(deviceInfo.base_cpu, 15) * 10) / 10,
      memory_usage: isOffline ? 0 : Math.round(this.randomVariation(40, 15) * 10) / 10,
      temperature: Math.round(this.randomVariation(45, 10) * 10) / 10,
      status: isOffline ? 'offline' : 'online'
    };
  }

  generateAllDevicesData() {
    return this.devices.map(device => this.generateDeviceData(device));
  }

  getDevices() {
    return this.devices;
  }
}

module.exports = DataSimulator;
