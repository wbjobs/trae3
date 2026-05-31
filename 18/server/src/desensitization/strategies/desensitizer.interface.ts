export interface SensitiveMatch {
  type: string;
  value: string;
  start: number;
  end: number;
  replacement: string;
}

export interface IDesensitizer {
  detect(text: string): Promise<SensitiveMatch[]>;
}
