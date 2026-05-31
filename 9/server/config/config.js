module.exports = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/geological3d',
    options: {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    },
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  validation: {
    stratum: {
      nameMinLength: 2,
      nameMaxLength: 50,
      codePattern: /^[A-Za-z0-9]{1,10}$/,
      colorPattern: /^#[0-9A-Fa-f]{6}$/,
      minThickness: 0.1,
      maxThickness: 10000,
    },
    point: {
      minX: -10000,
      maxX: 10000,
      minY: -10000,
      maxY: 10000,
      minZ: -10000,
      maxZ: 10000,
    },
  },
  rendering: {
    maxGridSize: 20,
    defaultGridSize: 10,
    maxPointsPerStratum: 400,
    lodDistance: {
      high: 200,
      medium: 400,
      low: 800,
    },
  },
  camera: {
    minDistance: 50,
    maxDistance: 800,
    minPolarAngle: 0.05,
    maxPolarAngle: Math.PI / 2 - 0.02,
    zoomSpeed: 0.1,
    rotateSpeed: 0.005,
    panSpeed: 0.5,
  },
};
