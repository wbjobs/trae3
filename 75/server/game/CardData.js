class CardData {
  static getAllCards() {
    return [
      {
        id: 1,
        name: '火焰小鬼',
        cost: 1,
        type: 'minion',
        attack: 2,
        hp: 1,
        rarity: 'common',
        description: '战吼：对敌方英雄造成1点伤害',
        battlecry: 'damage',
        battlecryValue: 1
      },
      {
        id: 2,
        name: '治疗机器人',
        cost: 2,
        type: 'minion',
        attack: 1,
        hp: 3,
        rarity: 'common',
        description: '战吼：恢复2点生命值',
        battlecry: 'heal',
        battlecryValue: 2
      },
      {
        id: 3,
        name: '嘲讽卫士',
        cost: 3,
        type: 'minion',
        attack: 2,
        hp: 5,
        rarity: 'common',
        taunt: true,
        description: '嘲讽'
      },
      {
        id: 4,
        name: '冲锋骑士',
        cost: 3,
        type: 'minion',
        attack: 3,
        hp: 2,
        rarity: 'common',
        charge: true,
        description: '冲锋'
      },
      {
        id: 5,
        name: '狮王',
        cost: 6,
        type: 'minion',
        attack: 6,
        hp: 5,
        rarity: 'rare',
        description: '强力的狮子'
      },
      {
        id: 6,
        name: '巨龙',
        cost: 8,
        type: 'minion',
        attack: 8,
        hp: 8,
        rarity: 'legendary',
        description: '传说中的巨龙'
      },
      {
        id: 7,
        name: '小精灵',
        cost: 1,
        type: 'minion',
        attack: 1,
        hp: 1,
        rarity: 'common',
        description: '弱小的精灵'
      },
      {
        id: 8,
        name: '石拳食人魔',
        cost: 4,
        type: 'minion',
        attack: 5,
        hp: 4,
        rarity: 'common',
        description: '标准身材'
      },
      {
        id: 101,
        name: '火球术',
        cost: 4,
        type: 'spell',
        rarity: 'common',
        effect: 'damage',
        value: 6,
        description: '对一个目标造成6点伤害'
      },
      {
        id: 102,
        name: '治疗术',
        cost: 2,
        type: 'spell',
        rarity: 'common',
        effect: 'heal',
        value: 5,
        description: '恢复5点生命值'
      },
      {
        id: 103,
        name: '奥术智慧',
        cost: 3,
        type: 'spell',
        rarity: 'common',
        effect: 'draw',
        value: 2,
        description: '抽两张牌'
      },
      {
        id: 104,
        name: '烈焰风暴',
        cost: 6,
        type: 'spell',
        rarity: 'rare',
        effect: 'aoe',
        value: 4,
        description: '对所有敌方随从造成4点伤害'
      },
      {
        id: 105,
        name: '力量祝福',
        cost: 2,
        type: 'spell',
        rarity: 'common',
        effect: 'buff',
        attackBuff: 3,
        hpBuff: 0,
        description: '使一个随从获得+3攻击力'
      },
      {
        id: 106,
        name: '神圣之灵',
        cost: 2,
        type: 'spell',
        rarity: 'common',
        effect: 'buff',
        attackBuff: 0,
        hpBuff: 4,
        description: '使一个随从获得+4生命值'
      },
      {
        id: 107,
        name: '小精灵',
        cost: 1,
        type: 'spell',
        rarity: 'common',
        effect: 'damage',
        value: 2,
        description: '对一个目标造成2点伤害'
      },
      {
        id: 108,
        name: '寒冰箭',
        cost: 2,
        type: 'spell',
        rarity: 'common',
        effect: 'damage',
        value: 3,
        description: '对一个目标造成3点伤害'
      }
    ];
  }

  static getCardById(id) {
    return this.getAllCards().find(c => c.id === id);
  }
}

module.exports = CardData;