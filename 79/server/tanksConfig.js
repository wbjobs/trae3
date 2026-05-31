const tanksConfig = [
  {
    id: 'tank-001',
    name: '原油储罐 A-1',
    type: '原油',
    capacity: 5000,
    unit: 'm³',
    height: 15,
    diameter: 22,
    position: { x: -40, y: 0, z: 0 },
    color: 0x4a90d9,
    thresholds: {
      level: {
        high: 4500,
        highHigh: 4750,
        low: 500,
        lowLow: 250
      },
      pressure: {
        high: 1.2,
        low: 0.6
      },
      temperature: {
        high: 60,
        low: 10
      }
    }
  },
  {
    id: 'tank-002',
    name: '成品油储罐 B-2',
    type: '成品油',
    capacity: 3000,
    unit: 'm³',
    height: 12,
    diameter: 18,
    position: { x: 0, y: 0, z: 0 },
    color: 0x52c41a,
    thresholds: {
      level: {
        high: 2700,
        highHigh: 2850,
        low: 300,
        lowLow: 150
      },
      pressure: {
        high: 1.0,
        low: 0.5
      },
      temperature: {
        high: 50,
        low: 15
      }
    }
  },
  {
    id: 'tank-003',
    name: '化工原料储罐 C-3',
    type: '化工原料',
    capacity: 4000,
    unit: 'm³',
    height: 14,
    diameter: 20,
    position: { x: 40, y: 0, z: 0 },
    color: 0xfa8c16,
    thresholds: {
      level: {
        high: 3600,
        highHigh: 3800,
        low: 400,
        lowLow: 200
      },
      pressure: {
        high: 1.5,
        low: 0.7
      },
      temperature: {
        high: 70,
        low: 20
      }
    }
  },
  {
    id: 'tank-004',
    name: '废水储罐 D-4',
    type: '废水',
    capacity: 2000,
    unit: 'm³',
    height: 10,
    diameter: 16,
    position: { x: -20, y: 0, z: -40 },
    color: 0x722ed1,
    thresholds: {
      level: {
        high: 1800,
        highHigh: 1900,
        low: 200,
        lowLow: 100
      },
      pressure: {
        high: 0.8,
        low: 0.3
      },
      temperature: {
        high: 45,
        low: 5
      }
    }
  },
  {
    id: 'tank-005',
    name: '消防水罐 E-5',
    type: '消防水',
    capacity: 1500,
    unit: 'm³',
    height: 10,
    diameter: 14,
    position: { x: 20, y: 0, z: -40 },
    color: 0x13c2c2,
    thresholds: {
      level: {
        high: 1350,
        highHigh: 1425,
        low: 750,
        lowLow: 500
      },
      pressure: {
        high: 1.0,
        low: 0.4
      },
      temperature: {
        high: 35,
        low: 2
      }
    }
  }
];

module.exports = { tanksConfig };
