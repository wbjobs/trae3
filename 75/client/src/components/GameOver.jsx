function GameOver({ winner, player, onPlayAgain }) {
  const isWinner = winner === player.id

  return (
    <div className="game-over-container">
      <h1 className="game-over-title">
        {isWinner ? '🎉 胜利!' : '💀 失败'}
      </h1>
      <p className="game-over-subtitle">
        {isWinner ? '恭喜你赢得了这场战斗!' : '再接再厉，下次一定能赢!'}
      </p>
      <button className="play-again-btn" onClick={onPlayAgain}>
        再来一局
      </button>
    </div>
  )
}

export default GameOver