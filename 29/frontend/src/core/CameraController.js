import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as TWEEN from '@tweenjs/tween.js';

export class CameraController {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.options = {
      minDistance: 20,
      maxDistance: 3000,
      minPolarAngle: 0.1,
      maxPolarAngle: Math.PI / 2 - 0.01,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      enableDamping: true,
      dampingFactor: 0.05,
      zoomSpeed: 0.8,
      rotateSpeed: 0.5,
      panSpeed: 0.8,
      collisionDetectionEnabled: false,
      ...options
    };

    this.controls = null;
    this.savedStates = new Map();
    this.currentView = 'perspective';

    this.viewPresets = {
      top: {
        position: new THREE.Vector3(0, 500, 0),
        target: new THREE.Vector3(0, 0, 0),
        up: new THREE.Vector3(0, 0, -1)
      },
      front: {
        position: new THREE.Vector3(0, 0, 500),
        target: new THREE.Vector3(0, 0, 0),
        up: new THREE.Vector3(0, 1, 0)
      },
      side: {
        position: new THREE.Vector3(500, 0, 0),
        target: new THREE.Vector3(0, 0, 0),
        up: new THREE.Vector3(0, 1, 0)
      },
      perspective: {
        position: new THREE.Vector3(300, 300, 300),
        target: new THREE.Vector3(0, 0, 0),
        up: new THREE.Vector3(0, 1, 0)
      }
    };

    this._init();
  }

  _init() {
    this.controls = new OrbitControls(this.camera, this.domElement);
    
    this.controls.minDistance = this.options.minDistance;
    this.controls.maxDistance = this.options.maxDistance;
    this.controls.minPolarAngle = this.options.minPolarAngle;
    this.controls.maxPolarAngle = this.options.maxPolarAngle;
    this.controls.minAzimuthAngle = this.options.minAzimuthAngle;
    this.controls.maxAzimuthAngle = this.options.maxAzimuthAngle;
    this.controls.enableDamping = this.options.enableDamping;
    this.controls.dampingFactor = this.options.dampingFactor;
    this.controls.zoomSpeed = this.options.zoomSpeed;
    this.controls.rotateSpeed = this.options.rotateSpeed;
    this.controls.panSpeed = this.options.panSpeed;
  }

  setZoomRange(min, max) {
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
  }

  setRotationRange(minPolar, maxPolar, minAzimuth = -Infinity, maxAzimuth = Infinity) {
    this.controls.minPolarAngle = minPolar;
    this.controls.maxPolarAngle = maxPolar;
    this.controls.minAzimuthAngle = minAzimuth;
    this.controls.maxAzimuthAngle = maxAzimuth;
  }

  flyTo(position, target, duration = 1000, easing = TWEEN.Easing.Cubic.InOut) {
    return new Promise((resolve) => {
      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const startUp = this.camera.up.clone();

      new TWEEN.Tween({ t: 0 })
        .to({ t: 1 }, duration)
        .easing(easing)
        .onUpdate((obj) => {
          this.camera.position.lerpVectors(startPosition, position, obj.t);
          this.controls.target.lerpVectors(startTarget, target, obj.t);
          this.camera.up.lerpVectors(startUp, position.clone().sub(target).normalize().cross(new THREE.Vector3(0, 1, 0)).cross(position.clone().sub(target).normalize()).normalize(), obj.t);
          this.controls.update();
        })
        .onComplete(() => {
          this.controls.target.copy(target);
          this.controls.update();
          resolve();
        })
        .start();
    });
  }

  setView(viewName, duration = 1000) {
    const preset = this.viewPresets[viewName];
    if (!preset) {
      console.warn(`View preset "${viewName}" not found`);
      return Promise.resolve();
    }

    this.currentView = viewName;
    return this.flyTo(preset.position.clone(), preset.target.clone(), duration);
  }

  saveState(key = 'default') {
    const state = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      up: this.camera.up.clone(),
      projectionMatrix: this.camera.projectionMatrix.clone()
    };
    this.savedStates.set(key, state);
    return state;
  }

  restoreState(key = 'default', duration = 1000) {
    const state = this.savedStates.get(key);
    if (!state) {
      console.warn(`Camera state "${key}" not found`);
      return Promise.resolve();
    }

    return this.flyTo(state.position.clone(), state.target.clone(), duration);
  }

  reset() {
    return this.setView('perspective');
  }

  setCollisionDetection(enabled) {
    this.options.collisionDetectionEnabled = enabled;
  }

  adjustNearFarByDistance() {
    if (!this.camera || !this.controls) return;

    const distance = this.camera.position.distanceTo(this.controls.target);
    const minNear = 5;
    const maxNear = 50;
    const minFar = 5000;
    const maxFar = 10000;

    const nearFactor = Math.min(distance / 100, 1);
    const farFactor = Math.min(distance / 1000, 1);

    this.camera.near = minNear + nearFactor * (maxNear - minNear);
    this.camera.far = minFar + farFactor * (maxFar - minFar);
    this.camera.updateProjectionMatrix();
  }

  update() {
    if (this.controls) {
      this.controls.update();
    }
    TWEEN.update();
  }

  dispose() {
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }
    this.savedStates.clear();
  }
}
