import type { TerrainType, UnitType } from "../shared/types.js";

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  factions: string[];
  tiles: { q: number; r: number; terrain: TerrainType }[];
  units: { type: UnitType; faction: string; q: number; r: number }[];
}

const riverValleyTiles: ScenarioDefinition["tiles"] = [];
const riverValleyOverrides = new Map<string, TerrainType>();

const riverPositions = [
  { q: 5, r: 0 }, { q: 5, r: 1 }, { q: 6, r: 2 }, { q: 6, r: 3 },
  { q: 6, r: 4 }, { q: 5, r: 5 }, { q: 5, r: 6 }, { q: 6, r: 7 },
  { q: 6, r: 8 }, { q: 6, r: 9 },
];
for (const p of riverPositions) riverValleyOverrides.set(`${p.q},${p.r}`, "water");

const mountainPositions = [
  { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 },
  { q: 11, r: 8 }, { q: 10, r: 9 }, { q: 11, r: 9 },
];
for (const p of mountainPositions) riverValleyOverrides.set(`${p.q},${p.r}`, "mountain");

const forestPositions = [
  { q: 1, r: 3 }, { q: 2, r: 2 }, { q: 2, r: 3 }, { q: 3, r: 4 },
  { q: 8, r: 1 }, { q: 9, r: 2 }, { q: 8, r: 6 }, { q: 9, r: 7 }, { q: 7, r: 8 },
];
for (const p of forestPositions) riverValleyOverrides.set(`${p.q},${p.r}`, "forest");

const urbanPositions = [
  { q: 4, r: 2 }, { q: 7, r: 4 }, { q: 4, r: 7 }, { q: 7, r: 6 },
];
for (const p of urbanPositions) riverValleyOverrides.set(`${p.q},${p.r}`, "urban");

const roadPositions = [
  { q: 4, r: 3 }, { q: 4, r: 4 }, { q: 4, r: 5 }, { q: 4, r: 6 },
  { q: 7, r: 3 }, { q: 7, r: 5 }, { q: 7, r: 7 },
];
for (const p of roadPositions) riverValleyOverrides.set(`${p.q},${p.r}`, "road");

for (let q = 0; q < 12; q++) {
  for (let r = 0; r < 10; r++) {
    const terrain = riverValleyOverrides.get(`${q},${r}`) ?? "plain";
    riverValleyTiles.push({ q, r, terrain });
  }
}

const riverValleyUnits: ScenarioDefinition["units"] = [
  { type: "infantry", faction: "red", q: 2, r: 1 },
  { type: "infantry", faction: "red", q: 3, r: 3 },
  { type: "armor", faction: "red", q: 1, r: 2 },
  { type: "artillery", faction: "red", q: 0, r: 3 },
  { type: "recon", faction: "red", q: 3, r: 0 },
  { type: "engineer", faction: "red", q: 2, r: 5 },
  { type: "infantry", faction: "blue", q: 9, r: 1 },
  { type: "infantry", faction: "blue", q: 8, r: 5 },
  { type: "armor", faction: "blue", q: 10, r: 4 },
  { type: "artillery", faction: "blue", q: 11, r: 5 },
  { type: "recon", faction: "blue", q: 9, r: 3 },
  { type: "engineer", faction: "blue", q: 8, r: 8 },
];

export const riverValleyBattle: ScenarioDefinition = {
  id: "river-valley",
  name: "河谷争夺战",
  description: "红蓝两军在河谷地带展开激烈争夺，控制河上要道是取胜关键。河流贯穿战场中央，两侧城镇为重要战略目标。",
  mapWidth: 12,
  mapHeight: 10,
  factions: ["red", "blue"],
  tiles: riverValleyTiles,
  units: riverValleyUnits,
};

const urbanSiegeTiles: ScenarioDefinition["tiles"] = [];
const urbanSiegeOverrides = new Map<string, TerrainType>();

const cityCenter = [
  { q: 3, r: 3 }, { q: 4, r: 3 }, { q: 5, r: 3 },
  { q: 3, r: 4 }, { q: 4, r: 4 }, { q: 5, r: 4 },
  { q: 3, r: 5 }, { q: 4, r: 5 }, { q: 5, r: 5 },
  { q: 4, r: 6 }, { q: 5, r: 6 },
];
for (const p of cityCenter) urbanSiegeOverrides.set(`${p.q},${p.r}`, "urban");

const siegeRoadPositions = [
  { q: 0, r: 4 }, { q: 1, r: 4 }, { q: 2, r: 4 },
  { q: 6, r: 4 }, { q: 7, r: 4 }, { q: 8, r: 4 }, { q: 9, r: 4 },
  { q: 4, r: 0 }, { q: 4, r: 1 }, { q: 4, r: 2 },
  { q: 4, r: 7 }, { q: 4, r: 8 }, { q: 4, r: 9 },
];
for (const p of siegeRoadPositions) urbanSiegeOverrides.set(`${p.q},${p.r}`, "road");

const siegeForestPositions = [
  { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 },
  { q: 8, r: 0 }, { q: 9, r: 0 }, { q: 9, r: 1 },
  { q: 0, r: 8 }, { q: 0, r: 9 },
  { q: 9, r: 8 }, { q: 9, r: 9 },
];
for (const p of siegeForestPositions) urbanSiegeOverrides.set(`${p.q},${p.r}`, "forest");

const siegeMountainPositions = [
  { q: 8, r: 9 }, { q: 9, r: 7 },
];
for (const p of siegeMountainPositions) urbanSiegeOverrides.set(`${p.q},${p.r}`, "mountain");

for (let q = 0; q < 10; q++) {
  for (let r = 0; r < 10; r++) {
    const terrain = urbanSiegeOverrides.get(`${q},${r}`) ?? "plain";
    urbanSiegeTiles.push({ q, r, terrain });
  }
}

const urbanSiegeUnits: ScenarioDefinition["units"] = [
  { type: "infantry", faction: "red", q: 0, r: 3 },
  { type: "infantry", faction: "red", q: 1, r: 6 },
  { type: "armor", faction: "red", q: 2, r: 4 },
  { type: "artillery", faction: "red", q: 0, r: 5 },
  { type: "recon", faction: "red", q: 2, r: 1 },
  { type: "engineer", faction: "red", q: 1, r: 8 },
  { type: "infantry", faction: "blue", q: 4, r: 3 },
  { type: "infantry", faction: "blue", q: 5, r: 5 },
  { type: "armor", faction: "blue", q: 4, r: 5 },
  { type: "artillery", faction: "blue", q: 5, r: 4 },
  { type: "recon", faction: "blue", q: 3, r: 4 },
  { type: "supply", faction: "blue", q: 4, r: 4 },
];

export const urbanSiege: ScenarioDefinition = {
  id: "urban-siege",
  name: "城市攻防战",
  description: "红军从外围发起城市攻坚，蓝军依托城镇建筑进行防守。城市中心为争夺焦点，巷战将异常惨烈。",
  mapWidth: 10,
  mapHeight: 10,
  factions: ["red", "blue"],
  tiles: urbanSiegeTiles,
  units: urbanSiegeUnits,
};

export const allScenarios: ScenarioDefinition[] = [riverValleyBattle, urbanSiege];
