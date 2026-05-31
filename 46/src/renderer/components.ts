import { ThemeManager } from './theme-manager';
import { ResponsiveManager } from './responsive-manager';

export interface ComponentOptions {
  id?: string;
  className?: string;
  style?: Partial<CSSStyleDeclaration>;
}

export interface ComponentState {
  [key: string]: any;
}

export abstract class UIComponent<TState extends ComponentState = ComponentState> {
  protected element: HTMLElement;
  protected state: TState;
  protected children: UIComponent[] = [];
  protected parent: UIComponent | null = null;
  protected themeManager: ThemeManager;
  protected responsiveManager: ResponsiveManager;
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(options: ComponentOptions = {}, initialState: Partial<TState> = {}) {
    this.themeManager = new ThemeManager();
    this.responsiveManager = new ResponsiveManager();
    this.element = this.createElement(options);
    this.state = this.getDefaultState();
    Object.assign(this.state, initialState);
    this.setupEventListeners();
  }

  protected abstract createElement(options: ComponentOptions): HTMLElement;

  protected getDefaultState(): TState {
    return {} as TState;
  }

  protected setupEventListeners(): void {}

  setState(newState: Partial<TState>): void {
    const prevState = { ...this.state };
    Object.assign(this.state, newState);
    this.onStateChange(prevState, this.state);
  }

  protected onStateChange(prevState: TState, newState: TState): void {
    this.render();
  }

  abstract render(): void;

  mount(parent: HTMLElement | UIComponent): void {
    if (parent instanceof UIComponent) {
      this.parent = parent;
      parent.addChild(this);
    } else {
      parent.appendChild(this.element);
    }
  }

  unmount(): void {
    if (this.parent) {
      this.parent.removeChild(this);
    } else if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.destroy();
  }

  addChild(child: UIComponent): void {
    this.children.push(child);
    child.parent = this;
    this.element.appendChild(child.element);
  }

  removeChild(child: UIComponent): void {
    const index = this.children.indexOf(child);
    if (index !== -1) {
      this.children.splice(index, 1);
      child.parent = null;
      if (child.element.parentNode === this.element) {
        this.element.removeChild(child.element);
      }
    }
  }

  clearChildren(): void {
    this.children.forEach((child) => child.destroy());
    this.children = [];
    this.element.innerHTML = '';
  }

  addEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): void {
    this.element.addEventListener(type, listener as EventListener, options);
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener as EventListener);
  }

  removeEventListener<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ): void {
    this.element.removeEventListener(type, listener as EventListener);
    this.eventListeners.get(type)?.delete(listener as EventListener);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getState(): Readonly<TState> {
    return { ...this.state };
  }

  setVisible(visible: boolean): void {
    this.element.style.display = visible ? '' : 'none';
  }

  setEnabled(enabled: boolean): void {
    (this.element as any).disabled = !enabled;
    if (enabled) {
      this.element.classList.remove('disabled');
    } else {
      this.element.classList.add('disabled');
    }
  }

  addClass(className: string): void {
    this.element.classList.add(className);
  }

  removeClass(className: string): void {
    this.element.classList.remove(className);
  }

  toggleClass(className: string): void {
    this.element.classList.toggle(className);
  }

  protected destroy(): void {
    this.eventListeners.forEach((listeners, type) => {
      listeners.forEach((listener) => {
        this.element.removeEventListener(type, listener);
      });
    });
    this.eventListeners.clear();
    this.clearChildren();
  }
}

export class ButtonComponent extends UIComponent<{
  label: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  size: 'small' | 'medium' | 'large';
  disabled: boolean;
  loading: boolean;
  icon?: string;
}> {
  protected getDefaultState() {
    return {
      label: '',
      variant: 'primary' as const,
      size: 'medium' as const,
      disabled: false,
      loading: false,
    };
  }

  protected createElement(options: ComponentOptions): HTMLElement {
    const el = document.createElement('button');
    el.className = `btn ${options.className || ''}`.trim();
    if (options.id) el.id = options.id;
    return el;
  }

  render(): void {
    const { label, variant, size, disabled, loading, icon } = this.state;

    this.element.className = `btn btn-${variant} btn-${size} ${loading ? 'loading' : ''}`.trim();
    (this.element as HTMLButtonElement).disabled = disabled || loading;

    let content = '';
    if (loading) {
      content = `<span class="spinner"></span> `;
    } else if (icon) {
      content = `<span class="icon">${icon}</span> `;
    }
    content += label;

    this.element.innerHTML = content;
  }

  onClick(callback: () => void): void {
    this.addEventListener('click', callback);
  }
}

export class InputComponent extends UIComponent<{
  value: string;
  placeholder: string;
  type: string;
  disabled: boolean;
  error?: string;
}> {
  protected inputElement: HTMLInputElement;

  protected getDefaultState() {
    return {
      value: '',
      placeholder: '',
      type: 'text',
      disabled: false,
    };
  }

  protected createElement(options: ComponentOptions): HTMLElement {
    const container = document.createElement('div');
    container.className = `input-wrapper ${options.className || ''}`.trim();

    this.inputElement = document.createElement('input');
    this.inputElement.className = 'input';
    if (options.id) this.inputElement.id = options.id;

    container.appendChild(this.inputElement);
    return container;
  }

  render(): void {
    const { value, placeholder, type, disabled, error } = this.state;

    this.inputElement.value = value;
    this.inputElement.placeholder = placeholder;
    this.inputElement.type = type;
    this.inputElement.disabled = disabled;

    if (error) {
      this.inputElement.classList.add('error');
      let errorEl = this.element.querySelector('.error-message') as HTMLElement;
      if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        this.element.appendChild(errorEl);
      }
      errorEl.textContent = error;
    } else {
      this.inputElement.classList.remove('error');
      const errorEl = this.element.querySelector('.error-message');
      if (errorEl) errorEl.remove();
    }
  }

  protected setupEventListeners(): void {
    this.inputElement.addEventListener('input', () => {
      this.setState({ value: this.inputElement.value });
    });
  }

  getValue(): string {
    return this.inputElement.value;
  }

  setValue(value: string): void {
    this.setState({ value });
  }

  onInput(callback: (value: string) => void): void {
    this.inputElement.addEventListener('input', () => callback(this.inputElement.value));
  }

  onChange(callback: (value: string) => void): void {
    this.inputElement.addEventListener('change', () => callback(this.inputElement.value));
  }
}

export class CardComponent extends UIComponent<{
  title?: string;
  collapsible: boolean;
  collapsed: boolean;
}> {
  protected headerEl?: HTMLElement;
  protected contentEl: HTMLElement;

  protected getDefaultState() {
    return {
      collapsible: false,
      collapsed: false,
    };
  }

  protected createElement(options: ComponentOptions): HTMLElement {
    const el = document.createElement('div');
    el.className = `card ${options.className || ''}`.trim();
    if (options.id) el.id = options.id;
    return el;
  }

  render(): void {
    const { title, collapsible, collapsed } = this.state;

    this.element.innerHTML = '';

    if (title) {
      this.headerEl = document.createElement('div');
      this.headerEl.className = 'card-header';

      const titleEl = document.createElement('div');
      titleEl.className = 'card-title';
      titleEl.textContent = title;
      this.headerEl.appendChild(titleEl);

      if (collapsible) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'card-toggle';
        toggleBtn.innerHTML = collapsed ? '▼' : '▲';
        toggleBtn.addEventListener('click', () => {
          this.setState({ collapsed: !this.state.collapsed });
        });
        this.headerEl.appendChild(toggleBtn);
      }

      this.element.appendChild(this.headerEl);
    }

    this.contentEl = document.createElement('div');
    this.contentEl.className = `card-content ${collapsed ? 'collapsed' : ''}`;
    this.element.appendChild(this.contentEl);
  }

  setContent(content: string | HTMLElement | UIComponent): void {
    if (!this.contentEl) this.render();

    this.contentEl.innerHTML = '';

    if (typeof content === 'string') {
      this.contentEl.innerHTML = content;
    } else if (content instanceof UIComponent) {
      this.contentEl.appendChild(content.getElement());
    } else {
      this.contentEl.appendChild(content);
    }
  }

  getContentElement(): HTMLElement {
    if (!this.contentEl) this.render();
    return this.contentEl!;
  }
}

export class ProgressBarComponent extends UIComponent<{
  value: number;
  max: number;
  showText: boolean;
  variant: 'default' | 'success' | 'warning' | 'error';
  indeterminate: boolean;
}> {
  protected fillEl: HTMLElement;
  protected textEl?: HTMLElement;

  protected getDefaultState() {
    return {
      value: 0,
      max: 100,
      showText: false,
      variant: 'default' as const,
      indeterminate: false,
    };
  }

  protected createElement(options: ComponentOptions): HTMLElement {
    const el = document.createElement('div');
    el.className = `progress-bar ${options.className || ''}`.trim();

    this.fillEl = document.createElement('div');
    this.fillEl.className = 'progress-fill';
    el.appendChild(this.fillEl);

    return el;
  }

  render(): void {
    const { value, max, showText, variant, indeterminate } = this.state;
    const percent = Math.min(100, Math.max(0, (value / max) * 100));

    this.element.className = `progress-bar progress-${variant} ${indeterminate ? 'indeterminate' : ''}`;
    this.fillEl.style.width = indeterminate ? '50%' : `${percent}%`;

    if (showText) {
      if (!this.textEl) {
        this.textEl = document.createElement('div');
        this.textEl.className = 'progress-text';
        this.element.appendChild(this.textEl);
      }
      this.textEl.textContent = `${Math.round(percent)}%`;
    } else if (this.textEl) {
      this.textEl.remove();
      this.textEl = undefined;
    }
  }

  setProgress(value: number): void {
    this.setState({ value });
  }
}

export class ToastComponent extends UIComponent<{
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
}> {
  protected timeoutId?: number;

  protected getDefaultState() {
    return {
      message: '',
      type: 'info' as const,
      duration: 3000,
    };
  }

  protected createElement(options: ComponentOptions): HTMLElement {
    const el = document.createElement('div');
    el.className = `toast ${options.className || ''}`.trim();
    return el;
  }

  render(): void {
    const { message, type } = this.state;

    this.element.className = `toast toast-${type}`;
    this.element.innerHTML = `
      <span class="toast-icon">${this.getIcon()}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;

    const closeBtn = this.element.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => this.close());

    if (this.state.duration > 0) {
      this.timeoutId = window.setTimeout(() => this.close(), this.state.duration);
    }
  }

  private getIcon(): string {
    const icons = {
      info: 'ℹ',
      success: '✓',
      warning: '⚠',
      error: '✕',
    };
    return icons[this.state.type];
  }

  close(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.element.classList.add('closing');
    setTimeout(() => {
      this.unmount();
    }, 300);
  }
}

export class ToastManager {
  private container: HTMLElement;
  private toasts: ToastComponent[] = [];

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message: string, type: ToastComponent['state']['type'] = 'info', duration: number = 3000): ToastComponent {
    const toast = new ToastComponent({}, { message, type, duration });
    toast.mount(this.container);
    toast.render();
    this.toasts.push(toast);
    return toast;
  }

  success(message: string, duration?: number): ToastComponent {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number): ToastComponent {
    return this.show(message, 'error', duration);
  }

  warning(message: string, duration?: number): ToastComponent {
    return this.show(message, 'warning', duration);
  }

  info(message: string, duration?: number): ToastComponent {
    return this.show(message, 'info', duration);
  }
}
