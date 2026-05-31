import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AppConfig, ServerConfig, CompilerConfig } from '@shared/types';

const DEFAULT_CONFIG: AppConfig = {
  projectsPath: '',
  outputPath: '',
  logPath: '',
  tempPath: '',
  server: {
    host: 'localhost',
    port: 3000,
    useSsl: false
  },
  compilers: [],
  theme: 'dark'
};

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>({ ...DEFAULT_CONFIG });
  const isConnected = ref(false);
  const detectedCompilers = ref<CompilerConfig[]>([]);

  const serverUrl = computed(() => {
    const protocol = config.value.server.useSsl ? 'https' : 'http';
    return `${protocol}://${config.value.server.host}:${config.value.server.port}`;
  });

  async function loadConfig() {
    try {
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const configPath = await window.electronAPI.path.join(userDataPath, 'config.json');
      
      const exists = await window.electronAPI.fs.exists(configPath);
      if (exists) {
        const data = await window.electronAPI.fs.readFile(configPath, 'utf-8');
        if (data) {
          config.value = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
        }
      } else {
        config.value = { ...DEFAULT_CONFIG };
        await initDefaultPaths();
        await saveConfig();
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      config.value = { ...DEFAULT_CONFIG };
    }
  }

  async function initDefaultPaths() {
    const userDataPath = await window.electronAPI.app.getPath('userData');
    config.value.projectsPath = await window.electronAPI.path.join(userDataPath, 'projects');
    config.value.outputPath = await window.electronAPI.path.join(userDataPath, 'output');
    config.value.logPath = await window.electronAPI.path.join(userDataPath, 'logs');
    config.value.tempPath = await window.electronAPI.path.join(userDataPath, 'temp');

    for (const dir of [config.value.projectsPath, config.value.outputPath, config.value.logPath, config.value.tempPath]) {
      const exists = await window.electronAPI.fs.exists(dir);
      if (!exists) {
        await window.electronAPI.fs.writeFile(await window.electronAPI.path.join(dir, '.gitkeep'), '');
      }
    }
  }

  async function saveConfig() {
    try {
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const configPath = await window.electronAPI.path.join(userDataPath, 'config.json');
      await window.electronAPI.fs.writeFile(configPath, JSON.stringify(config.value, null, 2));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  function updateServerConfig(serverConfig: Partial<ServerConfig>) {
    config.value.server = { ...config.value.server, ...serverConfig };
    saveConfig();
  }

  function addCompiler(compiler: CompilerConfig) {
    config.value.compilers.push(compiler);
    saveConfig();
  }

  function updateCompiler(index: number, compiler: Partial<CompilerConfig>) {
    if (index >= 0 && index < config.value.compilers.length) {
      config.value.compilers[index] = { ...config.value.compilers[index], ...compiler };
      saveConfig();
    }
  }

  function removeCompiler(index: number) {
    config.value.compilers.splice(index, 1);
    saveConfig();
  }

  async function detectCompilers() {
    try {
      detectedCompilers.value = await window.electronAPI.compiler.detect();
      return detectedCompilers.value;
    } catch (error) {
      console.error('Failed to detect compilers:', error);
      return [];
    }
  }

  function setTheme(theme: AppConfig['theme']) {
    config.value.theme = theme;
    saveConfig();
    applyTheme(theme);
  }

  function applyTheme(theme: AppConfig['theme']) {
    const html = document.documentElement;
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }

  function setConnected(connected: boolean) {
    isConnected.value = connected;
  }

  return {
    config,
    isConnected,
    detectedCompilers,
    serverUrl,
    loadConfig,
    saveConfig,
    updateServerConfig,
    addCompiler,
    updateCompiler,
    removeCompiler,
    detectCompilers,
    setTheme,
    applyTheme,
    setConnected
  };
});
