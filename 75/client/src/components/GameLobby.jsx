import { useState } from 'react'
import DeckManager from './DeckManager'
import ReplayList from './ReplayList'
import ReplayPlayer from './ReplayPlayer'
import './styles.css'

function GameLobby({ player, socket, onMatchmaking, isWaiting }) {
  const [activeTab, setActiveTab] = useState('match')
  const [selectedReplayId, setSelectedReplayId] = useState(null)

  const handleSelectReplay = (replayId) => {
    setSelectedReplayId(replayId)
    setActiveTab('replayPlayer')
  }

  const handleBackToList = () => {
    setSelectedReplayId(null)
    setActiveTab('replays')
  }

  const renderContent = () => {
    if (activeTab === 'decks') {
      return <DeckManager socket={socket} />
    }

    if (activeTab === 'replays') {
      return (
        <ReplayList
          playerId={player.id}
          onSelectReplay={handleSelectReplay}
        />
      )
    }

    if (activeTab === 'replayPlayer') {
      return (
        <ReplayPlayer
          socket={socket}
          player={player}
          initialReplayId={selectedReplayId}
          onBack={handleBackToList}
        />
      )
    }

    return (
      <div className="lobby-content">
        <div className="matchmaking-section">
          <h2>{isWaiting ? '正在寻找对手...' : '准备好战斗了吗？'}</h2>
          
          {isWaiting ? (
            <div className="waiting-animation">
              <div className="spinner"></div>
              <p>请稍候，正在匹配其他玩家...</p>
            </div>
          ) : (
            <button 
              className="match-btn"
              onClick={onMatchmaking}
            >
              开始匹配
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="lobby-container">
      <div className="lobby-header">
        <div className="player-info">
          <div className="player-avatar">
            {player.nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3>{player.nickname}</h3>
            <div className="player-stats">
              <div className="stat-item">
                <div className="stat-value">{player.wins}</div>
                <div className="stat-label">胜利</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{player.losses}</div>
                <div className="stat-label">失败</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{player.rating}</div>
                <div className="stat-label">积分</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {activeTab !== 'replayPlayer' && (
        <div className="lobby-tabs">
          <button
            className={`tab-btn ${activeTab === 'match' ? 'active' : ''}`}
            onClick={() => setActiveTab('match')}
          >
            开始匹配
          </button>
          <button
            className={`tab-btn ${activeTab === 'decks' ? 'active' : ''}`}
            onClick={() => setActiveTab('decks')}
          >
            卡组管理
          </button>
          <button
            className={`tab-btn ${activeTab === 'replays' ? 'active' : ''}`}
            onClick={() => setActiveTab('replays')}
          >
            录像回放
          </button>
        </div>
      )}
      
      {renderContent()}
    </div>
  )
}

export default GameLobby