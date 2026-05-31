import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PlotRenderer } from './plot-renderer';
import { GRID_SIZE, PLOT_SIZE, PlotData } from '../../shared';

export class SceneBuilder {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private plotRenderer: PlotRenderer;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private onPlotClick: ((plotId: string) => void) | null = null;
  private onPlotHover: ((plotId: string | null) => void) | null = null;
  private animationId: number = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 30, 60);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(15, 20, 15);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2.2;
    this.controls.target.set(0, 0, 0);

    this.plotRenderer = new PlotRenderer(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.setupLights();
    this.setupGrid();
    this.setupEvents(container);

    this.animate();
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x8888ff, 0x443322, 0.3);
    this.scene.add(hemiLight);
  }

  private setupGrid(): void {
    const groundGeo = new THREE.PlaneGeometry(GRID_SIZE * PLOT_SIZE + 2, GRID_SIZE * PLOT_SIZE + 2);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(
      GRID_SIZE * PLOT_SIZE,
      GRID_SIZE,
      0x333344,
      0x222233
    );
    gridHelper.position.y = -0.04;
    this.scene.add(gridHelper);
  }

  private setupEvents(container: HTMLElement): void {
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e, container));
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e, container));

    window.addEventListener('resize', () => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    });
  }

  private onClick(event: MouseEvent, container: HTMLElement): void {
    this.updateMouse(event, container);
    const plotId = this.raycastPlot();
    if (plotId && this.onPlotClick) {
      this.onPlotClick(plotId);
    }
  }

  private onMouseMove(event: MouseEvent, container: HTMLElement): void {
    this.updateMouse(event, container);
    const plotId = this.raycastPlot();
    if (this.onPlotHover) {
      this.onPlotHover(plotId);
    }

    if (plotId) {
      this.plotRenderer.highlightPlotAt(plotId);
    } else {
      this.plotRenderer.clearHighlight();
    }
  }

  private updateMouse(event: MouseEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastPlot(): string | null {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const meshes: THREE.Object3D[] = [];
    this.plotRenderer.getPlotMeshes().forEach((group) => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    });

    const intersects = this.raycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj) {
        if (obj.userData && obj.userData.plotId) {
          return obj.userData.plotId;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  initPlots(plots: PlotData[]): void {
    this.plotRenderer.initFromPlotData(plots);
  }

  updatePlot(plot: PlotData): void {
    this.plotRenderer.updatePlot(plot);
  }

  applyPlotDelta(delta: any): void {
    this.plotRenderer.applyDelta(delta);
  }

  setOnPlotClick(handler: (plotId: string) => void): void {
    this.onPlotClick = handler;
  }

  setOnPlotHover(handler: (plotId: string | null) => void): void {
    this.onPlotHover = handler;
  }

  dispose(): void {
    cancelAnimationFrame(this.animationId);
    this.plotRenderer.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
