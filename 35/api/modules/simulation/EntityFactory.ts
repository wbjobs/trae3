import type { Entity, SkillInstance, Vector2 } from '../../../shared/types.js';
import { ConfigLoader } from '../../utils/ConfigLoader.js';
import { IDGenerator } from '../../utils/IDGenerator.js';

export class EntityFactory {
  static createEntity(
    configId: string,
    ownerId: string,
    team: number,
    position: Vector2,
    name: string
  ): Entity | null {
    const config = ConfigLoader.getEntityConfig(configId);
    if (!config) return null;

    const skillInstances: SkillInstance[] = config.skillIds.map(skillId => {
      const skillConfig = ConfigLoader.getSkillConfig(skillId);
      return {
        id: IDGenerator.generate(),
        configId: skillId,
        cooldown: 0,
        maxCooldown: skillConfig?.cooldown || 5
      };
    });

    return {
      id: IDGenerator.generateEntityId(config.type.toUpperCase()),
      type: config.type,
      configId: config.id,
      ownerId,
      team,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      health: config.health,
      maxHealth: config.health,
      speed: config.speed,
      damage: config.damage,
      attackRange: config.attackRange,
      size: config.size,
      color: config.color,
      rotation: 0,
      state: 'idle',
      skills: skillInstances,
      lastAttackTime: 0,
      lastUpdate: Date.now(),
      name
    };
  }

  static createPlayerEntities(
    ownerId: string,
    team: number,
    spawnPoint: Vector2,
    configIds: string[],
    playerName: string
  ): Entity[] {
    const entities: Entity[] = [];
    const offsetAngle = (2 * Math.PI) / configIds.length;

    configIds.forEach((configId, index) => {
      const config = ConfigLoader.getEntityConfig(configId);
      if (!config) return;

      const offset = {
        x: Math.cos(offsetAngle * index) * 40,
        y: Math.sin(offsetAngle * index) * 40
      };

      const entity = this.createEntity(
        configId,
        ownerId,
        team,
        {
          x: spawnPoint.x + offset.x,
          y: spawnPoint.y + offset.y
        },
        `${playerName}的${config.name}`
      );

      if (entity) {
        entities.push(entity);
      }
    });

    return entities;
  }
}
