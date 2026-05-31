import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, FileImage, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api.service';
import { FileValidationResult, FileInfo } from '../../shared/types';
import { cn } from '../lib/utils';

interface UploadItem {
  id: string;
  file: File;
  status: 'pending' | 'validating' | 'valid' | 'invalid' | 'uploading' | 'success' | 'error';
  progress: number;
  validationResult?: FileValidationResult;
  fileInfo?: FileInfo;
  rubbingId?: string;
  error?: string;
  expanded: boolean;
}

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newItems: UploadItem[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      file,
      status: 'pending',
      progress: 0,
      expanded: false,
    }));

    setItems((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      await validateFile(item);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/tiff': ['.tif', '.tiff'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const validateFile = async (item: UploadItem) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: 'validating' } : i
      )
    );

    try {
      const result = await apiService.validateFile(item.file);
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: result.valid ? 'valid' : 'invalid',
                validationResult: result,
              }
            : i
        )
      );
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', error: '校验失败，请重试' }
            : i
        )
      );
    }
  };

  const uploadFile = async (item: UploadItem): Promise<boolean> => {
    if (item.status !== 'valid') return false;

    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i
      )
    );

    try {
      const chunkSize = 5 * 1024 * 1024;
      const totalChunks = Math.ceil(item.file.size / chunkSize);

      const session = await apiService.uploadInit(item.file.name, item.file.size);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, item.file.size);
        const chunk = item.file.slice(start, end);

        await apiService.uploadChunk(session.id, i, chunk);

        const progress = Math.round(((i + 1) / totalChunks) * 100);
        setItems((prev) =>
          prev.map((ui) =>
            ui.id === item.id ? { ...ui, progress } : ui
          )
        );
      }

      const result = await apiService.uploadComplete(session.id);

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'success', fileInfo: result.fileInfo, rubbingId: result.rubbingId, progress: 100 }
            : i
        )
      );

      return true;
    } catch (e) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, status: 'error', error: '上传失败，请重试' }
            : i
        )
      );
      return false;
    }
  };

  const handleUploadAll = async () => {
    const validItems = items.filter((i) => i.status === 'valid');
    if (validItems.length === 0) return;

    setIsProcessing(true);

    for (const item of validItems) {
      await uploadFile(item);
    }

    setIsProcessing(false);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const toggleExpand = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, expanded: !i.expanded } : i))
    );
  };

  const goToCatalog = (id: string) => {
    navigate(`/catalog/${id}`);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const getStatusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'validating':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'valid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'invalid':
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'uploading':
        return <Loader2 className="w-5 h-5 text-accent-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      default:
        return <FileImage className="w-5 h-5 text-ink-400" />;
    }
  };

  const getStatusLabel = (status: UploadItem['status']) => {
    const labels: Record<string, string> = {
      pending: '等待校验',
      validating: '校验中...',
      valid: '校验通过',
      invalid: '校验不通过',
      uploading: '上传中...',
      success: '上传成功',
      error: '上传失败',
    };
    return labels[status] || status;
  };

  const validCount = items.filter((i) => i.status === 'valid').length;
  const successCount = items.filter((i) => i.status === 'success').length;
  const canUploadAll = validCount > 0 && !isProcessing;

  return (
    <div className="space-y-6 animate-scroll-reveal">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary-800">拓片上传</h1>
          <p className="mt-1 text-ink-500">
            支持 TIFF、JPEG、PNG、PDF 格式，单文件最大 2GB
          </p>
        </div>
        {successCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-600">
              已成功上传 {successCount} 个文件
            </span>
            <button
              onClick={() => navigate('/catalog/list')}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              前往著录
            </button>
          </div>
        )}
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer',
          isDragActive
            ? 'border-accent-500 bg-accent-50/50'
            : 'border-primary-200 bg-white hover:border-accent-400 hover:bg-primary-50/30'
        )}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center transition-colors',
              isDragActive ? 'bg-accent-500 text-white' : 'bg-primary-100 text-primary-600'
            )}
          >
            <Upload className="w-10 h-10" />
          </div>
          <div>
            <p className="font-serif text-xl text-primary-700">
              {isDragActive ? '释放文件开始上传' : '拖拽文件到此处，或点击选择'}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              支持批量上传，系统将自动进行格式校验
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-400">
            <span className="px-2 py-1 bg-primary-100 rounded">TIFF</span>
            <span className="px-2 py-1 bg-primary-100 rounded">JPEG</span>
            <span className="px-2 py-1 bg-primary-100 rounded">PNG</span>
            <span className="px-2 py-1 bg-primary-100 rounded">PDF</span>
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-primary-800">
              文件列表 ({items.length})
            </h2>
            {canUploadAll && (
              <button
                onClick={handleUploadAll}
                disabled={isProcessing}
                className="px-6 py-2 bg-accent-500 hover:bg-accent-600 disabled:bg-ink-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    全部上传 ({validCount})
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'bg-white rounded-xl border overflow-hidden transition-all duration-200',
                  item.status === 'success'
                    ? 'border-green-200 bg-green-50/30'
                    : item.status === 'invalid' || item.status === 'error'
                    ? 'border-red-200 bg-red-50/30'
                    : 'border-primary-100 hover:shadow-paper'
                )}
              >
                <div className="p-4 flex items-center gap-4">
                  {getStatusIcon(item.status)}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-primary-800 truncate">
                        {item.file.name}
                      </span>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          item.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : item.status === 'valid'
                            ? 'bg-blue-100 text-blue-700'
                            : item.status === 'invalid' || item.status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-ink-100 text-ink-600'
                        )}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-ink-500">
                      <span>{formatFileSize(item.file.size)}</span>
                      {item.validationResult?.fileInfo && (
                        <>
                          <span>
                            {item.validationResult.fileInfo.width} ×{' '}
                            {item.validationResult.fileInfo.height} px
                          </span>
                          {item.validationResult.fileInfo.dpi && (
                            <span>{item.validationResult.fileInfo.dpi} DPI</span>
                          )}
                        </>
                      )}
                      {item.error && <span className="text-red-500">{item.error}</span>}
                    </div>
                  </div>

                  {item.status === 'uploading' && (
                    <div className="w-40">
                      <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-500 transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-right text-ink-500 mt-1">
                        {item.progress}%
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {item.status === 'success' && item.rubbingId && (
                      <button
                        onClick={() => goToCatalog(item.rubbingId!)}
                        className="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                      >
                        开始著录
                      </button>
                    )}
                    {item.status === 'invalid' && (
                      <button
                        onClick={() => validateFile(item)}
                        className="px-3 py-1.5 text-sm border border-primary-300 hover:bg-primary-50 rounded-lg transition-colors"
                      >
                        重新校验
                      </button>
                    )}
                    <button
                      onClick={() => toggleExpand(item.id)}
                      className="p-1.5 hover:bg-primary-100 rounded-lg transition-colors"
                    >
                      {item.expanded ? (
                        <ChevronUp className="w-5 h-5 text-ink-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-ink-400" />
                      )}
                    </button>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                </div>

                {item.expanded && item.validationResult && (
                  <div className="px-4 pb-4 border-t border-primary-50 bg-primary-50/30">
                    <div className="pt-4 space-y-3">
                      {item.validationResult.errors.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-red-600">错误</h4>
                          {item.validationResult.errors.map((err, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-sm text-red-600"
                            >
                              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>{err.field}：</strong>
                                {err.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.validationResult.warnings.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="font-medium text-yellow-600">警告</h4>
                          {item.validationResult.warnings.map((warn, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-sm text-yellow-600"
                            >
                              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong>{warn.field}：</strong>
                                {warn.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {item.validationResult.valid && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span>所有校验项通过，文件符合要求</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
