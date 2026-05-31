class SectionSlicer {
  constructor(sceneRenderer) {
    this.sceneRenderer = sceneRenderer;
    this.scene = sceneRenderer.scene;

    this.planes = {
      x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 200),
      y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 200),
      z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 200),
    };

    this.planeState = {
      x: { enabled: false, position: 200, flipped: false },
      y: { enabled: false, position: 200, flipped: false },
      z: { enabled: false, position: 200, flipped: false },
    };

    this.planeColors = {
      x: 0xff0000,
      y: 0x00ff00,
      z: 0x0000ff,
    };

    this.planeHelpers = { x: null, y: null, z: null };
    this.sceneBounds = { minX: -200, maxX: 200, minY: -200, maxY: 200, minZ: -200, maxZ: 200 };
    this.helperGroup = new THREE.Group();
    this.helperGroup.userData = { type: 'section_slicer_helpers' };
    this.scene.add(this.helperGroup);
  }

  calculateSceneBounds() {
    const meshes = this.sceneRenderer.strataMeshes;
    if (!meshes || meshes.length === 0) {
      this.sceneBounds = { minX: -200, maxX: 200, minY: -200, maxY: 200, minZ: -200, maxZ: 200 };
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    meshes.forEach(group => {
      if (!group) return;
      group.traverse(child => {
        if (child.isMesh && child.geometry) {
          if (!child.geometry.boundingBox) {
            child.geometry.computeBoundingBox();
          }
          const box = child.geometry.boundingBox.clone();
          box.applyMatrix4(child.matrixWorld);
          minX = Math.min(minX, box.min.x);
          maxX = Math.max(maxX, box.max.x);
          minY = Math.min(minY, box.min.y);
          maxY = Math.max(maxY, box.max.y);
          minZ = Math.min(minZ, box.min.z);
          maxZ = Math.max(maxZ, box.max.z);
        }
      });
    });

    if (minX === Infinity) {
      this.sceneBounds = { minX: -200, maxX: 200, minY: -200, maxY: 200, minZ: -200, maxZ: 200 };
      return;
    }

    const padding = 10;
    this.sceneBounds = {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding,
      minZ: minZ - padding,
      maxZ: maxZ + padding,
    };
  }

  createPlaneHelper(axis) {
    this.removePlaneHelper(axis);

    const state = this.planeState[axis];
    const color = this.planeColors[axis];
    const b = this.sceneBounds;

    let width, height;
    let geometry;

    if (axis === 'x') {
      width = b.maxZ - b.minZ;
      height = b.maxY - b.minY;
      geometry = new THREE.PlaneGeometry(width, height);
    } else if (axis === 'y') {
      width = b.maxX - b.minX;
      height = b.maxZ - b.minZ;
      geometry = new THREE.PlaneGeometry(width, height);
    } else {
      width = b.maxX - b.minX;
      height = b.maxY - b.minY;
      geometry = new THREE.PlaneGeometry(width, height);
    }

    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { type: 'clipping_plane_helper', axis: axis };

    const center = {
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      z: (b.minZ + b.maxZ) / 2,
    };

    if (axis === 'x') {
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(state.position, center.y, center.z);
    } else if (axis === 'y') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(center.x, state.position, center.z);
    } else {
      mesh.position.set(center.x, center.y, state.position);
    }

    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.6,
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);

    this.planeHelpers[axis] = mesh;
    this.helperGroup.add(mesh);
  }

  removePlaneHelper(axis) {
    const helper = this.planeHelpers[axis];
    if (helper) {
      this.helperGroup.remove(helper);
      helper.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.planeHelpers[axis] = null;
    }
  }

  updatePlaneHelper(axis) {
    const state = this.planeState[axis];
    if (!state.enabled) {
      this.removePlaneHelper(axis);
      return;
    }
    this.createPlaneHelper(axis);
  }

  updatePlaneFromState(axis) {
    const state = this.planeState[axis];
    const plane = this.planes[axis];

    if (axis === 'x') {
      plane.normal.set(state.flipped ? 1 : -1, 0, 0);
    } else if (axis === 'y') {
      plane.normal.set(0, state.flipped ? 1 : -1, 0);
    } else {
      plane.normal.set(0, 0, state.flipped ? 1 : -1);
    }
    plane.constant = state.position;
  }

  syncClippingPlanes() {
    const activePlanes = this.getActivePlanes();
    this.sceneRenderer.setClippingPlanes(activePlanes);
  }

  setPlanePosition(axis, value) {
    if (!this.planeState[axis]) return;
    const numericValue = CoordConverter.safeNumber(value, 0);
    this.planeState[axis].position = numericValue;
    this.updatePlaneFromState(axis);
    this.updatePlaneHelper(axis);
    this.syncClippingPlanes();
    this.sceneRenderer.markDirty();
  }

  togglePlane(axis, enabled) {
    if (!this.planeState[axis]) return;
    this.planeState[axis].enabled = enabled;
    this.updatePlaneFromState(axis);
    this.updatePlaneHelper(axis);
    this.syncClippingPlanes();
    this.sceneRenderer.markDirty();
  }

  flipPlane(axis) {
    if (!this.planeState[axis]) return;
    this.planeState[axis].flipped = !this.planeState[axis].flipped;
    this.updatePlaneFromState(axis);
    this.updatePlaneHelper(axis);
    this.syncClippingPlanes();
    this.sceneRenderer.markDirty();
  }

  resetPlanes() {
    const axes = ['x', 'y', 'z'];
    axes.forEach(axis => {
      this.planeState[axis].enabled = false;
      this.planeState[axis].position = 200;
      this.planeState[axis].flipped = false;
      this.updatePlaneFromState(axis);
      this.removePlaneHelper(axis);
    });
    this.syncClippingPlanes();
    this.sceneRenderer.markDirty();
  }

  getActivePlanes() {
    const activePlanes = [];
    const axes = ['x', 'y', 'z'];
    axes.forEach(axis => {
      if (this.planeState[axis].enabled) {
        activePlanes.push(this.planes[axis]);
      }
    });
    return activePlanes;
  }

  exportSliceData() {
    this.calculateSceneBounds();
    const result = [];
    const meshes = this.sceneRenderer.strataMeshes;
    const activeAxes = ['x', 'y', 'z'].filter(axis => this.planeState[axis].enabled);

    if (activeAxes.length === 0 || !meshes || meshes.length === 0) {
      return { planes: activeAxes.map(axis => ({
        axis: axis,
        position: this.planeState[axis].position,
        flipped: this.planeState[axis].flipped,
      })), intersections: result };
    }

    meshes.forEach(group => {
      if (!group || !group.userData) return;

      let groupBox = null;
      group.traverse(child => {
        if (child.isMesh && child.geometry) {
          if (!child.geometry.boundingBox) {
            child.geometry.computeBoundingBox();
          }
          const box = child.geometry.boundingBox.clone();
          box.applyMatrix4(child.matrixWorld);
          if (!groupBox) {
            groupBox = box.clone();
          } else {
            groupBox.union(box);
          }
        }
      });

      if (!groupBox) return;

      let intersectsAll = true;
      const intersectionBounds = {};

      activeAxes.forEach(axis => {
        const state = this.planeState[axis];
        const planePos = state.position;

        let meshMin, meshMax;
        if (axis === 'x') {
          meshMin = groupBox.min.x;
          meshMax = groupBox.max.x;
        } else if (axis === 'y') {
          meshMin = groupBox.min.y;
          meshMax = groupBox.max.y;
        } else {
          meshMin = groupBox.min.z;
          meshMax = groupBox.max.z;
        }

        const planeIntersectsMesh = planePos >= meshMin && planePos <= meshMax;
        if (!planeIntersectsMesh) {
          intersectsAll = false;
        }

        const clippedMin = state.flipped ? Math.max(meshMin, planePos) : meshMin;
        const clippedMax = state.flipped ? meshMax : Math.min(meshMax, planePos);

        intersectionBounds[axis] = {
          meshMin: meshMin,
          meshMax: meshMax,
          planePosition: planePos,
          clippedMin: clippedMin,
          clippedMax: clippedMax,
          intersects: planeIntersectsMesh,
        };
      });

      if (intersectsAll) {
        const stratumId = group.userData.stratumId || 'unknown';
        const stratumName = group.userData.stratumData
          ? group.userData.stratumData.name || 'unknown'
          : 'unknown';
        result.push({
          stratumId: stratumId,
          stratumName: stratumName,
          boundingBox: {
            min: { x: groupBox.min.x, y: groupBox.min.y, z: groupBox.min.z },
            max: { x: groupBox.max.x, y: groupBox.max.y, z: groupBox.max.z },
          },
          intersectionBounds: intersectionBounds,
        });
      }
    });

    return {
      planes: activeAxes.map(axis => ({
        axis: axis,
        position: this.planeState[axis].position,
        flipped: this.planeState[axis].flipped,
      })),
      intersections: result,
    };
  }

  dispose() {
    ['x', 'y', 'z'].forEach(axis => {
      this.removePlaneHelper(axis);
    });
    this.scene.remove(this.helperGroup);
    this.syncClippingPlanes();
    this.sceneRenderer.markDirty();
  }
}

window.SectionSlicer = SectionSlicer;
