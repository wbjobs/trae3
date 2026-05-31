import { memo } from 'react'

const Minion = memo(function Minion({ minion, isTargetable, canAttack, isSelected, onClick }) {
  const name = minion.n || minion.name
  const attack = minion.a || minion.attack
  const currentHp = minion.ch || minion.currentHp
  const taunt = minion.t !== undefined ? minion.t : minion.taunt

  return (
    <div
      className={`minion-on-field ${isTargetable ? 'targetable' : ''} ${canAttack ? 'can-attack' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {taunt && <div className="taunt-indicator">🛡️</div>}
      <div className="minion-portrait">👹</div>
      <div className="minion-name">{name}</div>
      <div className="minion-stats">
        <div className="card-attack">{attack}</div>
        <div className="card-health">{currentHp}</div>
      </div>
    </div>
  )
})

export default Minion
