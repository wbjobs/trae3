const config = require('../config/config');

class DataValidator {
  static validatePoint(point) {
    const { point: pointConfig } = config.validation;

    if (typeof point.x !== 'number' || isNaN(point.x)) {
      return { valid: false, error: 'Point x must be a valid number' };
    }
    if (point.x < pointConfig.minX || point.x > pointConfig.maxX) {
      return { valid: false, error: `Point x must be between ${pointConfig.minX} and ${pointConfig.maxX}` };
    }

    if (typeof point.y !== 'number' || isNaN(point.y)) {
      return { valid: false, error: 'Point y must be a valid number' };
    }
    if (point.y < pointConfig.minY || point.y > pointConfig.maxY) {
      return { valid: false, error: `Point y must be between ${pointConfig.minY} and ${pointConfig.maxY}` };
    }

    if (typeof point.z !== 'number' || isNaN(point.z)) {
      return { valid: false, error: 'Point z must be a valid number' };
    }
    if (point.z < pointConfig.minZ || point.z > pointConfig.maxZ) {
      return { valid: false, error: `Point z must be between ${pointConfig.minZ} and ${pointConfig.maxZ}` };
    }

    return { valid: true };
  }

  static validateStratum(stratum) {
    const { stratum: stratumConfig } = config.validation;
    const errors = [];

    if (!stratum.name || typeof stratum.name !== 'string') {
      errors.push('Stratum name is required and must be a string');
    } else if (stratum.name.length < stratumConfig.nameMinLength || stratum.name.length > stratumConfig.nameMaxLength) {
      errors.push(`Stratum name must be between ${stratumConfig.nameMinLength} and ${stratumConfig.nameMaxLength} characters`);
    }

    if (!stratum.code || typeof stratum.code !== 'string') {
      errors.push('Stratum code is required and must be a string');
    } else if (!stratumConfig.codePattern.test(stratum.code)) {
      errors.push(`Stratum code must match pattern: ${stratumConfig.codePattern}`);
    }

    if (stratum.color && !stratumConfig.colorPattern.test(stratum.color)) {
      errors.push(`Stratum color must be a valid hex color: ${stratumConfig.colorPattern}`);
    }

    if (typeof stratum.thickness !== 'undefined') {
      if (typeof stratum.thickness !== 'number' || isNaN(stratum.thickness)) {
        errors.push('Stratum thickness must be a valid number');
      } else if (stratum.thickness < stratumConfig.minThickness || stratum.thickness > stratumConfig.maxThickness) {
        errors.push(`Stratum thickness must be between ${stratumConfig.minThickness} and ${stratumConfig.maxThickness}`);
      }
    }

    if (typeof stratum.order !== 'number' || isNaN(stratum.order) || stratum.order < 1) {
      errors.push('Stratum order must be a positive integer');
    }

    if (stratum.points && !Array.isArray(stratum.points)) {
      errors.push('Stratum points must be an array');
    } else if (stratum.points) {
      const maxPoints = config.rendering.maxPointsPerStratum;
      if (stratum.points.length > maxPoints) {
        errors.push(`Stratum points must not exceed ${maxPoints}`);
      }
      stratum.points.forEach((point, index) => {
        const validation = this.validatePoint(point);
        if (!validation.valid) {
          errors.push(`Point ${index}: ${validation.error}`);
        }
      });
    }

    if (stratum.annotations && !Array.isArray(stratum.annotations)) {
      errors.push('Stratum annotations must be an array');
    } else if (stratum.annotations) {
      stratum.annotations.forEach((ann, index) => {
        const annValidation = this.validateAnnotation(ann);
        if (!annValidation.valid) {
          errors.push(`Annotation ${index}: ${annValidation.error}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static validateAnnotation(annotation) {
    if (!annotation.id || typeof annotation.id !== 'string') {
      return { valid: false, error: 'Annotation id is required and must be a string' };
    }
    if (!annotation.text || typeof annotation.text !== 'string') {
      return { valid: false, error: 'Annotation text is required and must be a string' };
    }
    if (!annotation.position) {
      return { valid: false, error: 'Annotation position is required' };
    }
    const pointValidation = this.validatePoint(annotation.position);
    if (!pointValidation.valid) {
      return { valid: false, error: `Invalid position: ${pointValidation.error}` };
    }
    return { valid: true };
  }

  static validateDrillHole(drillHole) {
    const errors = [];

    if (!drillHole.holeId || typeof drillHole.holeId !== 'string') {
      errors.push('Drill hole id is required and must be a string');
    }

    if (!drillHole.location || typeof drillHole.location !== 'object') {
      errors.push('Drill hole location is required');
    } else {
      if (typeof drillHole.location.x !== 'number' || isNaN(drillHole.location.x)) {
        errors.push('Drill hole location x must be a valid number');
      }
      if (typeof drillHole.location.y !== 'number' || isNaN(drillHole.location.y)) {
        errors.push('Drill hole location y must be a valid number');
      }
    }

    if (typeof drillHole.depth !== 'number' || isNaN(drillHole.depth) || drillHole.depth <= 0) {
      errors.push('Drill hole depth must be a positive number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static sanitizeStratum(stratum) {
    const cleaned = { ...stratum };

    if (cleaned.points && Array.isArray(cleaned.points)) {
      cleaned.points = cleaned.points
        .filter(p => p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number')
        .map(p => ({
          x: Number(p.x.toFixed(3)),
          y: Number(p.y.toFixed(3)),
          z: Number(p.z.toFixed(3)),
        }));
    }

    if (cleaned.thickness !== undefined) {
      cleaned.thickness = Number(cleaned.thickness.toFixed(2));
    }
    if (cleaned.depth !== undefined) {
      cleaned.depth = Number(cleaned.depth.toFixed(2));
    }
    if (cleaned.order !== undefined) {
      cleaned.order = Math.floor(cleaned.order);
    }

    if (!cleaned.color) {
      cleaned.color = '#8B4513';
    }

    return cleaned;
  }

  static normalizePoint(point) {
    return {
      x: Number(Number(point.x).toFixed(3)),
      y: Number(Number(point.y).toFixed(3)),
      z: Number(Number(point.z).toFixed(3)),
    };
  }

  static worldToThree(point) {
    return {
      x: point.x,
      y: point.z,
      z: point.y,
    };
  }

  static threeToWorld(point) {
    return {
      x: point.x,
      y: point.z,
      z: point.y,
    };
  }
}

module.exports = DataValidator;
