const { SIGNAL_QUALITY } = require('./constants');

function getSignalQuality(signalStrength) {
  if (signalStrength === null || signalStrength === undefined) {
    return SIGNAL_QUALITY.POOR;
  }
  
  if (signalStrength >= SIGNAL_QUALITY.EXCELLENT.min) return SIGNAL_QUALITY.EXCELLENT;
  if (signalStrength >= SIGNAL_QUALITY.GOOD.min) return SIGNAL_QUALITY.GOOD;
  if (signalStrength >= SIGNAL_QUALITY.FAIR.min) return SIGNAL_QUALITY.FAIR;
  return SIGNAL_QUALITY.POOR;
}

function getSignalColor(signalStrength) {
  return getSignalQuality(signalStrength).color;
}

function getSignalLabel(signalStrength) {
  return getSignalQuality(signalStrength).label;
}

function calculateLinkQuality(signal1, signal2) {
  if (!signal1 || !signal2) return 0;
  const avgSignal = (signal1 + signal2) / 2;
  const quality = Math.max(0, Math.min(100, 100 + avgSignal));
  return Math.round(quality);
}

function isValidSignalData(data) {
  if (!data || typeof data !== 'object') return false;
  if (!data.device_id || typeof data.device_id !== 'string') return false;
  if (!data.time) return false;
  return true;
}

function formatSignalData(data) {
  return {
    time: data.time || new Date().toISOString(),
    device_id: data.device_id,
    signal_strength: data.signal_strength !== undefined ? Number(data.signal_strength) : null,
    snr: data.snr !== undefined ? Number(data.snr) : null,
    channel: data.channel !== undefined ? Number(data.channel) : null,
    bandwidth: data.bandwidth !== undefined ? Number(data.bandwidth) : null,
    connected_clients: data.connected_clients !== undefined ? Number(data.connected_clients) : 0,
    cpu_usage: data.cpu_usage !== undefined ? Number(data.cpu_usage) : null,
    memory_usage: data.memory_usage !== undefined ? Number(data.memory_usage) : null,
    temperature: data.temperature !== undefined ? Number(data.temperature) : null
  };
}

module.exports = {
  getSignalQuality,
  getSignalColor,
  getSignalLabel,
  calculateLinkQuality,
  isValidSignalData,
  formatSignalData
};
