const shortKeyMap = {
  iid: 'instanceId',
  n: 'name',
  a: 'attack',
  h: 'hp',
  ch: 'currentHp',
  t: 'taunt',
  ca: 'canAttack',
  ha: 'hasAttacked',
  cg: 'charge',
  mh: 'maxHp',
  m: 'mana',
  mm: 'maxMana',
  hc: 'handCount',
  cp: 'currentPlayer',
  tn: 'turnNumber',
  d: 'description',
  c: 'cost',
  tp: 'type',
  r: 'rarity',
  bc: 'battlecry',
  bv: 'battlecryValue',
  ef: 'effect',
  v: 'value',
  ab: 'attackBuff',
  hb: 'hpBuff',
  rt: 'requiresTarget'
}

function deepExpand(obj) {
  if (obj === null || obj === undefined) {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepExpand(item))
  }
  if (typeof obj === 'object') {
    const result = {}
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const longKey = shortKeyMap[key] || key
        result[longKey] = deepExpand(obj[key])
      }
    }
    return result
  }
  return obj
}

function expandGameState(state) {
  return deepExpand(state)
}

export { expandGameState, shortKeyMap }
