import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileEdit,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  Upload as UploadIcon,
} from 'lucide-react';
import { apiService } from '../services/api.service';
import { RubbingMetadata, WorkflowStatus } from '../../shared/types';
import { cn } from '../lib/utils';

interface SearchFilters {
  keyword?: string;
  status?: WorkflowStatus;
  dynasty?: string;
  page: number;
  pageSize: number;
}

const CatalogList: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RubbingMetadata[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<SearchFilters>({
    page: 1,
    pageSize: 10,
  });
  const [dynasties, setDynasties] = useState<string[]>([]);

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadFilters = async () => {
    try {
      const data = await apiService.getSearchFilters();
      setDynasties(data.dynasties || []);
    } catch (e) {
      console.error('加载筛选条件失败', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await apiService.searchRubbings({
        keyword: filters.keyword,
        status: filters.status as string,
        dynasty: filters.dynasty,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      console.error('加载数据失败', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (id: string) => {
    try {
      await apiService.submitRubbing(id);
      await loadData();
    } catch (e) {
      console.error('提交审核失败', e);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiService.approveRubbing(id, '审核通过');
      await loadData();
    } catch (e) {
      console.error('审核通过失败', e);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await apiService.rejectRubbing(id, '需要补充信息');
      await loadData();
    } catch (e) {
      console.error('审核驳回失败', e);
    }
  };

  const getStatusBadge = (status: WorkflowStatus) => {
    const configs: Record<WorkflowStatus, { label: string; className: string }> = {
      draft: {
        label: '草稿',
        className: 'bg-ink-100 text-ink-600',
      },
      pending: {
        label: '待审核',
        className: 'bg-yellow-100 text-yellow-700',
      },
      published: {
        label: '已发布',
        className: 'bg-green-100 text-green-700',
      },
    };
    const config = configs[status] || configs.draft;
    return (
      <span
        className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          config.className
        )}
      >
        {config.label}
      </span>
    );
  };

  const totalPages = Math.ceil(total / filters.pageSize);

  return (
    <div className="space-y-6 animate-scroll-reveal">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-primary-800">著录编辑</h1>
          <p className="mt-1 text-ink-500">管理和编辑拓片元数据信息</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={apiService.getExportUrl({
              keyword: filters.keyword,
              status: filters.status,
              dynasty: filters.dynasty,
            })}
            download
            className="px-4 py-2 border border-primary-300 hover:bg-primary-50 text-primary-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            导出档案
          </a>
          <Link
            to="/batch-import"
            className="px-4 py-2 border border-primary-300 hover:bg-primary-50 text-primary-700 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <UploadIcon className="w-4 h-4" />
            批量导入
          </Link>
          <Link
            to="/upload"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <FileEdit className="w-4 h-4" />
            上传新拓片
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-primary-100 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
              <input
                type="text"
                placeholder="搜索题名、作者、关键词..."
                value={filters.keyword || ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, keyword: e.target.value, page: 1 }))
                }
                className="w-full pl-10 pr-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-ink-400" />
            <select
              value={filters.status || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value as WorkflowStatus) || undefined,
                  page: 1,
                }))
              }
              className="px-3 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
            >
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="pending">待审核</option>
              <option value="published">已发布</option>
            </select>
          </div>

          <div className="w-40">
            <select
              value={filters.dynasty || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dynasty: e.target.value || undefined,
                  page: 1,
                }))
              }
              className="w-full px-3 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white"
            >
              <option value="">全部朝代</option>
              {dynasties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-primary-100 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
            <span className="ml-3 text-ink-500">加载中...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <FileEdit className="w-16 h-16 text-ink-300 mx-auto mb-4" />
            <p className="text-ink-500">暂无数据</p>
            <Link
              to="/upload"
              className="inline-block mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              上传第一个拓片
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-50 border-b border-primary-100">
                  <tr>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      登录号
                    </th>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      题名
                    </th>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      朝代
                    </th>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      作者
                    </th>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      状态
                    </th>
                    <th className="text-left px-6 py-4 font-semibold text-primary-700 text-sm">
                      更新时间
                    </th>
                    <th className="text-right px-6 py-4 font-semibold text-primary-700 text-sm">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-primary-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 font-mono text-sm text-ink-600">
                        {item.accessionNo}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-primary-800">
                          {item.title}
                        </div>
                        {item.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.keywords.slice(0, 3).map((kw) => (
                              <span
                                key={kw}
                                className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-600 rounded"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-ink-600">
                        {item.dynasty || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-ink-600">
                        {item.author || '-'}
                      </td>
                      <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                      <td className="px-6 py-4 text-sm text-ink-500">
                        {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => navigate(`/catalog/${item.id}`)}
                            className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <FileEdit className="w-4 h-4 text-primary-600" />
                          </button>
                          <button
                            onClick={() => navigate(`/catalog/${item.id}`)}
                            className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
                            title="查看详情"
                          >
                            <Eye className="w-4 h-4 text-ink-600" />
                          </button>
                          {item.status === 'draft' && (
                            <button
                              onClick={() => handleSubmit(item.id)}
                              className="p-2 hover:bg-yellow-100 rounded-lg transition-colors"
                              title="提交审核"
                            >
                              <Send className="w-4 h-4 text-yellow-600" />
                            </button>
                          )}
                          {item.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(item.id)}
                                className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                                title="审核通过"
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </button>
                              <button
                                onClick={() => handleReject(item.id)}
                                className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                title="审核驳回"
                              >
                                <XCircle className="w-4 h-4 text-red-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-primary-100 flex items-center justify-between">
              <span className="text-sm text-ink-500">
                共 {total} 条记录，第 {filters.page} / {totalPages} 页
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: f.page - 1 }))
                  }
                  className="p-2 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (filters.page <= 3) {
                    pageNum = i + 1;
                  } else if (filters.page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = filters.page - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() =>
                        setFilters((f) => ({ ...f, page: pageNum }))
                      }
                      className={cn(
                        'min-w-10 h-10 rounded-lg font-medium transition-colors',
                        filters.page === pageNum
                          ? 'bg-primary-600 text-white'
                          : 'hover:bg-primary-50'
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters((f) => ({ ...f, page: f.page + 1 }))
                  }
                  className="p-2 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CatalogList;
