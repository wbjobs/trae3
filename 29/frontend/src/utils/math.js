import * as THREE from 'three';

export function toVector3(point) {
  if (point instanceof THREE.Vector3) return point;
  if (Array.isArray(point)) {
    return new THREE.Vector3(point[0] || 0, point[1] || 0, point[2] || 0);
  }
  return new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
}

export function toPointObject(vec) {
  if (vec instanceof THREE.Vector3) {
    return { x: vec.x, y: vec.y, z: vec.z };
  }
  return vec;
}

export function toPointArray(vec) {
  if (vec instanceof THREE.Vector3) {
    return [vec.x, vec.y, vec.z];
  }
  return Array.isArray(vec) ? vec : [vec.x, vec.y, vec.z];
}

export function distance(p1, p2) {
  const v1 = toVector3(p1);
  const v2 = toVector3(p2);
  return v1.distanceTo(v2);
}

export function distanceSquared(p1, p2) {
  const v1 = toVector3(p1);
  const v2 = toVector3(p2);
  return v1.distanceToSquared(v2);
}

export function distance2D(p1, p2) {
  const dx = (p2.x || 0) - (p1.x || 0);
  const dy = (p2.y || 0) - (p1.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function manhattanDistance(p1, p2) {
  return Math.abs((p2.x || 0) - (p1.x || 0)) +
         Math.abs((p2.y || 0) - (p1.y || 0)) +
         Math.abs((p2.z || 0) - (p1.z || 0));
}

export function lerp(start, end, t) {
  return start + (end - start) * Math.max(0, Math.min(1, t));
}

export function lerpPoint(p1, p2, t) {
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t),
    z: lerp(p1.z, p2.z, t)
  };
}

export function lerpVector3(v1, v2, t) {
  return new THREE.Vector3(
    lerp(v1.x, v2.x, t),
    lerp(v1.y, v2.y, t),
    lerp(v1.z, v2.z, t)
  );
}

export function interpolatePath(points, t) {
  if (points.length === 0) return null;
  if (points.length === 1) return points[0];
  if (t <= 0) return points[0];
  if (t >= 1) return points[points.length - 1];

  const totalLength = calculatePathLength(points);
  const targetLength = totalLength * t;
  
  let accumulated = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLength = distance(points[i], points[i + 1]);
    if (accumulated + segLength >= targetLength) {
      const segT = (targetLength - accumulated) / segLength;
      return lerpPoint(points[i], points[i + 1], segT);
    }
    accumulated += segLength;
  }

  return points[points.length - 1];
}

export function interpolatePathByDistance(points, dist) {
  if (points.length === 0) return null;
  if (points.length === 1) return { point: points[0], index: 0, t: 0 };
  if (dist <= 0) return { point: points[0], index: 0, t: 0 };

  let accumulated = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const segLength = distance(points[i], points[i + 1]);
    if (accumulated + segLength >= dist) {
      const segT = (dist - accumulated) / segLength;
      return {
        point: lerpPoint(points[i], points[i + 1], segT),
        index: i,
        t: segT
      };
    }
    accumulated += segLength;
  }

  return {
    point: points[points.length - 1],
    index: points.length - 2,
    t: 1
  };
}

export function resamplePath(points, numSegments) {
  if (points.length < 2) return points;
  
  const totalLength = calculatePathLength(points);
  const stepLength = totalLength / numSegments;
  const result = [points[0]];
  
  let currentDistance = 0;
  for (let i = 1; i < numSegments; i++) {
    currentDistance += stepLength;
    const { point } = interpolatePathByDistance(points, currentDistance);
    result.push(point);
  }
  
  result.push(points[points.length - 1]);
  return result;
}

export function simplifyPath(points, tolerance = 0.5) {
  if (points.length <= 2) return points;

  const result = [points[0]];
  let lastPoint = points[0];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = distance(lastPoint, points[i]);
    if (dist >= tolerance) {
      result.push(points[i]);
      lastPoint = points[i];
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

export function calculatePathLength(points) {
  if (points.length < 2) return 0;
  
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += distance(points[i], points[i + 1]);
  }
  return length;
}

export function calculateSegmentLengths(points) {
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    lengths.push(distance(points[i], points[i + 1]));
  }
  return lengths;
}

export function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2
  };
}

export function centroid(points) {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  
  let sumX = 0, sumY = 0, sumZ = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumZ += p.z;
  }
  
  return {
    x: sumX / points.length,
    y: sumY / points.length,
    z: sumZ / points.length
  };
}

export function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return {
    x: v.x / len,
    y: v.y / len,
    z: v.z / len
  };
}

export function dot(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

export function cross(v1, v2) {
  return {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x
  };
}

export function angleBetween(v1, v2) {
  const n1 = normalize(v1);
  const n2 = normalize(v2);
  const d = dot(n1, n2);
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

export function headingAngle(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.atan2(dy, dx);
}

export function slope(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const horizontal = Math.sqrt(dx * dx + dy * dy);
  if (horizontal === 0) return dz > 0 ? Infinity : -Infinity;
  return dz / horizontal;
}

export function gradient(p1, p2) {
  return Math.atan(slope(p1, p2));
}

export function pointToSegmentDistance(point, segStart, segEnd) {
  const v = {
    x: segEnd.x - segStart.x,
    y: segEnd.y - segStart.y,
    z: segEnd.z - segStart.z
  };
  const w = {
    x: point.x - segStart.x,
    y: point.y - segStart.y,
    z: point.z - segStart.z
  };

  const c1 = dot(w, v);
  if (c1 <= 0) return distance(point, segStart);

  const c2 = dot(v, v);
  if (c2 <= c1) return distance(point, segEnd);

  const t = c1 / c2;
  const projection = {
    x: segStart.x + t * v.x,
    y: segStart.y + t * v.y,
    z: segStart.z + t * v.z
  };

  return distance(point, projection);
}

export function closestPointOnSegment(point, segStart, segEnd) {
  const v = {
    x: segEnd.x - segStart.x,
    y: segEnd.y - segStart.y,
    z: segEnd.z - segStart.z
  };
  const w = {
    x: point.x - segStart.x,
    y: point.y - segStart.y,
    z: point.z - segStart.z
  };

  const c1 = dot(w, v);
  if (c1 <= 0) return { point: segStart, t: 0 };

  const c2 = dot(v, v);
  if (c2 <= c1) return { point: segEnd, t: 1 };

  const t = c1 / c2;
  return {
    point: {
      x: segStart.x + t * v.x,
      y: segStart.y + t * v.y,
      z: segStart.z + t * v.z
    },
    t
  };
}

export function isPointInBounds(point, bounds) {
  return (
    point.x >= bounds.min.x && point.x <= bounds.max.x &&
    point.y >= bounds.min.y && point.y <= bounds.max.y &&
    point.z >= bounds.min.z && point.z <= bounds.max.z
  );
}

export function mergeBounds(b1, b2) {
  return {
    min: {
      x: Math.min(b1.min.x, b2.min.x),
      y: Math.min(b1.min.y, b2.min.y),
      z: Math.min(b1.min.z, b2.min.z)
    },
    max: {
      x: Math.max(b1.max.x, b2.max.x),
      y: Math.max(b1.max.y, b2.max.y),
      z: Math.max(b1.max.z, b2.max.z)
    }
  };
}

export function expandBounds(bounds, amount) {
  return {
    min: {
      x: bounds.min.x - amount,
      y: bounds.min.y - amount,
      z: bounds.min.z - amount
    },
    max: {
      x: bounds.max.x + amount,
      y: bounds.max.y + amount,
      z: bounds.max.z + amount
    }
  };
}

export function boundsCenter(bounds) {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2
  };
}

export function boundsSize(bounds) {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z
  };
}

export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : null;
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function lerpColor(color1, color2, t) {
  const c1 = typeof color1 === 'string' ? hexToRgb(color1) : color1;
  const c2 = typeof color2 === 'string' ? hexToRgb(color2) : color2;
  
  if (!c1 || !c2) return color1;
  
  return {
    r: lerp(c1.r, c2.r, t),
    g: lerp(c1.g, c2.g, t),
    b: lerp(c1.b, c2.b, t)
  };
}

export function interpolateColorGradient(value, stops) {
  stops.sort((a, b) => a.position - b.position);
  
  if (value <= stops[0].position) return stops[0].color;
  if (value >= stops[stops.length - 1].position) return stops[stops.length - 1].color;
  
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].position && value <= stops[i + 1].position) {
      const t = (value - stops[i].position) / (stops[i + 1].position - stops[i].position);
      return lerpColor(stops[i].color, stops[i + 1].color, t);
    }
  }
  
  return stops[stops.length - 1].color;
}

export function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return { r, g, b };
}

export function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h, s, l };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

export function radToDeg(radians) {
  return radians * (180 / Math.PI);
}

export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function map(value, inMin, inMax, outMin, outMax) {
  return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function roundTo(value, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatNumber(value, decimals = 2) {
  return Number(value).toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function toPrecision(value, precision = 4) {
  return Number(value.toPrecision(precision));
}

export function equals(p1, p2, epsilon = 1e-6) {
  return (
    Math.abs(p1.x - p2.x) < epsilon &&
    Math.abs(p1.y - p2.y) < epsilon &&
    Math.abs(p1.z - p2.z) < epsilon
  );
}

export function areColinear(p1, p2, p3, epsilon = 1e-6) {
  const v1 = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z };
  const v2 = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z };
  const c = cross(v1, v2);
  return Math.abs(c.x) < epsilon && Math.abs(c.y) < epsilon && Math.abs(c.z) < epsilon;
}

export function createEuler(rotation, order = 'XYZ') {
  return new THREE.Euler(
    degToRad(rotation.x || 0),
    degToRad(rotation.y || 0),
    degToRad(rotation.z || 0),
    order
  );
}

export function createQuaternion(rotation) {
  return new THREE.Quaternion().setFromEuler(createEuler(rotation));
}

export default {
  toVector3,
  toPointObject,
  toPointArray,
  distance,
  distanceSquared,
  distance2D,
  manhattanDistance,
  lerp,
  lerpPoint,
  lerpVector3,
  interpolatePath,
  interpolatePathByDistance,
  resamplePath,
  simplifyPath,
  calculatePathLength,
  calculateSegmentLengths,
  midpoint,
  centroid,
  normalize,
  dot,
  cross,
  angleBetween,
  headingAngle,
  slope,
  gradient,
  pointToSegmentDistance,
  closestPointOnSegment,
  isPointInBounds,
  mergeBounds,
  expandBounds,
  boundsCenter,
  boundsSize,
  hexToRgb,
  rgbToHex,
  lerpColor,
  interpolateColorGradient,
  hslToRgb,
  rgbToHsl,
  clamp,
  degToRad,
  radToDeg,
  randomRange,
  randomInt,
  map,
  smoothstep,
  smootherstep,
  roundTo,
  formatNumber,
  toPrecision,
  equals,
  areColinear,
  createEuler,
  createQuaternion
};
