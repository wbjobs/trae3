import Store from 'electron-store';
import { AppConfig, DEFAULT_CONFIG } from './types';

export class ConfigManager {
  private store: Store<AppConfig>;

  constructor() {
    this.store = new Store<AppConfig>({
      name: 'cnc-program-manager',
      defaults: DEFAULT_CONFIG,
    });
  }

  getConfig(): AppConfig {
    return this.store.store;
  }

  getSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    return this.store.get(section) as AppConfig[K];
  }

  setSection<K extends keyof AppConfig>(section: K, value: AppConfig[K]): void {
    this.store.set(section, value);
  }

  updateConfig(updates: Partial<AppConfig>): void {
    for (const [key, value] of Object.entries(updates)) {
      this.store.set(key as keyof AppConfig, value as any);
    }
  }

  resetToDefaults(): void {
    this.store.store = DEFAULT_CONFIG;
  }

  exportConfig(): string {
    return JSON.stringify(this.store.store, null, 2);
  }

  importConfig(json: string): void {
    try {
      const config = JSON.parse(json) as AppConfig;
      this.store.store = { ...DEFAULT_CONFIG, ...config };
    } catch (err) {
      throw new Error(`配置导入失败: ${(err as Error).message}`);
    }
  }

  onChange(callback: (config: AppConfig) => void): void {
    this.store.onDidChange('', (newValue) => {
      if (newValue) {
        callback(newValue as AppConfig);
      }
    });
  }
}
