import { useState } from 'react';
import type { Transfer } from '@/types';
import TransferMap from '@/components/TransferMap';
import { X, ArrowRight, Clock } from 'lucide-react';
import { TRANSFER_STATUS_MAP, STATUS_COLORS } from '@/utils/constants';

export default function Map() {
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);

  const timelineSteps = selectedTransfer
    ? [
        { label: '发起申请', time: selectedTransfer.appliedAt, done: true },
        { label: '审批通过', time: selectedTransfer.approvedAt, done: !!selectedTransfer.approvedAt },
        { label: '流转中', time: null, done: ['in_transit', 'received'].includes(selectedTransfer.status) },
        { label: '已签收', time: selectedTransfer.receivedAt, done: selectedTransfer.status === 'received' },
      ]
    : [];

  return (
    <div className="relative space-y-4">
      <TransferMap onTransferSelect={(t) => setSelectedTransfer(t)} />

      {selectedTransfer && (
        <>
          <div className="fixed right-6 top-24 z-40 w-72 rounded-xl bg-white p-5 shadow-lg animate-slideIn">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-[#1E3A5F]">流转详情</h4>
              <button onClick={() => setSelectedTransfer(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedTransfer.status]}`}>
                {TRANSFER_STATUS_MAP[selectedTransfer.status]}
              </span>
            </div>
            <div className="mb-2 text-sm font-medium text-[#1E3A5F]">{selectedTransfer.sampleName}</div>
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
              <span className="rounded bg-gray-100 px-2 py-0.5">{selectedTransfer.fromLabName}</span>
              <ArrowRight className="h-4 w-4 text-gray-400" />
              <span className="rounded bg-gray-100 px-2 py-0.5">{selectedTransfer.toLabName}</span>
            </div>
            <p className="text-sm text-gray-500">{selectedTransfer.reason}</p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#1E3A5F]">
              <Clock className="h-4 w-4" />
              流转路径回放
            </h4>
            <div className="flex items-center">
              {timelineSteps.map((step, i) => (
                <div key={i} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`h-4 w-4 rounded-full border-2 ${step.done ? 'border-accent bg-accent' : 'border-gray-300 bg-white'}`} />
                    <span className="mt-1 text-xs text-gray-500">{step.label}</span>
                    {step.time && <span className="text-[10px] text-gray-400 font-mono">{new Date(step.time).toLocaleDateString()}</span>}
                  </div>
                  {i < timelineSteps.length - 1 && (
                    <div className={`mx-2 h-0.5 w-16 ${step.done ? 'bg-accent' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
