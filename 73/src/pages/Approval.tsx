import { useState, useEffect, useCallback } from 'react';
import { api } from '@/utils/api';
import { CheckCircle, XCircle, MessageSquare, Clock, Eye, X } from 'lucide-react';

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

type TabKey = 'pending' | 'approved' | 'rejected';

export default function Approval() {
  const [tab, setTab] = useState<TabKey>('pending');
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionPanel, setActionPanel] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let result;
      if (tab === 'pending') {
        result = await api.getPendingApprovals({ page, pageSize });
      } else {
        result = await api.getApprovalHistory({ page, pageSize, status: tab });
      }
      setItems(result?.items || []);
      setTotal(result?.total || 0);
    } catch (err) {
      console.error(err);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [tab, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async () => {
    if (!actionPanel) return;
    setProcessing(true);
    try {
      await api.approveSample(actionPanel.id, { action: actionType, comment });
      setActionPanel(null);
      setComment('');
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(false);
    }
  };

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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'pending', label: '待审批' },
    { key: 'approved', label: '已通过' },
    { key: 'rejected', label: '已退回' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-[#0F4C75] mb-6">审批管理</h1>
      <div className="flex gap-1 mb-6 bg-white rounded-lg border border-[#E2E8F0] p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-[#0F4C75] text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#F5F7FA] border-b border-[#E2E8F0]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">样品编号</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">样品名称</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">状态</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">登记时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">暂无数据</td></tr>
            ) : items.map(item => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-sm text-[#0F4C75]">{item.sampleNo}</td>
                <td className="px-4 py-3 text-sm">{item.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{item.type}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_MAP[item.status]?.className || ''}`}>
                    {STATUS_MAP[item.status]?.label || item.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{item.createdAt ? item.createdAt.slice(0, 19).replace('T', ' ') : '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    <button onClick={() => handleViewDetail(item.id)} className="text-gray-500 hover:text-[#0F4C75] text-sm flex items-center gap-1"><Eye size={14} /> 详情</button>
                    {tab === 'pending' && (
                      <>
                        <button onClick={() => { setActionPanel(item); setActionType('approve'); setComment(''); }} className="text-emerald-600 hover:text-emerald-700 text-sm flex items-center gap-1"><CheckCircle size={14} /> 通过</button>
                        <button onClick={() => { setActionPanel(item); setActionType('reject'); setComment(''); }} className="text-red-500 hover:text-red-600 text-sm flex items-center gap-1"><XCircle size={14} /> 退回</button>
                      </>
                    )}
                  </div>
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

      {actionPanel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setActionPanel(null)}>
          <div className="w-[400px] bg-white h-full shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
              <h2 className="text-lg font-bold text-[#0F4C75]">{actionType === 'approve' ? '审批通过' : '审批退回'}</h2>
              <button onClick={() => setActionPanel(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="flex-1 p-5">
              <p className="text-sm text-gray-500 mb-1">样品编号</p>
              <p className="font-mono font-medium text-[#0F4C75] mb-4">{actionPanel.sampleNo}</p>
              <p className="text-sm text-gray-500 mb-1">样品名称</p>
              <p className="font-medium mb-4">{actionPanel.name}</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1"><MessageSquare size={14} /> 审批意见</label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none resize-none text-sm"
                  placeholder={actionType === 'reject' ? '请填写退回原因（必填）' : '可选，填写审批意见'}
                />
              </div>
            </div>
            <div className="p-5 border-t border-[#E2E8F0] flex gap-3">
              <button onClick={() => setActionPanel(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm">取消</button>
              <button
                onClick={handleAction}
                disabled={processing || (actionType === 'reject' && !comment.trim())}
                className={`flex-1 px-4 py-2.5 text-white rounded-lg transition-colors text-sm disabled:opacity-50 ${
                  actionType === 'approve' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {processing ? '处理中...' : actionType === 'approve' ? '确认通过' : '确认退回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="w-[480px] bg-white h-full shadow-xl overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#E2E8F0]">
              <h2 className="text-lg font-bold text-[#0F4C75]">样品详情</h2>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
