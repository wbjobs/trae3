import type { Sample, Transfer } from '@/types';
import { SAMPLE_TYPE_MAP, SAMPLE_STATUS_MAP, TRANSFER_STATUS_MAP, STATUS_COLORS } from '@/utils/constants';
import { X, TestTube, Building2, Clock, Package, Thermometer } from 'lucide-react';
import { api } from '@/utils/api';
import { useEffect, useState } from 'react';

interface SampleDetailProps {
  sample: Sample;
  onClose: () => void;
}

export default function SampleDetail({ sample, onClose }: SampleDetailProps) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  useEffect(() => {
    api.get<Transfer[]>(`/samples/${sample.id}/transfers`).then(setTransfers).catch(() => {});
  }, [sample.id]);

  const infoItems = [
    { icon: TestTube, label: '样本编号', value: sample.sampleCode },
    { icon: Package, label: '样本类型', value: SAMPLE_TYPE_MAP[sample.type] },
    { icon: Building2, label: '所属实验室', value: sample.labName },
    { icon: Thermometer, label: '存储条件', value: sample.storageCondition },
    { icon: Clock, label: '创建时间', value: new Date(sample.createdAt).toLocaleString() },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1E3A5F]">{sample.name}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[sample.status]}`}>
            {SAMPLE_STATUS_MAP[sample.status]}
          </span>
          <span className="text-sm text-gray-500">数量：{sample.quantity} {sample.unit}</span>
          {sample.source && <span className="text-sm text-gray-500">来源：{sample.source}</span>}
        </div>

        <div className="space-y-3 rounded-lg bg-gray-50 p-4">
          {infoItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 text-sm">
                <Icon className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500">{item.label}</span>
                <span className="ml-auto font-medium text-[#1E3A5F]">{item.value}</span>
              </div>
            );
          })}
        </div>

        {transfers.length > 0 && (
          <div className="mt-5">
            <h4 className="mb-3 text-sm font-semibold text-[#1E3A5F]">流转记录</h4>
            <div className="space-y-2">
              {transfers.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                    {TRANSFER_STATUS_MAP[t.status]}
                  </span>
                  <span className="text-gray-600">{t.fromLabName}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-gray-600">{t.toLabName}</span>
                  <span className="ml-auto text-xs text-gray-400 font-mono">{new Date(t.appliedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
