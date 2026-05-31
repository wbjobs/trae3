const { v4: uuidv4 } = require('uuid');
const CardData = require('./CardData');
const config = require('../config/config');
const logger = require('../utils/Logger');

class GameEngine {
  constructor(db) {
    this.db = db;
    this.waitingRooms = [];
    this.gameConfig = config.get('game');
  }

  findOrCreateRoom() {
    if (this.waitingRooms.length > 0) {
      const room = this.waitingRooms.pop();
      logger.debug('[GameEngine] 复用等待中的房间', { roomId: room.id });
      return room;
    }
    
    const room = {
      id: uuidv4(),
      players: [],
      currentPlayer: 0,
      turnNumber: 0,
      gameStarted: false,
      createdAt: Date.now(),
      actionLog: []
    };
    
    this.waitingRooms.push(room);
    logger.debug('[GameEngine] 创建新房间', { roomId: room.id });
    return room;
  }

  addPlayerToRoom(room, playerId, socketId) {
    if (!room) {
      logger.error('[GameEngine] 房间不存在，无法添加玩家');
      return false;
    }

    if (room.players.length >= this.gameConfig.maxPlayersPerRoom) {
      logger.warn('[GameEngine] 房间已满', { roomId: room.id, playerId });
      return false;
    }

    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      logger.warn('[GameEngine] 玩家已在房间中', { roomId: room.id, playerId });
      existingPlayer.socketId = socketId;
      return true;
    }

    room.players.push({
      id: playerId,
      socketId,
      hp: this.gameConfig.startingHp,
      maxHp: this.gameConfig.startingHp,
      mana: this.gameConfig.startingMana,
      maxMana: this.gameConfig.startingMana,
      hand: [],
      deck: [],
      field: []
    });

    logger.info('[GameEngine] 玩家加入房间', { roomId: room.id, playerId, playerCount: room.players.length });
    return true;
  }

  validateGameState(room) {
    if (!room || !room.players || room.players.length !== 2) {
      return { valid: false, error: '房间玩家数量不正确' };
    }

    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];
      
      if (!player.id) {
        return { valid: false, error: `玩家${i}ID无效` };
      }
      if (player.hp === undefined || player.hp === null || player.hp > player.maxHp) {
        return { valid: false, error: `玩家${i}生命值无效` };
      }
      if (player.mana === undefined || player.mana === null || player.mana > player.maxMana) {
        return { valid: false, error: `玩家${i}法力值无效` };
      }
      if (!Array.isArray(player.hand)) {
        return { valid: false, error: `玩家${i}手牌无效` };
      }
      if (!Array.isArray(player.field)) {
        return { valid: false, error: `玩家${i}战场无效` };
      }
      if (player.field.length > this.gameConfig.maxFieldSize) {
        return { valid: false, error: `玩家${i}战场随从数量超过上限` };
      }
    }

    if (room.currentPlayer !== 0 && room.currentPlayer !== 1) {
      return { valid: false, error: '当前玩家索引无效' };
    }

    return { valid: true };
  }

  repairGameState(room) {
    logger.warn('[GameEngine] 尝试修复游戏状态', { roomId: room.id });

    for (let i = 0; i < room.players.length; i++) {
      const player = room.players[i];
      
      player.hp = Math.max(0, Math.min(player.hp || this.gameConfig.startingHp, player.maxHp || this.gameConfig.startingHp));
      player.maxHp = player.maxHp || this.gameConfig.startingHp;
      player.mana = Math.max(0, Math.min(player.mana || 0, player.maxMana || this.gameConfig.maxMana));
      player.maxMana = Math.max(1, Math.min(player.maxMana || 1, this.gameConfig.maxMana));
      player.hand = Array.isArray(player.hand) ? player.hand : [];
      player.field = Array.isArray(player.field) ? player.field : [];
      
      if (player.hand.length > this.gameConfig.maxHandSize) {
        player.hand = player.hand.slice(0, this.gameConfig.maxHandSize);
      }
      if (player.field.length > this.gameConfig.maxFieldSize) {
        player.field = player.field.slice(0, this.gameConfig.maxFieldSize);
      }

      player.field.forEach(minion => {
        if (minion.currentHp === undefined) minion.currentHp = minion.hp || 1;
        if (minion.attack === undefined) minion.attack = 0;
        if (minion.currentHp > minion.hp) minion.currentHp = minion.hp;
      });
    }

    room.currentPlayer = room.currentPlayer === 1 ? 1 : 0;
    room.turnNumber = Math.max(1, room.turnNumber || 1);

    logger.info('[GameEngine] 游戏状态修复完成', { roomId: room.id });
  }

  initGame(room) {
    try {
      logger.info('[GameEngine] 初始化游戏', { roomId: room.id });

      room.gameStarted = true;
      room.turnNumber = 1;
      room.currentPlayer = Math.floor(Math.random() * 2);
      room.actionLog = [];

      room.players.forEach((player, index) => {
        player.hp = this.gameConfig.startingHp;
        player.maxHp = this.gameConfig.startingHp;
        player.mana = this.gameConfig.startingMana;
        player.maxMana = this.gameConfig.startingMana;
        player.deck = this.createDeck();
        player.hand = [];
        player.field = [];
        
        for (let i = 0; i < this.gameConfig.startingHandSize; i++) {
          this.drawCard(player);
        }

        logger.debug('[GameEngine] 玩家初始状态', { 
          roomId: room.id,
          playerIndex: index,
          playerId: player.id,
          handSize: player.hand.length,
          deckSize: player.deck.length
        });
      });

      this.drawCard(room.players[room.currentPlayer]);

      const validation = this.validateGameState(room);
      if (!validation.valid) {
        logger.error('[GameEngine] 游戏初始化后状态无效', { error: validation.error });
        this.repairGameState(room);
      }

      this.logAction(room, 'game_start', { 
        firstPlayer: room.currentPlayer,
        players: room.players.map(p => ({ id: p.id, hp: p.hp }))
      });

      const gameState = this.getSerializableState(room, 0);
      logger.info('[GameEngine] 游戏初始化完成', { roomId: room.id, firstPlayer: room.currentPlayer });
      
      return gameState;
    } catch (error) {
      logger.error('[GameEngine] 游戏初始化失败', { roomId: room.id, error: error.message });
      throw error;
    }
  }

  createDeck() {
    try {
      const deck = [];
      const cardPool = CardData.getAllCards();
      
      for (let i = 0; i < this.gameConfig.deckSize; i++) {
        const cardTemplate = cardPool[Math.floor(Math.random() * cardPool.length)];
        const card = {
          ...cardTemplate,
          instanceId: uuidv4()
        };
        deck.push(card);
      }
      
      return deck.sort(() => Math.random() - 0.5);
    } catch (error) {
      logger.error('[GameEngine] 创建牌组失败', { error: error.message });
      throw error;
    }
  }

  drawCard(player) {
    try {
      if (player.deck.length > 0 && player.hand.length < this.gameConfig.maxHandSize) {
        const card = player.deck.pop();
        player.hand.push(card);
        logger.debug('[GameEngine] 抽牌', { playerId: player.id, cardName: card.name, handSize: player.hand.length });
        return card;
      }
      
      if (player.deck.length === 0) {
        logger.debug('[GameEngine] 牌库已空', { playerId: player.id });
      }
      
      if (player.hand.length >= this.gameConfig.maxHandSize) {
        logger.debug('[GameEngine] 手牌已满', { playerId: player.id });
      }
      
      return null;
    } catch (error) {
      logger.error('[GameEngine] 抽牌失败', { playerId: player.id, error: error.message });
      return null;
    }
  }

  isPlayerTurn(room, playerId) {
    if (!room || room.players.length === 0) return false;
    const currentPlayer = room.players[room.currentPlayer];
    return currentPlayer && currentPlayer.id === playerId;
  }

  getNextPlayer(room) {
    return (room.currentPlayer + 1) % 2;
  }

  getOpponent(room, playerId) {
    return room.players.find(p => p.id !== playerId);
  }

  validateCardPlay(room, player, cardInstanceId, targetId) {
    const cardIndex = player.hand.findIndex(c => c.instanceId === cardInstanceId);
    
    if (cardIndex === -1) {
      return { valid: false, error: '卡牌不存在' };
    }

    const card = player.hand[cardIndex];
    
    if (card.cost > player.mana) {
      return { valid: false, error: '法力值不足' };
    }

    if (card.type === 'minion' && player.field.length >= this.gameConfig.maxFieldSize) {
      return { valid: false, error: '战场已满' };
    }

    if (card.requiresTarget || card.effect === 'damage' || card.effect === 'heal' || card.effect === 'buff') {
      if (!targetId) {
        return { valid: false, error: '需要选择目标' };
      }
    }

    return { valid: true, card, cardIndex };
  }

  playCard(room, playerId, cardInstanceId, targetId) {
    try {
      const player = room.players.find(p => p.id === playerId);
      const opponent = this.getOpponent(room, playerId);
      
      if (!player || !opponent) {
        throw new Error('玩家不存在');
      }

      const validation = this.validateCardPlay(room, player, cardInstanceId, targetId);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      const { card, cardIndex } = validation;

      player.mana -= card.cost;
      player.hand.splice(cardIndex, 1);

      let result = {
        card: { ...card },
        playerId,
        effects: []
      };

      if (card.type === 'minion') {
        const minion = {
          ...card,
          currentHp: card.hp,
          canAttack: card.charge || false,
          hasAttacked: false
        };
        player.field.push(minion);
        result.effects.push({ type: 'summon', minion: { ...minion }, playerIndex: room.players.indexOf(player) });
        logger.debug('[GameEngine] 召唤随从', { roomId: room.id, playerId, minion: card.name });
      } else if (card.type === 'spell') {
        const spellResult = this.castSpell(card, player, opponent, targetId);
        result.effects.push(...spellResult.effects);
        logger.debug('[GameEngine] 施放法术', { roomId: room.id, playerId, spell: card.name });
      }

      if (card.battlecry) {
        const battlecryResult = this.triggerBattlecry(card, player, opponent, targetId);
        result.effects.push(...battlecryResult.effects);
        logger.debug('[GameEngine] 触发战吼', { roomId: room.id, playerId, battlecry: card.battlecry });
      }

      this.cleanupDeadMinions(room);
      this.logAction(room, 'play_card', { playerId, card: card.name, targetId });

      const stateValidation = this.validateGameState(room);
      if (!stateValidation.valid) {
        logger.warn('[GameEngine] 打牌后状态无效，进行修复', { error: stateValidation.error });
        this.repairGameState(room);
      }

      return result;
    } catch (error) {
      logger.error('[GameEngine] 打牌失败', { roomId: room.id, playerId, error: error.message });
      throw error;
    }
  }

  castSpell(spell, player, opponent, targetId) {
    const effects = [];
    const targetPlayer = targetId === 'hero' || player.field.find(m => m.instanceId === targetId) ? player : opponent;

    switch (spell.effect) {
      case 'damage':
        if (targetId === 'hero') {
          targetPlayer.hp = Math.max(0, targetPlayer.hp - spell.value);
          effects.push({ 
            type: 'damage_hero', 
            target: targetPlayer === opponent ? 'opponent' : 'self', 
            value: spell.value,
            newHp: targetPlayer.hp
          });
        } else {
          const targetMinion = targetPlayer.field.find(m => m.instanceId === targetId);
          if (targetMinion) {
            targetMinion.currentHp = Math.max(0, targetMinion.currentHp - spell.value);
            effects.push({ 
              type: 'damage_minion', 
              targetId, 
              value: spell.value,
              currentHp: targetMinion.currentHp
            });
          }
        }
        break;

      case 'heal':
        if (targetId === 'hero') {
          const oldHp = player.hp;
          player.hp = Math.min(player.hp + spell.value, player.maxHp);
          effects.push({ 
            type: 'heal_hero', 
            target: 'self', 
            value: player.hp - oldHp,
            newHp: player.hp
          });
        } else {
          const targetMinion = player.field.find(m => m.instanceId === targetId);
          if (targetMinion) {
            const oldHp = targetMinion.currentHp;
            targetMinion.currentHp = Math.min(targetMinion.currentHp + spell.value, targetMinion.hp);
            effects.push({ 
              type: 'heal_minion', 
              targetId, 
              value: targetMinion.currentHp - oldHp,
              currentHp: targetMinion.currentHp
            });
          }
        }
        break;

      case 'draw':
        const drawnCards = [];
        for (let i = 0; i < spell.value; i++) {
          const card = this.drawCard(player);
          if (card) drawnCards.push(card.instanceId);
        }
        effects.push({ type: 'draw_cards', value: drawnCards.length, cards: drawnCards });
        break;

      case 'aoe':
        const deadMinions = [];
        opponent.field.forEach(minion => {
          minion.currentHp = Math.max(0, minion.currentHp - spell.value);
          if (minion.currentHp <= 0) {
            deadMinions.push(minion.instanceId);
          }
        });
        effects.push({ type: 'aoe_damage', value: spell.value, deadMinions });
        break;

      case 'buff':
        const buffTarget = player.field.find(m => m.instanceId === targetId);
        if (buffTarget) {
          buffTarget.attack += spell.attackBuff || 0;
          buffTarget.currentHp += spell.hpBuff || 0;
          buffTarget.hp += spell.hpBuff || 0;
          effects.push({ 
            type: 'buff', 
            targetId, 
            attackBuff: spell.attackBuff || 0, 
            hpBuff: spell.hpBuff || 0,
            newAttack: buffTarget.attack,
            newHp: buffTarget.currentHp
          });
        }
        break;
    }

    return { effects };
  }

  triggerBattlecry(card, player, opponent, targetId) {
    const effects = [];
    
    switch (card.battlecry) {
      case 'damage':
        if (targetId && targetId !== 'hero') {
          const target = opponent.field.find(m => m.instanceId === targetId);
          if (target) {
            target.currentHp = Math.max(0, target.currentHp - card.battlecryValue);
            effects.push({ 
              type: 'battlecry_damage', 
              targetId, 
              value: card.battlecryValue,
              currentHp: target.currentHp
            });
          }
        } else if (targetId === 'hero') {
          opponent.hp = Math.max(0, opponent.hp - card.battlecryValue);
          effects.push({ 
            type: 'battlecry_damage_hero', 
            value: card.battlecryValue,
            newHp: opponent.hp
          });
        }
        break;

      case 'heal':
        const oldHp = player.hp;
        player.hp = Math.min(player.hp + card.battlecryValue, player.maxHp);
        effects.push({ 
          type: 'battlecry_heal', 
          value: player.hp - oldHp,
          newHp: player.hp
        });
        break;
    }

    return { effects };
  }

  attackWithMinion(room, playerId, attackerId, targetId) {
    try {
      const player = room.players.find(p => p.id === playerId);
      const opponent = this.getOpponent(room, playerId);
      
      if (!player || !opponent) {
        throw new Error('玩家不存在');
      }

      const attacker = player.field.find(m => m.instanceId === attackerId);
      if (!attacker) {
        throw new Error('攻击者不存在');
      }
      
      if (!attacker.canAttack || attacker.hasAttacked) {
        throw new Error('随从无法攻击');
      }

      const tauntMinions = opponent.field.filter(m => m.taunt);
      
      if (targetId === 'hero') {
        if (tauntMinions.length > 0) {
          throw new Error('必须先攻击有嘲讽的随从');
        }
        
        const damage = attacker.attack;
        opponent.hp = Math.max(0, opponent.hp - damage);
        attacker.hasAttacked = true;

        logger.debug('[GameEngine] 随从攻击英雄', { 
          roomId: room.id, 
          attacker: attacker.name, 
          damage,
          targetHp: opponent.hp
        });

        const result = {
          effects: [{ 
            type: 'attack_hero', 
            attackerId, 
            damage,
            targetHp: opponent.hp
          }]
        };

        this.logAction(room, 'attack_hero', { attacker: attacker.name, damage });
        return result;
      } else {
        const target = opponent.field.find(m => m.instanceId === targetId);
        if (!target) {
          throw new Error('目标不存在');
        }

        if (tauntMinions.length > 0 && !target.taunt) {
          throw new Error('必须先攻击有嘲讽的随从');
        }

        const attackerDamage = target.attack;
        const targetDamage = attacker.attack;

        target.currentHp = Math.max(0, target.currentHp - targetDamage);
        attacker.currentHp = Math.max(0, attacker.currentHp - attackerDamage);
        attacker.hasAttacked = true;

        logger.debug('[GameEngine] 随从战斗', { 
          roomId: room.id,
          attacker: attacker.name,
          target: target.name,
          attackerDamage,
          targetDamage
        });

        const effects = [{ 
          type: 'minion_combat', 
          attackerId, 
          targetId, 
          attackerDamage,
          targetDamage,
          attackerHp: attacker.currentHp,
          targetHp: target.currentHp
        }];

        this.cleanupDeadMinions(room);
        this.logAction(room, 'minion_combat', { attacker: attacker.name, target: target.name });

        const stateValidation = this.validateGameState(room);
        if (!stateValidation.valid) {
          logger.warn('[GameEngine] 攻击后状态无效，进行修复', { error: stateValidation.error });
          this.repairGameState(room);
        }

        return {
          effects
        };
      }
    } catch (error) {
      logger.error('[GameEngine] 随从攻击失败', { roomId: room.id, playerId, error: error.message });
      throw error;
    }
  }

  cleanupDeadMinions(room) {
    room.players.forEach(player => {
      const deadMinions = player.field.filter(m => m.currentHp <= 0);
      if (deadMinions.length > 0) {
        player.field = player.field.filter(m => m.currentHp > 0);
        deadMinions.forEach(m => {
          logger.debug('[GameEngine] 随从死亡', { name: m.name, playerId: player.id });
        });
      }
    });
  }

  endTurn(room) {
    try {
      const previousPlayer = room.currentPlayer;
      room.currentPlayer = this.getNextPlayer(room);
      room.turnNumber++;

      const currentPlayer = room.players[room.currentPlayer];
      currentPlayer.maxMana = Math.min(currentPlayer.maxMana + 1, this.gameConfig.maxMana);
      currentPlayer.mana = currentPlayer.maxMana;

      currentPlayer.field.forEach(minion => {
        minion.canAttack = true;
        minion.hasAttacked = false;
      });

      this.drawCard(currentPlayer);

      logger.info('[GameEngine] 回合结束', { 
        roomId: room.id,
        previousPlayer,
        newPlayer: room.currentPlayer,
        turnNumber: room.turnNumber
      });

      this.logAction(room, 'end_turn', { 
        previousPlayer,
        newPlayer: room.currentPlayer,
        turnNumber: room.turnNumber
      });

      const validation = this.validateGameState(room);
      if (!validation.valid) {
        logger.warn('[GameEngine] 回合结束后状态无效，进行修复', { error: validation.error });
        this.repairGameState(room);
      }

      return {
        currentPlayer: room.currentPlayer,
        turnNumber: room.turnNumber
      };
    } catch (error) {
      logger.error('[GameEngine] 结束回合失败', { roomId: room.id, error: error.message });
      throw error;
    }
  }

  checkGameOver(room) {
    const deadPlayers = room.players.filter(p => p.hp <= 0);
    if (deadPlayers.length > 0) {
      logger.info('[GameEngine] 游戏结束', { 
        roomId: room.id, 
        deadPlayers: deadPlayers.map(p => p.id)
      });
      return true;
    }
    return false;
  }

  getWinner(room) {
    const winner = room.players.find(p => p.hp > 0);
    if (winner) {
      logger.info('[GameEngine] 确定胜者', { roomId: room.id, winnerId: winner.id });
    }
    return winner ? winner.id : null;
  }

  getPlayerStates(room) {
    return room.players.map(p => ({
      id: p.id,
      h: p.hp,
      mh: p.maxHp,
      m: p.mana,
      mm: p.maxMana,
      hc: p.hand.length,
      field: p.field.map(m => ({
        iid: m.instanceId,
        n: m.name,
        a: m.attack,
        h: m.hp,
        ch: m.currentHp,
        t: m.taunt || false,
        ca: m.canAttack || false,
        ha: m.hasAttacked || false,
        cg: m.charge || false
      }))
    }));
  }

  getSerializableState(room, playerIndex) {
    const currentPlayerData = room.players[playerIndex];
    const opponentIndex = 1 - playerIndex;
    const opponentData = room.players[opponentIndex];

    return {
      players: [
        this.getPlayerStateForClient(currentPlayerData, true),
        this.getPlayerStateForClient(opponentData, false)
      ],
      cp: room.currentPlayer,
      tn: room.turnNumber,
      hand: currentPlayerData.hand.map(c => ({
        iid: c.instanceId,
        id: c.id,
        n: c.name,
        c: c.cost,
        tp: c.type,
        a: c.attack,
        h: c.hp,
        r: c.rarity,
        d: c.description,
        bc: c.battlecry,
        bv: c.battlecryValue,
        ef: c.effect,
        v: c.value,
        ab: c.attackBuff,
        hb: c.hpBuff,
        cg: c.charge,
        t: c.taunt,
        rt: c.requiresTarget
      }))
    };
  }

  getPlayerStateForClient(player, isCurrentPlayer) {
    return {
      id: player.id,
      h: player.hp,
      mh: player.maxHp,
      m: player.mana,
      mm: player.maxMana,
      hc: player.hand.length,
      field: player.field.map(m => ({
        iid: m.instanceId,
        n: m.name,
        a: m.attack,
        h: m.hp,
        ch: m.currentHp,
        t: m.taunt || false,
        ca: m.canAttack || false,
        ha: m.hasAttacked || false,
        cg: m.charge || false
      }))
    };
  }

  logAction(room, actionType, data) {
    room.actionLog.push({
      turnNumber: room.turnNumber,
      actionType,
      data,
      timestamp: Date.now()
    });

    if (this.db && room.id) {
      try {
        this.db.saveBattleLog(room.id, room.turnNumber, actionType, data);
      } catch (err) {
        logger.debug('[GameEngine] 保存对战日志失败', { error: err.message });
      }
    }
  }

  validateAndSyncState(room) {
    const validation = this.validateGameState(room);
    if (!validation.valid) {
      logger.warn('[GameEngine] 状态验证失败，执行修复', { error: validation.error });
      this.repairGameState(room);
      return { repaired: true, error: validation.error };
    }
    return { repaired: false };
  }
}

module.exports = GameEngine;