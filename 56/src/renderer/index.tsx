import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/global.css';

async function initApp() {
  try {
    const result = await window.electronAPI.platform.getInfo();
    if (result.success && result.data) {
      const platform = (result.data as any).platform || 'unknown';
      document.body.classList.add(`platform-${platform}`);
      document.body.setAttribute('data-platform', platform);
    }
  } catch (e) {
    console.warn('Failed to get platform info:', e);
  }

  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

initApp();

const root = createRoot(document.getElementById('root')!);
root.render(
  <HashRouter>
    <App />
  </HashRouter>
);
