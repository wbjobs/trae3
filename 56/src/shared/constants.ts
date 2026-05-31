export const APP_NAME = 'DrawingVault';
export const APP_VERSION = '1.0.0';

export const SUPPORTED_FORMATS: Record<string, string[]> = {
  input: ['dwg', 'dxf', 'pdf', 'svg'],
  output: ['pdf', 'svg', 'png', 'jpg'],
};

export const FORMAT_MIME: Record<string, string> = {
  dwg: 'application/acad',
  dxf: 'application/dxf',
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
};

export const CLOUD_API_BASE = 'https://api.drawing-vault.cloud/v1';
export const CLOUD_SYNC_INTERVAL = 5 * 60 * 1000;
export const CLOUD_REQUEST_TIMEOUT = 30 * 1000;

export const CACHE_MAX_SIZE = 500 * 1024 * 1024;
export const CACHE_DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
export const CACHE_DB_NAME = 'DrawingVaultCache';
export const CACHE_DB_VERSION = 1;
export const CACHE_STORE_NAME = 'drawings';

export const VERSION_HISTORY_LIMIT = 50;

export const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
export const ENCRYPTION_KEY_SIZE = 32;
export const ENCRYPTION_IV_SIZE = 16;
export const ENCRYPTION_AUTH_TAG_SIZE = 16;
export const ENCRYPTION_SALT_SIZE = 32;
export const ENCRYPTED_FILE_EXT = '.dvault';

export const HIGHLIGHT_COLORS = {
  added: '#22c55e',
  removed: '#ef4444',
  modified: '#f59e0b',
} as const;

export const IPC_CHANNELS = {
  CONVERT_START: 'convert:start',
  CONVERT_CANCEL: 'convert:cancel',
  CONVERT_PROGRESS: 'convert:progress',
  CONVERT_BATCH: 'convert:batch',
  CONVERT_CACHE_STATS: 'convert:cacheStats',
  CONVERT_CLEAR_CACHE: 'convert:clearCache',
  COMPARE_START: 'compare:start',
  COMPARE_RESULT: 'compare:result',
  COMPARE_HIGHLIGHT: 'compare:highlight',
  SYNC_STATUS: 'sync:status',
  SYNC_UPLOAD: 'sync:upload',
  SYNC_DOWNLOAD: 'sync:download',
  SYNC_PROGRESS: 'sync:progress',
  CACHE_STATS: 'cache:stats',
  CACHE_CLEAR: 'cache:clear',
  CACHE_GET: 'cache:get',
  CACHE_SET: 'cache:set',
  DRAWING_LIST: 'drawing:list',
  DRAWING_OPEN: 'drawing:open',
  APP_VERSION: 'app:version',
  ENCRYPT_START: 'encrypt:start',
  ENCRYPT_BATCH: 'encrypt:batch',
  ENCRYPT_DECRYPT: 'encrypt:decrypt',
  ENCRYPT_PROGRESS: 'encrypt:progress',
  ENCRYPT_LIST_KEYS: 'encrypt:listKeys',
  ENCRYPT_CREATE_KEY: 'encrypt:createKey',
  ENCRYPT_DELETE_KEY: 'encrypt:deleteKey',
  PLATFORM_GET_INFO: 'platform:getInfo',
} as const;
