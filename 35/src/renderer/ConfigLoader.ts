import type { EntityConfig, SkillConfig, MapConfig } from '../../shared/types';

const entitiesData: EntityConfig[] = [
  {
    id: "fighter_01",
    name: "星际战士",
    type: "fighter",
    health: 100,
    speed: 120,
    damage: 15,
    attackRange: 40,
    size: 16,
    color: "#00d4ff",
    skillIds: ["skill_01", "skill_02"]
  },
  {
    id: "tank_01",
    name: "重型机甲",
    type: "tank",
    health: 200,
    speed: 60,
    damage: 25,
    attackRange: 35,
    size: 24,
    color: "#ff6b35",
    skillIds: ["skill_03", "skill_04"]
  },
  {
    id: "ranged_01",
    name: "狙击手",
    type: "ranged",
    health: 70,
    speed: 90,
    damage: 40,
    attackRange: 150,
    size: 14,
    color: "#a855f7",
    skillIds: ["skill_05", "skill_06"]
  },
  {
    id: "support_01",
    name: "医疗兵",
    type: "support",
    health: 80,
    speed: 100,
    damage: 8,
    attackRange: 50,
    size: 14,
    color: "#22c55e",
    skillIds: ["skill_07", "skill_08"]
  }
];

const skillsData: SkillConfig[] = [
  {
    id: "skill_01",
    name: "快速斩击",
    description: "对目标造成150%伤害",
    cooldown: 5,
    damage: 22,
    range: 50,
    radius: 20,
    manaCost: 0,
    type: "attack",
    color: "#00d4ff",
    icon: "⚔️"
  },
  {
    id: "skill_02",
    name: "冲刺",
    description: "向目标方向快速冲刺",
    cooldown: 8,
    damage: 0,
    range: 100,
    radius: 0,
    manaCost: 0,
    type: "buff",
    color: "#00ffff",
    icon: "💨"
  },
  {
    id: "skill_03",
    name: "重击",
    description: "对范围内敌人造成200%伤害",
    cooldown: 10,
    damage: 50,
    range: 40,
    radius: 40,
    manaCost: 0,
    type: "attack",
    color: "#ff6b35",
    icon: "💥"
  },
  {
    id: "skill_04",
    name: "护盾",
    description: "获得50点临时护盾",
    cooldown: 15,
    damage: 0,
    range: 0,
    radius: 0,
    manaCost: 0,
    type: "buff",
    color: "#fbbf24",
    icon: "🛡️"
  },
  {
    id: "skill_05",
    name: "精准射击",
    description: "对远距离目标造成300%伤害",
    cooldown: 8,
    damage: 120,
    range: 300,
    radius: 10,
    manaCost: 0,
    type: "attack",
    color: "#a855f7",
    icon: "🎯"
  },
  {
    id: "skill_06",
    name: "烟雾弹",
    description: "释放烟雾遮蔽视野",
    cooldown: 12,
    damage: 0,
    range: 150,
    radius: 60,
    manaCost: 0,
    type: "debuff",
    color: "#6b7280",
    icon: "💨"
  },
  {
    id: "skill_07",
    name: "治疗术",
    description: "恢复友方单位50点生命",
    cooldown: 6,
    damage: -50,
    range: 100,
    radius: 0,
    manaCost: 0,
    type: "heal",
    color: "#22c55e",
    icon: "💚"
  },
  {
    id: "skill_08",
    name: "群体治疗",
    description: "恢复范围内友方30点生命",
    cooldown: 15,
    damage: -30,
    range: 0,
    radius: 80,
    manaCost: 0,
    type: "heal",
    color: "#4ade80",
    icon: "✨"
  }
];

const mapsData: MapConfig[] = [
  {
    id: "map_01",
    name: "太空战场",
    width: 1600,
    height: 1200,
    background: "#0a1628",
    gridSize: 40,
    obstacles: [
      { x: 300, y: 200, width: 80, height: 80, type: "wall" },
      { x: 700, y: 400, width: 120, height: 60, type: "wall" },
      { x: 1100, y: 200, width: 80, height: 80, type: "wall" },
      { x: 500, y: 800, width: 100, height: 100, type: "block" },
      { x: 1000, y: 700, width: 80, height: 80, type: "block" },
      { x: 200, y: 600, width: 60, height: 120, type: "wall" },
      { x: 1300, y: 900, width: 100, height: 60, type: "block" }
    ],
    spawnPoints: [
      { x: 100, y: 100, team: 0 },
      { x: 200, y: 150, team: 0 },
      { x: 150, y: 250, team: 0 },
      { x: 1400, y: 1000, team: 1 },
      { x: 1300, y: 950, team: 1 },
      { x: 1350, y: 850, team: 1 }
    ]
  },
  {
    id: "map_02",
    name: "星际要塞",
    width: 1400,
    height: 1000,
    background: "#111827",
    gridSize: 35,
    obstacles: [
      { x: 600, y: 400, width: 200, height: 200, type: "wall" },
      { x: 200, y: 300, width: 60, height: 150, type: "wall" },
      { x: 1100, y: 550, width: 60, height: 150, type: "wall" },
      { x: 400, y: 700, width: 100, height: 60, type: "block" },
      { x: 900, y: 200, width: 100, height: 60, type: "block" }
    ],
    spawnPoints: [
      { x: 80, y: 80, team: 0 },
      { x: 180, y: 120, team: 0 },
      { x: 120, y: 200, team: 0 },
      { x: 1250, y: 850, team: 1 },
      { x: 1150, y: 800, team: 1 },
      { x: 1200, y: 720, team: 1 }
    ]
  }
];

export class ConfigLoader {
  private entityConfigs: Map<string, EntityConfig> = new Map();
  private skillConfigs: Map<string, SkillConfig> = new Map();
  private mapConfigs: Map<string, MapConfig> = new Map();

  constructor() {
    entitiesData.forEach(e => this.entityConfigs.set(e.id, e));
    skillsData.forEach(s => this.skillConfigs.set(s.id, s));
    mapsData.forEach(m => this.mapConfigs.set(m.id, m));
  }

  getEntityConfig(id: string): EntityConfig | undefined {
    return this.entityConfigs.get(id);
  }

  getAllEntityConfigs(): EntityConfig[] {
    return Array.from(this.entityConfigs.values());
  }

  getSkillConfig(id: string): SkillConfig | undefined {
    return this.skillConfigs.get(id);
  }

  getAllSkillConfigs(): SkillConfig[] {
    return Array.from(this.skillConfigs.values());
  }

  getMapConfig(id: string): MapConfig | undefined {
    return this.mapConfigs.get(id);
  }

  getAllMapConfigs(): MapConfig[] {
    return Array.from(this.mapConfigs.values());
  }
}
