import type { Entity } from '../../../shared/types.js';
import { MathUtils } from '../../utils/MathUtils.js';
import { CollisionSystem } from './CollisionSystem.js';
import { RuleConfig } from './RuleConfig.js';

export class AISystem {
  private collisionSystem: CollisionSystem;
  private aiStateTimers: Map<string, number> = new Map();
  private aiWanderTargets: Map<string, { x: number; y: number } | null> = new Map();

  constructor(collisionSystem: CollisionSystem) {
    this.collisionSystem = collisionSystem;
  }

  updateAI(entity: Entity, entities: Entity[], deltaTime: number): void {
    if (entity.state === 'dead' || entity.state === 'casting') return;

    const aiConfig = RuleConfig.getInstance().getAIConfig(entity.type);
    const nearestEnemy = this.collisionSystem.getNearestEnemy(entities, entity);

    if (!nearestEnemy) {
      this.wander(entity, deltaTime, aiConfig.wanderRadius);
      return;
    }

    const distToEnemy = MathUtils.distance(entity.position, nearestEnemy.position);

    if (distToEnemy > aiConfig.detectionRange) {
      this.wander(entity, deltaTime, aiConfig.wanderRadius);
      return;
    }

    if (distToEnemy <= entity.attackRange) {
      this.attackBehavior(entity, nearestEnemy, deltaTime);
    } else {
      this.chase(entity, nearestEnemy, deltaTime);
    }
  }

  private chase(entity: Entity, target: Entity, deltaTime: number): void {
    entity.targetPosition = { ...target.position };
    entity.state = 'moving';

    const direction = MathUtils.direction(entity.position, target.position);
    const moveSpeed = entity.speed * (deltaTime / 1000);

    const newPosition = {
      x: entity.position.x + direction.x * moveSpeed,
      y: entity.position.y + direction.y * moveSpeed
    };

    const boundedPos = this.collisionSystem.checkMapBounds(newPosition, entity.size);

    if (!this.collisionSystem.checkObstacleCollision(boundedPos, entity.size)) {
      entity.position = boundedPos;
      entity.rotation = Math.atan2(direction.y, direction.x);
      entity.velocity = {
        x: direction.x * entity.speed,
        y: direction.y * entity.speed
      };
    } else {
      const slideAngle = Math.atan2(direction.y, direction.x);
      const slideOffsets = [
        { x: Math.cos(slideAngle + Math.PI / 2) * moveSpeed, y: Math.sin(slideAngle + Math.PI / 2) * moveSpeed },
        { x: Math.cos(slideAngle - Math.PI / 2) * moveSpeed, y: Math.sin(slideAngle - Math.PI / 2) * moveSpeed }
      ];

      for (const offset of slideOffsets) {
        const slidePos = {
          x: entity.position.x + offset.x,
          y: entity.position.y + offset.y
        };
        const boundedSlide = this.collisionSystem.checkMapBounds(slidePos, entity.size);
        if (!this.collisionSystem.checkObstacleCollision(boundedSlide, entity.size)) {
          entity.position = boundedSlide;
          entity.rotation = Math.atan2(offset.y, offset.x);
          entity.velocity = {
            x: offset.x / moveSpeed * entity.speed,
            y: offset.y / moveSpeed * entity.speed
          };
          break;
        }
      }
    }
  }

  private attackBehavior(entity: Entity, target: Entity, deltaTime: number): void {
    entity.state = 'attacking';
    entity.rotation = MathUtils.angle(entity.position, target.position);
    entity.targetPosition = undefined;
    entity.velocity = { x: 0, y: 0 };

    const timer = this.aiStateTimers.get(entity.id) || 0;
    this.aiStateTimers.set(entity.id, timer + deltaTime);
  }

  private wander(entity: Entity, deltaTime: number, wanderRadius: number): void {
    const currentTarget = this.aiWanderTargets.get(entity.id) || null;

    if (!currentTarget) {
      if (Math.random() < 0.02) {
        const angle = Math.random() * Math.PI * 2;
        const newTarget = {
          x: entity.position.x + Math.cos(angle) * wanderRadius,
          y: entity.position.y + Math.sin(angle) * wanderRadius
        };
        const bounded = this.collisionSystem.checkMapBounds(newTarget, entity.size);
        if (!this.collisionSystem.checkObstacleCollision(bounded, entity.size)) {
          this.aiWanderTargets.set(entity.id, bounded);
          entity.targetPosition = bounded;
          entity.state = 'moving';
        }
      } else {
        entity.state = 'idle';
        entity.velocity = { x: 0, y: 0 };
      }
      return;
    }

    const dist = MathUtils.distance(entity.position, currentTarget);
    if (dist < 15) {
      this.aiWanderTargets.set(entity.id, null);
      entity.targetPosition = undefined;
      entity.state = 'idle';
      entity.velocity = { x: 0, y: 0 };
      return;
    }

    const direction = MathUtils.direction(entity.position, currentTarget);
    const moveSpeed = entity.speed * 0.5 * (deltaTime / 1000);

    const newPosition = {
      x: entity.position.x + direction.x * moveSpeed,
      y: entity.position.y + direction.y * moveSpeed
    };

    const boundedPos = this.collisionSystem.checkMapBounds(newPosition, entity.size);
    
    if (!this.collisionSystem.checkObstacleCollision(boundedPos, entity.size)) {
      entity.position = boundedPos;
      entity.rotation = Math.atan2(direction.y, direction.x);
      entity.velocity = {
        x: direction.x * entity.speed * 0.5,
        y: direction.y * entity.speed * 0.5
      };
    } else {
      this.aiWanderTargets.set(entity.id, null);
      entity.targetPosition = undefined;
      entity.state = 'idle';
      entity.velocity = { x: 0, y: 0 };
    }
  }
}
