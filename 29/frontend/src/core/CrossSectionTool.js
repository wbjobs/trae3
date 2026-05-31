import * as THREE from 'three';
import { EventDispatcher } from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class CrossSectionTool extends EventDispatcher {
  constructor(scene, camera, domElement, options = {}) {
    super();

    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;

    this.options = {
      planeColor: 0x00ffff,
      planeOpacity: 0.2,
      sectionLineColor: 0xff0000,
      sectionLineWidth: 2,
      fillColor: 0x00ff00,
      fillOpacity: 0.3,
      gridSize: 100,
      gridDivisions: 20,
      moveSpeed: 1,
      rotateSpeed: 0.01,
      showGrid: true,
      showFill: true,
      showLabels: true,
      clippedOpacity: 0.3,
      designDiameter: null,
      ...options
    };

    this.planes = new Map();
    this.registeredObjects = [];
    this.sectionResults = new Map();
    this.originalMaterials = new WeakMap();
    this.clippedObjects = new WeakSet();

    this.interactionEnabled = false;
    this.activePlaneId = null;
    this.isDragging = false;
    this.isRotating = false;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragPlane = new THREE.Plane();
    this.dragOffset = new THREE.Vector3();

    this.keys = {
      w: false,
      s: false,
      a: false,
      d: false,
      q: false,
      e: false,
      shift: false
    };

    this._planeIdCounter = 0;
    this._animationFrameId = null;

    this._bindEvents();
  }

  _bindEvents() {
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._animate = this._animate.bind(this);

    this.domElement.addEventListener('mousedown', this._onMouseDown);
    this.domElement.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);

    this._startAnimation();
  }

  _unbindEvents() {
    this.domElement.removeEventListener('mousedown', this._onMouseDown);
    this.domElement.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }

  _startAnimation() {
    const animate = () => {
      this._animationFrameId = requestAnimationFrame(animate);
      this._animate();
    };
    animate();
  }

  _stopAnimation() {
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
  }

  _animate() {
    if (!this.interactionEnabled || !this.activePlaneId) return;

    const planeData = this.planes.get(this.activePlaneId);
    if (!planeData) return;

    const speed = this.options.moveSpeed * (this.keys.shift ? 5 : 1);
    const normal = planeData.plane.normal.clone();
    const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, normal).normalize();

    let moved = false;
    const position = planeData.position.clone();

    if (this.keys.w) {
      position.add(up.multiplyScalar(speed));
      moved = true;
    }
    if (this.keys.s) {
      position.add(up.multiplyScalar(-speed));
      moved = true;
    }
    if (this.keys.a) {
      position.add(right.multiplyScalar(-speed));
      moved = true;
    }
    if (this.keys.d) {
      position.add(right.multiplyScalar(speed));
      moved = true;
    }
    if (this.keys.q) {
      position.add(normal.multiplyScalar(-speed));
      moved = true;
    }
    if (this.keys.e) {
      position.add(normal.multiplyScalar(speed));
      moved = true;
    }

    if (moved) {
      this.updatePlane(this.activePlaneId, position, planeData.plane.normal);
    }
  }

  _onMouseDown(event) {
    if (!this.interactionEnabled || event.button !== 0) return;

    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const planeMeshes = Array.from(this.planes.values()).map(p => p.mesh);
    const intersects = this.raycaster.intersectObjects(planeMeshes);

    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object;
      const planeData = Array.from(this.planes.values()).find(p => p.mesh === clickedMesh);

      if (planeData) {
        this.activePlaneId = planeData.id;
        this.isDragging = !event.ctrlKey;
        this.isRotating = event.ctrlKey;

        if (this.isDragging) {
          this.dragPlane.copy(planeData.plane);
          this.dragOffset.copy(intersects[0].point).sub(planeData.position);
        }

        event.preventDefault();
      }
    }
  }

  _onMouseMove(event) {
    if (!this.interactionEnabled || !this.activePlaneId) return;

    const planeData = this.planes.get(this.activePlaneId);
    if (!planeData) return;

    this._updateMouse(event);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.isDragging) {
      const intersectionPoint = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.dragPlane, intersectionPoint);

      if (intersectionPoint) {
        const newPosition = intersectionPoint.sub(this.dragOffset);
        this.updatePlane(this.activePlaneId, newPosition, planeData.plane.normal);
      }
    } else if (this.isRotating) {
      const deltaX = event.movementX * this.options.rotateSpeed;
      const deltaY = event.movementY * this.options.rotateSpeed;

      const normal = planeData.plane.normal.clone();
      const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, normal).normalize();

      const quaternion = new THREE.Quaternion();
      quaternion.setFromAxisAngle(up, deltaX);
      quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(right, deltaY));

      const newNormal = normal.clone().applyQuaternion(quaternion).normalize();
      this.updatePlane(this.activePlaneId, planeData.position, newNormal);
    }
  }

  _onMouseUp() {
    this.isDragging = false;
    this.isRotating = false;
  }

  _onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key in this.keys) {
      this.keys[key] = true;
    }
    if (event.shiftKey) {
      this.keys.shift = true;
    }
  }

  _onKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in this.keys) {
      this.keys[key] = false;
    }
    if (!event.shiftKey) {
      this.keys.shift = false;
    }
  }

  _updateMouse(event) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _generateId() {
    return `plane_${++this._planeIdCounter}`;
  }

  createPlane(options = {}) {
    const {
      normal = new THREE.Vector3(1, 0, 0),
      position = new THREE.Vector3(0, 0, 0),
      color = this.options.planeColor
    } = options;

    const id = this._generateId();
    const planeNormal = new THREE.Vector3().copy(normal).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, position);

    const planeMesh = this._createPlaneMesh(plane, position, color);
    const gridHelper = this._createGridHelper(plane, position, color);

    const planeData = {
      id,
      plane,
      position: position.clone(),
      normal: planeNormal.clone(),
      mesh: planeMesh,
      gridHelper,
      color,
      sections: new Map()
    };

    this.planes.set(id, planeData);
    this.scene.add(planeMesh);
    if (gridHelper) this.scene.add(gridHelper);

    this.dispatchEvent({
      type: 'planeCreated',
      planeId: id,
      planeData
    });

    if (this.registeredObjects.length > 0) {
      this.intersectAll(id);
    }

    return id;
  }

  _createPlaneMesh(plane, position, color) {
    const size = this.options.gridSize;
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: this.options.planeOpacity,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.lookAt(position.clone().add(plane.normal));
    mesh.userData.isCrossSectionPlane = true;

    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 });
    const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
    mesh.add(edgeLines);

    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, size * 0.5),
      size * 0.1,
      color,
      size * 0.05,
      size * 0.03
    );
    mesh.add(arrowHelper);

    return mesh;
  }

  _createGridHelper(plane, position, color) {
    if (!this.options.showGrid) return null;

    const size = this.options.gridSize;
    const divisions = this.options.gridDivisions;
    const gridHelper = new THREE.GridHelper(size, divisions, color, color);
    gridHelper.position.copy(position);
    gridHelper.lookAt(position.clone().add(plane.normal));
    gridHelper.rotateX(Math.PI / 2);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.3;

    return gridHelper;
  }

  removePlane(planeId) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return;

    this._clearPlaneSections(planeId);

    this.scene.remove(planeData.mesh);
    planeData.mesh.geometry?.dispose();
    planeData.mesh.material?.dispose();

    if (planeData.gridHelper) {
      this.scene.remove(planeData.gridHelper);
      planeData.gridHelper.geometry?.dispose();
      planeData.gridHelper.material?.dispose();
    }

    this.planes.delete(planeId);
    this.sectionResults.delete(planeId);

    if (this.activePlaneId === planeId) {
      this.activePlaneId = null;
    }
  }

  _clearPlaneSections(planeId) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return;

    planeData.sections.forEach((section, objectId) => {
      if (section.line) {
        this.scene.remove(section.line);
        section.line.geometry?.dispose();
        section.line.material?.dispose();
      }
      if (section.fill) {
        this.scene.remove(section.fill);
        section.fill.geometry?.dispose();
        section.fill.material?.dispose();
      }
      if (section.label) {
        this.scene.remove(section.label);
      }
    });

    planeData.sections.clear();

    this.registeredObjects.forEach(obj => {
      this._restoreObjectMaterial(obj);
    });
  }

  updatePlane(planeId, position, normal) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return;

    planeData.position.copy(position);
    planeData.normal.copy(normal).normalize();
    planeData.plane.setFromNormalAndCoplanarPoint(planeData.normal, planeData.position);

    planeData.mesh.position.copy(position);
    planeData.mesh.lookAt(position.clone().add(planeData.normal));

    if (planeData.gridHelper) {
      planeData.gridHelper.position.copy(position);
      planeData.gridHelper.lookAt(position.clone().add(planeData.normal));
      planeData.gridHelper.rotateX(Math.PI / 2);
    }

    if (this.isDragging) {
      this.dragPlane.copy(planeData.plane);
    }

    this.dispatchEvent({
      type: 'planeUpdated',
      planeId,
      planeData
    });

    if (this.registeredObjects.length > 0) {
      this.intersectAll(planeId);
    }
  }

  registerObject(object) {
    if (!this.registeredObjects.includes(object)) {
      this.registeredObjects.push(object);
    }
  }

  unregisterObject(object) {
    const index = this.registeredObjects.indexOf(object);
    if (index > -1) {
      this.registeredObjects.splice(index, 1);
      this._restoreObjectMaterial(object);
    }
  }

  intersectObject(object, planeId) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return null;

    const sectionData = this.calculateSectionData(object, planeId);
    if (!sectionData || sectionData.points.length < 3) return null;

    this._createSectionVisualization(object, planeId, sectionData);
    this._applyClipping(object, planeId);

    return sectionData;
  }

  intersectAll(planeId) {
    const results = [];
    this.registeredObjects.forEach(object => {
      const result = this.intersectObject(object, planeId);
      if (result) {
        results.push({ object, result });
      }
    });
    return results;
  }

  _applyClipping(object, planeId) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return;

    object.traverse((child) => {
      if (child.isMesh && child.material) {
        if (!this.originalMaterials.has(child)) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          this.originalMaterials.set(child, materials.map(m => ({
            transparent: m.transparent,
            opacity: m.opacity,
            clippingPlanes: m.clippingPlanes ? [...m.clippingPlanes] : []
          })));
        }

        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(m => {
          m.transparent = true;
          m.opacity = this.options.clippedOpacity;
          m.clippingPlanes = [planeData.plane];
          m.clipShadows = true;
          m.side = THREE.DoubleSide;
        });

        this.clippedObjects.add(child);
      }
    });
  }

  _restoreObjectMaterial(object) {
    object.traverse((child) => {
      if (child.isMesh && this.originalMaterials.has(child)) {
        const originalProps = this.originalMaterials.get(child);
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((m, i) => {
          const props = originalProps[i];
          if (props) {
            m.transparent = props.transparent;
            m.opacity = props.opacity;
            m.clippingPlanes = props.clippingPlanes;
            m.clipShadows = false;
            m.side = THREE.FrontSide;
          }
        });

        this.clippedObjects.delete(child);
      }
    });
  }

  calculateSectionData(object, planeId) {
    const planeData = this.planes.get(planeId);
    if (!planeData) return null;

    const intersectionPoints = this._getIntersectionPoints(object, planeData.plane);
    if (intersectionPoints.length < 3) {
      return {
        area: 0,
        perimeter: 0,
        centroid: new THREE.Vector3(),
        points: intersectionPoints,
        equivalentDiameter: 0,
        deformation: 0,
        planeId,
        objectId: object.id,
        objectName: object.name
      };
    }

    const orderedPoints = this._orderPointsClockwise(intersectionPoints, planeData.plane.normal);
    const area = this._calculatePolygonArea(orderedPoints, planeData.plane.normal);
    const perimeter = this._calculatePolygonPerimeter(orderedPoints);
    const centroid = this._calculatePolygonCentroid(orderedPoints);
    const equivalentDiameter = Math.sqrt((4 * area) / Math.PI);
    const deformation = this.options.designDiameter
      ? ((equivalentDiameter - this.options.designDiameter) / this.options.designDiameter) * 100
      : 0;

    const sectionData = {
      area,
      perimeter,
      centroid,
      points: orderedPoints,
      equivalentDiameter,
      deformation,
      planeId,
      objectId: object.id,
      objectName: object.name,
      planePosition: planeData.position.clone(),
      planeNormal: planeData.normal.clone(),
      timestamp: Date.now()
    };

    if (!this.sectionResults.has(planeId)) {
      this.sectionResults.set(planeId, new Map());
    }
    this.sectionResults.get(planeId).set(object.id, sectionData);

    this.dispatchEvent({
      type: 'sectionCalculated',
      planeId,
      objectId: object.id,
      sectionData
    });

    return sectionData;
  }

  _getIntersectionPoints(object, plane) {
    const allPoints = [];
    const worldMatrix = object.matrixWorld;

    object.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;

      const geometry = child.geometry;
      const positionAttribute = geometry.getAttribute('position');
      if (!positionAttribute) return;

      const index = geometry.index;
      const localPlane = plane.clone().applyMatrix4(worldMatrix.clone().invert());

      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const ia = index.getX(i);
          const ib = index.getX(i + 1);
          const ic = index.getX(i + 2);
          this._intersectTriangle(localPlane, positionAttribute, ia, ib, ic, allPoints);
        }
      } else {
        for (let i = 0; i < positionAttribute.count; i += 3) {
          this._intersectTriangle(localPlane, positionAttribute, i, i + 1, i + 2, allPoints);
        }
      }
    });

    const uniquePoints = this._removeDuplicatePoints(allPoints);
    return uniquePoints.map(p => p.applyMatrix4(worldMatrix));
  }

  _intersectTriangle(plane, positionAttribute, ia, ib, ic, points) {
    const v0 = new THREE.Vector3(
      positionAttribute.getX(ia),
      positionAttribute.getY(ia),
      positionAttribute.getZ(ia)
    );
    const v1 = new THREE.Vector3(
      positionAttribute.getX(ib),
      positionAttribute.getY(ib),
      positionAttribute.getZ(ib)
    );
    const v2 = new THREE.Vector3(
      positionAttribute.getX(ic),
      positionAttribute.getY(ic),
      positionAttribute.getZ(ic)
    );

    const d0 = plane.distanceToPoint(v0);
    const d1 = plane.distanceToPoint(v1);
    const d2 = plane.distanceToPoint(v2);

    const intersect = (p0, p1, dA, dB) => {
      if (Math.abs(dA - dB) < 1e-6) return null;
      const t = -dA / (dB - dA);
      if (t < 0 || t > 1) return null;
      return new THREE.Vector3().lerpVectors(p0, p1, t);
    };

    const intersections = [];

    if (d0 * d1 < 0) {
      const p = intersect(v0, v1, d0, d1);
      if (p) intersections.push(p);
    }
    if (d1 * d2 < 0) {
      const p = intersect(v1, v2, d1, d2);
      if (p) intersections.push(p);
    }
    if (d2 * d0 < 0) {
      const p = intersect(v2, v0, d2, d0);
      if (p) intersections.push(p);
    }

    if (intersections.length === 2) {
      points.push(intersections[0], intersections[1]);
    } else if (intersections.length === 1) {
      if (Math.abs(d0) < 1e-6) points.push(v0.clone());
      if (Math.abs(d1) < 1e-6) points.push(v1.clone());
      if (Math.abs(d2) < 1e-6) points.push(v2.clone());
    }
  }

  _removeDuplicatePoints(points, tolerance = 0.001) {
    const unique = [];
    points.forEach(p => {
      const exists = unique.some(up => up.distanceTo(p) < tolerance);
      if (!exists) unique.push(p);
    });
    return unique;
  }

  _orderPointsClockwise(points, normal) {
    if (points.length < 3) return points;

    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);

    const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) {
      right.crossVectors(normal, new THREE.Vector3(1, 0, 0));
    }
    right.normalize();

    const up = new THREE.Vector3().crossVectors(right, normal).normalize();

    const angles = points.map((p, i) => {
      const toPoint = new THREE.Vector3().subVectors(p, centroid);
      const x = toPoint.dot(right);
      const y = toPoint.dot(up);
      const angle = Math.atan2(y, x);
      return { point: p, angle, index: i };
    });

    angles.sort((a, b) => b.angle - a.angle);
    return angles.map(a => a.point);
  }

  _calculatePolygonArea(points, normal) {
    if (points.length < 3) return 0;

    let area = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const v1 = points[i];
      const v2 = points[(i + 1) % n];
      const cross = new THREE.Vector3().crossVectors(v1, v2);
      area += cross.dot(normal);
    }

    return Math.abs(area) * 0.5;
  }

  _calculatePolygonPerimeter(points) {
    if (points.length < 2) return 0;

    let perimeter = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      perimeter += points[i].distanceTo(points[(i + 1) % n]);
    }

    return perimeter;
  }

  _calculatePolygonCentroid(points) {
    if (points.length === 0) return new THREE.Vector3();

    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);

    return centroid;
  }

  _createSectionVisualization(object, planeId, sectionData) {
    const planeData = this.planes.get(planeId);
    if (!planeData || sectionData.points.length < 3) return;

    const existingSection = planeData.sections.get(object.id);
    if (existingSection) {
      if (existingSection.line) {
        this.scene.remove(existingSection.line);
        existingSection.line.geometry?.dispose();
        existingSection.line.material?.dispose();
      }
      if (existingSection.fill) {
        this.scene.remove(existingSection.fill);
        existingSection.fill.geometry?.dispose();
        existingSection.fill.material?.dispose();
      }
      if (existingSection.label) {
        this.scene.remove(existingSection.label);
      }
    }

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      ...sectionData.points,
      sectionData.points[0]
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: this.options.sectionLineColor,
      linewidth: this.options.sectionLineWidth,
      transparent: true,
      opacity: 0.9
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.userData.isSectionLine = true;

    let fill = null;
    if (this.options.showFill) {
      try {
        const shape = this._createShapeFromPoints(sectionData.points, planeData.plane.normal);
        const fillGeometry = new THREE.ShapeGeometry(shape);
        const fillMaterial = new THREE.MeshBasicMaterial({
          color: this.options.fillColor,
          transparent: true,
          opacity: this.options.fillOpacity,
          side: THREE.DoubleSide,
          depthWrite: false
        });
        fill = new THREE.Mesh(fillGeometry, fillMaterial);
        fill.userData.isSectionFill = true;
      } catch (e) {
        console.warn('Failed to create section fill:', e);
      }
    }

    let label = null;
    if (this.options.showLabels) {
      label = this._createSectionLabel(sectionData);
    }

    this.scene.add(line);
    if (fill) this.scene.add(fill);
    if (label) this.scene.add(label);

    planeData.sections.set(object.id, { line, fill, label, sectionData });
  }

  _createShapeFromPoints(points, normal) {
    const shape = new THREE.Shape();

    const centroid = new THREE.Vector3();
    points.forEach(p => centroid.add(p));
    centroid.divideScalar(points.length);

    const right = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 1e-6) {
      right.crossVectors(normal, new THREE.Vector3(1, 0, 0));
    }
    right.normalize();

    const up = new THREE.Vector3().crossVectors(right, normal).normalize();

    const projectedPoints = points.map(p => {
      const toPoint = new THREE.Vector3().subVectors(p, centroid);
      return {
        x: toPoint.dot(right),
        y: toPoint.dot(up)
      };
    });

    shape.moveTo(projectedPoints[0].x, projectedPoints[0].y);
    for (let i = 1; i < projectedPoints.length; i++) {
      shape.lineTo(projectedPoints[i].x, projectedPoints[i].y);
    }
    shape.closePath();

    shape.translate(centroid.x, centroid.y);

    return shape;
  }

  _createSectionLabel(sectionData) {
    const div = document.createElement('div');
    div.style.cssText = `
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: Arial, sans-serif;
      border: 1px solid ${this.options.planeColor.toString(16).padStart(6, '0')};
      pointer-events: none;
      white-space: nowrap;
    `;

    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px; color: #${this.options.planeColor.toString(16).padStart(6, '0')}">
        ${sectionData.objectName || '截面分析'}
      </div>
      <div>面积: ${sectionData.area.toFixed(2)} m²</div>
      <div>周长: ${sectionData.perimeter.toFixed(2)} m</div>
      <div>等效直径: ${sectionData.equivalentDiameter.toFixed(2)} m</div>
      ${this.options.designDiameter ? `<div>变形率: ${sectionData.deformation.toFixed(2)}%</div>` : ''}
    `;

    const label = new CSS2DObject(div);
    label.position.copy(sectionData.centroid);

    return label;
  }

  autoGenerateSections(object, count, axis = 'x') {
    if (!object || count < 2) return [];

    const box = new THREE.Box3().setFromObject(object);
    const min = box.min;
    const max = box.max;

    const axisMap = {
      x: { component: 'x', normal: new THREE.Vector3(1, 0, 0) },
      y: { component: 'y', normal: new THREE.Vector3(0, 1, 0) },
      z: { component: 'z', normal: new THREE.Vector3(0, 0, 1) }
    };

    const axisConfig = axisMap[axis.toLowerCase()] || axisMap.x;
    const start = min[axisConfig.component];
    const end = max[axisConfig.component];
    const step = (end - start) / (count - 1);

    const planeIds = [];
    for (let i = 0; i < count; i++) {
      const position = new THREE.Vector3();
      position[axisConfig.component] = start + step * i;

      const center = box.getCenter(new THREE.Vector3());
      position.x = position.x || center.x;
      position.y = position.y || center.y;
      position.z = position.z || center.z;

      const planeId = this.createPlane({
        normal: axisConfig.normal.clone(),
        position
      });

      planeIds.push(planeId);
      this.intersectObject(object, planeId);
    }

    return planeIds;
  }

  exportSectionData(format = 'json') {
    const allData = [];

    this.sectionResults.forEach((objectMap, planeId) => {
      const planeData = this.planes.get(planeId);
      objectMap.forEach((sectionData, objectId) => {
        allData.push({
          planeId,
          planePosition: {
            x: sectionData.planePosition.x,
            y: sectionData.planePosition.y,
            z: sectionData.planePosition.z
          },
          planeNormal: {
            x: sectionData.planeNormal.x,
            y: sectionData.planeNormal.y,
            z: sectionData.planeNormal.z
          },
          objectId,
          objectName: sectionData.objectName,
          area: sectionData.area,
          perimeter: sectionData.perimeter,
          equivalentDiameter: sectionData.equivalentDiameter,
          deformation: sectionData.deformation,
          centroid: {
            x: sectionData.centroid.x,
            y: sectionData.centroid.y,
            z: sectionData.centroid.z
          },
          points: sectionData.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
          timestamp: sectionData.timestamp
        });
      });
    });

    if (format.toLowerCase() === 'csv') {
      return this._convertToCSV(allData);
    }

    return JSON.stringify(allData, null, 2);
  }

  _convertToCSV(data) {
    if (data.length === 0) return '';

    const headers = [
      'planeId',
      'planePosition.x',
      'planePosition.y',
      'planePosition.z',
      'planeNormal.x',
      'planeNormal.y',
      'planeNormal.z',
      'objectId',
      'objectName',
      'area',
      'perimeter',
      'equivalentDiameter',
      'deformation',
      'centroid.x',
      'centroid.y',
      'centroid.z',
      'timestamp'
    ];

    const rows = data.map(item => [
      item.planeId,
      item.planePosition.x,
      item.planePosition.y,
      item.planePosition.z,
      item.planeNormal.x,
      item.planeNormal.y,
      item.planeNormal.z,
      item.objectId,
      `"${item.objectName || ''}"`,
      item.area,
      item.perimeter,
      item.equivalentDiameter,
      item.deformation,
      item.centroid.x,
      item.centroid.y,
      item.centroid.z,
      item.timestamp
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  enableInteraction(enabled) {
    this.interactionEnabled = enabled;

    if (!enabled) {
      this.isDragging = false;
      this.isRotating = false;
    }
  }

  setActivePlane(planeId) {
    if (this.planes.has(planeId)) {
      this.activePlaneId = planeId;
    }
  }

  getActivePlane() {
    return this.activePlaneId;
  }

  getPlane(planeId) {
    return this.planes.get(planeId) || null;
  }

  getAllPlanes() {
    return Array.from(this.planes.values());
  }

  getSectionData(planeId, objectId) {
    const planeResults = this.sectionResults.get(planeId);
    if (!planeResults) return null;
    return planeResults.get(objectId) || null;
  }

  getAllSectionData() {
    const result = [];
    this.sectionResults.forEach((objectMap) => {
      objectMap.forEach((data) => result.push(data));
    });
    return result;
  }

  setDesignDiameter(diameter) {
    this.options.designDiameter = diameter;
  }

  setOption(key, value) {
    if (key in this.options) {
      this.options[key] = value;
    }
  }

  measureDistance(planeId1, planeId2) {
    const plane1 = this.planes.get(planeId1);
    const plane2 = this.planes.get(planeId2);

    if (!plane1 || !plane2) return 0;

    const direction = plane1.normal.clone().normalize();
    const distanceVector = new THREE.Vector3().subVectors(plane2.position, plane1.position);
    return Math.abs(distanceVector.dot(direction));
  }

  clearAll() {
    this.planes.forEach((_, planeId) => this.removePlane(planeId));
    this.sectionResults.clear();
    this.activePlaneId = null;
  }

  dispose() {
    this._stopAnimation();
    this._unbindEvents();
    this.clearAll();

    this.originalMaterials = new WeakMap();
    this.clippedObjects = new WeakSet();
    this.registeredObjects = [];
  }
}

export default CrossSectionTool;
