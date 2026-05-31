import { useState, useEffect } from 'react'
import './styles.css'

function DeckManager({ socket }) {
  const [decks, setDecks] = useState([])
  const [deckName, setDeckName] = useState('')
  const [selectedCards, setSelectedCards] = useState([])
  const [editingDeck, setEditingDeck] = useState(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (socket) {
      socket.emit('deck_list')

      socket.on('deck_list', (data) => {
        setDecks(data.decks || [])
      })

      socket.on('deck_created', (data) => {
        setDecks([...decks, data.deck])
        resetForm()
      })

      socket.on('deck_updated', (data) => {
        setDecks(decks.map(d => d.id === data.deck.id ? data.deck : d))
        resetForm()
      })

      socket.on('deck_deleted', (data) => {
        setDecks(decks.filter(d => d.id !== data.deckId))
      })

      socket.on('deck_backup_done', () => {
        alert('备份成功')
      })

      socket.on('deck_restored', (data) => {
        setDecks(data.decks || [])
        alert('恢复成功')
      })
    }

    return () => {
      if (socket) {
        socket.off('deck_list')
        socket.off('deck_created')
        socket.off('deck_updated')
        socket.off('deck_deleted')
        socket.off('deck_backup_done')
        socket.off('deck_restored')
      }
    }
  }, [socket, decks])

  const resetForm = () => {
    setDeckName('')
    setSelectedCards([])
    setEditingDeck(null)
    setShowForm(false)
  }

  const addCard = (cardId) => {
    if (selectedCards.length < 30) {
      setSelectedCards([...selectedCards, cardId])
    }
  }

  const removeCard = (index) => {
    const newCards = [...selectedCards]
    newCards.splice(index, 1)
    setSelectedCards(newCards)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!deckName.trim() || selectedCards.length !== 30) {
      alert('请输入卡组名称并选择30张卡牌')
      return
    }

    if (editingDeck) {
      socket.emit('deck_update', {
        deckId: editingDeck.id,
        name: deckName,
        cards: selectedCards
      })
    } else {
      socket.emit('deck_create', {
        name: deckName,
        cards: selectedCards
      })
    }
  }

  const handleEdit = (deck) => {
    setEditingDeck(deck)
    setDeckName(deck.name)
    setSelectedCards([...deck.cards])
    setShowForm(true)
  }

  const handleDelete = (deckId) => {
    if (confirm('确定要删除这个卡组吗？')) {
      socket.emit('deck_delete', { deckId })
    }
  }

  const handleBackup = () => {
    socket.emit('deck_backup')
  }

  const handleRestore = () => {
    socket.emit('deck_restore')
  }

  const availableCards = Array.from({ length: 16 }, (_, i) => i + 1)

  return (
    <div className="deck-manager">
      <div className="deck-header">
        <h2>卡组管理</h2>
        <div className="deck-actions">
          <button className="btn-primary" onClick={() => setShowForm(true)}>
            新建卡组
          </button>
          <button className="btn-secondary" onClick={handleBackup}>
            云端备份
          </button>
          <button className="btn-secondary" onClick={handleRestore}>
            恢复备份
          </button>
        </div>
      </div>

      {showForm && (
        <div className="deck-form">
          <h3>{editingDeck ? '编辑卡组' : '新建卡组'}</h3>
          <form onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="输入卡组名称"
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              maxLength={20}
            />
            <div className="card-selection">
              <div className="available-cards">
                <h4>可选卡牌 (点击添加)</h4>
                <div className="cards-grid">
                  {availableCards.map(cardId => (
                    <div
                      key={cardId}
                      className="card-option"
                      onClick={() => addCard(cardId)}
                    >
                      {cardId}
                    </div>
                  ))}
                </div>
              </div>
              <div className="selected-cards">
                <h4>已选卡牌 ({selectedCards.length}/30)</h4>
                <div className="cards-grid">
                  {selectedCards.map((cardId, index) => (
                    <div
                      key={index}
                      className="card-option selected"
                      onClick={() => removeCard(index)}
                    >
                      {cardId}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="form-buttons">
              <button type="submit" className="btn-primary">
                {editingDeck ? '保存修改' : '创建卡组'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="deck-list">
        {decks.length === 0 ? (
          <p className="empty-message">暂无卡组，点击上方按钮创建</p>
        ) : (
          decks.map(deck => (
            <div key={deck.id} className="deck-item">
              <div className="deck-info">
                <h4>{deck.name}</h4>
                <p>{deck.cards.length} 张卡牌</p>
              </div>
              <div className="deck-cards-preview">
                {deck.cards.slice(0, 10).map((cardId, i) => (
                  <span key={i} className="card-mini">{cardId}</span>
                ))}
                {deck.cards.length > 10 && <span>...</span>}
              </div>
              <div className="deck-item-actions">
                <button className="btn-secondary" onClick={() => handleEdit(deck)}>
                  编辑
                </button>
                <button className="btn-danger" onClick={() => handleDelete(deck.id)}>
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default DeckManager
