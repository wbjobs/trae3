const AppConfig = {
  camera: {
    minDistance: 50,
    maxDistance: 800,
    minPolarAngle: 0.05,
    maxPolarAngle: Math.PI / 2 - 0.02,
    zoomSpeed: 0.1,
    rotateSpeed: 0.005,
    panSpeed: 0.5,
    defaultPosition: {
      radius: 400,
      theta: Math.PI / 4,
      phi: Math.PI / 3,
    },
  },

  rendering: {
    maxGridSize: 10,
    defaultGridSize: 10,
    maxPointsPerStratum: 400,
    enableLOD: true,
    lodDistance: {
      high: 200,
      medium: 400,
      low: 800,
    },
    material: {
      opacity: 0.85,
      roughness: 0.8,
      metalness: 0.2,
      wireframe: false,
    },
    pointCloud: {
      size: 4,
      opacity: 0.9,
      sizeAttenuation: true,
    },
  },

  validation: {
    point: {
      minX: -10000,
      maxX: 10000,
      minY: -10000,
      maxY: 10000,
      minZ: -10000,
      maxZ: 10000,
    },
    stratum: {
      nameMinLength: 2,
      nameMaxLength: 50,
      minThickness: 0.1,
      maxThickness: 10000,
    },
  },

  colors: {
    strata: {
      Q: '#DEB887',
      N2: '#8B4513',
      E1: '#CD853F',
      K2: '#A0522D',
      T1: '#696969',
      Pz: '#4A4A4A',
      default: '#8B4513',
    },
    axis: {
      x: '#e53e3e',
      y: '#38a169',
      z: '#3182ce',
    },
    selection: '#4da6ff',
    highlight: '#ffd700',
    annotation: '#ff0000',
    drillHole: '#ffff00',
  },

  api: {
    baseUrl: '',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000,
  },

  ui: {
    animationDuration: 300,
    tooltipDelay: 500,
    debounceDelay: 250,
  },

  async loadFromServer() {
    try {
      const response = await fetch(`${this.api.baseUrl}/api/config`);
      if (response.ok) {
        const data = await response.json();
        Object.assign(this.camera, data.camera);
        Object.assign(this.rendering, data.rendering);
        Object.assign(this.validation, data.validation);
        console.log('Config loaded from server');
      }
    } catch (error) {
      console.warn('Using default config:', error.message);
    }
  },

  getColorForStratumCode(code) {
    return this.colors.strata[code] || this.colors.strata.default;
  },

  validateDistance(distance) {
    return CoordConverter.clamp(
      distance,
      this.camera.minDistance,
      this.camera.maxDistance
    );
  },

  validatePolarAngle(angle) {
    return CoordConverter.clamp(
      angle,
      this.camera.minPolarAngle,
      this.camera.maxPolarAngle
    );
  },

  validateColor(color) {
    if (typeof color !== 'string') return false;
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    return hexPattern.test(color);
  },
};

window.AppConfig = AppConfig;
