import type { Entity, SkillConfig, DamageEvent, SkillCastEvent, Player } from '../../../shared/types.js';
import { ConfigLoader } from '../../utils/ConfigLoader.js';
import { MathUtils } from '../../utils/MathUtils.js';
import { CollisionSystem } from './CollisionSystem.js';
import { IDGenerator } from '../../utils/IDGenerator.js';
import { RuleConfig } from './RuleConfig.js';

export class RuleEngine {
  private collisionSystem: CollisionSystem;
  private damageEvents: DamageEvent[] = [];
  private skillCastEvents: SkillCastEvent[] = [];

  constructor(collisionSystem: CollisionSystem) {
    this.collisionSystem = collisionSystem;
  }

  getDamageEvents(): DamageEvent[] {
    const events = [...this.damageEvents];
    this.damageEvents = [];
    return events;
  }

  getSkillCastEvents(): SkillCastEvent[] {
    const events = [...this.skillCastEvents];
    this.skillCastEvents = [];
    return events;
  }

  updateEntitySkills(entity: Entity, deltaTime: number): void {
    for (const skill of entity.skills) {
      if (skill.cooldown > 0) {
        const balance = RuleConfig.getInstance().getSkillBalance(skill.configId);
        const cooldownReduction = balance.cooldownMultiplier;
        skill.cooldown = Math.max(0, skill.cooldown - (deltaTime / 1000) / cooldownReduction);
      }
    }
  }

  moveEntity(entity: Entity, targetX: number, targetY: number, deltaTime: number): boolean {
    if (entity.state === 'dead') return false;

    entity.targetPosition = { x: targetX, y: targetY };
    if (entity.state !== 'casting' && entity.state !== 'attacking') {
      entity.state = 'moving';
    }

    const target = { x: targetX, y: targetY };
    const dist = MathUtils.distance(entity.position, target);

    if (dist < 5) {
      entity.velocity = { x: 0, y: 0 };
      if (entity.state === 'moving') {
        entity.state = 'idle';
      }
      entity.targetPosition = undefined;
      return true;
    }

    const balance = RuleConfig.getInstance().getEntityBalance(entity.type);
    const actualSpeed = entity.speed * balance.speedMultiplier;

    const direction = MathUtils.direction(entity.position, target);
    const moveSpeed = actualSpeed * (deltaTime / 1000);
    const actualMove = Math.min(moveSpeed, dist);

    const newPosition = {
      x: entity.position.x + direction.x * actualMove,
      y: entity.position.y + direction.y * actualMove
    };

    const boundedPos = this.collisionSystem.checkMapBounds(newPosition, entity.size);

    if (!this.collisionSystem.checkObstacleCollision(boundedPos, entity.size)) {
      entity.position = boundedPos;
      entity.rotation = Math.atan2(direction.y, direction.x);
    } else {
      const slideAngle = Math.atan2(direction.y, direction.x);
      const slideOffsets = [
        { x: Math.cos(slideAngle + Math.PI / 2) * moveSpeed, y: Math.sin(slideAngle + Math.PI / 2) * moveSpeed },
        { x: Math.cos(slideAngle - Math.PI / 2) * moveSpeed, y: Math.sin(slideAngle - Math.PI / 2) * moveSpeed }
      ];

      let slid = false;
      for (const offset of slideOffsets) {
        const slidePos = {
          x: entity.position.x + offset.x,
          y: entity.position.y + offset.y
        };
        const boundedSlide = this.collisionSystem.checkMapBounds(slidePos, entity.size);
        if (!this.collisionSystem.checkObstacleCollision(boundedSlide, entity.size)) {
          entity.position = boundedSlide;
          entity.rotation = Math.atan2(offset.y, offset.x);
          slid = true;
          break;
        }
      }

      if (!slid) {
        if (entity.state === 'moving') {
          entity.state = 'idle';
        }
        entity.targetPosition = undefined;
      }
    }

    entity.velocity = {
      x: direction.x * actualSpeed,
      y: direction.y * actualSpeed
    };

    entity.lastUpdate = Date.now();
    return true;
  }

  autoAttack(attacker: Entity, entities: Entity[], players: Player[]): void {
    if (attacker.state === 'dead' || attacker.state === 'casting') return;

    const now = Date.now();
    const attackCooldown = 1000;

    if (now - attacker.lastAttackTime < attackCooldown) return;

    const target = this.collisionSystem.getNearestEnemy(entities, attacker);
    if (!target) return;

    const dist = MathUtils.distance(attacker.position, target.position);
    if (dist > attacker.attackRange) return;

    attacker.lastAttackTime = now;
    const prevState = attacker.state;
    attacker.state = 'attacking';
    attacker.rotation = MathUtils.angle(attacker.position, target.position);

    const balance = RuleConfig.getInstance().getEntityBalance(attacker.type);
    const actualDamage = attacker.damage * balance.damageMultiplier;

    this.applyDamage(target, actualDamage, attacker.id, players);

    if (attacker.state === 'attacking') {
      setTimeout(() => {
        if (attacker.state === 'attacking') {
          attacker.state = prevState === 'moving' ? 'moving' : 'idle';
        }
      }, 300);
    }
  }

  castSkill(
    caster: Entity,
    skillId: string,
    targetX: number,
    targetY: number,
    entities: Entity[],
    players: Player[]
  ): boolean {
    if (caster.state === 'dead') return false;

    const skillInstance = caster.skills.find(s => s.id === skillId || s.configId === skillId);
    if (!skillInstance || skillInstance.cooldown > 0) return false;

    const skillConfig = ConfigLoader.getSkillConfig(skillInstance.configId);
    if (!skillConfig) return false;

    const skillBalance = RuleConfig.getInstance().getSkillBalance(skillConfig.id);
    const effectiveRange = skillConfig.range * skillBalance.rangeMultiplier;

    if (effectiveRange > 0) {
      const dist = MathUtils.distance(caster.position, { x: targetX, y: targetY });
      if (dist > effectiveRange) return false;
    }

    skillInstance.cooldown = skillInstance.maxCooldown;
    const prevState = caster.state;
    caster.state = 'casting';
    caster.rotation = MathUtils.angle(caster.position, { x: targetX, y: targetY });

    this.skillCastEvents.push({
      skillId: skillConfig.id,
      casterId: caster.id,
      x: targetX,
      y: targetY,
      timestamp: Date.now()
    });

    this.applySkillEffect(caster, skillConfig, skillBalance, targetX, targetY, entities, players);

    setTimeout(() => {
      if (caster.state === 'casting') {
        caster.state = prevState === 'moving' ? 'moving' : 'idle';
      }
    }, 500);

    return true;
  }

  private applySkillEffect(
    caster: Entity,
    skillConfig: SkillConfig,
    skillBalance: { damageMultiplier: number; rangeMultiplier: number; cooldownMultiplier: number; costMultiplier: number },
    targetX: number,
    targetY: number,
    entities: Entity[],
    players: Player[]
  ): void {
    const center = { x: targetX, y: targetY };
    const effectiveDamage = skillConfig.damage * skillBalance.damageMultiplier;

    if (skillConfig.type === 'heal') {
      const effectiveRange = skillConfig.radius > 0 ? skillConfig.radius * skillBalance.rangeMultiplier : skillConfig.range > 0 ? 50 : 1;
      const targets = skillConfig.radius > 0
        ? this.collisionSystem.findAlliesInRange(entities, caster.team, center, effectiveRange)
        : [caster];

      for (const target of targets) {
        const healAmount = Math.abs(effectiveDamage);
        target.health = Math.min(target.maxHealth, target.health + healAmount);
        this.damageEvents.push({
          targetId: target.id,
          sourceId: caster.id,
          damage: -healAmount,
          timestamp: Date.now(),
          x: target.position.x,
          y: target.position.y
        });
      }
    } else if (skillConfig.type === 'attack' || skillConfig.type === 'debuff') {
      const effectiveRange = skillConfig.radius > 0 ? skillConfig.radius * skillBalance.rangeMultiplier : skillConfig.range > 0 ? 30 : 1;
      const targets = this.collisionSystem.findEnemiesInRange(
        entities,
        caster.team,
        center,
        effectiveRange
      );

      for (const target of targets) {
        this.applyDamage(target, effectiveDamage, caster.id, players);
      }
    } else if (skillConfig.type === 'buff') {
      if (skillConfig.id === 'skill_02') {
        const direction = MathUtils.direction(caster.position, center);
        const dashDistance = 150 * skillBalance.rangeMultiplier;
        const newPos = {
          x: caster.position.x + direction.x * dashDistance,
          y: caster.position.y + direction.y * dashDistance
        };
        const boundedPos = this.collisionSystem.checkMapBounds(newPos, caster.size);
        if (!this.collisionSystem.checkObstacleCollision(boundedPos, caster.size)) {
          caster.position = boundedPos;
          caster.targetPosition = undefined;
        }
      } else if (skillConfig.id === 'skill_04') {
        caster.health = Math.min(caster.maxHealth, caster.health + 50 * skillBalance.damageMultiplier);
      }
    }
  }

  applyDamage(target: Entity, damage: number, sourceId: string, players: Player[]): void {
    if (target.state === 'dead') return;

    target.health -= damage;

    this.damageEvents.push({
      targetId: target.id,
      sourceId,
      damage,
      timestamp: Date.now(),
      x: target.position.x,
      y: target.position.y
    });

    const sourceEntity = players.find(p => 
      p.controlledEntities.includes(sourceId)
    );
    if (sourceEntity && damage > 0) {
      sourceEntity.damageDealt += damage;
    }

    if (target.health <= 0) {
      target.health = 0;
      target.state = 'dead';
      target.targetPosition = undefined;
      target.velocity = { x: 0, y: 0 };

      const killer = players.find(p => p.controlledEntities.includes(sourceId));
      const victim = players.find(p => p.controlledEntities.includes(target.id));

      if (killer) {
        killer.kills++;
      }
      if (victim) {
        victim.deaths++;
      }

      console.log(`[RuleEngine] 实体 ${target.name} 被消灭，伤害: ${damage}`);
    }
  }

  checkGameOver(entities: Entity[], players: Player[]): { isOver: boolean; winner?: string } {
    const aliveByTeam = new Map<number, number>();

    for (const entity of entities) {
      if (entity.state !== 'dead') {
        const count = aliveByTeam.get(entity.team) || 0;
        aliveByTeam.set(entity.team, count + 1);
      }
    }

    const aliveTeams = Array.from(aliveByTeam.entries()).filter(([, count]) => count > 0);

    if (aliveTeams.length <= 1) {
      if (aliveTeams.length === 1) {
        const winnerTeam = aliveTeams[0][0];
        const winnerPlayer = players.find(p => p.team === winnerTeam);
        return {
          isOver: true,
          winner: winnerPlayer?.nickname
        };
      }
      return { isOver: true };
    }

    return { isOver: false };
  }
}
