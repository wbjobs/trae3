import { useState, useEffect } from 'react';
import type { Sample } from '@/types';
import { useSampleStore } from '@/stores/sampleStore';
import { useLabStore } from '@/stores/labStore';
import { useAuthStore } from '@/stores/authStore';
import SampleForm from '@/components/SampleForm';
import SampleTable from '@/components/SampleTable';
import SampleDetail from '@/components/SampleDetail';
import { Package, Truck, CheckCircle } from 'lucide-react';
import { useStatisticsStore } from '@/stores/statisticsStore';

export default function Register() {
  const { fetchSamples } = useSampleStore();
  const { labs, fetchLabs } = useLabStore();
  const { user } = useAuthStore();
  const { overview, fetchOverview } = useStatisticsStore();
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const isViewer = user?.role === 'viewer';

  useEffect(() => {
    fetchLabs();
    fetchSamples({ page: 1, pageSize: 10 });
    fetchOverview();
  }, [fetchSamples, fetchLabs, fetchOverview]);

  const inStockCount = overview?.inStockCount ?? labs.reduce((sum, l) => sum + l.currentCount, 0);
  const inTransitCount = overview?.inTransitCount ?? 0;
  const receivedCount = overview?.receivedCount ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-emerald-50 p-2">
            <Package className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-[#1E3A5F]">{inStockCount}</p>
            <p className="text-xs text-gray-500">在库样本</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-amber-50 p-2">
            <Truck className="h-5 w-5 text-warning" />
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-[#1E3A5F]">{inTransitCount}</p>
            <p className="text-xs text-gray-500">流转中</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-blue-50 p-2">
            <CheckCircle className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <p className="font-mono text-lg font-bold text-[#1E3A5F]">{receivedCount}</p>
            <p className="text-xs text-gray-500">已签收</p>
          </div>
        </div>
      </div>

      {!isViewer && <SampleForm onSuccess={() => fetchSamples({ page: 1, pageSize: 10 })} />}
      <SampleTable onViewDetail={(sample) => setSelectedSample(sample)} />

      {selectedSample && (
        <SampleDetail sample={selectedSample} onClose={() => setSelectedSample(null)} />
      )}
    </div>
  );
}
