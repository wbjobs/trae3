import { useEffect, useState } from 'react';
import { api } from '@/utils/api';
import { FlaskConical, Clock, CheckCircle, XCircle, Activity, Bell, Download, AlertTriangle } from 'lucide-react';

interface DashboardData {
  totalSamples: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  recentActivities: { sampleNo: string; action: string; operator: string; timestamp: string }[];
}

const ACTION_MAP: Record<string, string> = {
  submit: '提交登记',
  approve: '审批通过',
  reject: '审批退回',
  resubmit: '重新提交',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminders, setReminders] = useState<any[]>([]);
  const [triggering, setTriggering] = useState(false);

  const fetchData = async () => {
    try {
      const [s, r] = await Promise.all([
        api.getDashboardStats(),
        api.getPendingReminders(),
      ]);
      setStats(s);
      setReminders(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleTriggerReminders = async () => {
    setTriggering(true);
    try {
      const result = await api.triggerReminders();
      if (result.count > 0) {
        alert(`已生成 ${result.count} 条送检提醒通知！`);
        fetchData();
      } else {
        alert('当前没有超过 24 小时的待审批样品。');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const handleExportAll = () => {
    window.location.href = api.exportCSV({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0F4C75]" />
      </div>
    );
  }

  const cards = [
    { label: '样品总数', value: stats?.totalSamples ?? 0, icon: FlaskConical, color: 'bg-[#0F4C75]', textColor: 'text-white' },
    { label: '待审批', value: stats?.pendingCount ?? 0, icon: Clock, color: 'bg-[#E8A838]', textColor: 'text-white' },
    { label: '已通过', value: stats?.approvedCount ?? 0, icon: CheckCircle, color: 'bg-emerald-500', textColor: 'text-white' },
    { label: '已退回', value: stats?.rejectedCount ?? 0, icon: XCircle, color: 'bg-red-500', textColor: 'text-white' },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#0F4C75]">工作台</h1>
        <div className="flex gap-3">
          <button
            onClick={handleTriggerReminders}
            disabled={triggering}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Bell size={16} /> {triggering ? '发送中...' : '触发送检提醒'}
          </button>
          <button
            onClick={handleExportAll}
            className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm flex items-center gap-1.5"
          >
            <Download size={16} /> 导出全部报表
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-8">
        {cards.map((card) => (
          <div key={card.label} className={`${card.color} rounded-xl p-6 flex items-center gap-4 shadow-lg`}>
            <card.icon size={36} className={card.textColor} />
            <div>
              <p className={`text-sm ${card.textColor} opacity-80`}>{card.label}</p>
              <p className={`text-3xl font-bold ${card.textColor}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {reminders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle size={20} /> 待处理提醒
          </h2>
          <div className="space-y-2">
            {reminders.filter(s => s.pendingHours >= 24).slice(0, 5).map((s) => (
              <div key={s.sampleNo} className="flex items-center gap-4 bg-white rounded-lg p-3 border border-amber-100">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="font-mono text-sm text-amber-800 w-28">{s.sampleNo}</span>
                <span className="text-sm text-gray-700 flex-1">{s.name}</span>
                <span className="text-xs text-gray-500">{s.type}</span>
                <span className="text-xs text-red-600 font-medium">已等待 {s.pendingHours} 小时</span>
              </div>
            ))}
            {reminders.filter(s => s.pendingHours >= 24).length > 5 && (
              <p className="text-xs text-amber-600 text-center pt-2">还有 {reminders.filter(s => s.pendingHours >= 24).length - 5} 条待处理...</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6">
        <h2 className="text-lg font-semibold text-[#0F4C75] mb-4 flex items-center gap-2">
          <Activity size={20} /> 最近动态
        </h2>
        {stats?.recentActivities.length === 0 ? (
          <p className="text-gray-400 text-center py-8">暂无动态</p>
        ) : (
          <div className="space-y-3">
            {stats?.recentActivities.map((act, i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-500 w-36">{act.timestamp.slice(0, 19).replace('T', ' ')}</span>
                <span className="font-medium text-[#0F4C75] w-28">{act.sampleNo}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  act.action === 'approve' ? 'bg-emerald-50 text-emerald-600' :
                  act.action === 'reject' ? 'bg-red-50 text-red-600' :
                  'bg-amber-50 text-amber-600'
                }`}>{ACTION_MAP[act.action] || act.action}</span>
                <span className="text-sm text-gray-500">{act.operator}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
