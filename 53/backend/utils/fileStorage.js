const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { CATEGORY_CODES } = require('../rules/catalogRules');

const uploadsDir = path.join(__dirname, '../uploads');
const filesDir = path.join(uploadsDir, 'files');
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');
const tempDir = path.join(uploadsDir, 'temp');
const importDir = path.join(uploadsDir, 'import');

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

ensureDirExists(uploadsDir);
ensureDirExists(filesDir);
ensureDirExists(thumbnailsDir);
ensureDirExists(tempDir);
ensureDirExists(importDir);

function getStoragePath(category) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const categoryCode = CATEGORY_CODES[category] || 'QT';
  
  const storagePath = path.join(filesDir, year, month, categoryCode);
  ensureDirExists(storagePath);
  
  return storagePath;
}

function getRelativeStoragePath(filename, category) {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const categoryCode = CATEGORY_CODES[category] || 'QT';
  
  return path.join(year, month, categoryCode, filename);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const category = req.body.category || '未分类';
    const destPath = getStoragePath(category);
    cb(null, destPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = function (req, file, cb) {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'text/csv',
    'application/vnd.ms-excel.sheet.macroenabled.12'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const uploadTemp = multer({
  storage: tempStorage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

function getFilePath(relativePath) {
  return path.join(filesDir, relativePath);
}

function getFileByRelativePath(relativePath) {
  const fullPath = path.join(filesDir, relativePath);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

function moveFileToCategory(tempFilename, category) {
  const tempPath = path.join(tempDir, tempFilename);
  const targetDir = getStoragePath(category);
  const relativePath = getRelativeStoragePath(tempFilename, category);
  const targetPath = path.join(filesDir, relativePath);
  
  if (fs.existsSync(tempPath)) {
    fs.renameSync(tempPath, targetPath);
    return relativePath;
  }
  return null;
}

function deleteFile(relativePath) {
  const filePath = path.join(filesDir, relativePath);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    
    const dirPath = path.dirname(filePath);
    try {
      if (fs.readdirSync(dirPath).length === 0) {
        fs.rmdirSync(dirPath);
      }
    } catch (e) {}
    
    return true;
  }
  return false;
}

function getFileInfo(relativePath) {
  const filePath = path.join(filesDir, relativePath);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    return {
      exists: true,
      size: stats.size,
      createdAt: stats.birthtime,
      path: filePath,
      relativePath: relativePath
    };
  }
  return { exists: false };
}

function cleanTempFiles(maxAge = 3600000) {
  const now = Date.now();
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    });
  }
}

function getStorageStats() {
  let totalSize = 0;
  let fileCount = 0;
  const categoryStats = {};

  function scanDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        scanDir(filePath);
      } else {
        totalSize += stats.size;
        fileCount++;
        
        const parts = path.relative(filesDir, filePath).split(path.sep);
        if (parts.length >= 3) {
          const catCode = parts[2];
          if (!categoryStats[catCode]) {
            categoryStats[catCode] = { count: 0, size: 0 };
          }
          categoryStats[catCode].count++;
          categoryStats[catCode].size += stats.size;
        }
      }
    });
  }

  if (fs.existsSync(filesDir)) {
    scanDir(filesDir);
  }

  return {
    totalSize,
    fileCount,
    categoryStats
  };
}

module.exports = {
  upload,
  uploadTemp,
  getFilePath,
  getFileByRelativePath,
  moveFileToCategory,
  deleteFile,
  getFileInfo,
  getStoragePath,
  getRelativeStoragePath,
  cleanTempFiles,
  getStorageStats,
  filesDir,
  uploadsDir,
  tempDir,
  importDir,
  thumbnailsDir,
  ensureDirExists
};
