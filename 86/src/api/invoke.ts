import { invoke } from '@tauri-apps/api/core';
import type {
  ScriptFile,
  ParseResult,
  SyntaxCheckResult,
  LocalProject,
  ScriptVersion,
  DatabaseConfig,
  SyncConfig,
  SyncStatus
} from '@/types';

export const invokeParseScript = async (
  content: string,
  language: string
): Promise<ParseResult> => {
  return invoke('parse_script', { content, language });
};

export const invokeCheckSyntax = async (
  content: string,
  language: string
): Promise<SyntaxCheckResult> => {
  return invoke('check_syntax', { content, language });
};

export const invokeLoadProject = async (path: string): Promise<LocalProject> => {
  return invoke('load_project', { path });
};

export const invokeSaveFile = async (file: ScriptFile): Promise<boolean> => {
  return invoke('save_file', { file });
};

export const invokeReadFile = async (path: string): Promise<string> => {
  return invoke('read_file', { path });
};

export const invokeDeleteFile = async (path: string): Promise<boolean> => {
  return invoke('delete_file', { path });
};

export const invokeCreateProject = async (
  name: string,
  path: string,
  description?: string
): Promise<LocalProject> => {
  return invoke('create_project', { name, path, description });
};

export const invokeListProjects = async (): Promise<LocalProject[]> => {
  return invoke('list_projects');
};

export const invokeDeleteProject = async (projectId: string): Promise<boolean> => {
  return invoke('delete_project', { projectId });
};

export const invokeSaveVersion = async (
  scriptId: string,
  content: string,
  message?: string
): Promise<ScriptVersion> => {
  return invoke('save_version', { scriptId, content, message });
};

export const invokeGetVersions = async (scriptId: string): Promise<ScriptVersion[]> => {
  return invoke('get_versions', { scriptId });
};

export const invokeRestoreVersion = async (
  scriptId: string,
  versionId: string
): Promise<ScriptFile> => {
  return invoke('restore_version', { scriptId, versionId });
};

export const invokeInitDatabase = async (config: DatabaseConfig): Promise<boolean> => {
  return invoke('init_database', { config });
};

export const invokeSaveSyncConfig = async (config: SyncConfig): Promise<boolean> => {
  return invoke('save_sync_config', { config });
};

export const invokeLoadSyncConfig = async (): Promise<SyncConfig | null> => {
  return invoke('load_sync_config');
};

export const invokeStartAutoSync = async (): Promise<void> => {
  return invoke('start_auto_sync');
};

export const invokeStopAutoSync = async (): Promise<void> => {
  return invoke('stop_auto_sync');
};

export const invokeGetSyncStatus = async (): Promise<SyncStatus> => {
  return invoke('get_sync_status');
};

export const invokeScanDirectory = async (
  path: string,
  extensions?: string[]
): Promise<{ name: string; path: string; isDir: boolean; size: number }[]> => {
  return invoke('scan_directory', { path, extensions });
};

export const invokeFormatScript = async (
  content: string,
  language: string
): Promise<string> => {
  return invoke('format_script', { content, language });
};

export const invokeSyncNow = async (): Promise<void> => {
  return invoke('sync_now');
};

export const invokeTestConnection = async (
  serverUrl: string,
  apiKey: string
): Promise<boolean> => {
  return invoke('test_connection', { serverUrl, apiKey });
};

export const invokeVerifyScript = async (
  scriptId: string
): Promise<boolean> => {
  return invoke('verify_script', { scriptId });
};

export const invokeRepairScript = async (
  scriptId: string
): Promise<boolean> => {
  return invoke('repair_script', { scriptId });
};

export const invokeEncryptScript = async (
  content: string,
  password: string
): Promise<string> => {
  return invoke('encrypt_script', { content, password });
};

export const invokeDecryptScript = async (
  content: string,
  password: string
): Promise<string> => {
  return invoke('decrypt_script', { content, password });
};

export const invokeEncryptBatch = async (
  contents: string[],
  password: string
): Promise<string[]> => {
  return invoke('encrypt_batch', { contents, password });
};

export const invokeDecryptBatch = async (
  contents: string[],
  password: string
): Promise<string[]> => {
  return invoke('decrypt_batch', { contents, password });
};

export const invokeComputeDiff = async (
  oldContent: string,
  newContent: string
): Promise<any> => {
  return invoke('compute_diff', { oldContent, newContent });
};

export const invokeGeneratePatch = async (
  oldContent: string,
  newContent: string
): Promise<string> => {
  return invoke('generate_patch', { oldContent, newContent });
};

export const invokeClearSyncCache = async (): Promise<boolean> => {
  return invoke('clear_sync_cache');
};

export const invokePullRemoteScripts = async (): Promise<any[]> => {
  return invoke('pull_remote_scripts');
};
