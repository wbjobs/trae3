import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export type Platform = 'win32' | 'linux' | 'darwin' | 'unknown';

export const getPlatform = (): Platform => {
  switch (process.platform) {
    case 'win32': return 'win32';
    case 'linux': return 'linux';
    case 'darwin': return 'darwin';
    default: return 'unknown';
  }
};

export const isWindows = (): boolean => process.platform === 'win32';
export const isLinux = (): boolean => process.platform === 'linux';

export const getPingArgs = (ip: string, timeout: number): string[] => {
  if (isWindows()) {
    return ['-n', '1', '-w', String(timeout), ip];
  }
  return ['-c', '1', '-W', String(Math.ceil(timeout / 1000)), ip];
};

export const getPingCommand = (): string => {
  return isWindows() ? 'ping' : 'ping';
};

export const getArpCommand = (): string => {
  return isWindows() ? 'arp -a' : 'arp -a';
};

export const getDataDir = (appName: string): string => {
  let basePath: string;
  try {
    const { app } = require('electron');
    basePath = app.getPath('userData');
  } catch {
    basePath = process.cwd();
  }
  return basePath;
};

export const getDatabasePath = (): string => {
  const base = getDataDir('firmware-manager');
  const dir = path.join(base, 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, 'firmware-manager.db');
};

export const getFirmwareDir = (): string => {
  const base = getDataDir('firmware-manager');
  const dir = path.join(base, 'firmwares');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const getLogDir = (): string => {
  const base = getDataDir('firmware-manager');
  const dir = path.join(base, 'logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const getNetworkInterfaces = (): os.NetworkInterfaceInfo[] => {
  const interfaces = os.networkInterfaces();
  const result: os.NetworkInterfaceInfo[] = [];
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        result.push(addr);
      }
    }
  }
  return result;
};

export const needsSudoForRawSocket = (): boolean => {
  return isLinux();
};
