import {
  PlotData,
  TerrainType,
  BuildingType,
  GRID_SIZE,
  TERRAIN_RESOURCE_MAP,
  BUILDING_COST,
  ResourceBag,
  ResourceType,
  Position,
  getTerrainYield,
  getBuildingCost,
} from '../../../shared';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickTerrain(rand: () => number): TerrainType {
  const r = rand();
  if (r < 0.30) return TerrainType.PLAIN;
  if (r < 0.50) return TerrainType.FOREST;
  if (r < 0.65) return TerrainType.MOUNTAIN;
  if (r < 0.78) return TerrainType.WATER;
  if (r < 0.90) return TerrainType.DESERT;
  return TerrainType.SWAMP;
}

function generatePlotId(x: number, y: number): string {
  return `plot_${x}_${y}`;
}

function clonePlot(p: PlotData): PlotData {
  return {
    id: p.id,
    position: { ...p.position },
    terrain: p.terrain,
    building: p.building,
    ownerId: p.ownerId,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
  };
}

export class PlotEngine {
  private plots: Map<string, PlotData> = new Map();
  private plotLocks: Set<string> = new Set();

  acquireLock(plotId: string): boolean {
    if (this.plotLocks.has(plotId)) return false;
    this.plotLocks.add(plotId);
    return true;
  }

  releaseLock(plotId: string): void {
    this.plotLocks.delete(plotId);
  }

  isLocked(plotId: string): boolean {
    return this.plotLocks.has(plotId);
  }

  generateMap(seed: number = Date.now()): PlotData[] {
    const rand = seededRandom(seed);
    const result: PlotData[] = [];

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const terrain = pickTerrain(rand);
        const id = generatePlotId(x, y);
        const plot: PlotData = {
          id,
          position: { x, y },
          terrain,
          building: BuildingType.NONE,
          ownerId: null,
          level: 0,
          hp: 0,
          maxHp: 0,
        };
        this.plots.set(id, plot);
        result.push(plot);
      }
    }
    return result;
  }

  getPlot(id: string): PlotData | undefined {
    return this.plots.get(id);
  }

  getPlotAt(pos: Position): PlotData | undefined {
    return this.plots.get(generatePlotId(pos.x, pos.y));
  }

  getAllPlots(): PlotData[] {
    return Array.from(this.plots.values());
  }

  tryPlaceBuilding(
    plotId: string,
    buildingType: BuildingType,
    ownerId: string,
    resources: ResourceBag
  ): { ok: true; plot: PlotData; remaining: ResourceBag } | { ok: false; reason: string } {
    if (this.isLocked(plotId)) {
      return { ok: false, reason: 'PLOT_BUSY' };
    }

    const plot = this.plots.get(plotId);
    if (!plot) return { ok: false, reason: 'PLOT_NOT_FOUND' };
    if (plot.terrain === TerrainType.WATER) return { ok: false, reason: 'CANNOT_BUILD_ON_WATER' };
    if (plot.building !== BuildingType.NONE) return { ok: false, reason: 'PLOT_OCCUPIED' };
    if (buildingType === BuildingType.NONE) return { ok: false, reason: 'INVALID_BUILDING' };

    const cost = getBuildingCost(buildingType);
    for (const res of Object.values(ResourceType)) {
      if ((cost[res] || 0) > (resources[res] || 0)) {
        return { ok: false, reason: `INSUFFICIENT_${String(res).toUpperCase()}` };
      }
    }

    const snapshot = clonePlot(plot);

    this.acquireLock(plotId);
    try {
      const currentPlot = this.plots.get(plotId);
      if (!currentPlot || currentPlot.building !== BuildingType.NONE) {
        return { ok: false, reason: 'PLOT_OCCUPIED' };
      }

      const remaining: ResourceBag = { ...resources };
      for (const res of Object.values(ResourceType)) {
        remaining[res] = (remaining[res] || 0) - (cost[res] || 0);
      }

      currentPlot.building = buildingType;
      currentPlot.ownerId = ownerId;
      currentPlot.level = 1;
      currentPlot.hp = 100;
      currentPlot.maxHp = 100;
      this.plots.set(plotId, currentPlot);

      return { ok: true, plot: clonePlot(currentPlot), remaining };
    } catch (err) {
      this.plots.set(plotId, snapshot);
      return { ok: false, reason: 'BUILD_INTERNAL_ERROR' };
    } finally {
      this.releaseLock(plotId);
    }
  }

  tryDemolishBuilding(plotId: string): { ok: true; plot: PlotData; refund: Partial<ResourceBag> } | { ok: false; reason: string } {
    if (this.isLocked(plotId)) {
      return { ok: false, reason: 'PLOT_BUSY' };
    }

    const plot = this.plots.get(plotId);
    if (!plot || plot.building === BuildingType.NONE) return { ok: false, reason: 'DEMOLISH_FAILED' };

    const snapshot = clonePlot(plot);

    this.acquireLock(plotId);
    try {
      const cost = getBuildingCost(plot.building);
      const refund: Partial<ResourceBag> = {};
      for (const res of Object.values(ResourceType)) {
        const c = cost[res] || 0;
        if (c > 0) refund[res] = Math.floor(c * 0.5);
      }

      plot.building = BuildingType.NONE;
      plot.ownerId = null;
      plot.level = 0;
      plot.hp = 0;
      plot.maxHp = 0;
      this.plots.set(plotId, plot);

      return { ok: true, plot: clonePlot(plot), refund };
    } catch (err) {
      this.plots.set(plotId, snapshot);
      return { ok: false, reason: 'DEMOLISH_INTERNAL_ERROR' };
    } finally {
      this.releaseLock(plotId);
    }
  }

  computeYield(ownerId: string): Partial<ResourceBag> {
    const yieldResult: Partial<ResourceBag> = {};
    const ownerPlots = Array.from(this.plots.values()).filter(p => p.ownerId === ownerId);

    for (const plot of ownerPlots) {
      const terrainYield = getTerrainYield(plot.terrain);
      if (!terrainYield) continue;
      for (const [res, amount] of Object.entries(terrainYield)) {
        const key = res as ResourceType;
        const safeAmount = typeof amount === 'number' && amount > 0 ? amount : 0;
        const safeLevel = plot.level > 0 ? plot.level : 0;
        yieldResult[key] = (yieldResult[key] || 0) + (safeAmount * safeLevel);
      }
    }
    return yieldResult;
  }

  loadPlots(plots: PlotData[]): void {
    this.plots.clear();
    this.plotLocks.clear();
    for (const p of plots) {
      this.plots.set(p.id, p);
    }
  }
}
