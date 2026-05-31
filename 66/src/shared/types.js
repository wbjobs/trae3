"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageExtensions = exports.SupportedLanguages = exports.IPCChannel = void 0;
var IPCChannel;
(function (IPCChannel) {
    IPCChannel["PROJECT_NEW"] = "project:new";
    IPCChannel["PROJECT_OPEN"] = "project:open";
    IPCChannel["PROJECT_SAVE"] = "project:save";
    IPCChannel["PROJECT_CLOSE"] = "project:close";
    IPCChannel["PROJECT_DELETE"] = "project:delete";
    IPCChannel["PROJECT_LIST"] = "project:list";
    IPCChannel["FILE_READ"] = "file:read";
    IPCChannel["FILE_WRITE"] = "file:write";
    IPCChannel["FILE_DELETE"] = "file:delete";
    IPCChannel["FILE_RENAME"] = "file:rename";
    IPCChannel["VALIDATE_FILE"] = "validate:file";
    IPCChannel["VALIDATE_PROJECT"] = "validate:project";
    IPCChannel["SYNC_START"] = "sync:start";
    IPCChannel["SYNC_STATUS"] = "sync:status";
    IPCChannel["SYNC_PUSH"] = "sync:push";
    IPCChannel["SYNC_PULL"] = "sync:pull";
    IPCChannel["CLOUD_LIST"] = "cloud:list";
    IPCChannel["CLOUD_GET"] = "cloud:get";
    IPCChannel["CLOUD_CREATE"] = "cloud:create";
    IPCChannel["CLOUD_DELETE"] = "cloud:delete";
    IPCChannel["CACHE_GET"] = "cache:get";
    IPCChannel["CACHE_SET"] = "cache:set";
    IPCChannel["CACHE_CLEAR"] = "cache:clear";
    IPCChannel["VERSION_LIST"] = "version:list";
    IPCChannel["VERSION_CREATE"] = "version:create";
    IPCChannel["VERSION_ROLLBACK"] = "version:rollback";
    IPCChannel["CONFIG_GET"] = "config:get";
    IPCChannel["CONFIG_SET"] = "config:set";
})(IPCChannel || (exports.IPCChannel = IPCChannel = {}));
exports.SupportedLanguages = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bat': 'bat',
};
exports.LanguageExtensions = {
    typescript: ['.ts', '.tsx'],
    javascript: ['.js', '.jsx'],
    python: ['.py'],
    java: ['.java'],
    cpp: ['.cpp', '.c', '.h', '.hpp'],
    csharp: ['.cs'],
    go: ['.go'],
    rust: ['.rs'],
    html: ['.html'],
    css: ['.css', '.scss', '.less'],
    json: ['.json'],
    yaml: ['.yaml', '.yml'],
    markdown: ['.md'],
    sql: ['.sql'],
    shell: ['.sh', '.bash'],
    bat: ['.bat', '.cmd'],
};
