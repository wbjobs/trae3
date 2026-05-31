export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
};

export type ResponsiveValue<T> = T | Partial<Record<Breakpoint, T>>;

export interface ResponsiveConfig {
  sidebar: {
    collapsed: boolean;
    width: number;
    collapsedWidth: number;
  };
  density: 'compact' | 'normal' | 'comfortable';
  viewMode: 'list' | 'grid' | 'table';
}

export class ResponsiveManager {
  private currentBreakpoint: Breakpoint = 'md';
  private containerWidth: number = 0;
  private config: ResponsiveConfig;
  private listeners: Set<(breakpoint: Breakpoint, config: ResponsiveConfig) => void> = new Set();

  constructor() {
    this.config = {
      sidebar: {
        collapsed: false,
        width: 220,
        collapsedWidth: 56,
      },
      density: 'normal',
      viewMode: 'list',
    };
    this.setupResizeListener();
    this.updateBreakpoint();
  }

  private setupResizeListener(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => {
        this.updateBreakpoint();
      });
    }
  }

  private updateBreakpoint(): void {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    this.containerWidth = width;

    let newBreakpoint: Breakpoint = 'xs';
    for (const [bp, minWidth] of Object.entries(BREAKPOINTS).reverse() as [Breakpoint, number][]) {
      if (width >= minWidth) {
        newBreakpoint = bp;
        break;
      }
    }

    if (newBreakpoint !== this.currentBreakpoint) {
      this.currentBreakpoint = newBreakpoint;
      this.applyResponsiveRules();
      this.notifyListeners();
    }
  }

  private applyResponsiveRules(): void {
    if (this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm') {
      this.config.sidebar.collapsed = true;
      this.config.density = 'compact';
      this.config.viewMode = 'list';
    } else if (this.currentBreakpoint === 'md') {
      this.config.sidebar.collapsed = false;
      this.config.density = 'normal';
      this.config.viewMode = 'list';
    } else {
      this.config.sidebar.collapsed = false;
      this.config.density = 'normal';
      this.config.viewMode = 'list';
    }
  }

  getBreakpoint(): Breakpoint {
    return this.currentBreakpoint;
  }

  getConfig(): Readonly<ResponsiveConfig> {
    return { ...this.config };
  }

  setSidebarCollapsed(collapsed: boolean): void {
    this.config.sidebar.collapsed = collapsed;
    this.notifyListeners();
  }

  toggleSidebar(): void {
    this.config.sidebar.collapsed = !this.config.sidebar.collapsed;
    this.notifyListeners();
  }

  setDensity(density: ResponsiveConfig['density']): void {
    this.config.density = density;
    this.notifyListeners();
  }

  setViewMode(mode: ResponsiveConfig['viewMode']): void {
    this.config.viewMode = mode;
    this.notifyListeners();
  }

  resolveValue<T>(value: ResponsiveValue<T>): T {
    if (typeof value !== 'object' || value === null) {
      return value as T;
    }

    const breakpointOrder: Breakpoint[] = ['xl', 'lg', 'md', 'sm', 'xs'];
    for (const bp of breakpointOrder) {
      const v = value[bp];
      if (v !== undefined) {
        return v;
      }
    }

    return (value as Record<string, T>)['xs'] as T;
  }

  isMobile(): boolean {
    return this.currentBreakpoint === 'xs' || this.currentBreakpoint === 'sm';
  }

  isTablet(): boolean {
    return this.currentBreakpoint === 'md';
  }

  isDesktop(): boolean {
    return this.currentBreakpoint === 'lg' || this.currentBreakpoint === 'xl';
  }

  subscribe(callback: (breakpoint: Breakpoint, config: ResponsiveConfig) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    this.listeners.forEach((cb) => cb(this.currentBreakpoint, this.config));
  }
}
