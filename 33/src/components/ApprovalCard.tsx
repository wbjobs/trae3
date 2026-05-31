import { useState } from 'react';
import type { Transfer } from '@/types';
import { useTransferStore } from '@/stores/transferStore';
import { TRANSFER_STATUS_MAP, STATUS_COLORS } from '@/utils/constants';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';

interface ApprovalCardProps {
  transfer: Transfer;
  onAction?: () => void;
}

export default function ApprovalCard({ transfer, onAction }: ApprovalCardProps) {
  const { approveTransfer } = useTransferStore();
  const [loading, setLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = async () => {
    setLoading(true);
    try {
      await approveTransfer(transfer.id, true);
      onAction?.();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setShowRejectInput(true);
      return;
    }
    setLoading(true);
    try {
      await approveTransfer(transfer.id, false, rejectReason);
      onAction?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[transfer.status]}`}>
            {TRANSFER_STATUS_MAP[transfer.status]}
          </span>
          <span className="font-mono text-xs text-gray-400">{transfer.sampleCode}</span>
        </div>
        <span className="text-xs text-gray-400">{new Date(transfer.appliedAt).toLocaleString()}</span>
      </div>

      <h4 className="mb-2 font-medium text-[#1E3A5F]">{transfer.sampleName}</h4>

      <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
        <span className="rounded bg-gray-100 px-2 py-0.5">{transfer.fromLabName}</span>
        <ArrowRight className="h-4 w-4 text-gray-400" />
        <span className="rounded bg-gray-100 px-2 py-0.5">{transfer.toLabName}</span>
      </div>

      <p className="mb-4 text-sm text-gray-500">{transfer.reason}</p>

      {transfer.status === 'pending' && (
        <div>
          {showRejectInput && (
            <div className="mb-3">
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因（必填）"
                className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                rows={2}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white hover:bg-success/90 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              通过
            </button>
            <button
              onClick={() => setShowRejectInput(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <XCircle className="h-4 w-4" />
              驳回
            </button>
            {showRejectInput && (
              <button
                onClick={handleReject}
                disabled={loading || !rejectReason.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                确认驳回
              </button>
            )}
          </div>
        </div>
      )}

      {transfer.rejectReason && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          驳回原因：{transfer.rejectReason}
        </div>
      )}
    </div>
  );
}
