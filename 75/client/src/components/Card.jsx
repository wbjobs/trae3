import { memo } from 'react'

const Card = memo(function Card({ card, isPlayable, isSelected, onClick }) {
  const rarityColors = {
    common: '#f39c12',
    rare: '#3498db',
    epic: '#9b59b6',
    legendary: '#e67e22'
  }

  const cost = card.c || card.cost
  const name = card.n || card.name
  const description = card.d || card.description
  const type = card.tp || card.type
  const rarity = card.r || card.rarity
  const attack = card.a || card.attack
  const hp = card.h || card.hp

  return (
    <div
      className={`card ${isPlayable ? 'playable' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      style={{ borderColor: rarityColors[rarity] || '#f39c12' }}
    >
      <div className="card-cost">{cost}</div>
      <div className="card-image">
        {type === 'minion' ? '👹' : '✨'}
      </div>
      <div className="card-name">{name}</div>
      <div className="card-desc">{description}</div>
      {type === 'minion' && (
        <div className="card-stats">
          <div className="card-attack">{attack}</div>
          <div className="card-health">{hp}</div>
        </div>
      )}
    </div>
  )
})

export default Card
