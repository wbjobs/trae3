import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import dataStore from '../data/store.js';
import FormatValidator from '../services/formatValidator.js';
import ProcessControlService from '../services/processControl.js';
import FileStorageService from '../services/fileStorage.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/init', (req, res) => {
  const { fileName, fileSize } = req.body;
  
  const validation = FormatValidator.validateFile(fileName, fileSize);
  
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      message: validation.errors.join('; ')
    });
  }

  const task = dataStore.addUploadTask({
    fileName,
    fileSize,
    progress: 0,
    status: 'PENDING'
  });

  res.json({
    success: true,
    data: {
      taskId: task.id,
      fileType: validation.fileType
    }
  });
});

router.post('/chunk', upload.single('chunk'), (req, res) => {
  const { taskId, chunkIndex } = req.body;
  
  const progress = Math.min(100, (parseInt(chunkIndex) + 1) * 10);
  dataStore.updateUploadTask(taskId, {
    progress,
    status: progress >= 100 ? 'VALIDATING' : 'UPLOADING'
  });

  res.json({
    success: true,
    data: {
      chunkIndex: parseInt(chunkIndex),
      received: true
    }
  });
});

router.post('/complete', (req, res) => {
  const { taskId, metadata } = req.body;
  
  const metaValidation = FormatValidator.validateMetadata(metadata);
  if (!metaValidation.valid) {
    return res.status(400).json({
      success: false,
      message: metaValidation.errors.join('; ')
    });
  }

  dataStore.updateUploadTask(taskId, {
    progress: 100,
    status: 'SUCCESS'
  });

  const fileName = metadata.fileName || 'unknown';
  const fileType = FormatValidator.detectFileType(fileName);
  const tempArchiveId = uuidv4();
  const filePath = FileStorageService.generateFilePath(fileName, tempArchiveId, {
    fileType,
    projectName: metadata.projectName
  });

  const archive = ProcessControlService.createArchive({
    ...metadata,
    fileName,
    filePath,
    fileSize: metadata.fileSize || 0,
    uploader: metadata.uploader || 'unknown',
    uploadTime: new Date().toLocaleString(),
    status: 'PENDING',
    fileType: FormatValidator.detectFileType(fileName)
  });

  res.json({
    success: true,
    data: {
      archiveId: archive.id,
      filePath: archive.filePath
    }
  });
});

router.get('/tasks', (req, res) => {
  res.json({
    success: true,
    data: dataStore.getUploadTasks()
  });
});

export default router;
