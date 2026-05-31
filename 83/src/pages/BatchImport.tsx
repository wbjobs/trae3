import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  FileEdit,
  Database,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../stores/auth.store';
import { cn } from '../lib/utils';

interface ImportResult {
  row: number;
  accessionNo: string;
  title: string;
  success: boolean;
  error?: string;
  rubbingId?: string;
}

const BatchImport: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [previewData, setPreviewData] = useState<Array<Record<string, unknown>>>([]);
  const [importResult, setImportResult] = useState<{
    total: number;
    success: number;
    failed: number;
    results: ImportResult[];
  } | null>(null);
  const [step, setStep] = useState<'select' | 'preview' | 'result'>('select');

  const canImport =
    user?.role === 'admin' || user?.role === 'operator';

  const parseExcelFile = async (file: File) => {
    return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { raw: false });
          resolve(jsonData as Array<Record<string, unknown>>);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      alert('请选择 Excel 文件（.xlsx 或 .xls 格式）');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      alert('文件大小不能超过 10MB');
      return;
    }

    try {
      setFileName(file.name);
      const data = await parseExcelFile(file);
      setPreviewData(data);
      setImportResult(null);
      setStep('preview');
    } catch (e) {
      console.error('解析文件失败', e);
      alert('文件解析失败，请检查文件格式');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleImport = async () => {
    if (!canImport || previewData.length === 0) return;

    if (!confirm(`确认导入 ${previewData.length} 条记录？此操作不可撤销。`)) {
      return;
    }

    setImporting(true);
    try {
      const result = await apiService.batchImportRubbings(previewData);
      setImportResult(result);
      setStep('result');
    } catch (e) {
      console.error('导入失败', e);
      alert(`导入失败：${e instanceof Error ? e.message : '未知错误'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setFileName('');
    setPreviewData([]);
    setImportResult(null);
    setStep('select');
  };

  const columns = previewData.length > 0 ? Object.keys(previewData[0]) : [];

  return (
    <div className="space-y-6 animate-scroll-reveal">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/catalog/list')}
            className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-primary-600" />
          </button>
          <div>
            <h1 className="font-serif text-3xl font-bold text-primary-800">批量导入</h1>
            <p className="mt-1 text-ink-500">从 Excel 文件批量导入拓片著录数据</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={apiService.getImportTemplateUrl()}
            download
            className="px-4 py-2 border border-primary-300 hover:bg-primary-50 text-primary-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            下载导入模板
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-primary-100 p-6">
        {step === 'select' && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-primary-50 rounded-lg border border-primary-100">
              <AlertTriangle className="w-5 h-5 text-accent-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-primary-700">
                <p className="font-medium mb-2">导入说明</p>
                <ul className="list-disc list-inside space-y-1 text-ink-600">
                  <li>请使用系统提供的导入模板，确保数据格式正确</li>
                  <li>单次导入最多支持 500 条记录</li>
                  <li><span className="font-medium">登录号</span>为必填项，且不能与现有记录重复</li>
                  <li><span className="font-medium">题名</span>为必填项</li>
                  <li>关键词支持用中文/英文逗号、空格或分号分隔</li>
                  <li>状态可填写：草稿、待审核、已发布</li>
                </ul>
              </div>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all duration-300',
                isDragging
                  ? 'border-accent-500 bg-accent-50'
                  : 'border-primary-200 hover:border-primary-400 hover:bg-primary-50'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8 text-primary-600" />
              </div>
              <p className="text-lg font-medium text-primary-800 mb-2">
                {isDragging ? '释放鼠标上传文件' : '点击或拖拽 Excel 文件到此处'}
              </p>
              <p className="text-sm text-ink-500">
                支持 .xlsx 和 .xls 格式，文件大小不超过 10MB
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-ink-600">
                  文件：<span className="font-medium text-primary-800">{fileName}</span>
                </p>
                <p className="text-ink-500 text-sm mt-1">
                  共 <span className="font-medium text-primary-700">{previewData.length}</span> 条记录待导入
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-primary-300 hover:bg-primary-50 text-primary-700 rounded-lg transition-colors"
                >
                  重新选择
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !canImport}
                  className={cn(
                    'px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2',
                    canImport && !importing
                      ? 'bg-primary-600 hover:bg-primary-700 text-white'
                      : 'bg-ink-200 text-ink-400 cursor-not-allowed'
                  )}
                >
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      导入中...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      确认导入
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-primary-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-primary-50 border-b border-primary-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-primary-700 whitespace-nowrap">
                      序号
                    </th>
                    {columns.slice(0, 8).map((col) => (
                      <th
                        key={col}
                        className="text-left px-4 py-3 font-semibold text-primary-700 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                    {columns.length > 8 && (
                      <th className="text-left px-4 py-3 font-semibold text-primary-700">
                        ...
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {previewData.slice(0, 10).map((row, idx) => (
                    <tr key={idx} className="hover:bg-primary-50/50">
                      <td className="px-4 py-3 text-ink-500">{idx + 2}</td>
                      {columns.slice(0, 8).map((col) => (
                        <td key={col} className="px-4 py-3 text-ink-700">
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                      {columns.length > 8 && (
                        <td className="px-4 py-3 text-ink-400">...</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.length > 10 && (
                <div className="px-4 py-2 bg-ink-50 text-center text-sm text-ink-500">
                  仅显示前 10 条预览，实际导入 {previewData.length} 条
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-12 h-12 rounded-full flex items-center justify-center',
                    importResult.failed === 0 ? 'bg-green-100' : 'bg-accent-100'
                  )}>
                    {importResult.failed === 0 ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <AlertTriangle className="w-6 h-6 text-accent-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-primary-800">导入完成</p>
                    <p className="text-ink-500">
                      共 {importResult.total} 条，成功 {importResult.success} 条，失败 {importResult.failed} 条
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="text-center px-4 py-2 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-2xl font-bold text-green-700">{importResult.success}</p>
                    <p className="text-xs text-green-600">成功</p>
                  </div>
                  <div className="text-center px-4 py-2 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-2xl font-bold text-red-700">{importResult.failed}</p>
                    <p className="text-xs text-red-600">失败</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-primary-300 hover:bg-primary-50 text-primary-700 rounded-lg transition-colors"
                >
                  继续导入
                </button>
                <button
                  onClick={() => navigate('/catalog/list')}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <FileEdit className="w-4 h-4" />
                  查看著录列表
                </button>
              </div>
            </div>

            {importResult.results.some(r => !r.success) && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary-800">失败记录</h3>
                <div className="overflow-x-auto border border-red-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 border-b border-red-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-red-700">行号</th>
                        <th className="text-left px-4 py-3 font-semibold text-red-700">登录号</th>
                        <th className="text-left px-4 py-3 font-semibold text-red-700">题名</th>
                        <th className="text-left px-4 py-3 font-semibold text-red-700">错误原因</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {importResult.results
                        .filter(r => !r.success)
                        .map((result, idx) => (
                          <tr key={idx} className="bg-red-50/30">
                            <td className="px-4 py-3 text-ink-500">{result.row}</td>
                            <td className="px-4 py-3 text-ink-700 font-mono">{result.accessionNo}</td>
                            <td className="px-4 py-3 text-ink-700">{result.title}</td>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-1.5 text-red-600">
                                <XCircle className="w-4 h-4" />
                                {result.error}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importResult.results.some(r => r.success) && (
              <div className="space-y-3">
                <h3 className="font-medium text-primary-800">成功记录</h3>
                <div className="overflow-x-auto border border-green-200 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-green-50 border-b border-green-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-green-700">行号</th>
                        <th className="text-left px-4 py-3 font-semibold text-green-700">登录号</th>
                        <th className="text-left px-4 py-3 font-semibold text-green-700">题名</th>
                        <th className="text-left px-4 py-3 font-semibold text-green-700">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {importResult.results
                        .filter(r => r.success)
                        .slice(0, 10)
                        .map((result, idx) => (
                          <tr key={idx} className="hover:bg-green-50/30">
                            <td className="px-4 py-3 text-ink-500">{result.row}</td>
                            <td className="px-4 py-3 text-ink-700 font-mono">{result.accessionNo}</td>
                            <td className="px-4 py-3 text-ink-700">{result.title}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => navigate(`/catalog/${result.rubbingId}`)}
                                className="text-primary-600 hover:text-primary-800 font-medium"
                              >
                                编辑著录
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {importResult.success > 10 && (
                    <div className="px-4 py-2 bg-green-50 text-center text-sm text-green-600">
                      仅显示前 10 条成功记录，共 {importResult.success} 条
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchImport;
