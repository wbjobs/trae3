import type { Player, GameRecord, GameState } from '../../../shared/types.js';
import { Database, PlayerData } from './Database.js';
import { IDGenerator } from '../../utils/IDGenerator.js';

export class PersistenceManager {
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  findOrCreatePlayer(nickname: string): PlayerData {
    return this.db.findOrCreatePlayer(nickname);
  }

  getPlayer(playerId: string): PlayerData | undefined {
    return this.db.getPlayer(playerId);
  }

  updatePlayerStats(playerId: string, stats: Partial<PlayerData>): void {
    this.db.updatePlayerStats(playerId, stats);
  }

  saveGameRecord(
    roomId: string,
    roomName: string,
    players: Player[],
    finalState: GameState,
    startTime: number,
    endTime: number
  ): GameRecord {
    const winnerId = finalState.winner;
    const winnerPlayer = players.find(p => p.id === winnerId);

    const playerStats = players.map(p => ({
      playerId: p.id,
      nickname: p.nickname,
      kills: p.kills,
      deaths: p.deaths,
      damageDealt: p.damageDealt,
      survived: p.id === winnerId || (finalState.entities.some(e => e.ownerId === p.id && e.state !== 'dead'))
    }));

    const record: GameRecord = {
      id: IDGenerator.generate(),
      roomId,
      roomName,
      startTime,
      endTime,
      duration: Math.floor((endTime - startTime) / 1000),
      winnerId,
      winnerName: winnerPlayer?.nickname,
      playerStats
    };

    this.db.addGameRecord(record);
    return record;
  }

  getGameRecords(limit?: number): GameRecord[] {
    return this.db.getGameRecords(limit);
  }

  getPlayerRecords(playerId: string, limit?: number): GameRecord[] {
    return this.db.getPlayerRecords(playerId, limit);
  }

  getLeaderboard(limit?: number): PlayerData[] {
    return this.db.getLeaderboard(limit);
  }
}
