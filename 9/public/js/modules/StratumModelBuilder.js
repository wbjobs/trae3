class StratumModelBuilder {
  constructor() {
    this.stratumMeshes = [];
    this._stratumMeshMap = new Map();
    this.sharedMaterials = new Map();
    this.gridSize = AppConfig.rendering.defaultGridSize;
    this.loadProgress = new Map();
  }

  buildStratumMesh(stratumData, lowerStratumData = null) {
    try {
      if (!stratumData || !stratumData.points || !Array.isArray(stratumData.points)) {
        console.warn('Invalid stratum data:', stratumData);
        return this.createEmptyGroup(stratumData);
      }

      const validPoints = this.validateAndCleanPoints(stratumData.points);
      if (validPoints.length < 4) {
        console.warn('Insufficient valid points for stratum:', stratumData.name);
        return this.createEmptyGroup(stratumData);
      }

      const color = CoordConverter.parseColor(stratumData.color, AppConfig.colors.strata.default);
      const stratumId = stratumData._id || stratumData.id;

      this.loadProgress.set(stratumId, 'loading');

      let lowerValidPoints = null;
      if (lowerStratumData && lowerStratumData.points) {
        lowerValidPoints = this.validateAndCleanPoints(lowerStratumData.points);
      }

      const lod = this.createLODStratumMesh(stratumData, lowerStratumData, validPoints, lowerValidPoints, color);

      lod.userData = {
        stratumId: stratumId,
        stratumData: stratumData,
        type: 'stratum_group',
      };

      lod.traverse(child => {
        if (child !== lod) {
          child.userData = {
            ...child.userData,
            stratumId: stratumId,
            stratumData: stratumData,
            type: 'stratum_group',
          };
        }
      });

      this.stratumMeshes.push(lod);
      this._stratumMeshMap.set(stratumId, lod);
      this.loadProgress.set(stratumId, 'loaded');

      return lod;
    } catch (error) {
      console.error('Error building stratum mesh:', error);
      const id = stratumData?._id || stratumData?.id;
      if (id) this.loadProgress.set(id, 'unloaded');
      return this.createEmptyGroup(stratumData);
    }
  }

  createLODStratumMesh(stratumData, lowerStratumData, validPoints, lowerValidPoints, color) {
    const lod = new THREE.LOD();

    const highGroup = new THREE.Group();
    const upperSurface = this.createSurfaceMesh(validPoints, color);
    if (upperSurface) {
      upperSurface.userData = { type: 'upper_surface' };
      highGroup.add(upperSurface);
    }
    if (lowerValidPoints && lowerValidPoints.length >= 4) {
      const volumeMesh = this.createVolumeMesh(validPoints, lowerValidPoints, color);
      if (volumeMesh) {
        volumeMesh.userData = { type: 'volume' };
        highGroup.add(volumeMesh);
      }
    }
    const edgeLines = this.createSurfaceEdges(validPoints, 0x222222);
    if (edgeLines) {
      highGroup.add(edgeLines);
    }
    const labelSprite = this.createStratumLabel(stratumData);
    if (labelSprite) {
      highGroup.add(labelSprite);
    }
    if (stratumData.annotations && Array.isArray(stratumData.annotations)) {
      stratumData.annotations.forEach(ann => {
        if (ann && ann.position) {
          const annotation = this.createAnnotation(ann, color);
          if (annotation) {
            annotation.userData = {
              type: 'annotation',
              annotationId: ann.id,
            };
            highGroup.add(annotation);
          }
        }
      });
    }
    lod.addLevel(highGroup, 0);

    const mediumGroup = new THREE.Group();
    const halfGrid = Math.max(2, Math.floor(this.gridSize / 2));
    const step = Math.max(1, Math.floor(this.gridSize / halfGrid));
    const subsampledPoints = [];
    for (let i = 0; i < this.gridSize; i += step) {
      for (let j = 0; j < this.gridSize; j += step) {
        const idx = i * this.gridSize + j;
        if (idx < validPoints.length) {
          subsampledPoints.push(validPoints[idx]);
        }
      }
    }
    const originalGridSize = this.gridSize;
    this.gridSize = halfGrid;
    if (subsampledPoints.length >= halfGrid * halfGrid) {
      const mediumSurface = this.createSurfaceMesh(subsampledPoints.slice(0, halfGrid * halfGrid), color);
      if (mediumSurface) {
        mediumSurface.userData = { type: 'upper_surface' };
        mediumGroup.add(mediumSurface);
      }
      if (lowerValidPoints && lowerValidPoints.length >= 4) {
        const subsampledLower = [];
        for (let i = 0; i < originalGridSize; i += step) {
          for (let j = 0; j < originalGridSize; j += step) {
            const idx = i * originalGridSize + j;
            if (idx < lowerValidPoints.length) {
              subsampledLower.push(lowerValidPoints[idx]);
            }
          }
        }
        if (subsampledLower.length >= halfGrid * halfGrid) {
          const mediumVolume = this.createVolumeMesh(
            subsampledPoints.slice(0, halfGrid * halfGrid),
            subsampledLower.slice(0, halfGrid * halfGrid),
            color
          );
          if (mediumVolume) {
            mediumVolume.userData = { type: 'volume' };
            mediumGroup.add(mediumVolume);
          }
        }
      }
    }
    this.gridSize = originalGridSize;
    lod.addLevel(mediumGroup, 200);

    const lowGroup = new THREE.Group();
    const bbox = this._computeBoundingBox(validPoints);
    if (bbox) {
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      bbox.getSize(size);
      bbox.getCenter(center);
      const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
      const boxMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        wireframe: true,
        transparent: true,
        opacity: 0.4,
      });
      const boxMesh = new THREE.Mesh(boxGeom, boxMat);
      boxMesh.position.copy(center);
      lowGroup.add(boxMesh);
    }
    lod.addLevel(lowGroup, 400);

    return lod;
  }

  _computeBoundingBox(points) {
    if (!points || points.length === 0) return null;
    const box = new THREE.Box3();
    points.forEach(p => {
      const threeP = CoordConverter.worldToThree(p);
      box.expandByPoint(new THREE.Vector3(threeP.x, threeP.y, threeP.z));
    });
    return box;
  }

  _createPlaceholder(stratumData, validPoints) {
    const group = new THREE.Group();
    const stratumId = stratumData?._id || stratumData?.id || 'unknown';
    group.userData = {
      stratumId: stratumId,
      stratumData: stratumData,
      type: 'stratum_group',
      placeholder: true,
    };

    if (validPoints && validPoints.length > 0) {
      const bbox = this._computeBoundingBox(validPoints);
      if (bbox) {
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);
        const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
        const boxMat = new THREE.MeshBasicMaterial({
          color: 0x888888,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        });
        const boxMesh = new THREE.Mesh(boxGeom, boxMat);
        boxMesh.position.copy(center);
        group.add(boxMesh);
      }
    }

    return group;
  }

  buildStratumMeshLazy(stratumData, lowerStratumData = null) {
    if (!stratumData || !stratumData.points || !Array.isArray(stratumData.points)) {
      return this.createEmptyGroup(stratumData);
    }

    const validPoints = this.validateAndCleanPoints(stratumData.points);
    const stratumId = stratumData._id || stratumData.id;
    const placeholder = this._createPlaceholder(stratumData, validPoints);

    this.loadProgress.set(stratumId, 'loading');

    const loadFn = () => {
      try {
        const fullMesh = this.buildStratumMesh(stratumData, lowerStratumData);
        if (placeholder.parent) {
          placeholder.parent.remove(placeholder);
          placeholder.parent.add(fullMesh);
        }
        const idx = this.stratumMeshes.indexOf(placeholder);
        if (idx !== -1) {
          this.stratumMeshes[idx] = fullMesh;
        }
      } catch (error) {
        console.error('Error in lazy loading stratum mesh:', error);
        if (stratumId) this.loadProgress.set(stratumId, 'unloaded');
      }
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(loadFn);
    } else {
      setTimeout(loadFn, 0);
    }

    this.stratumMeshes.push(placeholder);
    this._stratumMeshMap.set(stratumId, placeholder);

    return placeholder;
  }

  unloadStratumMesh(stratumId) {
    const mesh = this._stratumMeshMap.get(stratumId);
    if (!mesh) return null;

    let placeholder = null;
    if (mesh.userData && mesh.userData.stratumData) {
      const pts = mesh.userData.stratumData.points;
      const validPoints = pts ? this.validateAndCleanPoints(pts) : [];
      placeholder = this._createPlaceholder(mesh.userData.stratumData, validPoints);
    } else {
      placeholder = this.createEmptyGroup({ _id: stratumId });
      placeholder.userData.placeholder = true;
    }

    if (mesh.parent) {
      mesh.parent.remove(mesh);
      mesh.parent.add(placeholder);
    }

    const meshIdx = this.stratumMeshes.indexOf(mesh);
    if (meshIdx !== -1) {
      this.stratumMeshes[meshIdx] = placeholder;
    }

    this._stratumMeshMap.set(stratumId, placeholder);
    this.loadProgress.set(stratumId, 'unloaded');

    mesh.traverse(child => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          if (mat.map) mat.map.dispose();
          if (!mat._isShared) mat.dispose();
        });
      }
    });

    return placeholder;
  }

  getLoadedStrataIds() {
    const ids = [];
    this.loadProgress.forEach((state, id) => {
      if (state === 'loaded') {
        ids.push(id);
      }
    });
    return ids;
  }

  validateAndCleanPoints(points) {
    if (!Array.isArray(points)) return [];

    return points
      .filter(p => {
        if (!p || typeof p !== 'object') return false;
        const validation = CoordConverter.validatePoint(p);
        if (!validation.valid) {
          console.warn('Invalid point filtered:', validation.message, p);
          return false;
        }
        return true;
      })
      .map(p => CoordConverter.normalizePoint(p));
  }

  createEmptyGroup(stratumData) {
    const group = new THREE.Group();
    group.userData = {
      stratumId: stratumData?._id || stratumData?.id || 'unknown',
      stratumData: stratumData,
      type: 'stratum_group',
      empty: true,
    };
    return group;
  }

  getSharedMaterial(colorKey, type = 'surface') {
    const key = `${type}_${colorKey}`;
    if (!this.sharedMaterials.has(key)) {
      const config = AppConfig.rendering.material;
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(colorKey),
        transparent: true,
        opacity: type === 'volume' ? 0.7 : config.opacity,
        side: THREE.DoubleSide,
        roughness: config.roughness,
        metalness: config.metalness,
        flatShading: type === 'volume',
        polygonOffset: true,
        polygonOffsetFactor: type === 'surface' ? -1 : 0,
        polygonOffsetUnits: type === 'surface' ? -1 : 0,
      });
      material._isShared = true;
      this.sharedMaterials.set(key, material);
    }
    return this.sharedMaterials.get(key);
  }

  createSurfaceMesh(points, color) {
    try {
      const gridSize = this.gridSize;
      const expectedPoints = gridSize * gridSize;

      if (points.length < expectedPoints) {
        console.warn(`Insufficient points: expected ${expectedPoints}, got ${points.length}`);
        return null;
      }

      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];
      const uvs = [];

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const idx = i * gridSize + j;
          const point = points[idx];
          const threePoint = CoordConverter.worldToThree(point);
          vertices.push(threePoint.x, threePoint.y, threePoint.z);
          uvs.push(j / (gridSize - 1), i / (gridSize - 1));
        }
      }

      for (let i = 0; i < gridSize - 1; i++) {
        for (let j = 0; j < gridSize - 1; j++) {
          const a = i * gridSize + j;
          const b = i * gridSize + j + 1;
          const c = (i + 1) * gridSize + j;
          const d = (i + 1) * gridSize + j + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const material = this.getSharedMaterial(color, 'surface');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = true;

      return mesh;
    } catch (error) {
      console.error('Error creating surface mesh:', error);
      return null;
    }
  }

  createVolumeMesh(upperPoints, lowerPoints, color) {
    try {
      const gridSize = this.gridSize;
      const expectedPoints = gridSize * gridSize;

      if (upperPoints.length < expectedPoints || lowerPoints.length < expectedPoints) {
        console.warn('Insufficient points for volume mesh');
        return null;
      }

      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      const indices = [];

      for (let i = 0; i < expectedPoints; i++) {
        const threeUpper = CoordConverter.worldToThree(upperPoints[i]);
        vertices.push(threeUpper.x, threeUpper.y, threeUpper.z);
      }
      for (let i = 0; i < expectedPoints; i++) {
        const threeLower = CoordConverter.worldToThree(lowerPoints[i]);
        vertices.push(threeLower.x, threeLower.y, threeLower.z);
      }

      for (let i = 0; i < gridSize - 1; i++) {
        for (let j = 0; j < gridSize - 1; j++) {
          const idx = i * gridSize + j;

          const a = idx;
          const b = idx + 1;
          const c = idx + gridSize;
          const d = idx + gridSize + 1;

          indices.push(a, c, b, b, c, d);

          const a2 = idx + expectedPoints;
          const b2 = idx + 1 + expectedPoints;
          const c2 = idx + gridSize + expectedPoints;
          const d2 = idx + gridSize + 1 + expectedPoints;

          indices.push(a2, b2, c2, b2, d2, c2);
        }
      }

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize - 1; j++) {
          const idx = i * gridSize + j;
          const idx2 = idx + expectedPoints;

          if (i === 0 || i === gridSize - 1) {
            indices.push(idx, idx2, idx + 1, idx + 1, idx2, idx2 + 1);
          }
          if (j === 0 || j === gridSize - 2) {
            const rowIdx = j * gridSize + i;
            const rowIdx2 = rowIdx + expectedPoints;
            indices.push(rowIdx, rowIdx + gridSize, rowIdx2, rowIdx + gridSize, rowIdx2 + gridSize, rowIdx2);
          }
        }
      }

      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      const material = this.getSharedMaterial(color, 'volume');
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = true;

      return mesh;
    } catch (error) {
      console.error('Error creating volume mesh:', error);
      return null;
    }
  }

  createSurfaceEdges(points, color) {
    try {
      const gridSize = this.gridSize;
      const lineSegments = [];

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize - 1; j++) {
          const idx1 = i * gridSize + j;
          const idx2 = i * gridSize + j + 1;
          if (points[idx1] && points[idx2]) {
            lineSegments.push(CoordConverter.worldToThreeVector(points[idx1]));
            lineSegments.push(CoordConverter.worldToThreeVector(points[idx2]));
          }
        }
      }

      for (let i = 0; i < gridSize - 1; i++) {
        for (let j = 0; j < gridSize; j++) {
          const idx1 = i * gridSize + j;
          const idx2 = (i + 1) * gridSize + j;
          if (points[idx1] && points[idx2]) {
            lineSegments.push(CoordConverter.worldToThreeVector(points[idx1]));
            lineSegments.push(CoordConverter.worldToThreeVector(points[idx2]));
          }
        }
      }

      if (lineSegments.length < 2) return null;

      const geometry = new THREE.BufferGeometry().setFromPoints(lineSegments);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.frustumCulled = true;

      return lines;
    } catch (error) {
      console.error('Error creating surface edges:', error);
      return null;
    }
  }

  createStratumLabel(stratumData) {
    try {
      const name = stratumData.name || 'Unknown';
      const code = stratumData.code || '';
      const thickness = stratumData.thickness ? `${stratumData.thickness}m` : '';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const borderColor = CoordConverter.parseColor(stratumData.color, '#8B4513');
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${code} - ${name}`, canvas.width / 2, 24);

      if (thickness) {
        ctx.font = '14px Arial';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText(`厚度: ${thickness}`, canvas.width / 2, 48);
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        renderOrder: 1000,
      });

      const sprite = new THREE.Sprite(material);
      sprite.scale.set(45, 11.25, 1);

      const depth = CoordConverter.safeNumber(stratumData.depth, 0);
      const thick = CoordConverter.safeNumber(stratumData.thickness, 0);
      const centerY = -depth + thick / 2;

      const threePos = CoordConverter.worldToThree({ x: 0, y: 100, z: centerY });
      sprite.position.set(threePos.x, threePos.y, threePos.z);
      sprite.userData = { type: 'label' };

      return sprite;
    } catch (error) {
      console.error('Error creating stratum label:', error);
      return null;
    }
  }

  createPointCloud(points) {
    try {
      if (!Array.isArray(points) || points.length === 0) {
        return null;
      }

      const positions = [];
      const colors = [];
      const colorMap = AppConfig.colors.strata;

      points.forEach(p => {
        if (!p || typeof p !== 'object') return;

        const validation = CoordConverter.validatePoint(p);
        if (!validation.valid) return;

        const threePos = CoordConverter.worldToThree(p);
        positions.push(threePos.x, threePos.y, threePos.z);

        const colorKey = p.stratumCode || 'default';
        const colorHex = colorMap[colorKey] || colorMap.default;
        const color = new THREE.Color(colorHex);
        colors.push(color.r, color.g, color.b);
      });

      if (positions.length === 0) return null;

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeBoundingSphere();

      const config = AppConfig.rendering.pointCloud;
      const material = new THREE.PointsMaterial({
        size: config.size,
        vertexColors: true,
        transparent: true,
        opacity: config.opacity,
        sizeAttenuation: config.sizeAttenuation,
        depthTest: true,
        depthWrite: false,
      });

      const pointCloud = new THREE.Points(geometry, material);
      pointCloud.userData = { type: 'point_cloud' };
      pointCloud.frustumCulled = true;

      return pointCloud;
    } catch (error) {
      console.error('Error creating point cloud:', error);
      return null;
    }
  }

  createDrillHoleLine(drillHole) {
    try {
      if (!drillHole || !drillHole.location) {
        return null;
      }

      const x = CoordConverter.safeNumber(drillHole.location.x);
      const y = CoordConverter.safeNumber(drillHole.location.y);
      const depth = CoordConverter.safeNumber(drillHole.depth);

      const topPoint = CoordConverter.worldToThree({ x, y, z: 0 });
      const bottomPoint = CoordConverter.worldToThree({ x, y, z: -depth });

      const points = [
        new THREE.Vector3(topPoint.x, topPoint.y, topPoint.z),
        new THREE.Vector3(bottomPoint.x, bottomPoint.y, bottomPoint.z),
      ];

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineDashedMaterial({
        color: AppConfig.colors.drillHole,
        linewidth: 2,
        dashSize: 4,
        gapSize: 2,
        transparent: true,
        opacity: 0.8,
      });

      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      line.userData = { type: 'drill_hole', drillHole };
      line.frustumCulled = true;

      const markerGeom = new THREE.ConeGeometry(2.5, 6, 6);
      const markerMat = new THREE.MeshBasicMaterial({ color: AppConfig.colors.drillHole });
      const marker = new THREE.Mesh(markerGeom, markerMat);

      const markerTop = CoordConverter.worldToThree({ x, y, z: 3 });
      marker.position.set(markerTop.x, markerTop.y, markerTop.z);
      marker.rotation.x = Math.PI;
      line.add(marker);

      return line;
    } catch (error) {
      console.error('Error creating drill hole line:', error);
      return null;
    }
  }

  createAnnotation(annotationData, stratumColor) {
    try {
      if (!annotationData || !annotationData.position) {
        return null;
      }

      const validation = CoordConverter.validatePoint(annotationData.position);
      if (!validation.valid) {
        console.warn('Invalid annotation position:', validation.message);
        return null;
      }

      const group = new THREE.Group();
      const worldPos = CoordConverter.normalizePoint(annotationData.position);
      const threePos = CoordConverter.worldToThree(worldPos);

      const markerGeom = new THREE.SphereGeometry(2, 12, 12);
      const markerMat = new THREE.MeshBasicMaterial({
        color: AppConfig.colors.annotation,
        depthTest: true,
      });
      const marker = new THREE.Mesh(markerGeom, markerMat);
      marker.position.set(threePos.x, threePos.y, threePos.z);
      group.add(marker);

      const text = annotationData.text || '未命名标注';
      const id = annotationData.id || 'unknown';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 200;
      canvas.height = 50;

      ctx.fillStyle = 'rgba(255, 0, 0, 0.9)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.substring(0, 15), canvas.width / 2, 18);

      ctx.font = '11px Arial';
      ctx.fillStyle = '#ffcccc';
      ctx.fillText(`ID: ${id}`, canvas.width / 2, 38);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        renderOrder: 1001,
      });

      const sprite = new THREE.Sprite(spriteMat);
      const labelOffset = CoordConverter.worldToThree({ x: 0, y: 0, z: 8 });
      sprite.position.set(
        threePos.x + labelOffset.x,
        threePos.y + labelOffset.y,
        threePos.z + labelOffset.z
      );
      sprite.scale.set(28, 7, 1);
      group.add(sprite);

      const labelThreePos = CoordConverter.worldToThree({
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z + 4,
      });

      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(threePos.x, threePos.y, threePos.z),
        new THREE.Vector3(labelThreePos.x, labelThreePos.y, labelThreePos.z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: AppConfig.colors.annotation,
        transparent: true,
        opacity: 0.8,
      });
      group.add(new THREE.Line(lineGeom, lineMat));

      group.position.set(0, 0, 0);
      group.userData = {
        type: 'annotation',
        annotationId: id,
        worldPosition: worldPos,
        threePosition: threePos,
      };

      return group;
    } catch (error) {
      console.error('Error creating annotation:', error);
      return null;
    }
  }

  dispose() {
    this.stratumMeshes.forEach(m => {
      if (m && m.traverse) {
        m.traverse(child => {
          if (child.geometry) {
            child.geometry.dispose();
          }
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
          if (child.material && child.material.map) {
            child.material.map.dispose();
          }
        });
      }
    });
    this.stratumMeshes = [];

    this.sharedMaterials.forEach(mat => {
      mat.dispose();
    });
    this.sharedMaterials.clear();

    this._stratumMeshMap.clear();
    this.loadProgress.clear();
  }
}

window.StratumModelBuilder = StratumModelBuilder;
