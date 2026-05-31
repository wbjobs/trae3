import type { AppAPI } from '../../main/preload';

declare global {
  interface Window {
    appAPI: AppAPI;
  }
}

export {};
