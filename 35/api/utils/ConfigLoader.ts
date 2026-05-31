import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { EntityConfig, SkillConfig, MapConfig } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigLoader {
  private static entityConfigs: Map<string, EntityConfig> = new Map();
  private static skillConfigs: Map<string, SkillConfig> = new Map();
  private static mapConfigs: Map<string, MapConfig> = new Map();
  private static loaded = false;

  static load(): void {
    if (this.loaded) return;

    const configDir = path.resolve(__dirname, '..', 'config');

    if (!fs.existsSync(configDir)) {
      console.error(`[ConfigLoader] 配置目录不存在: ${configDir}`);
      this.loaded = true;
      return;
    }

    try {
      const entitiesPath = path.join(configDir, 'entities.json');
      if (fs.existsSync(entitiesPath)) {
        const entitiesData = JSON.parse(
          fs.readFileSync(entitiesPath, 'utf-8')
        ) as EntityConfig[];
        entitiesData.forEach(e => this.entityConfigs.set(e.id, e));
      } else {
        console.warn('[ConfigLoader] entities.json 不存在');
      }
    } catch (e) {
      console.error('[ConfigLoader] 加载实体配置失败:', e);
    }

    try {
      const skillsPath = path.join(configDir, 'skills.json');
      if (fs.existsSync(skillsPath)) {
        const skillsData = JSON.parse(
          fs.readFileSync(skillsPath, 'utf-8')
        ) as SkillConfig[];
        skillsData.forEach(s => this.skillConfigs.set(s.id, s));
      } else {
        console.warn('[ConfigLoader] skills.json 不存在');
      }
    } catch (e) {
      console.error('[ConfigLoader] 加载技能配置失败:', e);
    }

    try {
      const mapsPath = path.join(configDir, 'maps.json');
      if (fs.existsSync(mapsPath)) {
        const mapsData = JSON.parse(
          fs.readFileSync(mapsPath, 'utf-8')
        ) as MapConfig[];
        mapsData.forEach(m => this.mapConfigs.set(m.id, m));
      } else {
        console.warn('[ConfigLoader] maps.json 不存在');
      }
    } catch (e) {
      console.error('[ConfigLoader] 加载地图配置失败:', e);
    }

    this.loaded = true;
    console.log('[ConfigLoader] 配置加载完成:', 
      `实体: ${this.entityConfigs.size}个,`,
      `技能: ${this.skillConfigs.size}个,`,
      `地图: ${this.mapConfigs.size}个`,
      `(路径: ${configDir})`);
  }

  static getEntityConfig(id: string): EntityConfig | undefined {
    this.ensureLoaded();
    return this.entityConfigs.get(id);
  }

  static getAllEntityConfigs(): EntityConfig[] {
    this.ensureLoaded();
    return Array.from(this.entityConfigs.values());
  }

  static getSkillConfig(id: string): SkillConfig | undefined {
    this.ensureLoaded();
    return this.skillConfigs.get(id);
  }

  static getAllSkillConfigs(): SkillConfig[] {
    this.ensureLoaded();
    return Array.from(this.skillConfigs.values());
  }

  static getMapConfig(id: string): MapConfig | undefined {
    this.ensureLoaded();
    return this.mapConfigs.get(id);
  }

  static getAllMapConfigs(): MapConfig[] {
    this.ensureLoaded();
    return Array.from(this.mapConfigs.values());
  }

  private static ensureLoaded(): void {
    if (!this.loaded) {
      this.load();
    }
  }
}
