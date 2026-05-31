import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'

function Login({ onLogin }) {
  const [nickname, setNickname] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (nickname.trim()) {
      const playerId = localStorage.getItem('playerId') || uuidv4()
      localStorage.setItem('playerId', playerId)
      onLogin(playerId, nickname.trim())
    }
  }

  return (
    <div className="login-container">
      <h1>⚔️ 卡牌对战</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="输入你的昵称"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
        />
        <button type="submit">开始游戏</button>
      </form>
    </div>
  )
}

export default Login