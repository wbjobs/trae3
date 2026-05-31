import type { Entity, MapConfig, Vector2 } from '../../../shared/types.js';
import { MathUtils } from '../../utils/MathUtils.js';

export class CollisionSystem {
  private mapConfig: MapConfig;

  constructor(mapConfig: MapConfig) {
    this.mapConfig = mapConfig;
  }

  checkMapBounds(position: Vector2, size: number): Vector2 {
    return {
      x: MathUtils.clamp(position.x, size, this.mapConfig.width - size),
      y: MathUtils.clamp(position.y, size, this.mapConfig.height - size)
    };
  }

  checkObstacleCollision(position: Vector2, size: number): boolean {
    for (const obstacle of this.mapConfig.obstacles) {
      if (MathUtils.circleIntersectsRect(
        { x: position.x, y: position.y, radius: size },
        obstacle
      )) {
        return true;
      }
    }
    return false;
  }

  checkEntityCollision(entity1: Entity, entity2: Entity): boolean {
    const dist = MathUtils.distance(entity1.position, entity2.position);
    return dist < entity1.size + entity2.size;
  }

  findEntitiesInRange(
    entities: Entity[],
    position: Vector2,
    range: number,
    excludeId?: string
  ): Entity[] {
    return entities.filter(e => {
      if (e.id === excludeId) return false;
      if (e.state === 'dead') return false;
      return MathUtils.distance(e.position, position) <= range;
    });
  }

  findEnemiesInRange(
    entities: Entity[],
    team: number,
    position: Vector2,
    range: number
  ): Entity[] {
    return this.findEntitiesInRange(entities, position, range)
      .filter(e => e.team !== team);
  }

  findAlliesInRange(
    entities: Entity[],
    team: number,
    position: Vector2,
    range: number
  ): Entity[] {
    return this.findEntitiesInRange(entities, position, range)
      .filter(e => e.team === team);
  }

  getNearestEnemy(
    entities: Entity[],
    entity: Entity
  ): Entity | null {
    const enemies = entities.filter(e => 
      e.team !== entity.team && 
      e.state !== 'dead'
    );

    if (enemies.length === 0) return null;

    let nearest = enemies[0];
    let minDist = MathUtils.distance(entity.position, nearest.position);

    for (const enemy of enemies.slice(1)) {
      const dist = MathUtils.distance(entity.position, enemy.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  resolveEntityCollisions(entities: Entity[]): void {
    const alive = entities.filter(e => e.state !== 'dead');
    
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        
        if (!this.checkEntityCollision(a, b)) continue;

        const dist = MathUtils.distance(a.position, b.position);
        const minDist = a.size + b.size;
        
        if (dist === 0) continue;

        const overlap = (minDist - dist) / 2;
        const direction = MathUtils.direction(a.position, b.position);

        a.position.x -= direction.x * overlap;
        a.position.y -= direction.y * overlap;
        b.position.x += direction.x * overlap;
        b.position.y += direction.y * overlap;

        a.position = this.checkMapBounds(a.position, a.size);
        b.position = this.checkMapBounds(b.position, b.size);
      }
    }
  }
}
