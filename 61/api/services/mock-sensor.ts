import db from '../database.js';
import { insertSensorData } from './storage.js';
import { broadcastToSubscribers, broadcastAll } from './subscription.js';

interface SensorConfig {
  id: string;
  frequency: number;
  rangeMin: number;
  rangeMax: number;
  status: string;
}

const timers = new Map<string, ReturnType<typeof setInterval>>();

function loadOnlineSensors(): SensorConfig[] {
  const rows = db.prepare(
    'SELECT id, frequency, range_min, range_max, status FROM sensors WHERE status = ?'
  ).all('online') as any[];
  return rows.map((r) => ({
    id: r.id,
    frequency: r.frequency,
    rangeMin: r.range_min,
    rangeMax: r.range_max,
    status: r.status,
  }));
}

function generateValue(sensor: SensorConfig): number {
  const range = sensor.rangeMax - sensor.rangeMin;
  const center = (sensor.rangeMax + sensor.rangeMin) / 2;
  const noise = (Math.random() - 0.5) * range * 0.3;
  const value = center + noise;
  return Math.round(Math.max(sensor.rangeMin, Math.min(sensor.rangeMax, value)) * 100) / 100;
}

function startSensor(sensor: SensorConfig): void {
  if (timers.has(sensor.id)) return;

  const timer = setInterval(() => {
    const value = generateValue(sensor);
    const quality = Math.random() > 0.95 ? 'uncertain' : 'good';

    insertSensorData(sensor.id, value, quality as 'good' | 'uncertain');

    broadcastToSubscribers(sensor.id, {
      type: 'data',
      sensorId: sensor.id,
      value,
      timestamp: new Date().toISOString(),
    });
  }, sensor.frequency);

  timers.set(sensor.id, timer);
}

function stopSensor(sensorId: string): void {
  const timer = timers.get(sensorId);
  if (timer) {
    clearInterval(timer);
    timers.delete(sensorId);
  }
}

export function start(): void {
  const sensors = loadOnlineSensors();
  for (const sensor of sensors) {
    startSensor(sensor);
  }
  console.log(`Mock sensor started with ${sensors.length} online sensors`);
}

export function stop(): void {
  for (const [id] of timers) {
    stopSensor(id);
  }
  timers.clear();
  console.log('Mock sensor stopped');
}

export function reload(): void {
  const desiredSensors = loadOnlineSensors();
  const desiredIds = new Set(desiredSensors.map((s) => s.id));
  const currentIds = new Set(timers.keys());

  for (const id of currentIds) {
    if (!desiredIds.has(id)) {
      stopSensor(id);
      broadcastToSubscribers(id, {
        type: 'status',
        sensorId: id,
        status: 'offline',
      });
    }
  }

  for (const sensor of desiredSensors) {
    if (!currentIds.has(sensor.id)) {
      startSensor(sensor);
      broadcastToSubscribers(sensor.id, {
        type: 'status',
        sensorId: sensor.id,
        status: 'online',
      });
    }
  }

  console.log(`Mock sensor reloaded: ${desiredSensors.length} online sensors`);
}

export function getRunningSensorIds(): string[] {
  return Array.from(timers.keys());
}
