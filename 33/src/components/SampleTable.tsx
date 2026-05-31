import { useState, useEffect } from 'react';
import type { Sample } from '@/types';
import { useSampleStore } from '@/stores/sampleStore';
import { SAMPLE_TYPE_MAP, SAMPLE_STATUS_MAP, STATUS_COLORS } from '@/utils/constants';
import { Search, Eye, ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';

interface SampleTableProps {
  onTransfer?: (sample: Sample) => void;
  onViewDetail?: (sample: Sample) => void;
}

export default function SampleTable({ onTransfer, onViewDetail }: SampleTableProps) {
  const { samples, pagination, loading, fetchSamples } = useSampleStore();
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchSamples({ page: 1, pageSize: 10, keyword: keyword || undefined, type: typeFilter || undefined, status: statusFilter || undefined });
  }, [keyword, typeFilter, statusFilter, fetchSamples]);

  const handlePageChange = (page: number) => {
    fetchSamples({ page, pageSize: pagination.pageSize, keyword: keyword || undefined, type: typeFilter || undefined, status: statusFilter || undefined });
  };

  const totalPages = Math.ceil(pagination.total / pagination.pageSize);

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索样本编号或名称..."
            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">全部类型</option>
          {Object.entries(SAMPLE_TYPE_MAP).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          <option value="">全部状态</option>
          {Object.entries(SAMPLE_STATUS_MAP).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="pb-3 pr-4 font-medium">样本编号</th>
              <th className="pb-3 pr-4 font-medium">名称</th>
              <th className="pb-3 pr-4 font-medium">类型</th>
              <th className="pb-3 pr-4 font-medium">状态</th>
              <th className="pb-3 pr-4 font-medium">所属实验室</th>
              <th className="pb-3 pr-4 font-medium">创建时间</th>
              <th className="pb-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">加载中...</td></tr>
            ) : samples.length === 0 ? (
              <tr><td colSpan={7} className="py-10 text-center text-gray-400">暂无数据</td></tr>
            ) : (
              samples.map((sample) => (
                <tr key={sample.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 pr-4 font-mono text-xs text-[#1E3A5F]">{sample.sampleCode}</td>
                  <td className="py-3 pr-4">{sample.name}</td>
                  <td className="py-3 pr-4">{SAMPLE_TYPE_MAP[sample.type]}</td>
                  <td className="py-3 pr-4">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[sample.status]}`}>
                      {SAMPLE_STATUS_MAP[sample.status]}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{sample.labName}</td>
                  <td className="py-3 pr-4 text-gray-500 font-mono text-xs">{new Date(sample.createdAt).toLocaleDateString()}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => onViewDetail?.(sample)} className="rounded p-1 text-gray-400 hover:text-accent transition-colors" title="查看详情">
                        <Eye className="h-4 w-4" />
                      </button>
                      {sample.status === 'in_stock' && (
                        <button onClick={() => onTransfer?.(sample)} className="rounded p-1 text-gray-400 hover:text-accent transition-colors" title="发起流转">
                          <ArrowRightLeft className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>共 {pagination.total} 条记录</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, pagination.page - 3), pagination.page + 2).map((p) => (
              <button
                key={p}
                onClick={() => handlePageChange(p)}
                className={`h-8 w-8 rounded text-sm ${p === pagination.page ? 'bg-accent text-white' : 'hover:bg-gray-100'}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="rounded p-1 hover:bg-gray-100 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
