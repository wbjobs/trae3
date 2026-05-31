export const COLORS = {
  PRIMARY: '#1976D2',
  SECONDARY: '#424242',
  SUCCESS: '#4CAF50',
  WARNING: '#FF9800',
  DANGER: '#F44336',
  INFO: '#2196F3',
  
  TUNNEL: '#8B7355',
  TUNNEL_WALL: '#A0522D',
  
  PIPE_SUPPLY: '#4ECDC4',
  PIPE_RETURN: '#FF6B6B',
  PIPE_NEUTRAL: '#95A5A6',
  
  FAN_RUNNING: '#4CAF50',
  FAN_STANDBY: '#9E9E9E',
  FAN_FAULT: '#F44336',
  FAN_MAINTENANCE: '#FF9800',
  
  ANNOTATION_NORMAL: '#4CAF50',
  ANNOTATION_WARNING: '#FF9800',
  ANNOTATION_ALARM: '#F44336',
  ANNOTATION_INFO: '#2196F3',
  
  GRID: '#333333',
  AXIS_X: '#FF0000',
  AXIS_Y: '#00FF00',
  AXIS_Z: '#0000FF',
  
  BACKGROUND: '#0a0a0f',
  BACKGROUND_LIGHT: '#1a1a2e',
  
  TRANSPARENT: 'rgba(0, 0, 0, 0)',
  OVERLAY: 'rgba(0, 0, 0, 0.7)',
  HIGHLIGHT: 'rgba(255, 215, 0, 0.5)'
};

export const MATERIALS = {
  TUNNEL: {
    color: COLORS.TUNNEL,
    transparent: true,
    opacity: 0.3,
    side: 2,
    metalness: 0.1,
    roughness: 0.8
  },
  TUNNEL_WALL: {
    color: COLORS.TUNNEL_WALL,
    transparent: true,
    opacity: 0.5,
    side: 2
  },
  PIPE_SUPPLY: {
    color: COLORS.PIPE_SUPPLY,
    metalness: 0.3,
    roughness: 0.4
  },
  PIPE_RETURN: {
    color: COLORS.PIPE_RETURN,
    metalness: 0.3,
    roughness: 0.4
  },
  PIPE_INSULATION: {
    color: '#F5DEB3',
    transparent: true,
    opacity: 0.6,
    metalness: 0.0,
    roughness: 0.9
  },
  FAN_HOUSING: {
    color: '#555555',
    metalness: 0.5,
    roughness: 0.3
  },
  FAN_BLADE: {
    color: COLORS.PRIMARY,
    metalness: 0.4,
    roughness: 0.5
  },
  VALVE: {
    color: '#666666',
    metalness: 0.6,
    roughness: 0.4
  },
  WIREFRAME: {
    color: COLORS.PRIMARY,
    wireframe: true,
    transparent: true,
    opacity: 0.5
  },
  HIGHLIGHT: {
    color: COLORS.HIGHLIGHT,
    transparent: true,
    opacity: 0.5,
    side: 2
  },
  GHOST: {
    color: COLORS.SECONDARY,
    transparent: true,
    opacity: 0.2,
    side: 2
  }
};

export const LAYERS = {
  SCENE: 0,
  TUNNELS: 1,
  PIPES: 2,
  FANS: 3,
  ANNOTATIONS: 4,
  GRID: 5,
  GIZMO: 6,
  TRANSPARENT: 7,
  HIGHLIGHT: 8,
  UI: 9
};

export const LAYER_NAMES = {
  [LAYERS.SCENE]: '场景',
  [LAYERS.TUNNELS]: '巷道',
  [LAYERS.PIPES]: '管道',
  [LAYERS.FANS]: '风机',
  [LAYERS.ANNOTATIONS]: '标注',
  [LAYERS.GRID]: '网格',
  [LAYERS.GIZMO]: '辅助工具',
  [LAYERS.TRANSPARENT]: '透明物体',
  [LAYERS.HIGHLIGHT]: '高亮',
  [LAYERS.UI]: 'UI元素'
};

export const FAN_TYPES = {
  MAIN_FAN: {
    value: 'main_fan',
    label: '主通风机',
    icon: 'fan_main',
    defaultSize: 3.0
  },
  LOCAL_FAN: {
    value: 'local_fan',
    label: '局部通风机',
    icon: 'fan_local',
    defaultSize: 1.5
  },
  BOOSTER: {
    value: 'booster',
    label: '增压风机',
    icon: 'fan_booster',
    defaultSize: 2.0
  },
  EXHAUST: {
    value: 'exhaust',
    label: '排气风机',
    icon: 'fan_exhaust',
    defaultSize: 2.5
  }
};

export const FAN_INSTALLATION_TYPES = {
  FORCED_AIR: {
    value: 'forced_air',
    label: '压入式',
    color: COLORS.PIPE_SUPPLY
  },
  EXHAUST_AIR: {
    value: 'exhaust_air',
    label: '抽出式',
    color: COLORS.PIPE_RETURN
  },
  MIXED: {
    value: 'mixed',
    label: '混合式',
    color: COLORS.INFO
  }
};

export const FAN_STATUSES = {
  RUNNING: {
    value: 'running',
    label: '运行中',
    color: COLORS.FAN_RUNNING,
    icon: 'play_circle'
  },
  STANDBY: {
    value: 'standby',
    label: '备用',
    color: COLORS.FAN_STANDBY,
    icon: 'pause_circle'
  },
  FAULT: {
    value: 'fault',
    label: '故障',
    color: COLORS.FAN_FAULT,
    icon: 'error'
  },
  MAINTENANCE: {
    value: 'maintenance',
    label: '维护中',
    color: COLORS.FAN_MAINTENANCE,
    icon: 'build'
  },
  STOPPED: {
    value: 'stopped',
    label: '停止',
    color: '#757575',
    icon: 'stop_circle'
  }
};

export const PIPE_TYPES = {
  AIR_SUPPLY: {
    value: 'air_supply',
    label: '进风管道',
    color: COLORS.PIPE_SUPPLY,
    flowDirection: 1
  },
  AIR_RETURN: {
    value: 'air_return',
    label: '回风管道',
    color: COLORS.PIPE_RETURN,
    flowDirection: -1
  },
  FRESH_AIR: {
    value: 'fresh_air',
    label: '新鲜风管道',
    color: '#81C784',
    flowDirection: 1
  },
  EXHAUST_AIR: {
    value: 'exhaust_air',
    label: '排风管道',
    color: '#E57373',
    flowDirection: -1
  }
};

export const PIPE_MATERIALS = {
  STEEL: {
    value: 'steel',
    label: '钢管',
    roughness: 0.00015,
    defaultThickness: 0.008
  },
  IRON: {
    value: 'iron',
    label: '铸铁管',
    roughness: 0.00026,
    defaultThickness: 0.010
  },
  PVC: {
    value: 'pvc',
    label: 'PVC管',
    roughness: 0.000003,
    defaultThickness: 0.006
  },
  FIBERGLASS: {
    value: 'fiberglass',
    label: '玻璃钢',
    roughness: 0.000005,
    defaultThickness: 0.007
  },
  CONCRETE: {
    value: 'concrete',
    label: '混凝土',
    roughness: 0.001,
    defaultThickness: 0.150
  }
};

export const ANNOTATION_TYPES = {
  MONITORING_POINT: {
    value: 'monitoring_point',
    label: '监测点',
    icon: 'info',
    color: COLORS.INFO
  },
  DEFECT: {
    value: 'defect',
    label: '缺陷',
    icon: 'warning',
    color: COLORS.WARNING
  },
  EQUIPMENT: {
    value: 'equipment',
    label: '设备',
    icon: 'build',
    color: COLORS.SECONDARY
  },
  PIPE_CONNECTION: {
    value: 'pipe_connection',
    label: '管道连接',
    icon: 'link',
    color: COLORS.PRIMARY
  },
  INSTALLATION: {
    value: 'installation',
    label: '安装记录',
    icon: 'place',
    color: COLORS.SUCCESS
  },
  OPERATION: {
    value: 'operation',
    label: '操作指引',
    icon: 'touch_app',
    color: COLORS.INFO
  },
  SAFETY: {
    value: 'safety',
    label: '安全设施',
    icon: 'security',
    color: COLORS.DANGER
  },
  OTHER: {
    value: 'other',
    label: '其他',
    icon: 'label',
    color: COLORS.SECONDARY
  }
};

export const ANNOTATION_STATUSES = {
  NORMAL: {
    value: 'normal',
    label: '正常',
    color: COLORS.ANNOTATION_NORMAL
  },
  WARNING: {
    value: 'warning',
    label: '预警',
    color: COLORS.ANNOTATION_WARNING
  },
  ALARM: {
    value: 'alarm',
    label: '报警',
    color: COLORS.ANNOTATION_ALARM
  },
  RESOLVED: {
    value: 'resolved',
    label: '已处理',
    color: COLORS.SUCCESS
  },
  PENDING: {
    value: 'pending',
    label: '待处理',
    color: COLORS.INFO
  }
};

export const ANNOTATION_PRIORITIES = {
  LOW: { value: 'low', label: '低', order: 0, color: '#9E9E9E' },
  MEDIUM: { value: 'medium', label: '中', order: 1, color: '#FF9800' },
  HIGH: { value: 'high', label: '高', order: 2, color: '#FF5722' },
  CRITICAL: { value: 'critical', label: '紧急', order: 3, color: '#F44336' }
};

export const ANNOTATION_SEVERITIES = {
  LOW: { value: 'low', label: '轻微', order: 0, color: '#9E9E9E' },
  MEDIUM: { value: 'medium', label: '一般', order: 1, color: '#FF9800' },
  HIGH: { value: 'high', label: '严重', order: 2, color: '#FF5722' },
  CRITICAL: { value: 'critical', label: '危急', order: 3, color: '#F44336' }
};

export const TUNNEL_TYPES = {
  MAIN_TRANSPORT: {
    value: 'main_transport',
    label: '主运输巷',
    color: '#8D6E63'
  },
  RETURN_AIR: {
    value: 'return_air',
    label: '回风巷',
    color: '#FF8A65'
  },
  CONNECTION: {
    value: 'connection',
    label: '联络巷',
    color: '#A1887F'
  },
  FACE_TRANSPORT: {
    value: 'face_transport',
    label: '工作面运输巷',
    color: '#6D4C41'
  },
  FACE_RETURN: {
    value: 'face_return',
    label: '工作面回风巷',
    color: '#FF7043'
  },
  SHAFT: {
    value: 'shaft',
    label: '井筒',
    color: '#5D4037'
  },
  CHAMBER: {
    value: 'chamber',
    label: '硐室',
    color: '#795548'
  }
};

export const AIRFLOW_DIRECTIONS = {
  POSITIVE: { value: 'positive', label: '正向', color: COLORS.PIPE_SUPPLY },
  NEGATIVE: { value: 'negative', label: '反向', color: COLORS.PIPE_RETURN },
  STAGNANT: { value: 'stagnant', label: '停滞', color: COLORS.SECONDARY }
};

export const VALVE_TYPES = {
  BUTTERFLY: { value: 'butterfly', label: '蝶阀', icon: 'circle' },
  GATE: { value: 'gate', label: '闸阀', icon: 'rectangle' },
  BALL: { value: 'ball', label: '球阀', icon: 'circle' },
  CHECK: { value: 'check', label: '止回阀', icon: 'arrow_right' },
  REGULATING: { value: 'regulating', label: '调节阀', icon: 'tune' },
  SAFETY: { value: 'safety', label: '安全阀', icon: 'shield' }
};

export const VALVE_STATUSES = {
  OPEN: { value: 'open', label: '全开', color: COLORS.SUCCESS },
  PARTIAL: { value: 'partial', label: '部分开启', color: COLORS.WARNING },
  CLOSED: { value: 'closed', label: '关闭', color: COLORS.DANGER }
};

export const DEFAULT_CAMERA = {
  position: { x: 500, y: -200, z: 300 },
  target: { x: 500, y: 500, z: -300 },
  fov: 60,
  near: 0.1,
  far: 10000
};

export const GRID_CONFIG = {
  size: 2000,
  divisions: 40,
  colorGrid: COLORS.GRID,
  colorCenterLine: '#555555',
  position: { x: 0, y: 0, z: -500 }
};

export const LIGHTING_CONFIG = {
  ambient: {
    color: '#ffffff',
    intensity: 0.4
  },
  directional: {
    color: '#ffffff',
    intensity: 0.8,
    position: { x: 100, y: -100, z: 200 }
  },
  hemisphere: {
    skyColor: '#87CEEB',
    groundColor: '#362d26',
    intensity: 0.3
  }
};

export const RENDER_CONFIG = {
  antialias: true,
  alpha: true,
  pixelRatio: Math.min(window?.devicePixelRatio || 1, 2),
  shadowMapEnabled: true,
  shadowMapType: 'PCFSoftShadowMap',
  toneMapping: 'ACESFilmicToneMapping',
  toneMappingExposure: 1.0
};

export const ANIMATION_CONFIG = {
  FAN_ROTATION_SPEED: 0.05,
  AIR_FLOW_SPEED: 0.02,
  CAMERA_TRANSITION_DURATION: 1000,
  LOADING_SPINNER_SPEED: 1
};

export const API_CONFIG = {
  BASE_URL: '/api',
  TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
  CACHE_TTL: 5 * 60 * 1000
};

export const LOADING_CONFIG = {
  PAGE_SIZE: 100,
  BATCH_SIZE: 50,
  INCREMENTAL_LIMIT: 50,
  SIMPLIFICATION_TOLERANCE: 0.5,
  LOD_DISTANCES: [100, 300, 500, 1000]
};

export const ANNOTATION_STYLE = {
  fontSize: '14px',
  fontFamily: 'Arial, sans-serif',
  color: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  padding: '4px 8px',
  borderRadius: '4px',
  border: '1px solid #333',
  iconSize: 32,
  markerSize: 0.3,
  offset: { x: 0, y: 1.5, z: 0 }
};

export const WIND_SPEED_GRADIENT = [
  { position: 0, color: '#313695' },
  { position: 0.2, color: '#4575b4' },
  { position: 0.4, color: '#74add1' },
  { position: 0.5, color: '#e0f3f8' },
  { position: 0.6, color: '#fee090' },
  { position: 0.8, color: '#f46d43' },
  { position: 1.0, color: '#a50026' }
];

export const PRESSURE_GRADIENT = [
  { position: 0, color: '#053061' },
  { position: 0.25, color: '#2166ac' },
  { position: 0.5, color: '#f7f7f7' },
  { position: 0.75, color: '#b2182b' },
  { position: 1.0, color: '#67001f' }
];

export const TEMPERATURE_GRADIENT = [
  { position: 0, color: '#2C7BB6' },
  { position: 0.25, color: '#ABD9E9' },
  { position: 0.5, color: '#FFFFBF' },
  { position: 0.75, color: '#FDAE61' },
  { position: 1.0, color: '#D7191C' }
];

export const GAS_CONCENTRATION_GRADIENT = [
  { position: 0, color: '#1a9850' },
  { position: 0.3, color: '#91cf60' },
  { position: 0.5, color: '#d9ef8b' },
  { position: 0.7, color: '#fee08b' },
  { position: 0.85, color: '#fc8d59' },
  { position: 1.0, color: '#d73027' }
];

export const UNITS = {
  LENGTH: 'm',
  AREA: 'm²',
  VOLUME: 'm³',
  VELOCITY: 'm/s',
  FLOW_RATE: 'm³/s',
  PRESSURE: 'Pa',
  TEMPERATURE: '°C',
  POWER: 'kW',
  PERCENTAGE: '%',
  TIME: 'h',
  ANGLE: '°',
  CONCENTRATION: '%'
};

export const MINE_LEVELS = [-100, -200, -300, -400, -500, -600, -700, -800, -900, -1000];

export const CONTROL_MODES = {
  AUTOMATIC: { value: 'automatic', label: '自动' },
  MANUAL: { value: 'manual', label: '手动' },
  REMOTE: { value: 'remote', label: '远程' },
  LOCAL: { value: 'local', label: '就地' }
};

export const DATA_FIELDS = {
  TUNNEL: {
    required: ['id', 'name'],
    optional: [
      'code', 'level', 'type', 'width', 'height', 'length',
      'crossSectionArea', 'airflowDirection', 'designAirVolume',
      'actualAirVolume', 'windSpeed', 'airResistance', 'status',
      'description', 'startPoint', 'endPoint', 'pathPoints',
      'connectedTunnels', 'connectedPipes', 'createTime', 'updateTime'
    ],
    coordinateFields: ['startPoint', 'endPoint', 'pathPoints']
  },
  PIPE: {
    required: ['id', 'name', 'tunnelId'],
    optional: [
      'type', 'layer', 'diameter', 'length', 'thickness',
      'material', 'status', 'flowRate', 'pressure', 'windSpeed',
      'temperature', 'startPoint', 'endPoint', 'points',
      'roughness', 'airResistance', 'leakageRate', 'valveConfig',
      'createTime', 'updateTime'
    ],
    coordinateFields: ['startPoint', 'endPoint', 'points']
  },
  FAN: {
    required: ['id', 'name', 'position'],
    optional: [
      'tunnelId', 'pipeId', 'code', 'type', 'model', 'status',
      'power', 'rotationSpeed', 'airflow', 'efficiency',
      'ratedParameters', 'realTimeData', 'monitoringPoints',
      'maintenance', 'createTime', 'updateTime'
    ],
    coordinateFields: ['position']
  },
  ANNOTATION: {
    required: ['id', 'type', 'position'],
    optional: [
      'subtype', 'title', 'content', 'color', 'size', 'opacity',
      'rotation', 'priority', 'severity', 'status', 'tags',
      'customFields', 'attachments', 'comments', 'createTime', 'updateTime'
    ],
    coordinateFields: ['position']
  }
};

export const DATA_DEFAULTS = {
  TUNNEL: {
    name: '',
    code: '',
    level: 0,
    type: 'main_transport',
    width: 4.0,
    height: 3.0,
    length: 0,
    crossSectionArea: 12.0,
    airflowDirection: 'positive',
    designAirVolume: 0,
    actualAirVolume: 0,
    windSpeed: 0,
    airResistance: 0,
    status: 'normal',
    description: '',
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 0, y: 0, z: 0 },
    pathPoints: [],
    connectedTunnels: [],
    connectedPipes: []
  },
  PIPE: {
    name: '',
    tunnelId: '',
    type: 'air_supply',
    layer: 'main',
    diameter: 0.8,
    length: 0,
    thickness: 0.008,
    material: 'steel',
    status: 'normal',
    flowRate: 0,
    pressure: 0,
    windSpeed: 0,
    temperature: 20,
    startPoint: { x: 0, y: 0, z: 0 },
    endPoint: { x: 0, y: 0, z: 0 },
    points: [],
    roughness: 0.00015,
    airResistance: 0,
    leakageRate: 0,
    valveConfig: {}
  },
  FAN: {
    name: '',
    tunnelId: '',
    pipeId: '',
    code: '',
    type: 'local_fan',
    model: '',
    status: 'stopped',
    position: { x: 0, y: 0, z: 0 },
    power: 0,
    rotationSpeed: 0,
    airflow: 0,
    efficiency: 0,
    ratedParameters: {},
    realTimeData: {},
    monitoringPoints: [],
    maintenance: {}
  },
  ANNOTATION: {
    type: 'monitoring_point',
    subtype: '',
    position: { x: 0, y: 0, z: 0 },
    title: '',
    content: '',
    color: '#2196F3',
    size: 1.0,
    opacity: 1.0,
    rotation: 0,
    priority: 1,
    severity: 1,
    status: 'normal',
    tags: [],
    customFields: {},
    attachments: [],
    comments: []
  }
};

export const TYPE_MAPPINGS = {
  tunnels: 'TUNNEL',
  pipes: 'PIPE',
  fans: 'FAN',
  annotations: 'ANNOTATION',
  id: 'string',
  name: 'string',
  type: 'string',
  status: 'string',
  level: 'number',
  width: 'number',
  height: 'number',
  length: 'number',
  diameter: 'number',
  thickness: 'number',
  power: 'number',
  rotationSpeed: 'number',
  airflow: 'number',
  efficiency: 'number',
  flowRate: 'number',
  pressure: 'number',
  windSpeed: 'number',
  temperature: 'number',
  airResistance: 'number',
  roughness: 'number',
  leakageRate: 'number',
  crossSectionArea: 'number',
  designAirVolume: 'number',
  actualAirVolume: 'number',
  size: 'number',
  opacity: 'number',
  rotation: 'number',
  priority: 'number',
  severity: 'number',
  position: 'Point3D',
  startPoint: 'Point3D',
  endPoint: 'Point3D',
  pathPoints: 'Point3D[]',
  points: 'Point3D[]',
  createTime: 'Date',
  updateTime: 'Date',
  tags: 'string[]',
  connectedTunnels: 'string[]',
  connectedPipes: 'string[]',
  monitoringPoints: 'object[]',
  attachments: 'object[]',
  comments: 'object[]',
  ratedParameters: 'object',
  realTimeData: 'object',
  maintenance: 'object',
  customFields: 'object',
  valveConfig: 'object'
};

export default {
  COLORS,
  MATERIALS,
  LAYERS,
  LAYER_NAMES,
  FAN_TYPES,
  FAN_INSTALLATION_TYPES,
  FAN_STATUSES,
  PIPE_TYPES,
  PIPE_MATERIALS,
  ANNOTATION_TYPES,
  ANNOTATION_STATUSES,
  ANNOTATION_PRIORITIES,
  ANNOTATION_SEVERITIES,
  TUNNEL_TYPES,
  AIRFLOW_DIRECTIONS,
  VALVE_TYPES,
  VALVE_STATUSES,
  DEFAULT_CAMERA,
  GRID_CONFIG,
  LIGHTING_CONFIG,
  RENDER_CONFIG,
  ANIMATION_CONFIG,
  API_CONFIG,
  LOADING_CONFIG,
  ANNOTATION_STYLE,
  WIND_SPEED_GRADIENT,
  PRESSURE_GRADIENT,
  TEMPERATURE_GRADIENT,
  GAS_CONCENTRATION_GRADIENT,
  UNITS,
  MINE_LEVELS,
  CONTROL_MODES,
  DATA_FIELDS,
  DATA_DEFAULTS,
  TYPE_MAPPINGS
};
