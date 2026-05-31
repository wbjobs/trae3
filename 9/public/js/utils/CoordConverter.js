const CoordConverter = {
  WORLD_TO_THREE_SCALE: 1.0,

  worldToThree(point) {
    if (!point || typeof point !== 'object') {
      console.warn('Invalid point for coordinate conversion:', point);
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: this.safeNumber(point.x) * this.WORLD_TO_THREE_SCALE,
      y: this.safeNumber(point.z) * this.WORLD_TO_THREE_SCALE,
      z: this.safeNumber(point.y) * this.WORLD_TO_THREE_SCALE,
    };
  },

  threeToWorld(point) {
    if (!point || typeof point !== 'object') {
      console.warn('Invalid point for coordinate conversion:', point);
      return { x: 0, y: 0, z: 0 };
    }
    return {
      x: this.safeNumber(point.x) / this.WORLD_TO_THREE_SCALE,
      y: this.safeNumber(point.z) / this.WORLD_TO_THREE_SCALE,
      z: this.safeNumber(point.y) / this.WORLD_TO_THREE_SCALE,
    };
  },

  worldToThreeVector(point) {
    const three = this.worldToThree(point);
    return new THREE.Vector3(three.x, three.y, three.z);
  },

  threeToWorldVector(vector) {
    const world = this.threeToWorld({
      x: vector.x,
      y: vector.y,
      z: vector.z,
    });
    return {
      x: world.x,
      y: world.y,
      z: world.z,
    };
  },

  safeNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || typeof value === 'boolean') {
      return defaultValue;
    }
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) {
      return defaultValue;
    }
    return num;
  },

  clamp(value, min, max) {
    return Math.min(Math.max(this.safeNumber(value), this.safeNumber(min)), this.safeNumber(max));
  },

  normalizePoint(point, precision = 3) {
    return {
      x: Number(this.safeNumber(point.x).toFixed(precision)),
      y: Number(this.safeNumber(point.y).toFixed(precision)),
      z: Number(this.safeNumber(point.z).toFixed(precision)),
    };
  },

  validatePoint(point) {
    if (!point || typeof point !== 'object') {
      return { valid: false, message: 'Point must be an object' };
    }
    if (typeof point.x !== 'number' || isNaN(point.x)) {
      return { valid: false, message: 'Point x must be a valid number' };
    }
    if (typeof point.y !== 'number' || isNaN(point.y)) {
      return { valid: false, message: 'Point y must be a valid number' };
    }
    if (typeof point.z !== 'number' || isNaN(point.z)) {
      return { valid: false, message: 'Point z must be a valid number' };
    }
    return { valid: true };
  },

  distance(p1, p2) {
    const dx = this.safeNumber(p1.x) - this.safeNumber(p2.x);
    const dy = this.safeNumber(p1.y) - this.safeNumber(p2.y);
    const dz = this.safeNumber(p1.z) - this.safeNumber(p2.z);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  },

  lerp(p1, p2, t) {
    const clampedT = this.clamp(t, 0, 1);
    return {
      x: this.safeNumber(p1.x) + (this.safeNumber(p2.x) - this.safeNumber(p1.x)) * clampedT,
      y: this.safeNumber(p1.y) + (this.safeNumber(p2.y) - this.safeNumber(p1.y)) * clampedT,
      z: this.safeNumber(p1.z) + (this.safeNumber(p2.z) - this.safeNumber(p1.z)) * clampedT,
    };
  },

  parseColor(hexColor, defaultColor = '#8B4513') {
    if (typeof hexColor !== 'string') {
      return defaultColor;
    }
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    return hexPattern.test(hexColor) ? hexColor : defaultColor;
  },
};

window.CoordConverter = CoordConverter;
