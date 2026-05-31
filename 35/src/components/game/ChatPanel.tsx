import { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { GameSocket } from '../../network/GameSocket';
import { GameCard } from '../common/GameCard';
import { IDGenerator } from '../../utils/IDGenerator';

export function ChatPanel() {
  const [message, setMessage] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatMessages = useGameStore((state) => state.chatMessages);
  const addChatMessage = useGameStore((state) => state.addChatMessage);
  const currentRoom = useGameStore((state) => state.currentRoom);
  const playerId = useGameStore((state) => state.playerId);
  const nickname = useGameStore((state) => state.nickname);
  const isInGame = useGameStore((state) => state.isInGame);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentRoom) return;

    const socket = GameSocket.getInstance();
    const chatMessage = {
      id: IDGenerator.generate(),
      playerId,
      nickname,
      content: message.trim(),
      timestamp: Date.now(),
      roomId: currentRoom.id
    };

    socket.emit('chat:send', chatMessage);
    addChatMessage(chatMessage);
    setMessage('');
  };

  const unreadCount = isExpanded ? 0 : chatMessages.slice(-5).filter(m => m.playerId !== playerId).length;

  if (!isInGame || !currentRoom) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80">
      <GameCard className={`transition-all duration-300 ${isExpanded ? 'h-96' : 'h-auto'}`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-3 flex items-center justify-between hover:bg-slate-800/50 rounded-lg transition-colors"
        >
          <span className="text-white font-semibold flex items-center gap-2">
            聊天室
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </span>
          <span className="text-gray-400 text-sm">
            {isExpanded ? '收起 ▲' : '展开 ▼'}
          </span>
        </button>

        {isExpanded && (
          <>
            <div className="h-64 overflow-y-auto px-3 space-y-2 mb-3 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800">
              {chatMessages.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">暂无消息</p>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.playerId === playerId ? 'items-end' : 'items-start'
                    }`}
                  >
                    <span
                      className={`text-xs mb-1 ${
                        msg.playerId === playerId ? 'text-cyan-400' : 'text-yellow-400'
                      }`}
                    >
                      {msg.nickname}
                    </span>
                    <div
                      className={`max-w-[80%] px-3 py-2 rounded-lg ${
                        msg.playerId === playerId
                          ? 'bg-cyan-600 text-white rounded-br-none'
                          : 'bg-slate-700 text-gray-200 rounded-bl-none'
                      }`}
                    >
                      <p className="text-sm break-words">{msg.content}</p>
                    </div>
                    <span className="text-xs text-gray-500 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} className="px-3 pb-3 flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="输入消息..."
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-500"
                maxLength={200}
              />
              <button
                type="submit"
                disabled={!message.trim()}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
              >
                发送
              </button>
            </form>
          </>
        )}
      </GameCard>
    </div>
  );
}
