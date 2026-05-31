export type Theme = 'dark' | 'light' | 'system';

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgSurface: string;
  bgHover: string;
  bgActive: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentActive: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  shadow: string;
}

export interface ThemeConfig {
  colors: ThemeColors;
  radius: string;
  fontMono: string;
  fontSans: string;
  transition: string;
}

export const DARK_THEME: ThemeConfig = {
  colors: {
    bgPrimary: '#1e1e2e',
    bgSecondary: '#181825',
    bgTertiary: '#313244',
    bgSurface: '#45475a',
    bgHover: '#313244',
    bgActive: '#585b70',
    textPrimary: '#cdd6f4',
    textSecondary: '#a6adc8',
    textMuted: '#6c7086',
    accent: '#89b4fa',
    accentHover: '#74c7ec',
    accentActive: '#b4befe',
    success: '#a6e3a1',
    warning: '#f9e2af',
    error: '#f38ba8',
    border: '#585b70',
    shadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  radius: '8px',
  fontMono: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  transition: '0.15s ease',
};

export const LIGHT_THEME: ThemeConfig = {
  colors: {
    bgPrimary: '#ffffff',
    bgSecondary: '#f3f4f6',
    bgTertiary: '#e5e7eb',
    bgSurface: '#d1d5db',
    bgHover: '#e5e7eb',
    bgActive: '#9ca3af',
    textPrimary: '#111827',
    textSecondary: '#4b5563',
    textMuted: '#6b7280',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    accentActive: '#1d4ed8',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    border: '#d1d5db',
    shadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  radius: '8px',
  fontMono: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  transition: '0.15s ease',
};

export class ThemeManager {
  private currentTheme: Theme = 'dark';
  private systemTheme: 'dark' | 'light' = 'dark';
  private listeners: Set<(theme: ThemeConfig) => void> = new Set();

  constructor() {
    this.detectSystemTheme();
    this.setupSystemThemeListener();
  }

  private detectSystemTheme(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      this.systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
  }

  private setupSystemThemeListener(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        this.systemTheme = e.matches ? 'dark' : 'light';
        if (this.currentTheme === 'system') {
          this.applyTheme();
        }
      });
    }
  }

  setTheme(theme: Theme): void {
    this.currentTheme = theme;
    this.applyTheme();
    this.notifyListeners();
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  getThemeConfig(): ThemeConfig {
    const effectiveTheme = this.currentTheme === 'system' ? this.systemTheme : this.currentTheme;
    return effectiveTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
  }

  private applyTheme(): void {
    const config = this.getThemeConfig();
    const root = document.documentElement;

    Object.entries(config.colors).forEach(([key, value]) => {
      const cssVar = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVar, value);
    });

    root.style.setProperty('--radius', config.radius);
    root.style.setProperty('--font-mono', config.fontMono);
    root.style.setProperty('--font-sans', config.fontSans);
    root.style.setProperty('--transition', config.transition);
  }

  subscribe(callback: (theme: ThemeConfig) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const config = this.getThemeConfig();
    this.listeners.forEach((cb) => cb(config));
  }

  cycleTheme(): void {
    const themes: Theme[] = ['dark', 'light', 'system'];
    const currentIndex = themes.indexOf(this.currentTheme);
    this.setTheme(themes[(currentIndex + 1) % themes.length]);
  }
}
