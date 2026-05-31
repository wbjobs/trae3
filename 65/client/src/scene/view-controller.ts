import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ViewController {
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private isTransitioning: boolean = false;
  private transitionSpeed: number = 0.05;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
  }

  focusOnPosition(x: number, z: number): void {
    this.targetPosition.set(x, 0, z);
    this.isTransitioning = true;
  }

  resetView(): void {
    this.targetPosition.set(0, 0, 0);
    this.isTransitioning = true;
  }

  zoomIn(): void {
    this.camera.position.multiplyScalar(0.9);
  }

  zoomOut(): void {
    this.camera.position.multiplyScalar(1.1);
  }

  update(): void {
    if (this.isTransitioning) {
      const current = this.controls.target;
      const dx = this.targetPosition.x - current.x;
      const dy = this.targetPosition.y - current.y;
      const dz = this.targetPosition.z - current.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 0.01) {
        current.copy(this.targetPosition);
        this.isTransitioning = false;
      } else {
        current.x += dx * this.transitionSpeed;
        current.y += dy * this.transitionSpeed;
        current.z += dz * this.transitionSpeed;
      }
    }
  }

  enableControls(): void {
    this.controls.enabled = true;
  }

  disableControls(): void {
    this.controls.enabled = false;
  }

  setPolarAngleRange(min: number, max: number): void {
    this.controls.minPolarAngle = min;
    this.controls.maxPolarAngle = max;
  }

  setDistanceRange(min: number, max: number): void {
    this.controls.minDistance = min;
    this.controls.maxDistance = max;
  }
}
