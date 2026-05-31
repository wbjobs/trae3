import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Loader2,
  Tag,
  Calendar,
  User,
  MapPin,
  BookOpen,
  Clock,
  FileText,
} from 'lucide-react';
import { apiService } from '../services/api.service';
import { RubbingMetadata, WorkflowStatus } from '../../shared/types';
import { cn } from '../lib/utils';
import { Modal } from 'antd';

interface SearchFilters {
  keyword?: string;
  dynasty?: string;
  status?: WorkflowStatus;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

interface SearchFiltersData {
  dynasties: string[];
  eras: string[];
  authors: string[];
  methods: string[];
  statuses: string[];
}

const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<RubbingMetadata[]>([]);
  const [total, setTotal] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filtersData, setFiltersData] = useState<SearchFiltersData>({
    dynasties: [],
    eras: [],
    authors: [],
    methods: [],
    statuses: [],
  });
  const [selectedItem, setSelectedItem] = useState<RubbingMetadata | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);

  const [filters, setFilters] = useState<SearchFilters>({
    page: parseInt(searchParams.get('page') || '1'),
    pageSize: 12,
    keyword: searchParams.get('keyword') || undefined,
    dynasty: searchParams.get('dynasty') || undefined,
    status: (searchParams.get('status') as WorkflowStatus) || undefined,
  });

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadData();
  }, [filters]);

  useEffect(() => {
    const params: Record<string, string> = {
      page: filters.page.toString(),
    };
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.dynasty) params.dynasty = filters.dynasty;
    if (filters.status) params.status = filters.status;
    setSearchParams(params, { replace: true });
  }, [filters.page, filters.keyword, filters.dynasty, filters.status]);

  const loadFilters = async () => {
    try {
      const data = await apiService.getSearchFilters();
      setFiltersData(data);
    } catch (e) {
      console.error('加载筛选条件失败', e);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await apiService.searchRubbings({
        keyword: filters.keyword,
        dynasty: filters.dynasty,
        status: filters.status as string,
        page: filters.page,
        pageSize: filters.pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      console.error('搜索失败', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchInput = async (value: string) => {
    setFilters((f) => ({ ...f, keyword: value, page: 1 }));
    if (value.length >= 2) {
      try {
        const data = await apiService.getSearchSuggestions(value);
        setSuggestions(data);
        setShowSuggestions(true);
      } catch (e) {
        console.error('获取搜索建议失败', e);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setFilters((f) => ({ ...f, keyword: suggestion, page: 1 }));
    setShowSuggestions(false);
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      pageSize: 12,
      status: 'published',
    });
  };

  const openPreview = (item: RubbingMetadata) => {
    setSelectedItem(item);
    setPreviewVisible(true);
  };

  const totalPages = Math.ceil(total / filters.pageSize);

  const getStatusBadge = (status: WorkflowStatus) => {
    const configs: Record<WorkflowStatus, { label: string; className: string }> = {
      draft: { label: '草稿', className: 'bg-ink-100 text-ink-600' },
      pending: { label: '待审核', className: 'bg-yellow-100 text-yellow-700' },
      published: { label: '已发布', className: 'bg-green-100 text-green-700' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={cn('px-2 py-0.5 rounded text-xs font-medium', config.className)}>
        {config.label}
      </span>
    );
  };

  const activeFiltersCount = [filters.keyword, filters.dynasty, filters.dateFrom, filters.dateTo].filter(Boolean).length;

  return (
    <div className="space-y-6 animate-scroll-reveal">
      <div>
        <h1 className="font-serif text-3xl font-bold text-primary-800">检索查询</h1>
        <p className="mt-1 text-ink-500">检索和浏览已发布的拓片数据资源</p>
      </div>

      <div className="bg-white rounded-xl border border-primary-100 p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-400" />
          <input
            type="text"
            placeholder="输入关键词搜索题名、作者、铭文内容..."
            value={filters.keyword || ''}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => filters.keyword && filters.keyword.length >= 2 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            className="w-full pl-12 pr-24 py-3 border border-primary-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all text-lg"
          />
          <button
            onClick={() => loadData()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            搜索
          </button>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-primary-100 rounded-xl shadow-paper z-10 overflow-hidden">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s)}
                  className="w-full px-4 py-2.5 text-left hover:bg-primary-50 transition-colors flex items-center gap-2"
                >
                  <Search className="w-4 h-4 text-ink-400" />
                  <span className="text-ink-700">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <Filter className="w-4 h-4" />
            <span>筛选：</span>
          </div>

          <select
            value={filters.dynasty || ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                dynasty: e.target.value || undefined,
                page: 1,
              }))
            }
            className="px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white text-sm"
          >
            <option value="">全部朝代</option>
            {filtersData.dynasties.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <select
            value={filters.status || ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: (e.target.value as WorkflowStatus) || undefined,
                page: 1,
              }))
            }
            className="px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white text-sm"
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="pending">待审核</option>
            <option value="published">已发布</option>
          </select>

          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-500">年代：</span>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateFrom: e.target.value || undefined,
                  page: 1,
                }))
              }
              className="px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm"
            />
            <span className="text-ink-400">至</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  dateTo: e.target.value || undefined,
                  page: 1,
                }))
              }
              className="px-3 py-2 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 text-sm"
            />
          </div>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-sm text-ink-500 hover:text-red-500 transition-colors flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-500">
          共找到 <span className="font-semibold text-primary-700">{total}</span> 条记录
        </p>
        <div className="text-sm text-ink-400">
          第 {filters.page} / {Math.max(1, totalPages)} 页
        </div>
      </div>

      {loading ? (
        <div className="p-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
          <span className="ml-3 text-ink-500">搜索中...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-primary-100 p-16 text-center">
          <BookOpen className="w-16 h-16 text-ink-300 mx-auto mb-4" />
          <p className="text-ink-500 mb-2">未找到匹配的记录</p>
          <p className="text-sm text-ink-400">请尝试调整搜索条件或筛选器</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-primary-100 overflow-hidden hover:shadow-paper transition-all duration-300 hover:-translate-y-1 group"
              >
                <div
                  className="relative aspect-[4/3] bg-primary-50 cursor-pointer overflow-hidden"
                  onClick={() => openPreview(item)}
                >
                  {item.fileId ? (
                    <img
                      src={apiService.getPreviewUrl(item.fileId, 'thumb')}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileText className="w-16 h-16 text-ink-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    {getStatusBadge(item.status)}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(item);
                      }}
                      className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                      title="查看大图"
                    >
                      <Maximize2 className="w-4 h-4 text-primary-700" />
                    </button>
                    {item.fileId && (
                      <a
                        href={apiService.getDownloadUrl(item.fileId)}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                        title="下载原图"
                      >
                        <Download className="w-4 h-4 text-primary-700" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-serif text-lg font-semibold text-primary-800 line-clamp-2 group-hover:text-accent-600 transition-colors">
                        {item.title}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm font-mono text-ink-400">
                      {item.accessionNo}
                    </p>
                  </div>

                  <div className="space-y-1.5 text-sm">
                    {item.dynasty && (
                      <div className="flex items-center gap-2 text-ink-500">
                        <Calendar className="w-4 h-4 text-accent-500" />
                        <span>{item.dynasty}</span>
                        {item.era && <span className="text-ink-400">· {item.era}</span>}
                      </div>
                    )}
                    {item.author && (
                      <div className="flex items-center gap-2 text-ink-500">
                        <User className="w-4 h-4 text-accent-500" />
                        <span>{item.author}</span>
                      </div>
                    )}
                    {item.location && (
                      <div className="flex items-center gap-2 text-ink-500">
                        <MapPin className="w-4 h-4 text-accent-500" />
                        <span>{item.location}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-ink-400 text-xs">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                  </div>

                  {item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-2 border-t border-primary-50">
                      {item.keywords.slice(0, 4).map((kw) => (
                        <span
                          key={kw}
                          className="px-2 py-0.5 text-xs bg-primary-50 text-primary-600 rounded"
                        >
                          <Tag className="w-3 h-3 inline mr-1" />
                          {kw}
                        </span>
                      ))}
                      {item.keywords.length > 4 && (
                        <span className="px-2 py-0.5 text-xs text-ink-400">
                          +{item.keywords.length - 4}
                        </span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => navigate(`/catalog/${item.id}`)}
                    className="w-full mt-2 py-2 text-sm text-primary-600 hover:text-primary-800 hover:bg-primary-50 rounded-lg transition-colors font-medium"
                  >
                    查看详情 →
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              className="p-2 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
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
                  onClick={() => setFilters((f) => ({ ...f, page: pageNum }))}
                  className={cn(
                    'min-w-10 h-10 rounded-lg font-medium transition-colors',
                    filters.page === pageNum
                      ? 'bg-primary-600 text-white'
                      : 'hover:bg-primary-50 text-ink-700'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              disabled={filters.page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              className="p-2 border border-primary-200 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </>
      )}

      <Modal
        title={selectedItem?.title}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={1000}
        styles={{
          body: { padding: 0 },
        }}
      >
        {selectedItem && (
          <div className="flex flex-col lg:flex-row">
            <div className="lg:flex-1 bg-ink-900 flex items-center justify-center p-8 min-h-[400px]">
              {selectedItem.fileId ? (
                <img
                  src={apiService.getFileUrl(selectedItem.fileId)}
                  alt={selectedItem.title}
                  className="max-w-full max-h-[600px] object-contain"
                />
              ) : (
                <div className="text-ink-400 text-center">
                  <FileText className="w-16 h-16 mx-auto mb-2 opacity-50" />
                  <p>暂无图像</p>
                </div>
              )}
            </div>
            <div className="lg:w-80 p-6 space-y-4 border-t lg:border-t-0 lg:border-l border-primary-100">
              <div>
                <h4 className="text-xs text-ink-400 uppercase tracking-wider">登录号</h4>
                <p className="font-mono text-primary-800">{selectedItem.accessionNo}</p>
              </div>
              <div>
                <h4 className="text-xs text-ink-400 uppercase tracking-wider">题名</h4>
                <p className="font-serif text-lg text-primary-800">{selectedItem.title}</p>
              </div>
              {selectedItem.dynasty && (
                <div>
                  <h4 className="text-xs text-ink-400 uppercase tracking-wider">朝代</h4>
                  <p className="text-primary-700">{selectedItem.dynasty}</p>
                </div>
              )}
              {selectedItem.author && (
                <div>
                  <h4 className="text-xs text-ink-400 uppercase tracking-wider">作者</h4>
                  <p className="text-primary-700">{selectedItem.author}</p>
                </div>
              )}
              {selectedItem.inscriptionContent && (
                <div>
                  <h4 className="text-xs text-ink-400 uppercase tracking-wider">铭文内容</h4>
                  <p className="text-primary-700 text-sm line-clamp-6">
                    {selectedItem.inscriptionContent}
                  </p>
                </div>
              )}
              {selectedItem.keywords.length > 0 && (
                <div>
                  <h4 className="text-xs text-ink-400 uppercase tracking-wider mb-2">关键词</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedItem.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="px-2 py-0.5 text-xs bg-primary-50 text-primary-600 rounded"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-primary-100 space-y-2">
                <button
                  onClick={() => navigate(`/catalog/${selectedItem.id}`)}
                  className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  查看完整记录
                </button>
                {selectedItem.fileId && (
                  <a
                    href={apiService.getDownloadUrl(selectedItem.fileId)}
                    className="block w-full py-2 text-center border border-primary-300 hover:bg-primary-50 rounded-lg transition-colors text-sm text-primary-700"
                  >
                    下载原图
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SearchPage;
