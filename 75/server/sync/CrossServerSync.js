const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/Logger');

class CrossServerSync {
  constructor(io, db) {
    this.io = io;
    this.db = db;
    this.serverId = config.get('sync.serverId') || uuidv4();
    this.peerServers = new Map();
    this.battleStates = new Map();
    this.stateVersion = new Map();
    this.syncInterval = null;
    this.enabled = config.get('sync.enabled') !== false;

    if (this.enabled) {
      this.startPeriodicSync();
      logger.info('[CrossServer] 跨服同步已启用', { serverId: this.serverId });
    } else {
      logger.info('[CrossServer] 跨服同步已禁用');
    }

    this.setupServerSyncHandlers();
  }

  startPeriodicSync() {
    const interval = config.get('sync.syncInterval') || 5000;
    this.syncInterval = setInterval(() => {
      this.cleanupExpiredStates();
      this.broadcastHeartbeat();
    }, interval);
    
    logger.debug('[CrossServer] 定期同步已启动', { intervalMs: interval });
  }

  cleanupExpiredStates() {
    const expireTime = config.get('sync.stateExpireTime') || 3600000;
    const now = Date.now();
    let cleanedCount = 0;

    for (const [battleId, state] of this.battleStates) {
      if (now - state.timestamp > expireTime) {
        this.battleStates.delete(battleId);
        this.stateVersion.delete(battleId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('[CrossServer] 清理过期状态', { count: cleanedCount });
    }
  }

  broadcastHeartbeat() {
    if (this.peerServers.size === 0) return;

    const heartbeat = {
      serverId: this.serverId,
      timestamp: Date.now(),
      activeBattles: this.battleStates.size,
      peerCount: this.peerServers.size
    };

    this.peerServers.forEach((peerInfo, peerId) => {
      try {
        this.io.to(peerInfo.socketId).emit('server_heartbeat', heartbeat);
      } catch (err) {
        logger.debug('[CrossServer] 发送心跳失败', { peerId, error: err.message });
      }
    });
  }

  async syncBattleState(battleId, room) {
    try {
      if (!battleId || !room) {
        throw new Error('无效的对战ID或房间');
      }

      const state = {
        battleId,
        serverId: this.serverId,
        players: room.players.map(p => ({
          id: p.id,
          h: p.hp,
          mh: p.maxHp,
          m: p.mana,
          mm: p.maxMana,
          field: p.field.map(m => ({
            iid: m.instanceId,
            n: m.name,
            a: m.attack,
            h: m.hp,
            ch: m.currentHp,
            t: m.taunt || false,
            ca: m.canAttack || false,
            ha: m.hasAttacked || false
          })),
          hc: p.hand.length
        })),
        cp: room.currentPlayer,
        tn: room.turnNumber,
        timestamp: Date.now(),
        _c: 1
      };

      const currentVersion = this.stateVersion.get(battleId) || 0;
      state.version = currentVersion + 1;

      const validation = this.validateBattleState(state);
      if (!validation.valid) {
        logger.error('[CrossServer] 对战状态验证失败', { battleId, error: validation.error });
        state = this.repairBattleState(state);
      }

      this.battleStates.set(battleId, state);
      this.stateVersion.set(battleId, state.version);

      if (this.db) {
        try {
          this.db.saveBattleState(this.serverId, battleId, state);
        } catch (err) {
          logger.error('[CrossServer] 保存对战状态到数据库失败', { battleId, error: err.message });
        }
      }

      if (this.enabled && this.peerServers.size > 0) {
        this.broadcastToPeers('battle_state_update', state);
        logger.debug('[CrossServer] 对战状态已同步', { battleId, version: state.version, peerCount: this.peerServers.size });
      }

      return state;
    } catch (error) {
      logger.error('[CrossServer] 同步对战状态失败', { battleId, error: error.message });
      throw error;
    }
  }

  validateBattleState(state) {
    if (!state || typeof state !== 'object') {
      return { valid: false, error: '状态数据无效' };
    }
    if (!state.battleId || typeof state.battleId !== 'string') {
      return { valid: false, error: '对战ID无效' };
    }
    if (!Array.isArray(state.players) || state.players.length !== 2) {
      return { valid: false, error: '玩家数据无效' };
    }
    if (state.cp !== 0 && state.cp !== 1) {
      return { valid: false, error: '当前玩家索引无效' };
    }
    if (typeof state.tn !== 'number' || state.tn < 1) {
      return { valid: false, error: '回合数无效' };
    }

    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      if (!player.id) {
        return { valid: false, error: `玩家${i}ID无效` };
      }
      if (player.h === undefined || player.h < 0 || player.h > player.mh) {
        return { valid: false, error: `玩家${i}生命值无效` };
      }
      if (player.m === undefined || player.m < 0 || player.m > player.mm) {
        return { valid: false, error: `玩家${i}法力值无效` };
      }
      if (!Array.isArray(player.field)) {
        return { valid: false, error: `玩家${i}战场数据无效` };
      }
    }

    return { valid: true };
  }

  repairBattleState(state) {
    logger.warn('[CrossServer] 尝试修复对战状态', { battleId: state.battleId });

    try {
      state.players = state.players || [{}, {}];
      
      for (let i = 0; i < 2; i++) {
        const player = state.players[i] || {};
        player.h = Math.max(0, Math.min(player.h || 30, player.mh || 30));
        player.mh = player.mh || 30;
        player.m = Math.max(0, Math.min(player.m || 0, player.mm || 10));
        player.mm = Math.max(1, Math.min(player.mm || 1, 10));
        player.field = Array.isArray(player.field) ? player.field : [];
        
        player.field.forEach(minion => {
          minion.ch = Math.max(0, minion.ch || minion.h || 1);
          minion.a = Math.max(0, minion.a || 0);
          if (minion.ch > minion.h) minion.ch = minion.h;
        });
      }

      state.cp = state.cp === 1 ? 1 : 0;
      state.tn = Math.max(1, state.tn || 1);
      state.timestamp = Date.now();
      state.version = (state.version || 0) + 1;
      state.repaired = true;

      logger.info('[CrossServer] 对战状态修复完成', { battleId: state.battleId });
    } catch (error) {
      logger.error('[CrossServer] 修复对战状态失败', { battleId: state.battleId, error: error.message });
    }

    return state;
  }

  async getSyncedBattleState(battleId) {
    try {
      if (!battleId) {
        throw new Error('对战ID不能为空');
      }

      if (this.battleStates.has(battleId)) {
        return this.battleStates.get(battleId);
      }

      if (this.db) {
        try {
          const state = this.db.getBattleState(this.serverId, battleId);
          if (state) {
            const validation = this.validateBattleState(state);
            if (validation.valid) {
              this.battleStates.set(battleId, state);
              this.stateVersion.set(battleId, state.version || 1);
              return state;
            } else {
              logger.warn('[CrossServer] 数据库中的状态无效，尝试修复', { battleId });
              const repaired = this.repairBattleState(state);
              this.battleStates.set(battleId, repaired);
              return repaired;
            }
          }
        } catch (err) {
          logger.error('[CrossServer] 从数据库获取状态失败', { battleId, error: err.message });
        }
      }

      if (this.enabled && this.peerServers.size > 0) {
        const remoteState = await this.requestStateFromPeers(battleId);
        if (remoteState) {
          return remoteState;
        }
      }

      return null;
    } catch (error) {
      logger.error('[CrossServer] 获取同步对战状态失败', { battleId, error: error.message });
      return null;
    }
  }

  addPeerServer(peerId, peerInfo) {
    if (!peerId || !peerInfo?.socketId) {
      logger.error('[CrossServer] 对等服务器信息无效');
      return false;
    }

    this.peerServers.set(peerId, {
      ...peerInfo,
      connectedAt: Date.now()
    });

    logger.info('[CrossServer] 已连接对等服务器', { 
      peerId, 
      address: peerInfo.address,
      totalPeers: this.peerServers.size
    });

    return true;
  }

  removePeerServer(peerId) {
    if (this.peerServers.has(peerId)) {
      this.peerServers.delete(peerId);
      logger.info('[CrossServer] 已断开对等服务器', { peerId, remainingPeers: this.peerServers.size });
      return true;
    }
    return false;
  }

  broadcastToPeers(event, data) {
    let successCount = 0;
    let failCount = 0;

    this.peerServers.forEach((peerInfo, peerId) => {
      try {
        this.io.to(peerInfo.socketId).emit(event, {
          fromServer: this.serverId,
          timestamp: Date.now(),
          ...data
        });
        successCount++;
      } catch (err) {
        failCount++;
        logger.debug('[CrossServer] 向对等服务器广播失败', { peerId, event, error: err.message });
      }
    });

    if (failCount > 0) {
      logger.debug('[CrossServer] 广播完成', { event, success: successCount, failed: failCount });
    }
  }

  async requestStateFromPeers(battleId) {
    if (this.peerServers.size === 0) {
      return null;
    }

    logger.debug('[CrossServer] 向对等服务器请求状态', { battleId, peerCount: this.peerServers.size });

    const results = [];
    const timeout = 5000;

    for (const [peerId, peerInfo] of this.peerServers) {
      try {
        const state = await this.requestPeerState(peerId, battleId, timeout);
        if (state) {
          results.push(state);
        }
      } catch (err) {
        logger.debug('[CrossServer] 从对等服务器请求状态失败', { peerId, battleId, error: err.message });
      }
    }

    if (results.length > 0) {
      results.sort((a, b) => {
        if (b.version !== a.version) {
          return (b.version || 0) - (a.version || 0);
        }
        return b.timestamp - a.timestamp;
      });

      const bestState = results[0];
      logger.info('[CrossServer] 从对等服务器获取到状态', { battleId, version: bestState.version });

      this.battleStates.set(battleId, bestState);
      this.stateVersion.set(battleId, bestState.version || 1);

      return bestState;
    }

    logger.warn('[CrossServer] 没有从对等服务器获取到有效状态', { battleId });
    return null;
  }

  async requestPeerState(peerId, battleId, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const peerInfo = this.peerServers.get(peerId);
      if (!peerInfo) {
        reject(new Error('对等服务器不存在'));
        return;
      }

      const requestId = uuidv4();
      const timer = setTimeout(() => {
        reject(new Error('请求超时'));
      }, timeout);

      const responseHandler = (response) => {
        if (response.requestId === requestId && response.battleId === battleId) {
          clearTimeout(timer);
          this.io.removeListener('battle_state_response', responseHandler);
          
          if (response.state) {
            const validation = this.validateBattleState(response.state);
            if (validation.valid) {
              resolve(response.state);
            } else {
              reject(new Error(validation.error));
            }
          } else {
            resolve(null);
          }
        }
      };

      this.io.on('battle_state_response', responseHandler);

      try {
        this.io.to(peerInfo.socketId).emit('request_battle_state', {
          battleId,
          requestId,
          fromServer: this.serverId
        });
      } catch (err) {
        clearTimeout(timer);
        this.io.removeListener('battle_state_response', responseHandler);
        reject(err);
      }
    });
  }

  async reconcileStates(battleId, localState, remoteState) {
    try {
      if (!remoteState) {
        return localState;
      }
      if (!localState) {
        return remoteState;
      }

      const localVersion = localState.version || 0;
      const remoteVersion = remoteState.version || 0;
      const localTime = localState.timestamp || 0;
      const remoteTime = remoteState.timestamp || 0;

      let chosenState;
      let reason;

      if (remoteVersion > localVersion) {
        chosenState = remoteState;
        reason = '远程版本更高';
      } else if (remoteVersion < localVersion) {
        chosenState = localState;
        reason = '本地版本更高';
      } else if (remoteTime > localTime) {
        chosenState = remoteState;
        reason = '远程时间更新';
      } else {
        chosenState = localState;
        reason = '本地时间更新或相等';
      }

      logger.debug('[CrossServer] 状态协调完成', { 
        battleId, 
        reason,
        localVersion,
        remoteVersion,
        chosenVersion: chosenState.version
      });

      const validation = this.validateBattleState(chosenState);
      if (!validation.valid) {
        logger.warn('[CrossServer] 协调后的状态无效，使用本地状态', { battleId, error: validation.error });
        return localState;
      }

      this.battleStates.set(battleId, chosenState);
      this.stateVersion.set(battleId, chosenState.version);

      return chosenState;
    } catch (error) {
      logger.error('[CrossServer] 状态协调失败', { battleId, error: error.message });
      return localState;
    }
  }

  setupServerSyncHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      socket.on('server_sync', async (data) => {
        const { type, serverId, payload } = data;

        try {
          switch (type) {
            case 'server_hello':
              this.addPeerServer(serverId, {
                socketId: socket.id,
                address: payload?.address || socket.handshake.address
              });
              break;

            case 'request_battle_state': {
              const state = this.battleStates.get(payload.battleId);
              if (state) {
                socket.emit('battle_state_response', {
                  battleId: payload.battleId,
                  requestId: payload.requestId,
                  state,
                  fromServer: this.serverId
                });
              }
              break;
            }

            case 'battle_state_update': {
              const battleId = payload.battleId;
              const localState = this.battleStates.get(battleId);
              
              const validation = this.validateBattleState(payload);
              if (!validation.valid) {
                logger.warn('[CrossServer] 收到无效的状态更新', { from: serverId, battleId, error: validation.error });
                return;
              }

              const reconciled = await this.reconcileStates(battleId, localState, payload);
              this.battleStates.set(battleId, reconciled);
              this.stateVersion.set(battleId, reconciled.version);

              if (this.db) {
                try {
                  this.db.saveBattleState(this.serverId, battleId, reconciled);
                } catch (err) {
                  logger.debug('[CrossServer] 保存同步状态失败', { error: err.message });
                }
              }

              logger.debug('[CrossServer] 处理状态更新', { from: serverId, battleId, version: reconciled.version });
              break;
            }

            case 'server_heartbeat':
              const peerInfo = this.peerServers.get(serverId);
              if (peerInfo) {
                peerInfo.lastHeartbeat = Date.now();
                peerInfo.activeBattles = payload.activeBattles;
              }
              break;

            case 'server_disconnect':
              this.removePeerServer(serverId);
              break;
          }
        } catch (error) {
          logger.error('[CrossServer] 处理服务器同步消息失败', { type, from: serverId, error: error.message });
        }
      });

      socket.on('disconnect', () => {
        for (const [peerId, peerInfo] of this.peerServers) {
          if (peerInfo.socketId === socket.id) {
            this.removePeerServer(peerId);
            break;
          }
        }
      });
    });
  }

  getServerStats() {
    return {
      serverId: this.serverId,
      enabled: this.enabled,
      peerCount: this.peerServers.size,
      activeBattles: this.battleStates.size,
      uptime: process.uptime(),
      peers: Array.from(this.peerServers.entries()).map(([id, info]) => ({
        id,
        address: info.address,
        connectedAt: info.connectedAt,
        lastHeartbeat: info.lastHeartbeat
      }))
    };
  }

  close() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('[CrossServer] 定期同步已停止');
    }

    if (this.peerServers.size > 0) {
      this.broadcastToPeers('server_disconnect', { serverId: this.serverId });
      this.peerServers.clear();
    }

    logger.info('[CrossServer] 跨服同步模块已关闭');
  }
}

module.exports = CrossServerSync;