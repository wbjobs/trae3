import { useState, useEffect, useRef } from 'react'
import './styles.css'

function ReplayPlayer({ socket, player, onBack, initialReplayId }) {
  const [replayId, setReplayId] = useState(initialReplayId || '')
  const [replayData, setReplayData] = useState(null)
  const [currentStep, setCurrentStep] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playIntervalRef = useRef(null)

  useEffect(() => {
    if (initialReplayId) {
      setReplayId(initialReplayId)
      fetch('/api/replay/' + initialReplayId)
        .then(res => res.json())
        .then(data => {
          setReplayData(data)
          setCurrentStep(-1)
          setIsPlaying(false)
        })
        .catch(() => {
          alert('获取录像失败')
        })
    }
  }, [initialReplayId])

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isPlaying && replayData && currentStep < replayData.steps.length - 1) {
      playIntervalRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= replayData.steps.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 1000)
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }

    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
      }
    }
  }, [isPlaying, replayData, currentStep])

  const fetchReplay = async () => {
    if (!replayId.trim()) return
    
    try {
      const response = await fetch('/api/replay/' + replayId)
      if (response.ok) {
        const data = await response.json()
        setReplayData(data)
        setCurrentStep(-1)
        setIsPlaying(false)
      } else {
        alert('获取录像失败')
      }
    } catch (error) {
      alert('获取录像失败: ' + error.message)
    }
  }

  const handlePlay = () => {
    if (!replayData) return
    if (currentStep >= replayData.steps.length - 1) {
      setCurrentStep(-1)
    }
    setIsPlaying(true)
  }

  const handlePause = () => {
    setIsPlaying(false)
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleNext = () => {
    if (replayData && currentStep < replayData.steps.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      fetchReplay()
    }
  }

  return (
    <div className="replay-player">
      {onBack && (
        <div className="replay-back-btn">
          <button className="btn-secondary" onClick={onBack}>
            ← 返回列表
          </button>
        </div>
      )}
      
      <div className="replay-player-header">
        <h2>录像回放</h2>
        <div className="replay-input">
          <input
            type="text"
            placeholder="输入 replayId"
            value={replayId}
            onChange={(e) => setReplayId(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="btn-primary" onClick={fetchReplay}>
            加载
          </button>
        </div>
      </div>

      {replayData && (
        <>
          <div className="replay-controls">
            <button
              onClick={handlePrev}
              disabled={currentStep <= 0}
            >
              上一步
            </button>
            {isPlaying ? (
              <button onClick={handlePause}>
                暂停
              </button>
            ) : (
              <button
                onClick={handlePlay}
                disabled={!replayData}
              >
                播放
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!replayData || currentStep >= replayData.steps.length - 1}
            >
              下一步
            </button>
          </div>

          <div className="replay-progress">
            步骤: {currentStep + 1} / {replayData.steps.length}
          </div>

          <div className="replay-steps">
            {replayData.steps.map((step, index) => (
              <div
                key={index}
                className={`replay-step ${index === currentStep ? 'active' : ''}`}
              >
                <div className="replay-step-header">
                  <span className="step-index">步骤 {index + 1}</span>
                  <span className="step-action-type">{step.actionType}</span>
                </div>
                <div className="step-action-data">
                  {JSON.stringify(step.action_data)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!replayData && (
        <p className="empty-message">请输入 replayId 加载录像</p>
      )}
    </div>
  )
}

export default ReplayPlayer
