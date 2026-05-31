const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const logger = require('../utils/Logger');

class DatabaseManager {
  constructor() {
    this.dbPath = config.get('database.path');
    this.backupPath = config.get('database.backupPath');
    this.db = null;
    this.isConnected = false;
    this.stmts = {};
    
    this.ensureDataDirectory();
    this.initConnection();
  }

  ensureDataDirectory() {
    try {
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info(`[Database] 创建数据目录: ${dataDir}`);
      }
      
      if (!fs.existsSync(this.backupPath)) {
        fs.mkdirSync(this.backupPath, { recursive: true });
        logger.info(`[Database] 创建备份目录: ${this.backupPath}`);
      }
    } catch (error) {
      logger.error('[Database] 创建数据目录失败', { error: error.message });
    }
  }

  initConnection() {
    try {
      if (fs.existsSync(this.dbPath) && !this.validateDatabase()) {
        logger.warn('[Database] 数据库文件损坏，尝试从备份恢复');
        if (!this.restoreFromBackup()) {
          logger.warn('[Database] 无可用备份，将创建新数据库');
          this.backupCorruptedDatabase();
          this.deleteCorruptedDatabase();
        }
      }

      this.db = new Database(this.dbPath);
      this.isConnected = true;
      logger.info('[Database] 数据库连接成功');
      
      this.enableWalMode();
      this.initTables();
      this.prepareStatements();
      logger.info('[Database] 数据库表初始化完成');

    } catch (error) {
      logger.error('[Database] 初始化连接失败', { error: error.message });
      this.handleConnectionError(error);
    }
  }

  prepareStatements() {
    this.stmts = {
      getPlayer: this.db.prepare('SELECT * FROM players WHERE id = ?'),
      createPlayer: this.db.prepare(
        'INSERT INTO players (id, nickname, level, exp, wins, losses, rating) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      updateWins: this.db.prepare('UPDATE players SET wins = wins + 1, rating = MAX(0, rating + ?) WHERE id = ?'),
      updateLosses: this.db.prepare('UPDATE players SET losses = losses + 1, rating = MAX(0, rating + ?) WHERE id = ?'),
      repairPlayer: this.db.prepare(
        'UPDATE players SET nickname = ?, level = ?, exp = ?, wins = ?, losses = ?, rating = ? WHERE id = ?'
      ),
      insertBattle: this.db.prepare(
        'INSERT INTO battles (id, player1_id, player2_id, winner_id, duration, player1_hp, player2_hp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ),
      getBattleHistory: this.db.prepare(`
        SELECT b.*, p1.nickname as player1_nickname, p2.nickname as player2_nickname, w.nickname as winner_nickname
        FROM battles b
        JOIN players p1 ON b.player1_id = p1.id
        JOIN players p2 ON b.player2_id = p2.id
        LEFT JOIN players w ON b.winner_id = w.id
        WHERE b.player1_id = ? OR b.player2_id = ?
        ORDER BY b.created_at DESC
        LIMIT ?
      `),
      getLeaderboard: this.db.prepare(`
        SELECT id, nickname, wins, losses, rating,
               CASE WHEN (wins + losses) > 0 THEN ROUND(wins * 100.0 / (wins + losses), 1) ELSE 0 END as win_rate
        FROM players ORDER BY rating DESC, wins DESC LIMIT ?
      `),
      upsertBattleState: this.db.prepare(`
        INSERT INTO server_states (server_id, battle_id, state_data) VALUES (?, ?, ?)
        ON CONFLICT(server_id, battle_id) DO UPDATE SET state_data = excluded.state_data, last_updated = CURRENT_TIMESTAMP
      `),
      getBattleState: this.db.prepare('SELECT state_data FROM server_states WHERE server_id = ? AND battle_id = ?'),
      insertBattleLog: this.db.prepare(
        'INSERT INTO battle_logs (id, battle_id, turn_number, action_type, action_data) VALUES (?, ?, ?, ?, ?)'
      ),
      insertReplay: this.db.prepare(
        'INSERT INTO battle_replays (id, battle_id, player1_id, player2_id, actions, initial_state, result, duration, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ),
      getReplay: this.db.prepare('SELECT * FROM battle_replays WHERE id = ?'),
      getPlayerReplays: this.db.prepare(`
        SELECT r.id, r.battle_id, r.player1_id, r.player2_id, r.result, r.duration, r.created_at,
               p1.nickname as player1_nickname, p2.nickname as player2_nickname
        FROM battle_replays r
        JOIN players p1 ON r.player1_id = p1.id
        JOIN players p2 ON r.player2_id = p1.id
        WHERE r.player1_id = ? OR r.player2_id = ?
        ORDER BY r.created_at DESC LIMIT ?
      `),
      insertDeck: this.db.prepare(
        'INSERT INTO decks (id, player_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ),
      getPlayerDecks: this.db.prepare('SELECT * FROM decks WHERE player_id = ? ORDER BY updated_at DESC'),
      getDeck: this.db.prepare('SELECT * FROM decks WHERE id = ? AND player_id = ?'),
      updateDeck: this.db.prepare(
        'UPDATE decks SET name = ?, cards = ?, updated_at = ? WHERE id = ? AND player_id = ?'
      ),
      deleteDeck: this.db.prepare('DELETE FROM decks WHERE id = ? AND player_id = ?'),
      upsertDeckBackup: this.db.prepare(`
        INSERT INTO deck_backups (id, player_id, decks_data, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET decks_data = excluded.decks_data, created_at = excluded.created_at
      `),
      getDeckBackup: this.db.prepare('SELECT * FROM deck_backups WHERE player_id = ?'),
    };
    logger.debug('[Database] 预编译语句已缓存');
  }

  validateDatabase() {
    try {
      const stats = fs.statSync(this.dbPath);
      if (stats.size === 0) {
        logger.warn('[Database] 数据库文件为空');
        return false;
      }

      const header = Buffer.alloc(16);
      const fd = fs.openSync(this.dbPath, 'r');
      fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);
      
      if (header.toString('utf8', 0, 16) !== 'SQLite format 3\x00') {
        logger.warn('[Database] 数据库文件头无效');
        return false;
      }

      return true;
    } catch (error) {
      logger.error('[Database] 验证数据库失败', { error: error.message });
      return false;
    }
  }

  backupCorruptedDatabase() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const backupFile = path.join(
          this.backupPath,
          `corrupted_${path.basename(this.dbPath)}_${Date.now()}`
        );
        fs.copyFileSync(this.dbPath, backupFile);
        logger.info(`[Database] 损坏数据库已备份: ${backupFile}`);
        return true;
      }
    } catch (error) {
      logger.error('[Database] 备份损坏数据库失败', { error: error.message });
    }
    return false;
  }

  deleteCorruptedDatabase() {
    try {
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
        logger.warn('[Database] 已删除损坏的数据库文件');
      }
    } catch (error) {
      logger.error('[Database] 删除损坏数据库失败', { error: error.message });
    }
  }

  createBackup() {
    try {
      if (!this.isConnected) {
        logger.warn('[Database] 无法备份，数据库未连接');
        return null;
      }

      const backupFile = path.join(
        this.backupPath,
        `backup_${Date.now()}.db`
      );

      fs.copyFileSync(this.dbPath, backupFile);
      
      this.cleanupOldBackups();
      
      logger.info(`[Database] 数据库备份完成: ${backupFile}`);
      return backupFile;
    } catch (error) {
      logger.error('[Database] 创建备份失败', { error: error.message });
      return null;
    }
  }

  cleanupOldBackups() {
    try {
      const files = fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
        .sort()
        .reverse();
      
      const maxBackups = 10;
      if (files.length > maxBackups) {
        for (let i = maxBackups; i < files.length; i++) {
          fs.unlinkSync(path.join(this.backupPath, files[i]));
          logger.debug(`[Database] 删除旧备份: ${files[i]}`);
        }
      }
    } catch (error) {
      logger.error('[Database] 清理旧备份失败', { error: error.message });
    }
  }

  restoreFromBackup() {
    try {
      const files = fs.readdirSync(this.backupPath)
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
        .sort()
        .reverse();
      
      for (const file of files) {
        const backupPath = path.join(this.backupPath, file);
        try {
          fs.copyFileSync(backupPath, this.dbPath);
          logger.info(`[Database] 已从备份恢复: ${file}`);
          return true;
        } catch (err) {
          logger.warn(`[Database] 从备份 ${file} 恢复失败`, { error: err.message });
        }
      }
    } catch (error) {
      logger.error('[Database] 查找备份失败', { error: error.message });
    }
    return false;
  }

  enableWalMode() {
    if (config.get('database.enableWal')) {
      try {
        this.db.exec('PRAGMA journal_mode = WAL');
        logger.debug('[Database] WAL模式已启用');
        
        this.db.exec('PRAGMA synchronous = NORMAL');
      } catch (err) {
        logger.warn('[Database] 启用WAL模式失败', { error: err.message });
      }
    }
  }

  handleConnectionError(error) {
    logger.error('[Database] 连接错误处理', { error: error.message });
    
    setTimeout(() => {
      logger.info('[Database] 尝试重新连接...');
      this.initConnection();
    }, 5000);
  }

  initTables() {
    const sql = `
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        level INTEGER DEFAULT 1,
        exp INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        rating INTEGER DEFAULT 1500,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS player_cards (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        card_id INTEGER NOT NULL,
        count INTEGER DEFAULT 1,
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      CREATE TABLE IF NOT EXISTS battles (
        id TEXT PRIMARY KEY,
        player1_id TEXT NOT NULL,
        player2_id TEXT NOT NULL,
        winner_id TEXT,
        duration INTEGER DEFAULT 0,
        player1_hp INTEGER,
        player2_hp INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player1_id) REFERENCES players(id),
        FOREIGN KEY (player2_id) REFERENCES players(id),
        FOREIGN KEY (winner_id) REFERENCES players(id)
      );

      CREATE TABLE IF NOT EXISTS battle_logs (
        id TEXT PRIMARY KEY,
        battle_id TEXT NOT NULL,
        turn_number INTEGER,
        action_type TEXT,
        action_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (battle_id) REFERENCES battles(id)
      );

      CREATE TABLE IF NOT EXISTS server_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        battle_id TEXT NOT NULL,
        state_data TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(server_id, battle_id)
      );

      CREATE TABLE IF NOT EXISTS battle_replays (
        id TEXT PRIMARY KEY,
        battle_id TEXT NOT NULL,
        player1_id TEXT NOT NULL,
        player2_id TEXT NOT NULL,
        actions TEXT NOT NULL,
        initial_state TEXT,
        result TEXT,
        duration INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (battle_id) REFERENCES battles(id),
        FOREIGN KEY (player1_id) REFERENCES players(id),
        FOREIGN KEY (player2_id) REFERENCES players(id)
      );

      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cards TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      CREATE TABLE IF NOT EXISTS deck_backups (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL UNIQUE,
        decks_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
      );

      CREATE INDEX IF NOT EXISTS idx_battles_player1 ON battles(player1_id);
      CREATE INDEX IF NOT EXISTS idx_battles_player2 ON battles(player2_id);
      CREATE INDEX IF NOT EXISTS idx_battles_created ON battles(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_battle_logs_battle ON battle_logs(battle_id);
      CREATE INDEX IF NOT EXISTS idx_server_states_battle ON server_states(battle_id);
      CREATE INDEX IF NOT EXISTS idx_replays_player1 ON battle_replays(player1_id);
      CREATE INDEX IF NOT EXISTS idx_replays_player2 ON battle_replays(player2_id);
      CREATE INDEX IF NOT EXISTS idx_replays_battle ON battle_replays(battle_id);
      CREATE INDEX IF NOT EXISTS idx_decks_player ON decks(player_id);
    `;

    this.db.exec(sql);
  }

  run(sql, params = []) {
    if (!this.isConnected || !this.db) {
      throw new Error('数据库未连接');
    }

    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(params);
      return { lastID: result.lastInsertRowid, changes: result.changes };
    } catch (err) {
      logger.error('[Database] SQL执行错误', { sql, error: err.message });
      throw err;
    }
  }

  get(sql, params = []) {
    if (!this.isConnected || !this.db) {
      throw new Error('数据库未连接');
    }

    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(params);
    } catch (err) {
      logger.error('[Database] SQL查询错误', { sql, error: err.message });
      throw err;
    }
  }

  all(sql, params = []) {
    if (!this.isConnected || !this.db) {
      throw new Error('数据库未连接');
    }

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(params);
    } catch (err) {
      logger.error('[Database] SQL查询错误', { sql, error: err.message });
      throw err;
    }
  }

  transaction(fn) {
    if (!this.isConnected || !this.db) {
      throw new Error('数据库未连接');
    }
    return this.db.transaction(fn)();
  }

  validatePlayerData(player) {
    if (!player || typeof player !== 'object') {
      return { valid: false, error: '玩家数据无效' };
    }
    if (!player.id || typeof player.id !== 'string') {
      return { valid: false, error: '玩家ID无效' };
    }
    if (!player.nickname || typeof player.nickname !== 'string') {
      return { valid: false, error: '玩家昵称无效' };
    }
    if (player.wins !== undefined && (typeof player.wins !== 'number' || player.wins < 0)) {
      return { valid: false, error: '胜利场次无效' };
    }
    if (player.losses !== undefined && (typeof player.losses !== 'number' || player.losses < 0)) {
      return { valid: false, error: '失败场次无效' };
    }
    if (player.rating !== undefined && (typeof player.rating !== 'number' || player.rating < 0)) {
      return { valid: false, error: '积分无效' };
    }
    return { valid: true };
  }

  validateBattleData(room, winnerId) {
    if (!room || !room.players || room.players.length < 2) {
      return { valid: false, error: '房间数据无效' };
    }
    if (!room.players[0].id || !room.players[1].id) {
      return { valid: false, error: '玩家ID无效' };
    }
    if (winnerId && !room.players.find(p => p.id === winnerId)) {
      return { valid: false, error: '胜者ID无效' };
    }
    return { valid: true };
  }

  sanitizeString(str, maxLength = 100) {
    if (typeof str !== 'string') return '';
    return str.substring(0, maxLength).replace(/[^\w\u4e00-\u9fa5\s\-_.]/g, '');
  }

  getPlayer(playerId) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const row = this.stmts.getPlayer.get(playerId);
      
      if (row) {
        const validation = this.validatePlayerData(row);
        if (!validation.valid) {
          logger.warn('[Database] 玩家数据损坏', { playerId, error: validation.error });
          return this.repairPlayerData(row);
        }
      }
      
      return row;
    } catch (error) {
      logger.error('[Database] 获取玩家失败', { playerId, error: error.message });
      throw error;
    }
  }

  repairPlayerData(player) {
    logger.info('[Database] 修复玩家数据', { playerId: player.id });
    
    player.nickname = this.sanitizeString(player.nickname || '未知玩家', 20);
    player.level = Math.max(1, parseInt(player.level) || 1);
    player.exp = Math.max(0, parseInt(player.exp) || 0);
    player.wins = Math.max(0, parseInt(player.wins) || 0);
    player.losses = Math.max(0, parseInt(player.losses) || 0);
    player.rating = Math.max(0, Math.min(3000, parseInt(player.rating) || 1500));

    try {
      this.stmts.repairPlayer.run(
        player.nickname, player.level, player.exp, player.wins, player.losses, player.rating, player.id
      );
      return player;
    } catch (error) {
      logger.error('[Database] 修复玩家数据失败', { playerId: player.id, error: error.message });
      return player;
    }
  }

  createPlayer(playerId, nickname) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const cleanNickname = this.sanitizeString(nickname, 20);
      if (!cleanNickname) {
        throw new Error('昵称无效');
      }

      const playerData = {
        id: playerId,
        nickname: cleanNickname,
        level: 1,
        exp: 0,
        wins: 0,
        losses: 0,
        rating: 1500
      };

      const validation = this.validatePlayerData(playerData);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      this.stmts.createPlayer.run(
        playerData.id, playerData.nickname, playerData.level, playerData.exp,
        playerData.wins, playerData.losses, playerData.rating
      );

      logger.info('[Database] 创建新玩家', { playerId, nickname: cleanNickname });
      return playerData;
    } catch (error) {
      logger.error('[Database] 创建玩家失败', { playerId, error: error.message });
      throw error;
    }
  }

  updatePlayerStats(playerId, won) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }
      if (typeof won !== 'boolean') {
        throw new Error('胜负状态无效');
      }

      const ratingChange = won ? 25 : -15;
      const stmt = won ? this.stmts.updateWins : this.stmts.updateLosses;
      const result = stmt.run(ratingChange, playerId);

      if (result.changes === 0) {
        logger.warn('[Database] 更新玩家统计未找到玩家', { playerId });
      }

      logger.debug('[Database] 更新玩家统计', { playerId, won, ratingChange });
      return result;
    } catch (error) {
      logger.error('[Database] 更新玩家统计失败', { playerId, error: error.message });
      throw error;
    }
  }

  saveBattleResult(room, winnerId) {
    try {
      const validation = this.validateBattleData(room, winnerId);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const battleId = uuidv4();
      const player1 = room.players[0];
      const player2 = room.players[1];
      const duration = room.actionLog && room.actionLog.length > 0
        ? Math.round((Date.now() - room.createdAt) / 1000)
        : 0;

      this.transaction(() => {
        this.stmts.insertBattle.run(
          battleId, player1.id, player2.id, winnerId, duration, player1.hp, player2.hp
        );
        this.updatePlayerStats(player1.id, player1.id === winnerId);
        this.updatePlayerStats(player2.id, player2.id === winnerId);
      });

      this.createBackup();

      logger.info('[Database] 保存对战结果', { 
        battleId, 
        winnerId,
        player1: player1.id,
        player2: player2.id
      });

      return battleId;
    } catch (error) {
      logger.error('[Database] 保存对战结果失败', { error: error.message });
      throw error;
    }
  }

  getBattleHistory(playerId, limit = 20) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      return this.stmts.getBattleHistory.all(playerId, playerId, limit);
    } catch (error) {
      logger.error('[Database] 获取对战历史失败', { playerId, error: error.message });
      throw error;
    }
  }

  getLeaderboard(limit = 50) {
    try {
      return this.stmts.getLeaderboard.all(limit);
    } catch (error) {
      logger.error('[Database] 获取排行榜失败', { error: error.message });
      throw error;
    }
  }

  saveBattleState(serverId, battleId, stateData) {
    try {
      if (!serverId || !battleId) {
        throw new Error('服务器ID或对战ID无效');
      }

      const stateJson = typeof stateData === 'string' ? stateData : JSON.stringify(stateData);
      
      const result = this.stmts.upsertBattleState.run(serverId, battleId, stateJson);

      logger.debug('[Database] 保存对战状态', { battleId, serverId });
      return result;
    } catch (error) {
      logger.error('[Database] 保存对战状态失败', { battleId, error: error.message });
      throw error;
    }
  }

  getBattleState(serverId, battleId) {
    try {
      if (!serverId || !battleId) {
        throw new Error('服务器ID或对战ID无效');
      }

      const row = this.stmts.getBattleState.get(serverId, battleId);

      if (row && row.state_data) {
        try {
          return JSON.parse(row.state_data);
        } catch (parseError) {
          logger.error('[Database] 解析对战状态JSON失败', { battleId, error: parseError.message });
          return null;
        }
      }

      return null;
    } catch (error) {
      logger.error('[Database] 获取对战状态失败', { battleId, error: error.message });
      throw error;
    }
  }

  saveBattleLog(battleId, turnNumber, actionType, actionData) {
    try {
      const logId = uuidv4();
      const dataJson = typeof actionData === 'string' ? actionData : JSON.stringify(actionData);
      
      this.stmts.insertBattleLog.run(logId, battleId, turnNumber, actionType, dataJson);

      return logId;
    } catch (error) {
      logger.error('[Database] 保存对战日志失败', { error: error.message });
    }
  }

  saveBattleReplay(room, battleId, winnerId) {
    try {
      const replayId = uuidv4();
      const actions = room.actionLog || [];
      const initialState = actions.length > 0 && actions[0].actionType === 'game_start'
        ? actions[0].data : null;
      const duration = Math.round((Date.now() - room.createdAt) / 1000);

      this.stmts.insertReplay.run(
        replayId,
        battleId,
        room.players[0].id,
        room.players[1].id,
        JSON.stringify(actions),
        initialState ? JSON.stringify(initialState) : null,
        winnerId,
        duration,
        new Date().toISOString()
      );

      logger.info('[Database] 保存对战录像', { replayId, battleId });
      return replayId;
    } catch (error) {
      logger.error('[Database] 保存对战录像失败', { battleId, error: error.message });
      return null;
    }
  }

  getBattleReplay(replayId) {
    try {
      if (!replayId || typeof replayId !== 'string') {
        throw new Error('录像ID无效');
      }

      const row = this.stmts.getReplay.get(replayId);
      if (!row) return null;

      try {
        row.actions = JSON.parse(row.actions);
        if (row.initial_state) row.initial_state = JSON.parse(row.initial_state);
        if (row.result) row.result = row.result;
      } catch (parseError) {
        logger.error('[Database] 解析录像数据失败', { replayId, error: parseError.message });
        return null;
      }

      return row;
    } catch (error) {
      logger.error('[Database] 获取对战录像失败', { replayId, error: error.message });
      throw error;
    }
  }

  getPlayerReplays(playerId, limit = 20) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      return this.stmts.getPlayerReplays.all(playerId, playerId, limit);
    } catch (error) {
      logger.error('[Database] 获取玩家录像失败', { playerId, error: error.message });
      throw error;
    }
  }

  createDeck(playerId, name, cardIds) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const cleanName = this.sanitizeString(name, 30);
      if (!cleanName) {
        throw new Error('卡组名称无效');
      }

      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        throw new Error('卡组卡牌不能为空');
      }

      const deckId = uuidv4();
      const now = new Date().toISOString();

      this.stmts.insertDeck.run(deckId, playerId, cleanName, JSON.stringify(cardIds), now, now);

      logger.info('[Database] 创建卡组', { deckId, playerId, name: cleanName });
      return { id: deckId, name: cleanName, cards: cardIds, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('[Database] 创建卡组失败', { playerId, error: error.message });
      throw error;
    }
  }

  getPlayerDecks(playerId) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const rows = this.stmts.getPlayerDecks.all(playerId);
      return rows.map(row => {
        try {
          row.cards = JSON.parse(row.cards);
        } catch (e) {
          row.cards = [];
        }
        return row;
      });
    } catch (error) {
      logger.error('[Database] 获取卡组列表失败', { playerId, error: error.message });
      throw error;
    }
  }

  getDeck(deckId, playerId) {
    try {
      if (!deckId || !playerId) {
        throw new Error('参数无效');
      }

      const row = this.stmts.getDeck.get(deckId, playerId);
      if (!row) return null;

      try {
        row.cards = JSON.parse(row.cards);
      } catch (e) {
        row.cards = [];
      }

      return row;
    } catch (error) {
      logger.error('[Database] 获取卡组失败', { deckId, error: error.message });
      throw error;
    }
  }

  updateDeck(deckId, playerId, name, cardIds) {
    try {
      if (!deckId || !playerId) {
        throw new Error('参数无效');
      }

      const cleanName = this.sanitizeString(name, 30);
      if (!cleanName) {
        throw new Error('卡组名称无效');
      }

      if (!Array.isArray(cardIds) || cardIds.length === 0) {
        throw new Error('卡组卡牌不能为空');
      }

      const now = new Date().toISOString();
      const result = this.stmts.updateDeck.run(cleanName, JSON.stringify(cardIds), now, deckId, playerId);

      if (result.changes === 0) {
        throw new Error('卡组不存在或无权限');
      }

      logger.info('[Database] 更新卡组', { deckId, playerId });
      return { id: deckId, name: cleanName, cards: cardIds, updatedAt: now };
    } catch (error) {
      logger.error('[Database] 更新卡组失败', { deckId, error: error.message });
      throw error;
    }
  }

  deleteDeck(deckId, playerId) {
    try {
      if (!deckId || !playerId) {
        throw new Error('参数无效');
      }

      const result = this.stmts.deleteDeck.run(deckId, playerId);

      if (result.changes === 0) {
        throw new Error('卡组不存在或无权限');
      }

      logger.info('[Database] 删除卡组', { deckId, playerId });
      return true;
    } catch (error) {
      logger.error('[Database] 删除卡组失败', { deckId, error: error.message });
      throw error;
    }
  }

  backupPlayerDecks(playerId) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const decks = this.stmts.getPlayerDecks.all(playerId);
      const backupId = uuidv4();
      const now = new Date().toISOString();

      this.stmts.upsertDeckBackup.run(backupId, playerId, JSON.stringify(decks), now);

      logger.info('[Database] 卡组云端备份', { playerId, deckCount: decks.length });
      return { id: backupId, deckCount: decks.length, createdAt: now };
    } catch (error) {
      logger.error('[Database] 卡组备份失败', { playerId, error: error.message });
      throw error;
    }
  }

  restorePlayerDecks(playerId) {
    try {
      if (!playerId || typeof playerId !== 'string') {
        throw new Error('玩家ID无效');
      }

      const row = this.stmts.getDeckBackup.get(playerId);
      if (!row) {
        logger.warn('[Database] 无可用卡组备份', { playerId });
        return null;
      }

      let decks;
      try {
        decks = JSON.parse(row.decks_data);
      } catch (e) {
        logger.error('[Database] 卡组备份数据损坏', { playerId });
        return null;
      }

      this.transaction(() => {
        const deleteAllDecks = this.db.prepare('DELETE FROM decks WHERE player_id = ?');
        deleteAllDecks.run(playerId);

        const insertDeck = this.db.prepare(
          'INSERT INTO decks (id, player_id, name, cards, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (const deck of decks) {
          try {
            const cardsJson = typeof deck.cards === 'string' ? deck.cards : JSON.stringify(deck.cards);
            insertDeck.run(deck.id, playerId, deck.name, cardsJson, deck.created_at, deck.updated_at || new Date().toISOString());
          } catch (e) {
            logger.warn('[Database] 恢复单个卡组失败', { deckId: deck.id, error: e.message });
          }
        }
      });

      logger.info('[Database] 卡组从备份恢复', { playerId, deckCount: decks.length });
      return { deckCount: decks.length, restoredAt: row.created_at };
    } catch (error) {
      logger.error('[Database] 卡组恢复失败', { playerId, error: error.message });
      throw error;
    }
  }

  close() {
    if (this.db && this.isConnected) {
      try {
        this.createBackup();
        this.db.close();
        this.isConnected = false;
        this.stmts = {};
        logger.info('[Database] 数据库已关闭');
      } catch (err) {
        logger.error('[Database] 关闭数据库失败', { error: err.message });
      }
    }
  }
}

module.exports = DatabaseManager;
