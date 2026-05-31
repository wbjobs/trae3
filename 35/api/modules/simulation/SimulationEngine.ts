import type { Entity, GameState, Player, DamageEvent, SkillCastEvent, MapConfig } from '../../../shared/types.js';
import { ConfigLoader } from '../../utils/ConfigLoader.js';
import { CollisionSystem } from './CollisionSystem.js';
import { RuleEngine } from './RuleEngine.js';
import { AISystem } from './AISystem.js';
import { EntityFactory } from './EntityFactory.js';

export class SimulationEngine {
  private entities: Entity[] = [];
  private players: Player[] = [];
  private mapConfig: MapConfig;
  private collisionSystem: CollisionSystem;
  private ruleEngine: RuleEngine;
  private aiSystem: AISystem;
  private lastUpdateTime: number = 0;
  private startTime: number = 0;
  private isRunning: boolean = false;
  private gameOverResult: { isOver: boolean; winner?: string } | null = null;

  constructor(mapId: string, players: Player[]) {
    const mapConfig = ConfigLoader.getMapConfig(mapId);
    if (!mapConfig) {
      throw new Error(`Map config not found: ${mapId}`);
    }
    this.mapConfig = mapConfig;
    this.players = players;
    
    this.collisionSystem = new CollisionSystem(this.mapConfig);
    this.ruleEngine = new RuleEngine(this.collisionSystem);
    this.aiSystem = new AISystem(this.collisionSystem);
  }

  initialize(): void {
    this.entities = [];
    this.gameOverResult = null;
    
    this.players.forEach((player, index) => {
      const team = index % 2;
      player.team = team;
      player.kills = 0;
      player.deaths = 0;
      player.damageDealt = 0;
      
      const spawnPoints = this.mapConfig.spawnPoints.filter(sp => sp.team === team);
      const spawnPoint = spawnPoints[index % spawnPoints.length];
      
      const entityConfigs = ['fighter_01', 'tank_01', 'ranged_01'];
      const playerEntities = EntityFactory.createPlayerEntities(
        player.id,
        team,
        { x: spawnPoint.x, y: spawnPoint.y },
        entityConfigs,
        player.nickname
      );
      
      player.controlledEntities = playerEntities.map(e => e.id);
      this.entities.push(...playerEntities);
    });

    const aiPlayerIds = ['AI_BOT_1', 'AI_BOT_2'];
    aiPlayerIds.forEach((aiId, index) => {
      const team = (index + 2) % 2;
      const spawnPoints = this.mapConfig.spawnPoints.filter(sp => sp.team === team);
      const spawnPoint = spawnPoints[(index + 2) % spawnPoints.length];
      
      const aiEntity = EntityFactory.createEntity(
        'support_01',
        aiId,
        team,
        { x: spawnPoint.x, y: spawnPoint.y },
        `AI机器人${index + 1}`
      );
      
      if (aiEntity) {
        this.entities.push(aiEntity);
      }
    });

    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.isRunning = true;
    console.log('[SimulationEngine] 推演引擎初始化完成，实体数量:', this.entities.length);
  }

  update(): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const deltaTime = Math.min(now - this.lastUpdateTime, 100);
    this.lastUpdateTime = now;

    for (const entity of this.entities) {
      if (entity.state === 'dead') continue;

      this.ruleEngine.updateEntitySkills(entity, deltaTime);

      const isPlayerControlled = this.players.some(p => 
        p.controlledEntities.includes(entity.id)
      );

      if (!isPlayerControlled) {
        this.aiSystem.updateAI(entity, this.entities, deltaTime);
      } else if (entity.targetPosition) {
        this.ruleEngine.moveEntity(
          entity,
          entity.targetPosition.x,
          entity.targetPosition.y,
          deltaTime
        );
      }

      this.ruleEngine.autoAttack(entity, this.entities, this.players);
    }

    this.collisionSystem.resolveEntityCollisions(this.entities);

    const result = this.ruleEngine.checkGameOver(this.entities, this.players);
    if (result.isOver) {
      this.gameOverResult = result;
      this.isRunning = false;
    }

    for (const entity of this.entities) {
      entity.lastUpdate = now;
    }
  }

  getState(): GameState {
    const now = Date.now();

    return {
      entities: this.entities.map(e => ({ ...e, position: { ...e.position }, velocity: { ...e.velocity }, targetPosition: e.targetPosition ? { ...e.targetPosition } : undefined, skills: e.skills.map(s => ({ ...s })) })),
      players: this.players.map(p => ({ ...p, controlledEntities: [...p.controlledEntities] })),
      timestamp: now,
      mapId: this.mapConfig.id,
      isGameOver: !!this.gameOverResult?.isOver,
      winner: this.gameOverResult?.winner,
      gameTime: now - this.startTime
    };
  }

  getDamageEvents(): DamageEvent[] {
    return this.ruleEngine.getDamageEvents();
  }

  getSkillCastEvents(): SkillCastEvent[] {
    return this.ruleEngine.getSkillCastEvents();
  }

  handlePlayerMove(playerId: string, entityId: string, targetX: number, targetY: number): boolean {
    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.controlledEntities.includes(entityId)) {
      return false;
    }

    const entity = this.entities.find(e => e.id === entityId);
    if (!entity || entity.state === 'dead') {
      return false;
    }

    entity.targetPosition = { x: targetX, y: targetY };
    if (entity.state !== 'casting' && entity.state !== 'attacking') {
      entity.state = 'moving';
    }
    return true;
  }

  handlePlayerSkill(
    playerId: string,
    entityId: string,
    skillId: string,
    targetX: number,
    targetY: number
  ): boolean {
    const player = this.players.find(p => p.id === playerId);
    if (!player || !player.controlledEntities.includes(entityId)) {
      return false;
    }

    const entity = this.entities.find(e => e.id === entityId);
    if (!entity || entity.state === 'dead') {
      return false;
    }

    return this.ruleEngine.castSkill(
      entity,
      skillId,
      targetX,
      targetY,
      this.entities,
      this.players
    );
  }

  getEntity(entityId: string): Entity | undefined {
    return this.entities.find(e => e.id === entityId);
  }

  getEntities(): Entity[] {
    return this.entities;
  }

  getMapConfig(): MapConfig {
    return this.mapConfig;
  }

  getPlayers(): Player[] {
    return this.players;
  }

  isGameRunning(): boolean {
    return this.isRunning;
  }

  getStartTime(): number {
    return this.startTime;
  }

  stop(): void {
    this.isRunning = false;
  }
}
