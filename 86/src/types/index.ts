export interface ScriptFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: ScriptLanguage;
  size: number;
  createdAt: string;
  updatedAt: string;
  isSynced: boolean;
  remoteId?: string;
  version: number;
  tags?: string[];
}

export type ScriptLanguage = 
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'rust'
  | 'go'
  | 'bash'
  | 'powershell'
  | 'sql'
  | 'json'
  | 'yaml'
  | 'unknown';

export interface ParseResult {
  success: boolean;
  ast?: ASTNode;
  errors: ParseError[];
  tokens: Token[];
}

export interface ASTNode {
  type: string;
  name?: string;
  start: number;
  end: number;
  children?: ASTNode[];
  value?: string;
}

export interface Token {
  type: string;
  value: string;
  position: Position;
}

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface ParseError {
  message: string;
  severity: 'error' | 'warning' | 'info';
  position: Position;
  code?: string;
}

export interface SyntaxCheckResult {
  isValid: boolean;
  errors: ParseError[];
  suggestions: Suggestion[];
}

export interface Suggestion {
  message: string;
  type: 'performance' | 'style' | 'security' | 'best_practice';
  position: Position;
}

export interface SyncConfig {
  serverUrl: string;
  apiKey: string;
  username: string;
  autoSync: boolean;
  syncInterval: number;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime?: string;
  pendingFiles: number;
  totalFiles: number;
  error?: string;
}

export interface RemoteScript {
  id: string;
  name: string;
  language: ScriptLanguage;
  author: string;
  description: string;
  downloads: number;
  stars: number;
  updatedAt: string;
  version: number;
  categories: string[];
}

export interface ScriptVersion {
  id: string;
  scriptId: string;
  version: number;
  content: string;
  createdAt: string;
  author: string;
  message?: string;
  diff?: string;
}

export interface LocalProject {
  id: string;
  name: string;
  path: string;
  description: string;
  scripts: ScriptFile[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface DatabaseConfig {
  dbPath: string;
  encryptionKey?: string;
}

export interface AppState {
  currentFile: ScriptFile | null;
  openFiles: ScriptFile[];
  projects: LocalProject[];
  syncStatus: SyncStatus;
  syncConfig: SyncConfig;
  parseResult: ParseResult | null;
  syntaxResult: SyntaxCheckResult | null;
}
