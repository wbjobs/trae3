import { v4 as uuidv4 } from 'uuid';
import { getDb } from './schema.js';

interface DeviceSeed {
  id: string;
  name: string;
  code: string;
  type: 'hvac' | 'plumbing' | 'electrical' | 'fire';
  floor: number;
  position_x: number;
  position_y: number;
  position_z: number;
  status: 'online' | 'offline' | 'alarm';
  health_score: number;
}

interface ParamSeed {
  id: string;
  device_id: string;
  param_key: string;
  label: string;
  value: number;
  unit: string;
  threshold_min: number | null;
  threshold_max: number | null;
}

const FLOORS: Record<string, number> = { 'B1': -1, '1F': 1, '2F': 2 };

const HVAC_DEVICES = [
  { name: 'AHU-1F-01', label: 'Air Handling Unit', floor: '1F', px: 12.5, py: 8.0, pz: 4.2 },
  { name: 'AHU-1F-02', label: 'Air Handling Unit', floor: '1F', px: 38.0, py: 8.0, pz: 4.2 },
  { name: 'AHU-2F-01', label: 'Air Handling Unit', floor: '2F', px: 12.5, py: 8.0, pz: 7.8 },
  { name: 'AHU-2F-02', label: 'Air Handling Unit', floor: '2F', px: 38.0, py: 8.0, pz: 7.8 },
  { name: 'CHW-PUMP-B1-01', label: 'Chilled Water Pump', floor: 'B1', px: 5.0, py: 3.0, pz: 0.5 },
  { name: 'CHW-PUMP-B1-02', label: 'Chilled Water Pump', floor: 'B1', px: 8.0, py: 3.0, pz: 0.5 },
  { name: 'FCU-1F-01', label: 'Fan Coil Unit', floor: '1F', px: 20.0, py: 15.0, pz: 3.8 },
  { name: 'FCU-2F-01', label: 'Fan Coil Unit', floor: '2F', px: 20.0, py: 15.0, pz: 7.4 },
];

const PLUMBING_DEVICES = [
  { name: 'DWP-B1-01', label: 'Domestic Water Pump', floor: 'B1', px: 15.0, py: 5.0, pz: 0.5 },
  { name: 'DWP-1F-01', label: 'Domestic Water Pump', floor: '1F', px: 22.0, py: 10.0, pz: 3.8 },
  { name: 'DWP-2F-01', label: 'Domestic Water Pump', floor: '2F', px: 22.0, py: 10.0, pz: 7.4 },
  { name: 'HW-TANK-B1-01', label: 'Hot Water Tank', floor: 'B1', px: 18.0, py: 5.0, pz: 0.8 },
  { name: 'PRV-1F-01', label: 'Pressure Reducing Valve', floor: '1F', px: 30.0, py: 12.0, pz: 3.5 },
  { name: 'PRV-2F-01', label: 'Pressure Reducing Valve', floor: '2F', px: 30.0, py: 12.0, pz: 7.1 },
];

const ELECTRICAL_DEVICES = [
  { name: 'XFMR-B1-01', label: 'Transformer', floor: 'B1', px: 40.0, py: 5.0, pz: 0.5 },
  { name: 'MDB-1F-01', label: 'Main Distribution Board', floor: '1F', px: 2.0, py: 2.0, pz: 3.5 },
  { name: 'MDB-2F-01', label: 'Main Distribution Board', floor: '2F', px: 2.0, py: 2.0, pz: 7.1 },
  { name: 'GEN-B1-01', label: 'Emergency Generator', floor: 'B1', px: 42.0, py: 8.0, pz: 0.5 },
  { name: 'UPS-1F-01', label: 'UPS Unit', floor: '1F', px: 5.0, py: 18.0, pz: 3.5 },
];

const FIRE_DEVICES = [
  { name: 'FP-B1-01', label: 'Fire Pump', floor: 'B1', px: 35.0, py: 3.0, pz: 0.5 },
  { name: 'FP-1F-01', label: 'Fire Pump', floor: '1F', px: 35.0, py: 18.0, pz: 3.5 },
  { name: 'SPR-1F-01', label: 'Sprinkler Valve', floor: '1F', px: 25.0, py: 5.0, pz: 3.8 },
  { name: 'SPR-2F-01', label: 'Sprinkler Valve', floor: '2F', px: 25.0, py: 5.0, pz: 7.4 },
  { name: 'FAP-B1-01', label: 'Fire Alarm Panel', floor: 'B1', px: 1.0, py: 1.0, pz: 1.5 },
];

const HVAC_PARAMS = [
  { param_key: 'supply_temp', label: 'Supply Air Temperature', min: 16, max: 45, unit: '°C', tmin: 18, tmax: 40 },
  { param_key: 'return_temp', label: 'Return Air Temperature', min: 20, max: 42, unit: '°C', tmin: 22, tmax: 38 },
  { param_key: 'supply_pressure', label: 'Supply Air Pressure', min: 0.2, max: 0.8, unit: 'MPa', tmin: 0.3, tmax: 0.7 },
  { param_key: 'fan_speed', label: 'Fan Speed', min: 600, max: 1800, unit: 'RPM', tmin: 800, tmax: 1500 },
  { param_key: 'filter_dp', label: 'Filter Differential Pressure', min: 0.02, max: 0.15, unit: 'MPa', tmin: 0.03, tmax: 0.12 },
];

const PLUMBING_PARAMS = [
  { param_key: 'pressure', label: 'Water Pressure', min: 0.2, max: 0.8, unit: 'MPa', tmin: 0.3, tmax: 0.7 },
  { param_key: 'flow_rate', label: 'Flow Rate', min: 10, max: 80, unit: 'm³/h', tmin: 15, tmax: 70 },
  { param_key: 'temperature', label: 'Water Temperature', min: 20, max: 65, unit: '°C', tmin: 25, tmax: 60 },
  { param_key: 'pump_current', label: 'Pump Current', min: 5, max: 50, unit: 'A', tmin: 8, tmax: 45 },
];

const ELECTRICAL_PARAMS = [
  { param_key: 'voltage', label: 'Voltage', min: 380, max: 400, unit: 'V', tmin: 385, tmax: 395 },
  { param_key: 'current', label: 'Current', min: 5, max: 50, unit: 'A', tmin: 8, tmax: 45 },
  { param_key: 'power_factor', label: 'Power Factor', min: 0.85, max: 0.99, unit: '', tmin: 0.88, tmax: 0.97 },
  { param_key: 'frequency', label: 'Frequency', min: 49.8, max: 50.2, unit: 'Hz', tmin: 49.9, tmax: 50.1 },
  { param_key: 'load_rate', label: 'Load Rate', min: 10, max: 95, unit: '%', tmin: 15, tmax: 85 },
];

const FIRE_PARAMS = [
  { param_key: 'pressure', label: 'System Pressure', min: 0.2, max: 0.8, unit: 'MPa', tmin: 0.3, tmax: 0.7 },
  { param_key: 'flow_rate', label: 'Flow Rate', min: 10, max: 80, unit: 'm³/h', tmin: 15, tmax: 70 },
  { param_key: 'pump_current', label: 'Pump Current', min: 5, max: 50, unit: 'A', tmin: 8, tmax: 45 },
];

const PARAM_MAP: Record<string, typeof HVAC_PARAMS> = {
  hvac: HVAC_PARAMS,
  plumbing: PLUMBING_PARAMS,
  electrical: ELECTRICAL_PARAMS,
  fire: FIRE_PARAMS,
};

const DEVICE_GROUPS: { type: DeviceSeed['type']; devices: typeof HVAC_DEVICES }[] = [
  { type: 'hvac', devices: HVAC_DEVICES },
  { type: 'plumbing', devices: PLUMBING_DEVICES },
  { type: 'electrical', devices: ELECTRICAL_DEVICES },
  { type: 'fire', devices: FIRE_DEVICES },
];

function randBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function pickStatus(): DeviceSeed['status'] {
  const r = Math.random();
  if (r < 0.6) return 'online';
  if (r < 0.85) return 'offline';
  return 'alarm';
}

function buildDevices(): DeviceSeed[] {
  const devices: DeviceSeed[] = [];
  for (const group of DEVICE_GROUPS) {
    for (const d of group.devices) {
      const status = pickStatus();
      const health_score = status === 'alarm' ? randBetween(40, 75) : status === 'online' ? randBetween(85, 100) : randBetween(50, 90);
      devices.push({
        id: uuidv4(),
        name: d.name,
        code: d.name,
        type: group.type,
        floor: FLOORS[d.floor],
        position_x: d.px,
        position_y: d.py,
        position_z: d.pz,
        status,
        health_score,
      });
    }
  }
  return devices;
}

function buildParams(devices: DeviceSeed[]): ParamSeed[] {
  const params: ParamSeed[] = [];
  for (const device of devices) {
    const templates = PARAM_MAP[device.type];
    const count = 3 + Math.floor(Math.random() * 3);
    const selected = templates.slice(0, count);
    for (const t of selected) {
      params.push({
        id: uuidv4(),
        device_id: device.id,
        param_key: t.param_key,
        label: t.label,
        value: randBetween(t.min, t.max),
        unit: t.unit,
        threshold_min: t.tmin,
        threshold_max: t.tmax,
      });
    }
  }
  return params;
}

function buildAlertRules(): {
  id: string;
  device_type: string;
  param_key: string;
  level: 'critical' | 'major' | 'minor';
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  enabled: number;
}[] {
  const rules: {
    id: string;
    device_type: string;
    param_key: string;
    level: 'critical' | 'major' | 'minor';
    condition: 'gt' | 'lt' | 'eq';
    threshold: number;
    enabled: number;
  }[] = [];

  rules.push(
    { id: uuidv4(), device_type: 'hvac', param_key: 'supply_temp', level: 'critical', condition: 'gt', threshold: 40, enabled: 1 },
    { id: uuidv4(), device_type: 'hvac', param_key: 'supply_temp', level: 'minor', condition: 'lt', threshold: 18, enabled: 1 },
    { id: uuidv4(), device_type: 'hvac', param_key: 'supply_pressure', level: 'major', condition: 'gt', threshold: 0.7, enabled: 1 },
    { id: uuidv4(), device_type: 'hvac', param_key: 'filter_dp', level: 'major', condition: 'gt', threshold: 0.12, enabled: 1 },
    { id: uuidv4(), device_type: 'hvac', param_key: 'fan_speed', level: 'critical', condition: 'gt', threshold: 1500, enabled: 1 },
    { id: uuidv4(), device_type: 'plumbing', param_key: 'pressure', level: 'critical', condition: 'lt', threshold: 0.3, enabled: 1 },
    { id: uuidv4(), device_type: 'plumbing', param_key: 'pressure', level: 'major', condition: 'gt', threshold: 0.7, enabled: 1 },
    { id: uuidv4(), device_type: 'plumbing', param_key: 'flow_rate', level: 'minor', condition: 'lt', threshold: 15, enabled: 1 },
    { id: uuidv4(), device_type: 'plumbing', param_key: 'temperature', level: 'critical', condition: 'gt', threshold: 60, enabled: 1 },
    { id: uuidv4(), device_type: 'electrical', param_key: 'voltage', level: 'critical', condition: 'gt', threshold: 395, enabled: 1 },
    { id: uuidv4(), device_type: 'electrical', param_key: 'voltage', level: 'critical', condition: 'lt', threshold: 385, enabled: 1 },
    { id: uuidv4(), device_type: 'electrical', param_key: 'current', level: 'major', condition: 'gt', threshold: 45, enabled: 1 },
    { id: uuidv4(), device_type: 'electrical', param_key: 'load_rate', level: 'critical', condition: 'gt', threshold: 85, enabled: 1 },
    { id: uuidv4(), device_type: 'electrical', param_key: 'frequency', level: 'minor', condition: 'gt', threshold: 50.1, enabled: 1 },
    { id: uuidv4(), device_type: 'fire', param_key: 'pressure', level: 'critical', condition: 'lt', threshold: 0.3, enabled: 1 },
    { id: uuidv4(), device_type: 'fire', param_key: 'flow_rate', level: 'critical', condition: 'lt', threshold: 15, enabled: 1 },
    { id: uuidv4(), device_type: 'fire', param_key: 'pump_current', level: 'major', condition: 'gt', threshold: 45, enabled: 1 },
  );

  return rules;
}

function buildAlerts(devices: DeviceSeed[]): {
  id: string;
  device_id: string;
  level: 'critical' | 'major' | 'minor';
  message: string;
  param_key: string;
  param_value: number;
  threshold: number;
  status: 'active' | 'confirmed' | 'resolved';
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  remark: string | null;
}[] {
  const alarmDevices = devices.filter(d => d.status === 'alarm' || Math.random() < 0.3);
  const alerts: {
    id: string;
    device_id: string;
    level: 'critical' | 'major' | 'minor';
    message: string;
    param_key: string;
    param_value: number;
    threshold: number;
    status: 'active' | 'confirmed' | 'resolved';
    created_at: string;
    confirmed_at: string | null;
    confirmed_by: string | null;
    remark: string | null;
  }[] = [];

  const sampleAlertDefs: {
    type: string;
    param_key: string;
    level: 'critical' | 'major' | 'minor';
    message: string;
    condition: 'gt' | 'lt';
    threshold: number;
    valueOffset: number;
  }[] = [
    { type: 'hvac', param_key: 'supply_temp', level: 'critical', message: 'Supply air temperature critically high', condition: 'gt', threshold: 40, valueOffset: 3.5 },
    { type: 'hvac', param_key: 'supply_pressure', level: 'major', message: 'Supply air pressure exceeds limit', condition: 'gt', threshold: 0.7, valueOffset: 0.08 },
    { type: 'hvac', param_key: 'filter_dp', level: 'major', message: 'Filter differential pressure too high', condition: 'gt', threshold: 0.12, valueOffset: 0.02 },
    { type: 'plumbing', param_key: 'pressure', level: 'critical', message: 'Water pressure critically low', condition: 'lt', threshold: 0.3, valueOffset: -0.08 },
    { type: 'electrical', param_key: 'voltage', level: 'critical', message: 'Voltage exceeds safe range', condition: 'gt', threshold: 395, valueOffset: 4 },
    { type: 'electrical', param_key: 'load_rate', level: 'major', message: 'Load rate above threshold', condition: 'gt', threshold: 85, valueOffset: 8 },
    { type: 'fire', param_key: 'pressure', level: 'critical', message: 'Fire system pressure critically low', condition: 'lt', threshold: 0.3, valueOffset: -0.1 },
    { type: 'fire', param_key: 'flow_rate', level: 'major', message: 'Fire system flow rate below threshold', condition: 'lt', threshold: 15, valueOffset: -4 },
  ];

  const statuses: ('active' | 'confirmed' | 'resolved')[] = ['active', 'active', 'confirmed', 'resolved'];

  for (const def of sampleAlertDefs) {
    const matching = alarmDevices.filter(d => d.type === def.type);
    if (matching.length === 0) continue;
    const device = matching[Math.floor(Math.random() * matching.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const paramValue = def.condition === 'gt' ? def.threshold + Math.abs(def.valueOffset) : def.threshold - Math.abs(def.valueOffset);

    alerts.push({
      id: uuidv4(),
      device_id: device.id,
      level: def.level,
      message: `${device.name}: ${def.message}`,
      param_key: def.param_key,
      param_value: Math.round(paramValue * 100) / 100,
      threshold: def.threshold,
      status,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 86400000 * 7)).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
      confirmed_at: status !== 'active' ? new Date(Date.now() - Math.floor(Math.random() * 86400000 * 2)).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '') : null,
      confirmed_by: status !== 'active' ? 'admin' : null,
      remark: status === 'resolved' ? 'Issue resolved after maintenance' : status === 'confirmed' ? 'Under investigation' : null,
    });
  }

  return alerts;
}

export function seedDatabase(): void {
  const db = getDb();

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM devices').get() as { cnt: number };
  if (count.cnt > 0) return;

  const devices = buildDevices();
  const params = buildParams(devices);
  const rules = buildAlertRules();
  const alerts = buildAlerts(devices);

  const insertDevice = db.prepare(`
    INSERT INTO devices (id, name, code, type, floor, position_x, position_y, position_z, status, health_score)
    VALUES (@id, @name, @code, @type, @floor, @position_x, @position_y, @position_z, @status, @health_score)
  `);

  const insertParam = db.prepare(`
    INSERT INTO device_params (id, device_id, param_key, label, value, unit, threshold_min, threshold_max)
    VALUES (@id, @device_id, @param_key, @label, @value, @unit, @threshold_min, @threshold_max)
  `);

  const insertRule = db.prepare(`
    INSERT INTO alert_rules (id, device_type, param_key, level, condition, threshold, enabled)
    VALUES (@id, @device_type, @param_key, @level, @condition, @threshold, @enabled)
  `);

  const insertAlert = db.prepare(`
    INSERT INTO alerts (id, device_id, level, message, param_key, param_value, threshold, status, created_at, confirmed_at, confirmed_by, remark)
    VALUES (@id, @device_id, @level, @message, @param_key, @param_value, @threshold, @status, @created_at, @confirmed_at, @confirmed_by, @remark)
  `);

  const transaction = db.transaction(() => {
    for (const d of devices) insertDevice.run(d);
    for (const p of params) insertParam.run(p);
    for (const r of rules) insertRule.run(r);
    for (const a of alerts) insertAlert.run(a);
  });

  transaction();
}
