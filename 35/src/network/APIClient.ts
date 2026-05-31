const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface LoginResponse {
  playerId: string;
  nickname: string;
  stats: {
    totalGames: number;
    wins: number;
    kills: number;
    playTime: number;
  };
}

class APIClientClass {
  private socketId: string = '';

  setSocketId(id: string): void {
    this.socketId = id;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.socketId && { 'x-socket-id': this.socketId }),
      ...((options.headers as Record<string, string>) || {})
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });
      const json = await response.json();
      if (json.success) {
        return json.data as T;
      }
      throw new Error(json.error || '请求失败');
    } catch (error) {
      console.error('[APIClient] 请求失败:', error);
      throw error;
    }
  }

  async login(nickname: string, playerId: string): Promise<{ player: LoginResponse }> {
    const data = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ nickname, playerId })
    });
    return {
      player: {
        playerId: data.id || data.playerId,
        nickname: data.nickname,
        stats: {
          totalGames: data.totalGames || 0,
          wins: data.wins || 0,
          kills: data.kills || 0,
          playTime: data.playTime || 0
        }
      }
    };
  }

  async getLeaderboard(limit: number = 10): Promise<any[]> {
    return this.request<any[]>('/auth/leaderboard');
  }

  async getRooms(): Promise<any[]> {
    return this.request<any[]>('/rooms');
  }

  async createRoom(params: {
    name: string;
    ownerId: string;
    ownerName: string;
    maxPlayers?: number;
    mode?: string;
    mapId?: string;
  }): Promise<any> {
    return this.request<any>('/rooms', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  async joinRoom(roomId: string, playerId: string, playerName: string): Promise<any> {
    return this.request<any>(`/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({ playerId, playerName })
    });
  }

  async leaveRoom(roomId: string, playerId: string): Promise<void> {
    await this.request<void>(`/rooms/${roomId}/leave`, {
      method: 'POST',
      body: JSON.stringify({ playerId })
    });
  }

  async toggleReady(roomId: string, playerId: string): Promise<void> {
    await this.request<void>(`/rooms/${roomId}/ready`, {
      method: 'POST',
      body: JSON.stringify({ playerId, ready: true })
    });
  }

  async startGame(roomId: string, ownerId: string): Promise<any> {
    return this.request<any>(`/rooms/${roomId}/start`, {
      method: 'POST',
      body: JSON.stringify({ ownerId })
    });
  }

  async getRoom(roomId: string): Promise<any> {
    return this.request<any>(`/rooms/${roomId}`);
  }

  async getPlayerRecords(playerId: string): Promise<any[]> {
    return this.request<any[]>(`/records?playerId=${encodeURIComponent(playerId)}`);
  }

  async getEntityConfigs(): Promise<any[]> {
    return this.request<any[]>('/config/entities');
  }

  async getSkillConfigs(): Promise<any[]> {
    return this.request<any[]>('/config/skills');
  }

  async getMapConfigs(): Promise<any[]> {
    return this.request<any[]>('/config/maps');
  }
}

export const APIClient = new APIClientClass();
