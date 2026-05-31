import { GameClient } from './gameClient';
import { UIManager } from './ui';

const SERVER_URL = 'http://localhost:3000';

let gameClient: GameClient | null = null;
let uiManager: UIManager | null = null;

async function initApp(): Promise<void> {
  try {
    gameClient = new GameClient('gameCanvas', SERVER_URL);
    uiManager = new UIManager(gameClient);

    uiManager.init();

    updateConnectionStatus(false);
    uiManager.setStatus('正在连接服务器...');

    await gameClient.connect();
    await gameClient.init();

    updateConnectionStatus(true);
    uiManager.setStatus('已连接到服务器');
    uiManager.showSuccess('连接成功！');

    gameClient.start();

    uiManager.showLobby();

    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn?.addEventListener('click', () => {
      uiManager?.refreshGameList();
    });

    window.addEventListener('beforeunload', () => {
      if (gameClient) {
        gameClient.disconnect();
      }
    });

  } catch (error) {
    console.error('Failed to initialize app:', error);
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    uiManager?.showError(`初始化失败: ${errorMessage}`);
    uiManager?.setStatus('初始化失败');
  }
}

function updateConnectionStatus(connected: boolean): void {
  const statusElement = document.getElementById('connectionStatus');
  if (!statusElement) return;

  const dot = statusElement.querySelector('.status-dot');
  const text = statusElement.querySelector('span:last-child');

  if (dot) {
    dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  }
  if (text) {
    text.textContent = connected ? '已连接' : '未连接';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
