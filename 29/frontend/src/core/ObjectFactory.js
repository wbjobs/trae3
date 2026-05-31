import * as THREE from 'three';

export class ObjectFactory {
  static materialCache = new Map();

  static defaultMaterialOptions = {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: true
  };

  static getMaterialKey(type, options) {
    const sorted = Object.entries(options).sort((a, b) => a[0].localeCompare(b[0]));
    return `${type}:${JSON.stringify(sorted)}`;
  }

  static getOrCreateMaterial(type, options, MaterialClass = THREE.MeshStandardMaterial) {
    const key = this.getMaterialKey(type, options);
    
    if (this.materialCache.has(key)) {
      return this.materialCache.get(key);
    }

    const material = new MaterialClass(options);
    this.materialCache.set(key, material);
    return material;
  }

  static clearMaterialCache() {
    this.materialCache.forEach(material => material.dispose());
    this.materialCache.clear();
  }

  static createTunnel(start, end, width, height, color = 0x8b7355) {
    const startPoint = start instanceof THREE.Vector3 ? start : new THREE.Vector3(...start);
    const endPoint = end instanceof THREE.Vector3 ? end : new THREE.Vector3(...end);

    const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
    const length = direction.length();
    const midPoint = new THREE.Vector3().addVectors(startPoint, endPoint).multiplyScalar(0.5);

    const tunnelGroup = new THREE.Group();
    tunnelGroup.userData = {
      type: 'tunnel',
      start: startPoint,
      end: endPoint,
      width,
      height,
      length
    };

    const halfWidth = width / 2;
    const halfHeight = height / 2;

    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, -halfHeight);
    shape.lineTo(halfWidth, -halfHeight);
    shape.lineTo(halfWidth, halfHeight);
    shape.quadraticCurveTo(0, height * 0.7, -halfWidth, halfHeight);
    shape.lineTo(-halfWidth, -halfHeight);

    const extrudeSettings = {
      steps: 1,
      depth: length,
      bevelEnabled: false
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, halfHeight, 0);

    const material = this.getOrCreateMaterial('tunnel', {
      color,
      ...ObjectFactory.defaultMaterialOptions,
      metalness: 0.1,
      roughness: 0.8
    });

    const tunnelMesh = new THREE.Mesh(geometry, material);
    tunnelMesh.castShadow = true;
    tunnelMesh.receiveShadow = true;
    tunnelMesh.matrixAutoUpdate = false;
    tunnelGroup.add(tunnelMesh);

    const edgesGeometry = new THREE.EdgesGeometry(geometry, 30);
    const edgesMaterial = this.getOrCreateMaterial('tunnelEdges', {
      color: 0x333333,
      transparent: true,
      opacity: 0.3
    }, THREE.LineBasicMaterial);
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.matrixAutoUpdate = false;
    tunnelGroup.add(edges);

    tunnelGroup.position.copy(midPoint);

    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, direction).normalize();
    const angle = Math.acos(up.dot(direction.normalize()) / up.length());
    tunnelGroup.quaternion.setFromAxisAngle(axis, angle);
    tunnelGroup.updateMatrix();
    tunnelGroup.matrixAutoUpdate = false;

    return tunnelGroup;
  }

  static createPipe(points, diameter = 5, color = 0x4a90d9, quality = 'medium') {
    const curvePoints = points.map(p => 
      p instanceof THREE.Vector3 ? p : new THREE.Vector3(...p)
    );

    const pipeGroup = new THREE.Group();
    pipeGroup.userData = {
      type: 'pipe',
      points: curvePoints,
      diameter
    };

    const curve = new THREE.CatmullRomCurve3(curvePoints);
    curve.curveType = 'catmullrom';
    curve.tension = 0.5;

    const qualitySettings = {
      low: { tubularSegments: 8, radialSegments: 4 },
      medium: { tubularSegments: 32, radialSegments: 8 },
      high: { tubularSegments: 64, radialSegments: 12 }
    };

    const settings = qualitySettings[quality] || qualitySettings.medium;
    const tubularSegments = Math.min(settings.tubularSegments, 
      Math.max(16, Math.floor(curvePoints.length * 2)));

    const geometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      diameter / 2,
      settings.radialSegments,
      false
    );

    const material = this.getOrCreateMaterial('pipe', {
      color,
      ...ObjectFactory.defaultMaterialOptions,
      metalness: 0.6,
      roughness: 0.3
    });

    const pipeMesh = new THREE.Mesh(geometry, material);
    pipeMesh.castShadow = true;
    pipeMesh.receiveShadow = true;
    pipeMesh.frustumCulled = true;
    pipeGroup.add(pipeMesh);

    const ringGeometry = new THREE.TorusGeometry(diameter / 2 + 0.5, 0.3, 4, 8);
    const ringMaterial = this.getOrCreateMaterial('pipeRing', {
      color: 0x333333,
      metalness: 0.8,
      roughness: 0.2,
      depthWrite: true
    });

    const ringInterval = Math.floor(curvePoints.length / 3) || 1;
    for (let i = 0; i < curvePoints.length; i += ringInterval) {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      const point = curvePoints[i];
      ring.position.copy(point);
      
      if (i < curvePoints.length - 1) {
        const nextPoint = curvePoints[i + 1];
        const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const axis = new THREE.Vector3().crossVectors(up, direction).normalize();
        if (axis.length() > 0) {
          const angle = Math.acos(up.dot(direction) / (up.length() * direction.length()));
          ring.quaternion.setFromAxisAngle(axis, angle);
        }
      }
      
      ring.castShadow = true;
      ring.matrixAutoUpdate = false;
      ring.updateMatrix();
      pipeGroup.add(ring);
    }

    return pipeGroup;
  }

  static createPipeLOD(points, diameter = 5, color = 0x4a90d9) {
    const lod = new THREE.LOD();

    const highQuality = this.createPipe(points, diameter, color, 'high');
    highQuality.traverse(child => {
      if (child.isMesh) child.visible = true;
    });
    lod.addLevel(highQuality, 50);

    const mediumQuality = this.createPipe(points, diameter, color, 'medium');
    mediumQuality.traverse(child => {
      if (child.isMesh) child.visible = true;
    });
    lod.addLevel(mediumQuality, 150);

    const lowQuality = this.createPipe(points, diameter, color, 'low');
    lowQuality.traverse(child => {
      if (child.isMesh) child.visible = true;
    });
    lod.addLevel(lowQuality, Infinity);

    lod.userData = {
      type: 'pipeLOD',
      points,
      diameter,
      isLOD: true
    };

    return lod;
  }

  static createFan(position, type = 'axial', status = 'running') {
    const fanPosition = position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position);

    const fanGroup = new THREE.Group();
    fanGroup.position.copy(fanPosition);
    fanGroup.userData = {
      type: 'fan',
      fanType: type,
      status,
      rotationSpeed: status === 'running' ? Math.PI * 2 : 0
    };

    const baseColor = status === 'running' ? 0x2ecc71 : 0xe74c3c;
    const housingColor = 0x2c3e50;

    const housingSize = type === 'axial' ? 12 : 15;
    const housingDepth = type === 'axial' ? 8 : 12;

    const housingGeometry = new THREE.CylinderGeometry(
      housingSize,
      housingSize,
      housingDepth,
      16
    );
    const housingMaterial = this.getOrCreateMaterial('fanHousing', {
      color: housingColor,
      metalness: 0.7,
      roughness: 0.3,
      depthWrite: true
    });
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.rotation.x = Math.PI / 2;
    housing.castShadow = true;
    housing.receiveShadow = true;
    housing.matrixAutoUpdate = false;
    housing.updateMatrix();
    fanGroup.add(housing);

    const standGeometry = new THREE.BoxGeometry(housingSize * 1.5, 4, housingSize * 0.6);
    const standMaterial = this.getOrCreateMaterial('fanStand', {
      color: 0x34495e,
      metalness: 0.5,
      roughness: 0.5,
      depthWrite: true
    });
    const stand = new THREE.Mesh(standGeometry, standMaterial);
    stand.position.y = -housingDepth / 2 - 2;
    stand.castShadow = true;
    stand.receiveShadow = true;
    stand.matrixAutoUpdate = false;
    stand.updateMatrix();
    fanGroup.add(stand);

    const bladeGroup = new THREE.Group();
    bladeGroup.userData = { isBlades: true };

    const bladeCount = type === 'axial' ? 6 : 8;
    const bladeLength = housingSize * 0.85;
    const bladeWidth = bladeLength * 0.15;

    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -bladeWidth / 2);
    bladeShape.lineTo(bladeLength * 0.3, -bladeWidth / 2);
    bladeShape.quadraticCurveTo(
      bladeLength, 0,
      bladeLength * 0.3, bladeWidth / 2
    );
    bladeShape.lineTo(0, bladeWidth / 2);
    bladeShape.lineTo(0, -bladeWidth / 2);

    const bladeExtrudeSettings = {
      steps: 1,
      depth: 0.8,
      bevelEnabled: false
    };

    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, bladeExtrudeSettings);
    const bladeMaterial = this.getOrCreateMaterial('fanBlade', {
      color: baseColor,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
      depthWrite: true
    });

    for (let i = 0; i < bladeCount; i++) {
      const blade = new THREE.Mesh(bladeGeometry, bladeMaterial);
      blade.rotation.z = (i / bladeCount) * Math.PI * 2;
      blade.position.z = 0.4;
      blade.castShadow = true;
      bladeGroup.add(blade);
    }

    const hubGeometry = new THREE.CylinderGeometry(2, 2, 1.5, 8);
    const hubMaterial = this.getOrCreateMaterial('fanHub', {
      color: 0x1a1a2e,
      metalness: 0.8,
      roughness: 0.2,
      depthWrite: true
    });
    const hub = new THREE.Mesh(hubGeometry, hubMaterial);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = 0.75;
    hub.matrixAutoUpdate = false;
    hub.updateMatrix();
    bladeGroup.add(hub);

    bladeGroup.position.z = housingDepth / 2 + 0.5;
    fanGroup.add(bladeGroup);

    const indicatorGeometry = new THREE.SphereGeometry(1.5, 8, 8);
    const indicatorMaterial = this.getOrCreateMaterial('fanIndicator', {
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: status === 'running' ? 0.5 : 0.1,
      depthWrite: true
    });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.set(housingSize + 2, 0, 0);
    indicator.userData = { isIndicator: true };
    fanGroup.add(indicator);

    fanGroup.userData.bladeGroup = bladeGroup;
    fanGroup.userData.indicator = indicator;

    fanGroup.userData.animate = (delta) => {
      if (fanGroup.userData.status === 'running' && bladeGroup) {
        bladeGroup.rotation.z += fanGroup.userData.rotationSpeed * delta;
      }
    };

    fanGroup.userData.setStatus = (newStatus) => {
      fanGroup.userData.status = newStatus;
      fanGroup.userData.rotationSpeed = newStatus === 'running' ? Math.PI * 2 : 0;
      
      const newColor = newStatus === 'running' ? 0x2ecc71 : 0xe74c3c;
      indicatorMaterial.color.setHex(newColor);
      indicatorMaterial.emissive.setHex(newColor);
      indicatorMaterial.emissiveIntensity = newStatus === 'running' ? 0.5 : 0.1;

      bladeGroup.children.forEach(child => {
        if (child.material && child.material.color) {
          child.material.color.setHex(newColor);
        }
      });
    };

    return fanGroup;
  }

  static createGround(size = 500, color = 0x2d3436) {
    const groundGroup = new THREE.Group();
    groundGroup.userData = { type: 'ground' };

    const geometry = new THREE.PlaneGeometry(size, size, 50, 50);
    const material = this.getOrCreateMaterial('ground', {
      color,
      roughness: 0.9,
      metalness: 0.1,
      depthWrite: true
    });

    const ground = new THREE.Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false;
    ground.updateMatrix();
    groundGroup.add(ground);

    const gridHelper = new THREE.GridHelper(size, 100, 0x555555, 0x333333);
    gridHelper.position.y = 0.01;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;
    gridHelper.matrixAutoUpdate = false;
    gridHelper.updateMatrix();
    groundGroup.add(gridHelper);

    return groundGroup;
  }

  static createAxesHelper(size = 50) {
    const axesHelper = new THREE.AxesHelper(size);
    axesHelper.userData = { type: 'axesHelper' };
    
    const lineWidth = 2;
    axesHelper.material.linewidth = lineWidth;
    
    return axesHelper;
  }

  static createGridHelper(size = 200, divisions = 20, color1 = 0x444444, color2 = 0x222222) {
    const gridHelper = new THREE.GridHelper(size, divisions, color1, color2);
    gridHelper.userData = { type: 'gridHelper' };
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.5;
    return gridHelper;
  }

  static createLabel(text, position, options = {}) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = options.fontSize || 32;
    const fontFamily = options.fontFamily || 'Arial';
    const padding = 10;

    context.font = `bold ${fontSize}px ${fontFamily}`;
    const textWidth = context.measureText(text).width;
    
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;

    context.font = `bold ${fontSize}px ${fontFamily}`;
    context.fillStyle = options.backgroundColor || 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    context.fillStyle = options.color || '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position instanceof THREE.Vector3 ? position : new THREE.Vector3(...position));
    sprite.scale.set(canvas.width / 20, canvas.height / 20, 1);
    sprite.userData = { type: 'label', text };

    return sprite;
  }

  static createArrow(start, end, color = 0xffff00, headLength = 10, headWidth = 6) {
    const startPoint = start instanceof THREE.Vector3 ? start : new THREE.Vector3(...start);
    const endPoint = end instanceof THREE.Vector3 ? end : new THREE.Vector3(...end);
    
    const direction = new THREE.Vector3().subVectors(endPoint, startPoint);
    const length = direction.length();
    direction.normalize();

    const arrowHelper = new THREE.ArrowHelper(
      direction,
      startPoint,
      length,
      color,
      headLength,
      headWidth
    );
    arrowHelper.userData = { type: 'arrow', start: startPoint, end: endPoint };

    return arrowHelper;
  }

  static disposeObject(object) {
    if (!object) return;

    object.traverse((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
        }
      }
    });
  }
}
