import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTransferStore } from '@/stores/transferStore';
import { useSampleStore } from '@/stores/sampleStore';
import { useLabStore } from '@/stores/labStore';
import { useAuthStore } from '@/stores/authStore';
import ApprovalCard from '@/components/ApprovalCard';
import { SAMPLE_TYPE_MAP } from '@/utils/constants';
import { Send, Clock, Loader2, ShieldCheck } from 'lucide-react';
import type { Sample } from '@/types';

type TabKey = 'apply' | 'pending' | 'history';

export default function Approval() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { transfers, pendingTransfers, fetchTransfers, fetchPending, createTransfer } = useTransferStore();
  const { samples, fetchSamples } = useSampleStore();
  const { labs, fetchLabs } = useLabStore();

  const [activeTab, setActiveTab] = useState<TabKey>('apply');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const [selectedSampleId, setSelectedSampleId] = useState<number | ''>('');
  const [targetLabId, setTargetLabId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  const inStockSamples = samples.filter((s) => s.status === 'in_stock');

  useEffect(() => {
    fetchLabs();
    fetchSamples({ page: 1, pageSize: 100 });
    fetchPending();
    fetchTransfers({ page: 1, pageSize: 20, status: statusFilter || undefined });
  }, [fetchLabs, fetchSamples, fetchPending, fetchTransfers, statusFilter]);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!selectedSampleId) { setFormError('请选择样本'); return; }
    if (!targetLabId) { setFormError('请选择目标实验室'); return; }
    if (!reason.trim()) { setFormError('请填写流转原因'); return; }
    const sample = samples.find((s) => s.id === Number(selectedSampleId)) as Sample | undefined;
    if (sample && Number(targetLabId) === sample.labId) { setFormError('目标实验室不能与当前实验室相同'); return; }

    setLoading(true);
    try {
      await createTransfer({ sampleId: Number(selectedSampleId), toLabId: Number(targetLabId), reason });
      setSelectedSampleId('');
      setTargetLabId('');
      setReason('');
      setActiveTab('history');
      fetchTransfers({ page: 1, pageSize: 20 });
    } finally {
      setLoading(false);
    }
  };

  if (user?.role === 'viewer') {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <ShieldCheck className="h-12 w-12 text-gray-300" />
        <p className="text-gray-400">您没有审批路由的访问权限</p>
        <button onClick={() => navigate('/map')} className="text-accent hover:underline text-sm">返回流转地图</button>
      </div>
    );
  }

  const isApprover = user?.role === 'admin' || user?.role === 'approver';
  const tabs: { key: TabKey; label: string }[] = isApprover
    ? [{ key: 'apply', label: '流转申请' }, { key: 'pending', label: '待审批' }, { key: 'history', label: '审批历史' }]
    : [{ key: 'apply', label: '流转申请' }, { key: 'history', label: '审批历史' }];

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-gray-100 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'border-b-2 border-accent text-accent' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'apply' && (
        <form onSubmit={handleCreateTransfer} className="rounded-xl bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-[#1E3A5F]">发起流转申请</h3>
          {formError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">选择样本 <span className="text-red-500">*</span></label>
              <select
                value={selectedSampleId}
                onChange={(e) => setSelectedSampleId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">请选择在库样本</option>
                {inStockSamples.map((s) => (
                  <option key={s.id} value={s.id}>{s.sampleCode} - {s.name} ({SAMPLE_TYPE_MAP[s.type]})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">目标实验室 <span className="text-red-500">*</span></label>
              <select
                value={targetLabId}
                onChange={(e) => setTargetLabId(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">请选择目标实验室</option>
                {labs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm text-gray-600">流转原因 <span className="text-red-500">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请说明流转原因..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                rows={3}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              提交申请
            </button>
          </div>
        </form>
      )}

      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingTransfers.length === 0 ? (
            <div className="rounded-xl bg-white py-16 text-center text-gray-400 shadow-sm">暂无待审批的流转申请</div>
          ) : (
            pendingTransfers.map((t) => (
              <ApprovalCard key={t.id} transfer={t} onAction={() => { fetchPending(); fetchTransfers({ page: 1, pageSize: 20 }); }} />
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">全部状态</option>
              <option value="approved">已通过</option>
              <option value="rejected">已驳回</option>
              <option value="in_transit">流转中</option>
              <option value="received">已签收</option>
            </select>
          </div>
          {transfers.length === 0 ? (
            <div className="rounded-xl bg-white py-16 text-center text-gray-400 shadow-sm">暂无审批记录</div>
          ) : (
            transfers.map((t) => <ApprovalCard key={t.id} transfer={t} />)
          )}
        </div>
      )}
    </div>
  );
}
