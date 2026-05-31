import { useState, useEffect, useMemo, useCallback } from 'react'
import Card from './Card'
import Minion from './Minion'
import Hero from './Hero'
import { expandGameState } from '../utils/stateAdapter'

function BattleField({ gameState, player, onPlayCard, onAttackMinion, onEndTurn, isMyTurn }) {
  const expandedGameState = useMemo(() => expandGameState(gameState), [gameState])
  const [selectedCard, setSelectedCard] = useState(null)
  const [selectedAttacker, setSelectedAttacker] = useState(null)
  const [showTurnIndicator, setShowTurnIndicator] = useState(false)

  const myPlayerIndex = useMemo(() => {
    return expandedGameState.players.findIndex(p => p.id === player.id)
  }, [expandedGameState.players, player.id])

  const opponentIndex = useMemo(() => 1 - myPlayerIndex, [myPlayerIndex])

  const me = useMemo(() => expandedGameState.players[myPlayerIndex], [expandedGameState.players, myPlayerIndex])
  const opponent = useMemo(() => expandedGameState.players[opponentIndex], [expandedGameState.players, opponentIndex])

  useEffect(() => {
    if (isMyTurn) {
      setShowTurnIndicator(true)
      const timer = setTimeout(() => setShowTurnIndicator(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [isMyTurn, expandedGameState.turnNumber])

  const handleCardClick = useCallback((card) => {
    if (!isMyTurn) return
    if (card.cost > me.mana) return

    setSelectedAttacker(null)
    if (selectedCard?.instanceId === card.instanceId) {
      setSelectedCard(null)
    } else {
      setSelectedCard(card)
    }
  }, [isMyTurn, me.mana, selectedCard])

  const handleCardTargetClick = useCallback((targetId) => {
    if (selectedCard && isMyTurn) {
      onPlayCard(selectedCard.instanceId, targetId)
      setSelectedCard(null)
    }
  }, [selectedCard, isMyTurn, onPlayCard])

  const handleMyMinionClick = useCallback((minion) => {
    if (!isMyTurn) return

    if (selectedCard) {
      return
    }

    if (minion.canAttack && !minion.hasAttacked) {
      if (selectedAttacker?.instanceId === minion.instanceId) {
        setSelectedAttacker(null)
      } else {
        setSelectedAttacker(minion)
      }
    }
  }, [isMyTurn, selectedCard, selectedAttacker])

  const handleAttackTargetClick = useCallback((targetId) => {
    if (selectedAttacker && isMyTurn) {
      onAttackMinion(selectedAttacker.instanceId, targetId)
      setSelectedAttacker(null)
    }
  }, [selectedAttacker, isMyTurn, onAttackMinion])

  const handleOpponentMinionClick = useCallback((minion) => {
    if (selectedCard) {
      handleCardTargetClick(minion.instanceId)
    } else if (selectedAttacker) {
      handleAttackTargetClick(minion.instanceId)
    }
  }, [selectedCard, selectedAttacker, handleCardTargetClick, handleAttackTargetClick])

  const handleOpponentHeroClick = useCallback(() => {
    if (selectedCard) {
      handleCardTargetClick('hero')
    } else if (selectedAttacker) {
      handleAttackTargetClick('hero')
    }
  }, [selectedCard, selectedAttacker, handleCardTargetClick, handleAttackTargetClick])

  const handleBackgroundClick = useCallback(() => {
    setSelectedCard(null)
    setSelectedAttacker(null)
  }, [])

  return (
    <div className="battlefield" onClick={handleBackgroundClick}>
      <div className="turn-info">
        回合 {expandedGameState.turnNumber} - {isMyTurn ? '你的回合' : '对手回合'}
      </div>

      {showTurnIndicator && isMyTurn && (
        <div className="turn-indicator">你的回合!</div>
      )}

      <div className="opponent-area">
        <div className="opponent-hand-count">
          {Array(opponent.handCount || 0).fill(0).map((_, i) => (
            <div key={i} className="hand-card-back"></div>
          ))}
        </div>

        <div className="hero-section">
          <Hero
            hp={opponent.hp}
            maxHp={opponent.maxHp}
            isTargetable={(selectedCard || selectedAttacker) && isMyTurn}
            onClick={handleOpponentHeroClick}
            isOpponent={true}
          />
          <div className="mana-crystal">
            {Array(opponent.maxMana).fill(0).map((_, i) => (
              <div
                key={i}
                className={`mana-orb ${i >= opponent.mana ? 'empty' : ''}`}
              ></div>
            ))}
          </div>
        </div>

        <div className="field-area">
          {opponent.field?.map(minion => (
            <Minion
              key={minion.instanceId}
              minion={minion}
              isTargetable={(selectedCard || selectedAttacker) && isMyTurn}
              onClick={() => handleOpponentMinionClick(minion)}
            />
          ))}
        </div>
      </div>

      <div className="player-area">
        <div className="field-area">
          {me.field?.map(minion => (
            <Minion
              key={minion.instanceId}
              minion={minion}
              canAttack={minion.canAttack && !minion.hasAttacked && isMyTurn}
              isSelected={selectedAttacker?.instanceId === minion.instanceId}
              onClick={() => handleMyMinionClick(minion)}
            />
          ))}
        </div>

        <div className="hero-section">
          <Hero
            hp={me.hp}
            maxHp={me.maxHp}
            isOpponent={false}
          />
          <div className="mana-crystal">
            {Array(me.maxMana).fill(0).map((_, i) => (
              <div
                key={i}
                className={`mana-orb ${i >= me.mana ? 'empty' : ''}`}
              ></div>
            ))}
          </div>
        </div>

        <div className="hand-area">
          {expandedGameState.myHand?.map(card => (
            <Card
              key={card.instanceId}
              card={card}
              isPlayable={card.cost <= me.mana && isMyTurn}
              isSelected={selectedCard?.instanceId === card.instanceId}
              onClick={(e) => {
                e.stopPropagation()
                handleCardClick(card)
              }}
            />
          ))}
        </div>
      </div>

      <button
        className="end-turn-btn"
        onClick={onEndTurn}
        disabled={!isMyTurn}
      >
        结束回合
      </button>
    </div>
  )
}

export default BattleField
