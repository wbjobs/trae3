import * as THREE from 'three';
import {
  PlotData,
  TerrainType,
  BuildingType,
  PLOT_SIZE,
  GRID_SIZE,
  PlotDataDelta,
} from '../../shared';

const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.PLAIN]: 0x7ec850,
  [TerrainType.FOREST]: 0x2d6a2e,
  [TerrainType.MOUNTAIN]: 0x8b7d6b,
  [TerrainType.WATER]: 0x3a8fd4,
  [TerrainType.DESERT]: 0xd4b872,
  [TerrainType.SWAMP]: 0x5a6e3a,
};

const TERRAIN_HEIGHTS: Record<TerrainType, number> = {
  [TerrainType.PLAIN]: 0.05,
  [TerrainType.FOREST]: 0.1,
  [TerrainType.MOUNTAIN]: 0.3,
  [TerrainType.WATER]: -0.05,
  [TerrainType.DESERT]: 0.05,
  [TerrainType.SWAMP]: 0.02,
};

class GeometryPool {
  private cache: Map<string, THREE.BufferGeometry> = new Map();
  private refCount: Map<string, number> = new Map();

  acquireTerrainGeo(): THREE.BufferGeometry {
    const key = 'terrain';
    let geo = this.cache.get(key);
    if (!geo) {
      geo = new THREE.BoxGeometry(PLOT_SIZE * 0.95, 1, PLOT_SIZE * 0.95);
      this.cache.set(key, geo);
      this.refCount.set(key, 0);
    }
    this.refCount.set(key, (this.refCount.get(key) || 0) + 1);
    return geo;
  }

  acquireBuildingGeo(type: BuildingType): THREE.BufferGeometry {
    const key = `b_${type}`;
    let geo = this.cache.get(key);
    if (!geo) {
      geo = this.createBuildingGeo(type);
      this.cache.set(key, geo);
      this.refCount.set(key, 0);
    }
    this.refCount.set(key, (this.refCount.get(key) || 0) + 1);
    return geo;
  }

  private createBuildingGeo(type: BuildingType): THREE.BufferGeometry {
    switch (type) {
      case BuildingType.CASTLE: return new THREE.BoxGeometry(0.6, 0.5, 0.6);
      case BuildingType.FARM: return new THREE.BoxGeometry(0.5, 0.2, 0.5);
      case BuildingType.MINE: return new THREE.CylinderGeometry(0.2, 0.25, 0.3, 6);
      case BuildingType.BARRACKS: return new THREE.BoxGeometry(0.5, 0.35, 0.5);
      case BuildingType.MARKET: return new THREE.BoxGeometry(0.4, 0.3, 0.4);
      case BuildingType.WALL: return new THREE.BoxGeometry(0.8, 0.4, 0.15);
      case BuildingType.TOWER: return new THREE.CylinderGeometry(0.15, 0.2, 0.6, 8);
      default: return new THREE.BoxGeometry(0.1, 0.1, 0.1);
    }
  }

  dispose(): void {
    for (const geo of this.cache.values()) geo.dispose();
    this.cache.clear();
    this.refCount.clear();
  }
}

class MaterialPool {
  private terrainMats: Map<string, THREE.MeshLambertMaterial> = new Map();
  private buildingMats: Map<string, THREE.MeshPhongMaterial> = new Map();

  acquireTerrainMat(terrain: TerrainType): THREE.MeshLambertMaterial {
    const color = TERRAIN_COLORS[terrain] || 0x7ec850;
    const key = `t_${color}`;
    let mat = this.terrainMats.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      this.terrainMats.set(key, mat);
    }
    return mat;
  }

  acquireBuildingMat(color: number): THREE.MeshPhongMaterial {
    const key = `b_${color}`;
    let mat = this.buildingMats.get(key);
    if (!mat) {
      mat = new THREE.MeshPhongMaterial({ color, emissive: 0x111111 });
      this.buildingMats.set(key, mat);
    }
    return mat;
  }

  dispose(): void {
    for (const m of this.terrainMats.values()) m.dispose();
    for (const m of this.buildingMats.values()) m.dispose();
    this.terrainMats.clear();
    this.buildingMats.clear();
  }
}

const BUILDING_COLORS: Record<BuildingType, number> = {
  [BuildingType.NONE]: 0x000000,
  [BuildingType.CASTLE]: 0xf5f5dc,
  [BuildingType.FARM]: 0xdaa520,
  [BuildingType.MINE]: 0x696969,
  [BuildingType.BARRACKS]: 0x8b0000,
  [BuildingType.MARKET]: 0xff8c00,
  [BuildingType.WALL]: 0xa0a0a0,
  [BuildingType.TOWER]: 0xc0c0c0,
};

export class PlotRenderer {
  private scene: THREE.Scene;
  private plotMeshes: Map<string, THREE.Group> = new Map();
  private highlightedPlot: string | null = null;
  private highlightMesh: THREE.Mesh | null = null;
  private geoPool: GeometryPool;
  private matPool: MaterialPool;
  private waterMat: THREE.MeshPhongMaterial;
  private highlightMat: THREE.MeshBasicMaterial;
  private plotStateCache: Map<string, PlotData> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geoPool = new GeometryPool();
    this.matPool = new MaterialPool();
    this.waterMat = new THREE.MeshPhongMaterial({
      color: 0x4488cc,
      transparent: true,
      opacity: 0.7,
      shininess: 100,
    });
    this.highlightMat = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
  }

  initFromPlotData(plots: PlotData[]): void {
    for (const plot of plots) {
      this.plotStateCache.set(plot.id, plot);
      this.createPlotMesh(plot);
    }
  }

  applyDelta(delta: PlotDataDelta): void {
    const base = this.plotStateCache.get(delta.id);
    if (!base) return;
    const updated = this.mergeDelta(base, delta);
    this.plotStateCache.set(delta.id, updated);
    this.updatePlot(updated);
  }

  private mergeDelta(base: PlotData, delta: PlotDataDelta): PlotData {
    const p = { ...base };
    if (delta.px !== undefined) p.position = { ...p.position, x: delta.px };
    if (delta.py !== undefined) p.position = { ...p.position, y: delta.py };
    if (delta.t !== undefined) p.terrain = delta.t as any;
    if (delta.b !== undefined) p.building = delta.b as any;
    if (delta.o !== undefined) p.ownerId = delta.o;
    if (delta.l !== undefined) p.level = delta.l;
    if (delta.hp !== undefined) p.hp = delta.hp;
    if (delta.mhp !== undefined) p.maxHp = delta.mhp;
    return p;
  }

  createPlotMesh(plot: PlotData): THREE.Group {
    let group = this.plotMeshes.get(plot.id);
    if (group) this.scene.remove(group);

    group = new THREE.Group();
    const x = (plot.position.x - GRID_SIZE / 2) * PLOT_SIZE;
    const z = (plot.position.y - GRID_SIZE / 2) * PLOT_SIZE;
    const height = TERRAIN_HEIGHTS[plot.terrain];

    const terrainGeo = this.geoPool.acquireTerrainGeo();
    const terrainMat = this.matPool.acquireTerrainMat(plot.terrain);
    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.scale.y = Math.max(0.01, height);
    terrainMesh.position.y = height / 2;
    terrainMesh.userData = { plotId: plot.id };
    group.add(terrainMesh);

    if (plot.terrain === TerrainType.FOREST) {
      this.addForestDecorations(group, height);
    }

    if (plot.terrain === TerrainType.MOUNTAIN) {
      const peakGeo = new THREE.ConeGeometry(0.25, 0.4, 5);
      const peakMat = new THREE.MeshLambertMaterial({ color: 0x9e9e8e });
      const peak = new THREE.Mesh(peakGeo, peakMat);
      peak.position.y = height + 0.2;
      group.add(peak);
    }

    if (plot.building !== BuildingType.NONE) {
      const buildingGeo = this.geoPool.acquireBuildingGeo(plot.building);
      const buildingMat = this.matPool.acquireBuildingMat(BUILDING_COLORS[plot.building]);
      const buildingMesh = new THREE.Mesh(buildingGeo, buildingMat);
      buildingMesh.position.y = height + 0.25;
      buildingMesh.userData = { plotId: plot.id, isBuilding: true };
      group.add(buildingMesh);
    }

    if (plot.terrain === TerrainType.WATER) {
      const waterGeo = new THREE.PlaneGeometry(PLOT_SIZE * 0.95, PLOT_SIZE * 0.95);
      const waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.y = 0.02;
      group.add(waterMesh);
    }

    group.position.set(x, 0, z);
    group.userData = { plotId: plot.id };
    this.scene.add(group);
    this.plotMeshes.set(plot.id, group);

    return group;
  }

  private addForestDecorations(group: THREE.Group, height: number): void {
    const treeGeo = new THREE.ConeGeometry(0.15, 0.3, 6);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1a5e1a });
    const positions = [
      [-0.15, -0.15], [0.15, -0.1], [-0.1, 0.2]
    ];
    for (const [dx, dz] of positions) {
      const tree = new THREE.Mesh(treeGeo, treeMat);
      tree.position.set(dx, height + 0.15, dz);
      group.add(tree);
    }
  }

  updatePlot(plot: PlotData): void {
    this.createPlotMesh(plot);
  }

  removePlotMesh(plotId: string): void {
    const group = this.plotMeshes.get(plotId);
    if (group) {
      this.scene.remove(group);
      this.plotMeshes.delete(plotId);
      this.plotStateCache.delete(plotId);
    }
  }

  highlightPlotAt(plotId: string): void {
    this.clearHighlight();
    const group = this.plotMeshes.get(plotId);
    if (!group) return;

    const geo = new THREE.PlaneGeometry(PLOT_SIZE, PLOT_SIZE);
    this.highlightMesh = new THREE.Mesh(geo, this.highlightMat);
    this.highlightMesh.rotation.x = -Math.PI / 2;
    this.highlightMesh.position.y = 0.35;
    group.add(this.highlightMesh);
    this.highlightedPlot = plotId;
  }

  clearHighlight(): void {
    if (this.highlightMesh && this.highlightedPlot) {
      const group = this.plotMeshes.get(this.highlightedPlot);
      if (group) group.remove(this.highlightMesh);
      this.highlightMesh = null;
      this.highlightedPlot = null;
    }
  }

  getPlotMeshes(): Map<string, THREE.Group> {
    return this.plotMeshes;
  }

  getCachedPlot(plotId: string): PlotData | undefined {
    return this.plotStateCache.get(plotId);
  }

  dispose(): void {
    for (const plotId of Array.from(this.plotMeshes.keys())) {
      this.removePlotMesh(plotId);
    }
    this.geoPool.dispose();
    this.matPool.dispose();
    this.waterMat.dispose();
    this.highlightMat.dispose();
    this.plotStateCache.clear();
  }
}
