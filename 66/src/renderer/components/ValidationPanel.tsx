import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle, X, RefreshCw, FileText } from 'lucide-react';
import clsx from 'clsx';
import { ValidationResult, ProjectFile } from '../../shared/types';
import { useAppStore } from '@/store/useAppStore';

interface ValidationPanelProps {
  results: ValidationResult[];
  files: ProjectFile[];
  onFileClick: (fileId: string) => void;
  onErrorClick: (fileId: string, line: number, column: number) => void;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({
  results,
  files,
  onFileClick,
  onErrorClick,
}) => {
  const { validateProject, clearValidation, isLoading, currentProject } = useAppStore();

  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const isValid = totalErrors === 0;

  const getFileName = (fileId: string) => {
    return files.find((f) => f.id === fileId)?.name || fileId;
  };

  const getFilePath = (fileId: string) => {
    return files.find((f) => f.id === fileId)?.path || fileId;
  };

  return (
    <div className="h-full flex flex-col bg-gray-800 text-white">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-200">语法校验</span>
          {isValid && results.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle size={12} />
              通过
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => currentProject && validateProject()}
            disabled={isLoading || !currentProject}
            className={clsx(
              'p-1 rounded transition-colors',
              isLoading || !currentProject
                ? 'text-gray-600 cursor-not-allowed'
                : 'hover:bg-gray-700 text-gray-400'
            )}
            title="重新校验"
          >
            <RefreshCw size={14} className={clsx(isLoading && 'animate-spin')} />
          </button>
          {results.length > 0 && (
            <button
              onClick={clearValidation}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 transition-colors"
              title="清除结果"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && (
        <div className="flex items-center gap-4 px-3 py-2 border-b border-gray-700 bg-gray-850 text-xs">
          <div className="flex items-center gap-1">
            <AlertCircle size={12} className="text-red-400" />
            <span className="text-red-400">{totalErrors} 错误</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle size={12} className="text-yellow-400" />
            <span className="text-yellow-400">{totalWarnings} 警告</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            <AlertCircle size={32} className="mb-2 opacity-50" />
            <p>暂无校验结果</p>
            <p className="text-xs mt-1">点击刷新按钮校验项目</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {results.map((result) => {
              const hasIssues = result.errors.length > 0 || result.warnings.length > 0;
              if (!hasIssues) return null;

              return (
                <div key={result.fileId} className="py-1">
                  <div
                    className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-gray-700 text-sm"
                    onClick={() => onFileClick(result.fileId)}
                  >
                    <FileText size={14} className="text-blue-400 flex-shrink-0" />
                    <span className="flex-1 truncate text-gray-200">
                      {getFileName(result.fileId)}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      {result.errors.length > 0 && (
                        <span className="text-red-400">{result.errors.length}E</span>
                      )}
                      {result.warnings.length > 0 && (
                        <span className="text-yellow-400">{result.warnings.length}W</span>
                      )}
                    </div>
                  </div>

                  <div className="pl-6 pr-3 space-y-0.5">
                    {result.errors.map((error, idx) => (
                      <div
                        key={`err-${idx}`}
                        className="flex items-start gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-700 text-xs group"
                        onClick={() => onErrorClick(result.fileId, error.line, error.column)}
                        title={`${error.ruleId || ''} - 点击跳转`}
                      >
                        <AlertCircle size={12} className="text-red-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-300 flex-1">{error.message}</span>
                        <span className="text-gray-500 flex-shrink-0 group-hover:text-gray-300">
                          L{error.line}:{error.column}
                        </span>
                      </div>
                    ))}
                    {result.warnings.map((warning, idx) => (
                      <div
                        key={`warn-${idx}`}
                        className="flex items-start gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-700 text-xs group"
                        onClick={() => onErrorClick(result.fileId, warning.line, warning.column)}
                        title={`${warning.ruleId || ''} - 点击跳转`}
                      >
                        <AlertTriangle size={12} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-400 flex-1">{warning.message}</span>
                        <span className="text-gray-500 flex-shrink-0 group-hover:text-gray-300">
                          L{warning.line}:{warning.column}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {results.every((r) => r.errors.length === 0 && r.warnings.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-gray-500 text-sm">
                <CheckCircle size={32} className="mb-2 text-green-500" />
                <p>所有文件校验通过</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
