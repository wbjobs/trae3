import { create } from 'zustand';
import type { Message } from '@/types';
import { api } from '@/utils/api';

interface MessageState {
  messages: Message[];
  unreadCount: number;
  loading: boolean;
  fetchMessages: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  unreadCount: 0,
  loading: false,

  fetchMessages: async () => {
    set({ loading: true });
    try {
      const res = await api.get<Message[]>('/messages');
      set({ messages: res });
    } finally {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async () => {
    const res = await api.get<{ count: number }>('/messages/unread-count');
    set({ unreadCount: res.count });
  },

  markAsRead: async (id: number) => {
    await api.post(`/messages/${id}/read`);
    const { messages, fetchUnreadCount } = get();
    set({ messages: messages.map((m) => (m.id === id ? { ...m, read: true } : m)) });
    fetchUnreadCount();
  },

  markAllAsRead: async () => {
    await api.post('/messages/read-all');
    const { messages } = get();
    set({ messages: messages.map((m) => ({ ...m, read: true })), unreadCount: 0 });
  },
}));
