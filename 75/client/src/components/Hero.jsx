import { memo } from 'react'

const Hero = memo(function Hero({ hero, hp, maxHp, isTargetable, onClick, isOpponent }) {
  const displayHp = hero ? (hero.h || hero.hp) : hp
  const displayMaxHp = hero ? (hero.mh || hero.maxHp) : maxHp

  return (
    <div
      className={`hero-portrait ${isTargetable ? 'targetable' : ''}`}
      onClick={onClick}
    >
      {isOpponent ? '👿' : '😇'}
      <div className="hero-hp">{displayHp}/{displayMaxHp}</div>
    </div>
  )
})

export default Hero
