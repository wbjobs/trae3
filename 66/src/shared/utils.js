"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateId = generateId;
exports.generateVersion = generateVersion;
exports.getLanguageFromFileName = getLanguageFromFileName;
exports.getFileExtension = getFileExtension;
exports.formatFileSize = formatFileSize;
exports.formatDate = formatDate;
exports.formatRelativeTime = formatRelativeTime;
exports.calculateFileHash = calculateFileHash;
exports.isValidFileName = isValidFileName;
exports.debounce = debounce;
exports.throttle = throttle;
exports.createProjectFile = createProjectFile;
exports.compareFiles = compareFiles;
exports.validatePath = validatePath;
const crypto_js_1 = __importDefault(require("crypto-js"));
const types_1 = require("./types");
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
function generateVersion() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}
function getLanguageFromFileName(fileName) {
    const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
    return types_1.SupportedLanguages[ext] || 'plaintext';
}
function getFileExtension(fileName) {
    return fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
}
function formatFileSize(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}
function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    if (diff < minute)
        return '刚刚';
    if (diff < hour)
        return `${Math.floor(diff / minute)} 分钟前`;
    if (diff < day)
        return `${Math.floor(diff / hour)} 小时前`;
    if (diff < week)
        return `${Math.floor(diff / day)} 天前`;
    return formatDate(timestamp);
}
function calculateFileHash(content) {
    return crypto_js_1.default.SHA256(content).toString();
}
function isValidFileName(name) {
    const invalidChars = /[<>:"/\\|?*]/;
    return !invalidChars.test(name) && name.length > 0 && name.length <= 255;
}
function debounce(func, wait) {
    let timeout = null;
    return (...args) => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
function throttle(func, limit) {
    let inThrottle = false;
    return (...args) => {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
function createProjectFile(name, path, content = '') {
    const now = Date.now();
    return {
        id: generateId(),
        name,
        path,
        content,
        language: getLanguageFromFileName(name),
        size: Buffer.byteLength(content, 'utf8'),
        lastModified: now,
        isDirty: false,
        version: generateVersion(),
    };
}
function compareFiles(file1, file2) {
    const lines1 = file1.content.split('\n');
    const lines2 = file2.content.split('\n');
    const added = [];
    const removed = [];
    const modified = [];
    const maxLines = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLines; i++) {
        if (i >= lines1.length) {
            added.push(`+ ${lines2[i]}`);
        }
        else if (i >= lines2.length) {
            removed.push(`- ${lines1[i]}`);
        }
        else if (lines1[i] !== lines2[i]) {
            modified.push(`~ ${lines1[i]} -> ${lines2[i]}`);
        }
    }
    return { added, removed, modified };
}
function validatePath(path) {
    if (!path || path.length === 0)
        return false;
    const normalized = path.replace(/\\/g, '/');
    if (normalized.includes('..'))
        return false;
    if (/[<>:"|?*]/.test(normalized))
        return false;
    return true;
}
