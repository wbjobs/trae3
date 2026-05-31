import { useState, useRef, useEffect } from "react";
import { Send, MessageSquare, ChevronDown } from "lucide-react";
import { useGameStore } from "../stores/gameStore";

interface ChatWindowProps {
  gameId: string;
  onSend: (gameId: string, message: string) => void;
}

export default function ChatWindow({ gameId, onSend }: ChatWindowProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { chatMessages } = useGameStore();

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(gameId, trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)]/90 backdrop-blur border border-[var(--color-border)] rounded-military text-tactical-sand text-sm hover:bg-[var(--color-surface-hover)] transition-colors z-50"
      >
        <MessageSquare size={16} />
        <span>通信</span>
        {chatMessages.length > 0 && (
          <span className="bg-alert-red text-white text-[10px] px-1.5 py-0.5 rounded-full">
            {chatMessages.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 h-72 bg-[var(--color-bg-secondary)]/95 backdrop-blur border border-[var(--color-border)] rounded-military flex flex-col z-50 animate-slide-up">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 text-tactical-sand text-sm">
          <MessageSquare size={14} />
          <span className="font-serif">战情通信</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-data-gray hover:text-tactical-sand transition-colors"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
        {chatMessages.length === 0 && (
          <p className="text-xs text-data-gray text-center py-4">暂无消息</p>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className="px-2 py-1">
            <span className="text-xs text-tactical-sand font-medium">{msg.senderName}</span>
            <span className="text-xs text-data-gray ml-2">{msg.message}</span>
          </div>
        ))}
      </div>

      <div className="p-2 border-t border-[var(--color-border)]">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-military px-2 py-1.5 text-xs text-[var(--color-text)] placeholder-data-gray focus:outline-none focus:border-tactical-sand/50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-2 py-1.5 bg-tactical-sand/20 text-tactical-sand rounded-military hover:bg-tactical-sand/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
