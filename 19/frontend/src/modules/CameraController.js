import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';

export class CameraController {
  constructor(camera, controls, renderer) {
    this.camera = camera;
    this.controls = controls;
    this.renderer = renderer;
    this.mode = 'rotate';
    
    this.MIN_DISTANCE = 2;
    this.MAX_DISTANCE = 300;
    this.MIN_POLAR_ANGLE = 0.1;
    this.MAX_POLAR_ANGLE = Math.PI / 2 - 0.05;
    
    this.originalSettings = {
      enableRotate: controls.enableRotate,
      enablePan: controls.enablePan,
      enableZoom: controls.enableZoom,
    };
    
    this.tweenGroup = new TWEEN.Group();
  }

  setMode(mode) {
    this.mode = mode;
    
    this.controls.enableRotate = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    
    switch (mode) {
      case 'rotate':
        this.controls.enableRotate = true;
        this.controls.enableZoom = true;
        break;
      case 'pan':
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
        break;
      case 'zoom':
        this.controls.enableZoom = true;
        break;
      default:
        this.controls.enableRotate = true;
        this.controls.enablePan = true;
        this.controls.enableZoom = true;
    }
    
    this.enforceBounds();
  }

  enforceBounds() {
    const position = this.camera.position;
    const target = this.controls.target;
    
    const distance = position.distanceTo(target);
    
    if (distance < this.MIN_DISTANCE) {
      const direction = position.clone().sub(target).normalize();
      position.copy(target.clone().add(direction.multiplyScalar(this.MIN_DISTANCE)));
      this.controls.update();
    } else if (distance > this.MAX_DISTANCE) {
      const direction = position.clone().sub(target).normalize();
      position.copy(target.clone().add(direction.multiplyScalar(this.MAX_DISTANCE)));
      this.controls.update();
    }
    
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(position.clone().sub(target));
    
    if (spherical.phi < this.MIN_POLAR_ANGLE) {
      spherical.phi = this.MIN_POLAR_ANGLE;
      const newPos = new THREE.Vector3().setFromSpherical(spherical).add(target);
      position.copy(newPos);
      this.controls.update();
    } else if (spherical.phi > this.MAX_POLAR_ANGLE) {
      spherical.phi = this.MAX_POLAR_ANGLE;
      const newPos = new THREE.Vector3().setFromSpherical(spherical).add(target);
      position.copy(newPos);
      this.controls.update();
    }
  }

  flyTo(position, target, duration = 1500) {
    const startPosition = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    
    const tween = new TWEEN.Tween({ t: 0 }, this.tweenGroup)
      .to({ t: 1 }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate(({ t }) => {
        this.camera.position.lerpVectors(startPosition, position, t);
        this.controls.target.lerpVectors(startTarget, target, t);
        this.controls.update();
      })
      .onComplete(() => {
        this.enforceBounds();
      });
    
    this.tweenGroup.removeAll();
    tween.start();
  }

  focusOnObject(object3D, distance = 10) {
    const box = new THREE.Box3().setFromObject(object3D);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= distance / 10;
    
    cameraZ = Math.max(this.MIN_DISTANCE, Math.min(this.MAX_DISTANCE, cameraZ));
    
    const cameraPos = new THREE.Vector3(
      center.x + cameraZ * 0.5,
      center.y + cameraZ * 0.5,
      center.z + cameraZ * 0.5
    );
    
    this.flyTo(cameraPos, center);
  }

  frontView() {
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const clampedDistance = Math.max(this.MIN_DISTANCE * 2, Math.min(this.MAX_DISTANCE * 0.7, distance));
    const position = new THREE.Vector3(target.x, target.y, target.z + clampedDistance);
    this.flyTo(position, target);
  }

  backView() {
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const clampedDistance = Math.max(this.MIN_DISTANCE * 2, Math.min(this.MAX_DISTANCE * 0.7, distance));
    const position = new THREE.Vector3(target.x, target.y, target.z - clampedDistance);
    this.flyTo(position, target);
  }

  leftView() {
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const clampedDistance = Math.max(this.MIN_DISTANCE * 2, Math.min(this.MAX_DISTANCE * 0.7, distance));
    const position = new THREE.Vector3(target.x - clampedDistance, target.y, target.z);
    this.flyTo(position, target);
  }

  rightView() {
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const clampedDistance = Math.max(this.MIN_DISTANCE * 2, Math.min(this.MAX_DISTANCE * 0.7, distance));
    const position = new THREE.Vector3(target.x + clampedDistance, target.y, target.z);
    this.flyTo(position, target);
  }

  topView() {
    const target = this.controls.target.clone();
    const distance = this.camera.position.distanceTo(target);
    const clampedDistance = Math.max(this.MIN_DISTANCE * 2, Math.min(this.MAX_DISTANCE * 0.7, distance));
    const position = new THREE.Vector3(target.x, target.y + clampedDistance, target.z);
    this.flyTo(position, target);
  }

  resetView() {
    const position = new THREE.Vector3(60, 60, 60);
    const target = new THREE.Vector3(0, -5, 0);
    this.flyTo(position, target);
  }

  zoomIn(amount = 1) {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    const newDistance = Math.max(this.MIN_DISTANCE, currentDistance - amount * 5);
    
    const newPosition = this.controls.target.clone().add(direction.multiplyScalar(newDistance));
    this.flyTo(newPosition, this.controls.target, 300);
  }

  zoomOut(amount = 1) {
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    const newDistance = Math.min(this.MAX_DISTANCE, currentDistance + amount * 5);
    
    const newPosition = this.controls.target.clone().add(direction.multiplyScalar(newDistance));
    this.flyTo(newPosition, this.controls.target, 300);
  }

  setZoomSpeed(speed) {
    this.controls.zoomSpeed = Math.max(0.1, Math.min(5, speed));
  }

  setRotateSpeed(speed) {
    this.controls.rotateSpeed = Math.max(0.1, Math.min(5, speed));
  }

  setPanSpeed(speed) {
    this.controls.panSpeed = Math.max(0.1, Math.min(5, speed));
  }

  setMinDistance(distance) {
    this.MIN_DISTANCE = Math.max(0.1, distance);
    this.controls.minDistance = this.MIN_DISTANCE;
    this.enforceBounds();
  }

  setMaxDistance(distance) {
    this.MAX_DISTANCE = Math.max(this.MIN_DISTANCE + 1, distance);
    this.controls.maxDistance = this.MAX_DISTANCE;
    this.enforceBounds();
  }

  update() {
    this.tweenGroup.update();
    this.enforceBounds();
  }

  dispose() {
    this.tweenGroup.removeAll();
  }
}
