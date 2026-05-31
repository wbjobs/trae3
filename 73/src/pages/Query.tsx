import { useState, useEffect, useCallback } from 'react';
import { api } from '@/utils/api';
import { Search, ChevronRight, X, FileText, Clock, Download } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: '待审批', className: 'bg-amber-50 text-amber-600' },
  approved: { label: '已通过', className: 'bg-emerald-50 text-emerald-600' },
  rejected: { label: '已退回', className: 'bg-red-50 text-red-600' },
};

const ACTION_MAP: Record<string, string> = {
  submit: '提交登记',
  approve: '审批通过',
  reject: '审批退回',
  resubmit: '重新提交',
};

export default function Query() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (keyword) params.keyword = keyword;
      if (status) params.status = status;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const result = await api.getSamples(params);
      setItems(result.items || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error(err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, status, startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = () => { setPage(1); fetchData(); };

  const handleViewDetail = async (id: string) => {
    try {
      const data = await api.getSample(id);
      if (data?.sample) {
        setDetail(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-[#0F4C75] mb-6">流转查询</h1>
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 mb-6 flex items-end gap-4">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">关键词</label>
          <input value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none text-sm" placeholder="样品编号或名称" />
        </div>
        <div className="w-36">
          <label className="block text-xs text-gray-500 mb-1">状态</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none text-sm">
            <option value="">全部</option>
            <option value="pending">待审批</option>
            <option value="approved">已通过</option>
            <option value="rejected">已退回</option>
          </select>
        </div>
        <div className="w-40">
          <label className="block text-xs text-gray-500 mb-1">开始日期</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none text-sm" />
        </div>
        <div className="w-40">
          <label className="block text-xs text-gray-500 mb-1">结束日期</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none text-sm" />
        </div>
        <button onClick={handleSearch} className="px-5 py-2 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0d3f63] transition-colors text-sm flex items-center gap-1.5">
          <Search size={16} /> 查询
        </button>
        <a
          href={api.exportCSV({ ...(keyword && { keyword }), ...(status && { status }), ...(startDate && { startDate }), ...(endDate && { endDate }) })}
          className="px-5 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm flex items-center gap-1.5"
        >
          <Download size={16} /> 导出 CSV
        </a>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F5F7FA] border-b border-[#E2E8F0]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">样品编号</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">样品名称</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">当前步骤</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">登记时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">暂无数据</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-sm text-[#0F4C75]">{item.sampleNo}</td>
                <td className="px-4 py-3 text-sm">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.type}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.currentStep || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_MAP[item.status]?.className || ''}`}>
                    {STATUS_MAP[item.status]?.label || item.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{item.createdAt ? item.createdAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => handleViewDetail(item.id)} className="text-[#0F4C75] hover:underline text-sm flex items-center gap-0.5">
                    详情 <ChevronRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0]">
            <span className="text-sm text-gray-500">共 {total} 条记录</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50">上一页</button>
              <span className="px-3 py-1 text-sm text-gray-500">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40 hover:bg-gray-50">下一页</button>
            </div>
          </div>
        )}
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="w-[480px] bg-white h-full shadow-xl overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
              <h2 className="text-lg font-bold text-[#0F4C75]">流转详情</h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="p-5">
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">样品编号：</span><span className="font-mono font-medium">{detail.sample?.sampleNo}</span></div>
                  <div><span className="text-gray-500">样品名称：</span><span className="font-medium">{detail.sample?.name}</span></div>
                  <div><span className="text-gray-500">类型：</span>{detail.sample?.type}</div>
                  <div><span className="text-gray-500">来源：</span>{detail.sample?.source}</div>
                  <div><span className="text-gray-500">规格：</span>{detail.sample?.specification}</div>
                  <div><span className="text-gray-500">数量：</span>{detail.sample?.quantity} {detail.sample?.unit}</div>
                  <div className="col-span-2"><span className="text-gray-500">状态：</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_MAP[detail.sample?.status]?.className}`}>{STATUS_MAP[detail.sample?.status]?.label}</span>
                  </div>
                  {detail.sample?.description && <div className="col-span-2"><span className="text-gray-500">备注：</span>{detail.sample.description}</div>}
                </div>
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Clock size={16} /> 流转记录</h3>
              {detail.flowRecords?.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">暂无流转记录</p>
              ) : (
                <div className="space-y-0">
                  {detail.flowRecords?.map((r: any, i: number) => (
                    <div key={r.id} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center">
                        <div className={`w-3 h-3 rounded-full ${i === detail.flowRecords.length - 1 ? 'bg-[#E8A838]' : 'bg-gray-300'}`} />
                        {i < detail.flowRecords.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                      </div>
                      <div className="pb-2">
                        <p className="text-sm font-medium">{ACTION_MAP[r.action] || r.action}</p>
                        <p className="text-xs text-gray-400">{r.operator} · {r.createdAt ? r.createdAt.slice(0, 19).replace('T', ' ') : '-'}</p>
                        {r.comment && <p className="text-xs text-gray-500 mt-1">{r.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {detail.attachments?.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5 mt-4"><FileText size={16} /> 附件</h3>
                  <div className="space-y-2">
                    {detail.attachments?.map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm">
                        <FileText size={14} className="text-gray-400" />
                        <span className="flex-1 truncate">{a.fileName}</span>
                        <span className="text-xs text-gray-400">{(a.fileSize / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
