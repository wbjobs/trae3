import { useState, useEffect } from 'react'
import './styles.css'

function ReplayList({ playerId, onSelectReplay }) {
  const [replays, setReplays] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReplays = async () => {
      if (!playerId) return
      
      try {
        const response = await fetch('/api/replays/' + playerId)
        if (response.ok) {
          const data = await response.json()
          setReplays(data.replays || [])
        }
      } catch (error) {
        console.error('获取录像列表失败:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReplays()
  }, [playerId])

  const formatDuration = (seconds) => {
    if (!seconds) return '未知'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}分${secs}秒`
  }

  return (
    <div className="replay-list">
      <div className="replay-list-header">
        <h2>录像列表</h2>
      </div>

      {loading ? (
        <div className="waiting-animation">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      ) : replays.length === 0 ? (
        <p className="empty-message">暂无录像记录</p>
      ) : (
        <div className="replay-items">
          {replays.map((replay) => (
            <div
              key={replay.id}
              className="replay-item"
              onClick={() => onSelectReplay(replay.id)}
            >
              <div className="replay-item-main">
                <span className="replay-opponent">
                  对手: {replay.opponent || '未知'}
                </span>
                <span className={`replay-result ${replay.result === 'win' ? 'win' : 'lose'}`}>
                  {replay.result === 'win' ? '胜利' : '失败'}
                </span>
              </div>
              <div className="replay-item-details">
                <span>时长: {formatDuration(replay.duration)}</span>
                <span>日期: {replay.date || '未知'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ReplayList
