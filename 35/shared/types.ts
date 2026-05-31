export interface Vector2 {
  x: number;
  y: number;
}

export interface EntityConfig {
  id: string;
  name: string;
  type: 'fighter' | 'tank' | 'support' | 'ranged';
  health: number;
  speed: number;
  damage: number;
  attackRange: number;
  size: number;
  color: string;
  skillIds: string[];
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  damage: number;
  range: number;
  radius: number;
  manaCost: number;
  type: 'attack' | 'heal' | 'buff' | 'debuff';
  color: string;
  icon: string;
}

export interface MapConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string;
  gridSize: number;
  obstacles: Obstacle[];
  spawnPoints: SpawnPoint[];
}

export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'wall' | 'block';
}

export interface SpawnPoint {
  x: number;
  y: number;
  team: number;
}

export interface SkillInstance {
  id: string;
  configId: string;
  cooldown: number;
  maxCooldown: number;
}

export interface Entity {
  id: string;
  type: 'fighter' | 'tank' | 'support' | 'ranged';
  configId: string;
  ownerId: string;
  team: number;
  position: Vector2;
  velocity: Vector2;
  targetPosition?: Vector2;
  targetEntityId?: string;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  attackRange: number;
  size: number;
  color: string;
  rotation: number;
  state: 'idle' | 'moving' | 'attacking' | 'casting' | 'dead';
  skills: SkillInstance[];
  lastAttackTime: number;
  lastUpdate: number;
  name: string;
}

export interface Player {
  id: string;
  nickname: string;
  roomId: string;
  socketId: string;
  controlledEntities: string[];
  isReady: boolean;
  isOwner: boolean;
  team: number;
  kills: number;
  deaths: number;
  damageDealt: number;
}

export interface Room {
  id: string;
  name: string;
  ownerId: string;
  players: Player[];
  maxPlayers: number;
  mode: 'ffa' | 'team';
  status: 'waiting' | 'playing' | 'ended';
  mapId: string;
  createdAt: number;
  gameStartTime?: number;
  gameEndTime?: number;
  winnerId?: string;
}

export interface GameState {
  entities: Entity[];
  players: Player[];
  timestamp: number;
  mapId: string;
  isGameOver: boolean;
  winner?: string;
  gameTime: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'explosion' | 'trail' | 'hit' | 'projectile';
}

export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  content: string;
  timestamp: number;
  roomId: string;
}

export interface GameRecord {
  id: string;
  roomId: string;
  roomName: string;
  startTime: number;
  endTime: number;
  duration: number;
  winnerId?: string;
  winnerName?: string;
  playerStats: PlayerStats[];
}

export interface PlayerStats {
  playerId: string;
  nickname: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  survived: boolean;
}

export interface DamageEvent {
  targetId: string;
  sourceId: string;
  damage: number;
  timestamp: number;
  x: number;
  y: number;
}

export interface SkillCastEvent {
  skillId: string;
  casterId: string;
  x: number;
  y: number;
  timestamp: number;
}
