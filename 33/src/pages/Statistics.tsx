import { useEffect } from 'react';
import { useStatisticsStore } from '@/stores/statisticsStore';
import StatsCard from '@/components/StatsCard';
import { Package, Truck, CheckCircle, ClipboardCheck, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar,
} from 'recharts';
import { SAMPLE_TYPE_MAP } from '@/utils/constants';

const PIE_COLORS = ['#1E3A5F', '#0EA5A0', '#F59E0B', '#10B981', '#6366F1', '#EC4899', '#8B5CF6'];

export default function Statistics() {
  const { overview, trend, labLoad, efficiency, loading, fetchOverview, fetchTrend, fetchLabLoad, fetchApprovalEfficiency } = useStatisticsStore();

  useEffect(() => {
    fetchOverview();
    fetchTrend(30);
    fetchLabLoad();
    fetchApprovalEfficiency();
  }, [fetchOverview, fetchTrend, fetchLabLoad, fetchApprovalEfficiency]);

  const statsCards = overview
    ? [
        { icon: <Package className="h-5 w-5" />, value: overview.totalSamples, label: '样本总量' },
        { icon: <ClipboardCheck className="h-5 w-5" />, value: overview.inStockCount, label: '在库样本' },
        { icon: <Truck className="h-5 w-5" />, value: overview.inTransitCount, label: '流转中' },
        { icon: <CheckCircle className="h-5 w-5" />, value: overview.pendingApprovalCount, label: '待审批' },
      ]
    : [
        { icon: <Package className="h-5 w-5" />, value: 0, label: '样本总量' },
        { icon: <ClipboardCheck className="h-5 w-5" />, value: 0, label: '在库样本' },
        { icon: <Truck className="h-5 w-5" />, value: 0, label: '流转中' },
        { icon: <CheckCircle className="h-5 w-5" />, value: 0, label: '待审批' },
      ];

  const typeChartData = overview?.byType
    ? overview.byType.map((item: any) => ({
        name: SAMPLE_TYPE_MAP[item.type as keyof typeof SAMPLE_TYPE_MAP] || item.type,
        value: item.count,
      }))
    : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {statsCards.map((card, i) => (
          <StatsCard key={i} icon={card.icon} value={card.value} label={card.label} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-[#1E3A5F]">流转趋势（近30天）</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend.length > 0 ? trend : []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="count" stroke="#0EA5A0" strokeWidth={2} dot={{ fill: '#0EA5A0', r: 3 }} name="流转次数" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-[#1E3A5F]">样本类型分布</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={typeChartData.length > 0 ? typeChartData : [{ name: '暂无数据', value: 1 }]}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={{ stroke: '#94A3B8' }}
              >
                {typeChartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-[#1E3A5F]">实验室负载</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={labLoad.length > 0 ? labLoad : []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="labName" tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="currentCount" fill="#0EA5A0" radius={[4, 4, 0, 0]} name="当前数量" />
              <Bar dataKey="capacity" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="容量" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-[#1E3A5F]">审批效率</h3>
          </div>
          {efficiency ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="font-mono text-2xl font-bold text-[#1E3A5F]">{efficiency.averageApprovalHours}h</p>
                <p className="mt-1 text-xs text-gray-500">平均审批时长</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4 text-center">
                <p className="font-mono text-2xl font-bold text-success">{efficiency.approvalRate}%</p>
                <p className="mt-1 text-xs text-gray-500">通过率</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4 text-center">
                <p className="font-mono text-2xl font-bold text-red-500">{efficiency.rejectionRate}%</p>
                <p className="mt-1 text-xs text-gray-500">驳回率</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4 text-center">
                <p className="font-mono text-2xl font-bold text-blue-600">{efficiency.totalApproved + efficiency.totalRejected}</p>
                <p className="mt-1 text-xs text-gray-500">审批总数</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-16 text-gray-400">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
