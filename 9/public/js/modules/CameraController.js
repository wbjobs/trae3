class CameraController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3(0, 0, 0);
    this.isDragging = false;
    this.isPanning = false;
    this.isAnimating = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.config = AppConfig.camera;
    this.onCameraChange = null;

    this.spherical = {
      radius: this.config.defaultPosition.radius,
      theta: this.config.defaultPosition.theta,
      phi: this.config.defaultPosition.phi,
    };

    this.targetSpherical = { ...this.spherical };
    this.targetLookAt = new THREE.Vector3(0, 0, 0);

    this.init();
  }

  init() {
    this.enforceBounds();
    this.updateCameraPosition();
    this.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.domElement.addEventListener('mouseup', () => this.onMouseUp());
    this.domElement.addEventListener('mouseleave', () => this.onMouseUp());
    this.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    this.domElement.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.domElement.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    this.domElement.addEventListener('touchend', () => this.onTouchEnd());
  }

  enforceBounds() {
    this.spherical.radius = AppConfig.validateDistance(this.spherical.radius);
    this.spherical.phi = AppConfig.validatePolarAngle(this.spherical.phi);

    this.targetSpherical.radius = AppConfig.validateDistance(this.targetSpherical.radius);
    this.targetSpherical.phi = AppConfig.validatePolarAngle(this.targetSpherical.phi);

    const maxTargetOffset = 500;
    this.target.x = CoordConverter.clamp(this.target.x, -maxTargetOffset, maxTargetOffset);
    this.target.y = CoordConverter.clamp(this.target.y, -300, 50);
    this.target.z = CoordConverter.clamp(this.target.z, -maxTargetOffset, maxTargetOffset);
  }

  updateCameraPosition() {
    const x = this.target.x + this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
    const y = this.target.y + this.spherical.radius * Math.cos(this.spherical.phi);
    const z = this.target.z + this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
    if (this.onCameraChange) this.onCameraChange();
  }

  onMouseDown(event) {
    if (this.isAnimating) return;
    if (event.button === 0) {
      this.isDragging = true;
    } else if (event.button === 2) {
      this.isPanning = true;
    }
    this.previousMousePosition = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  }

  onMouseMove(event) {
    if (!this.isDragging && !this.isPanning) return;
    event.preventDefault();

    const deltaX = event.clientX - this.previousMousePosition.x;
    const deltaY = event.clientY - this.previousMousePosition.y;

    if (this.isDragging) {
      this.spherical.theta -= deltaX * this.config.rotateSpeed;
      this.spherical.phi -= deltaY * this.config.rotateSpeed;
      this.enforceBounds();
    } else if (this.isPanning) {
      const panDelta = this.config.panSpeed * Math.max(this.spherical.radius * 0.001, 0.1);
      const right = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      this.camera.getWorldDirection(right);
      right.cross(up).normalize();
      this.target.addScaledVector(right, -deltaX * panDelta);
      this.target.y = CoordConverter.clamp(this.target.y + deltaY * panDelta, -300, 50);
      this.enforceBounds();
    }

    this.previousMousePosition = { x: event.clientX, y: event.clientY };
    this.updateCameraPosition();
  }

  onMouseUp() {
    this.isDragging = false;
    this.isPanning = false;
  }

  onWheel(event) {
    event.preventDefault();
    event.stopPropagation();

    const delta = Math.sign(event.deltaY);
    const zoomFactor = 1 + delta * 0.1;
    const newRadius = this.spherical.radius * zoomFactor;
    const clampedRadius = AppConfig.validateDistance(newRadius);

    if (clampedRadius !== this.spherical.radius) {
      this.spherical.radius = clampedRadius;
      this.updateCameraPosition();
    }
  }

  onTouchStart(event) {
    if (this.isAnimating) return;
    event.preventDefault();

    if (event.touches.length === 1) {
      this.isDragging = true;
      this.previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    } else if (event.touches.length === 2) {
      this.pinchStartDistance = this.getPinchDistance(event.touches);
    }
  }

  onTouchMove(event) {
    event.preventDefault();

    if (event.touches.length === 1 && this.isDragging) {
      const deltaX = event.touches[0].clientX - this.previousMousePosition.x;
      const deltaY = event.touches[0].clientY - this.previousMousePosition.y;

      this.spherical.theta -= deltaX * this.config.rotateSpeed * 1.5;
      this.spherical.phi -= deltaY * this.config.rotateSpeed * 1.5;
      this.enforceBounds();

      this.previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
      this.updateCameraPosition();
    } else if (event.touches.length === 2) {
      const currentDistance = this.getPinchDistance(event.touches);
      if (this.pinchStartDistance) {
        const delta = this.pinchStartDistance - currentDistance;
        const newRadius = this.spherical.radius * (1 + delta * 0.005);
        this.spherical.radius = AppConfig.validateDistance(newRadius);
        this.updateCameraPosition();
      }
      this.pinchStartDistance = currentDistance;
    }
  }

  onTouchEnd() {
    this.isDragging = false;
    this.isPanning = false;
    this.pinchStartDistance = null;
  }

  getPinchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  setTarget(x, y, z) {
    this.target.set(
      CoordConverter.safeNumber(x),
      CoordConverter.safeNumber(y),
      CoordConverter.safeNumber(z)
    );
    this.enforceBounds();
    this.updateCameraPosition();
  }

  reset() {
    this.animateTo({
      target: new THREE.Vector3(0, 0, 0),
      radius: this.config.defaultPosition.radius,
      theta: this.config.defaultPosition.theta,
      phi: this.config.defaultPosition.phi,
    });
  }

  zoomTo(stratumMesh) {
    try {
      const box = new THREE.Box3().setFromObject(stratumMesh);
      if (box.isEmpty()) {
        console.warn('Cannot zoom to empty bounding box');
        return;
      }

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const minDim = Math.max(size.x, size.z);
      const fov = this.camera.fov * (Math.PI / 180);
      let requiredRadius = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

      requiredRadius = AppConfig.validateDistance(requiredRadius * 1.5);

      this.animateTo({
        target: center,
        radius: requiredRadius,
        theta: this.spherical.theta,
        phi: Math.min(Math.max(this.spherical.phi, 0.3), Math.PI / 3),
      });
    } catch (error) {
      console.error('Error in zoomTo:', error);
    }
  }

  animateTo(params, duration = 500) {
    if (this.isAnimating) return;

    this.isAnimating = true;
    this.targetLookAt.copy(params.target || this.target);
    this.targetSpherical = {
      radius: params.radius !== undefined ? AppConfig.validateDistance(params.radius) : this.spherical.radius,
      theta: params.theta !== undefined ? params.theta : this.spherical.theta,
      phi: params.phi !== undefined ? AppConfig.validatePolarAngle(params.phi) : this.spherical.phi,
    };

    const startTarget = this.target.clone();
    const startSpherical = { ...this.spherical };
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = this.easeInOutCubic(progress);

      this.target.lerpVectors(startTarget, this.targetLookAt, easeProgress);
      this.spherical.radius = startSpherical.radius + (this.targetSpherical.radius - startSpherical.radius) * easeProgress;
      this.spherical.theta = this.slerpAngle(startSpherical.theta, this.targetSpherical.theta, easeProgress);
      this.spherical.phi = startSpherical.phi + (this.targetSpherical.phi - startSpherical.phi) * easeProgress;

      this.enforceBounds();
      this.updateCameraPosition();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isAnimating = false;
      }
    };

    requestAnimationFrame(animate);
  }

  slerpAngle(a, b, t) {
    const diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    return a + diff * t;
  }

  easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  frontView() {
    this.animateTo({
      target: this.target,
      theta: 0,
      phi: this.config.minPolarAngle + 0.01,
    });
  }

  topView() {
    this.animateTo({
      target: this.target,
      theta: 0,
      phi: this.config.minPolarAngle,
    });
  }

  sideView() {
    this.animateTo({
      target: this.target,
      theta: Math.PI / 2,
      phi: this.config.minPolarAngle + 0.01,
    });
  }

  update() {
    if (!this.isAnimating) {
      this.updateCameraPosition();
    }
  }
}

window.CameraController = CameraController;
