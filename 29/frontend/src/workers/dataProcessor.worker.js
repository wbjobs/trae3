function perpDistance(point, lineStart, lineEnd) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const dz = lineEnd.z - lineStart.z;
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  if (mag === 0) {
    const dx0 = point.x - lineStart.x;
    const dy0 = point.y - lineStart.y;
    const dz0 = point.z - lineStart.z;
    return Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);
  }
  
  const ux = dx / mag;
  const uy = dy / mag;
  const uz = dz / mag;
  
  const px = point.x - lineStart.x;
  const py = point.y - lineStart.y;
  const pz = point.z - lineStart.z;
  
  const dot = px * ux + py * uy + pz * uz;
  const cx = px - dot * ux;
  const cy = py - dot * uy;
  const cz = pz - dot * uz;
  
  return Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function ramerDouglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;
  
  let maxDist = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  
  if (maxDist > tolerance) {
    const left = ramerDouglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = ramerDouglasPeucker(points.slice(maxIndex), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  }
  
  return [first, last];
}

function decimatePointCloud(points, ratio = 0.1) {
  if (!points || points.length === 0) return [];
  if (ratio >= 1) return points.slice();
  
  const step = Math.max(1, Math.floor(1 / ratio));
  const result = [];
  
  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
  }
  
  return result;
}

function decimatePointCloudByDistance(points, minDistance = 0.5) {
  if (!points || points.length === 0) return [];
  if (points.length <= 2) return points.slice();
  
  const result = [points[0]];
  const minDistSq = minDistance * minDistance;
  
  for (let i = 1; i < points.length; i++) {
    const last = result[result.length - 1];
    const dx = points[i].x - last.x;
    const dy = points[i].y - last.y;
    const dz = points[i].z - last.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    
    if (distSq >= minDistSq) {
      result.push(points[i]);
    }
  }
  
  const lastPoint = points[points.length - 1];
  const lastInResult = result[result.length - 1];
  if (lastPoint !== lastInResult) {
    const dx = lastPoint.x - lastInResult.x;
    const dy = lastPoint.y - lastInResult.y;
    const dz = lastPoint.z - lastInResult.z;
    if (dx * dx + dy * dy + dz * dz > 0.001) {
      result.push(lastPoint);
    }
  }
  
  return result;
}

function calculateBounds(points) {
  if (!points || points.length === 0) return null;
  
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    center: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      z: (minZ + maxZ) / 2
    },
    size: {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ
    }
  };
}

function filterByDistance(points, center, maxDistance) {
  if (!points || points.length === 0) return [];
  
  const maxDistSq = maxDistance * maxDistance;
  const result = [];
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const dz = p.z - center.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    
    if (distSq <= maxDistSq) {
      result.push(p);
    }
  }
  
  return result;
}

function filterByBounds(points, bounds) {
  if (!points || points.length === 0) return [];
  
  const result = [];
  const { min, max } = bounds;
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (
      p.x >= min.x && p.x <= max.x &&
      p.y >= min.y && p.y <= max.y &&
      p.z >= min.z && p.z <= max.z
    ) {
      result.push(p);
    }
  }
  
  return result;
}

function convertFormat(data, fromFormat, toFormat) {
  if (!data) return null;
  
  if (fromFormat === 'array' && toFormat === 'object') {
    return data.map(p => ({ x: p[0], y: p[1], z: p[2] }));
  }
  
  if (fromFormat === 'object' && toFormat === 'array') {
    return data.map(p => [p.x, p.y, p.z]);
  }
  
  if (fromFormat === 'flat' && toFormat === 'object') {
    const result = [];
    for (let i = 0; i < data.length; i += 3) {
      result.push({ x: data[i], y: data[i + 1], z: data[i + 2] });
    }
    return result;
  }
  
  if (fromFormat === 'object' && toFormat === 'flat') {
    const result = new Float32Array(data.length * 3);
    for (let i = 0; i < data.length; i++) {
      result[i * 3] = data[i].x;
      result[i * 3 + 1] = data[i].y;
      result[i * 3 + 2] = data[i].z;
    }
    return Array.from(result);
  }
  
  return data;
}

function calculatePathLength(points) {
  if (!points || points.length < 2) return 0;
  
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const dz = points[i].z - points[i - 1].z;
    length += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  return length;
}

function resamplePath(points, segmentLength) {
  if (!points || points.length < 2) return points || [];
  if (segmentLength <= 0) return points.slice();
  
  const result = [points[0]];
  let accumulatedDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = curr.z - prev.z;
    const segmentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    if (segmentDist === 0) continue;
    
    while (accumulatedDistance + segmentDist >= segmentLength) {
      const t = (segmentLength - accumulatedDistance) / segmentDist;
      result.push({
        x: prev.x + t * dx,
        y: prev.y + t * dy,
        z: prev.z + t * dz
      });
      accumulatedDistance = 0;
    }
    
    accumulatedDistance += segmentDist;
  }
  
  result.push(points[points.length - 1]);
  return result;
}

function processTunnelData(tunnels, options = {}) {
  return tunnels.map(tunnel => {
    let pathPoints = tunnel.pathPoints || [];
    
    if (options.simplify && options.simplifyTolerance) {
      pathPoints = ramerDouglasPeucker(pathPoints, options.simplifyTolerance);
    }
    
    if (options.decimate && options.decimateRatio) {
      pathPoints = decimatePointCloud(pathPoints, options.decimateRatio);
    }
    
    const bounds = calculateBounds(pathPoints);
    const length = calculatePathLength(pathPoints);
    
    return {
      ...tunnel,
      pathPoints,
      bounds,
      length
    };
  });
}

function processPipeData(pipes, options = {}) {
  return pipes.map(pipe => {
    let pathPoints = pipe.pathPoints || [];
    
    if (options.simplify && options.simplifyTolerance) {
      pathPoints = ramerDouglasPeucker(pathPoints, options.simplifyTolerance);
    }
    
    if (options.decimate && options.decimateRatio) {
      pathPoints = decimatePointCloud(pathPoints, options.decimateRatio);
    }
    
    const bounds = calculateBounds(pathPoints);
    const length = calculatePathLength(pathPoints);
    
    return {
      ...pipe,
      pathPoints,
      bounds,
      length
    };
  });
}

function processPointCloud(points, options = {}) {
  let result = points;
  
  if (options.decimateByDistance && options.minDistance) {
    result = decimatePointCloudByDistance(result, options.minDistance);
  } else if (options.decimate && options.decimateRatio) {
    result = decimatePointCloud(result, options.decimateRatio);
  }
  
  if (options.filterByDistance && options.center && options.maxDistance) {
    result = filterByDistance(result, options.center, options.maxDistance);
  }
  
  if (options.filterByBounds && options.bounds) {
    result = filterByBounds(result, options.bounds);
  }
  
  const bounds = calculateBounds(result);
  
  return {
    points: result,
    bounds,
    count: result.length
  };
}

self.onmessage = function(e) {
  const { id, task, data, options = {} } = e.data;
  
  try {
    let result;
    
    switch (task) {
      case 'simplifyPath':
        result = ramerDouglasPeucker(data, options.tolerance || 0.5);
        break;
        
      case 'decimatePointCloud':
        result = decimatePointCloud(data, options.ratio || 0.1);
        break;
        
      case 'decimatePointCloudByDistance':
        result = decimatePointCloudByDistance(data, options.minDistance || 0.5);
        break;
        
      case 'calculateBounds':
        result = calculateBounds(data);
        break;
        
      case 'filterByDistance':
        result = filterByDistance(data, options.center, options.maxDistance);
        break;
        
      case 'filterByBounds':
        result = filterByBounds(data, options.bounds);
        break;
        
      case 'convertFormat':
        result = convertFormat(data, options.from, options.to);
        break;
        
      case 'calculatePathLength':
        result = calculatePathLength(data);
        break;
        
      case 'resamplePath':
        result = resamplePath(data, options.segmentLength);
        break;
        
      case 'processTunnels':
        result = processTunnelData(data, options);
        break;
        
      case 'processPipes':
        result = processPipeData(data, options);
        break;
        
      case 'processPointCloud':
        result = processPointCloud(data, options);
        break;
        
      case 'processAll':
        result = {
          tunnels: data.tunnels ? processTunnelData(data.tunnels, options) : [],
          pipes: data.pipes ? processPipeData(data.pipes, options) : [],
          fans: data.fans || [],
          annotations: data.annotations || []
        };
        break;
        
      default:
        throw new Error(`Unknown task: ${task}`);
    }
    
    self.postMessage({
      id,
      success: true,
      result
    });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error.message
    });
  }
};
