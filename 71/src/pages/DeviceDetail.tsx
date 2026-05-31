import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronRight, Activity, Clock, AlertTriangle, Settings, History, Gauge } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { useDeviceStore } from '@/stores/deviceStore'
import { ParamCard, ParamItem } from '@/components/ParamPanel'
import { ConfigDiff } from '@/components/ConfigDiff'
import type { HistoryRecord, ConfigHistory, ConfigParams } from '../../shared/types'

const statusLabels: Record<string, string> = { online: '在线', offline: '离线', fault: '故障', warning: '告警' }
const statusColors: Record<string, string> = {
  online: 'text-inv-online',
  offline: 'text-slate-400',
  fault: 'text-inv-fault',
  warning: 'text-inv-warning',
}

const paramLabelMap: Partial<Record<keyof ConfigParams, string>> = {
  ratedPower: '额定功率',
  acVoltageMax: '最大交流电压',
  acVoltageMin: '最小交流电压',
  overVoltageThreshold: '过压阈值',
  underVoltageThreshold: '欠压阈值',
  overFreqThreshold: '过频阈值',
  underFreqThreshold: '欠频阈值',
  overTempThreshold: '过温阈值',
  heartbeatInterval: '心跳间隔',
  reportInterval: '上报间隔',
}

const mockConfigHistory: ConfigHistory[] = [
  {
    id: 1,
    deviceId: '1',
    params: {
      ratedPower: 50,
      acVoltageMax: 270,
      acVoltageMin: 180,
      overVoltageThreshold: 260,
      underVoltageThreshold: 190,
      overFreqThreshold: 51.5,
      underFreqThreshold: 48.5,
      overTempThreshold: 75,
      heartbeatInterval: 30,
      reportInterval: 10,
    },
    appliedBy: 'admin',
    status: 'success',
    appliedAt: Date.now() - 3600000 * 2,
  },
  {
    id: 2,
    deviceId: '1',
    params: {
      ratedPower: 55,
      acVoltageMax: 275,
      acVoltageMin: 180,
      overVoltageThreshold: 265,
      underVoltageThreshold: 190,
      overFreqThreshold: 51.5,
      underFreqThreshold: 48.5,
      overTempThreshold: 80,
      heartbeatInterval: 30,
      reportInterval: 10,
    },
    appliedBy: 'operator',
    status: 'success',
    appliedAt: Date.now() - 3600000 * 24,
  },
  {
    id: 3,
    deviceId: '1',
    params: {
      ratedPower: 60,
      acVoltageMax: 280,
      acVoltageMin: 175,
      overVoltageThreshold: 270,
      underVoltageThreshold: 185,
      overFreqThreshold: 52,
      underFreqThreshold: 48,
      overTempThreshold: 85,
      heartbeatInterval: 25,
      reportInterval: 8,
    },
    appliedBy: 'admin',
    status: 'success',
    appliedAt: Date.now() - 3600000 * 72,
  },
]

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const devices = useDeviceStore((s) => s.devices)
  const device = devices.find((d) => d.id === id)
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [paramKey, setParamKey] = useState<string>('acPower')
  const [timeRange, setTimeRange] = useState<string>('24h')
  const [activeTab, setActiveTab] = useState<'params' | 'history'>('params')
  const [configHistory, setConfigHistory] = useState<ConfigHistory[]>([])
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null)

  useEffect(() => {
    if (!id) return
    const hours = timeRange === '1h' ? 1 : timeRange === '6h' ? 6 : timeRange === '7d' ? 168 : 24
    fetch(`/api/devices/${id}/history?hours=${hours}`)
      .then((r) => r.json())
      .then((data) => setHistory(data.history ?? []))
      .catch(() => {})
  }, [id, timeRange])

  useEffect(() => {
    setConfigHistory(mockConfigHistory.filter((h) => h.deviceId === id))
  }, [id])

  if (!device) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        设备不存在或未连接
      </div>
    )
  }

  const p = device.params

  const chartData = history.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    value: h.params[paramKey as keyof typeof h.params] ?? 0,
  }))

  const paramOptions = [
    { key: 'acPower', label: '交流功率 (kW)' },
    { key: 'acVoltage', label: '交流电压 (V)' },
    { key: 'acCurrent', label: '交流电流 (A)' },
    { key: 'dcVoltage', label: '直流电压 (V)' },
    { key: 'dcCurrent', label: '直流电流 (A)' },
  ]

  const selectedHistory = configHistory.find((h) => h.id === selectedHistoryId)
  const prevHistory = selectedHistoryId
    ? configHistory[configHistory.findIndex((h) => h.id === selectedHistoryId) + 1]
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-200">监控面板</button>
        <ChevronRight className="w-4 h-4 text-slate-500" />
        <span className="text-slate-200">{device.name}</span>
        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${statusColors[device.status]} bg-opacity-20`}>
          {statusLabels[device.status]}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('params')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'params'
              ? 'bg-inv-primary text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <Gauge className="w-4 h-4" />
          运行参数
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-inv-primary text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          <History className="w-4 h-4" />
          配置历史
        </button>
      </div>

      {activeTab === 'params' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <ParamCard title="交流侧参数">
              <ParamItem label="电压" value={p.acVoltage} unit="V" />
              <ParamItem label="电流" value={p.acCurrent} unit="A" />
              <ParamItem label="频率" value={p.acFrequency} unit="Hz" />
              <ParamItem label="功率" value={p.acPower} unit="kW" />
            </ParamCard>
            <ParamCard title="直流侧参数">
              <ParamItem label="电压" value={p.dcVoltage} unit="V" />
              <ParamItem label="电流" value={p.dcCurrent} unit="A" />
              <ParamItem label="功率" value={p.dcPower} unit="kW" />
              <ParamItem label="" value="" unit="" />
            </ParamCard>
            <ParamCard title="统计信息">
              <ParamItem label="日发电量" value={p.dailyEnergy} unit="kWh" />
              <ParamItem label="总发电量" value={p.totalEnergy} unit="MWh" />
              <ParamItem label="效率" value={p.efficiency} unit="%" />
              <ParamItem label="温度" value={p.temperature} unit="°C" />
            </ParamCard>
          </div>

          <div className="bg-inv-card border border-inv-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-medium">历史曲线</h3>
                <select
                  value={paramKey}
                  onChange={(e) => setParamKey(e.target.value)}
                  className="text-xs rounded px-2 py-1"
                >
                  {paramOptions.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-1">
                {['1h', '6h', '24h', '7d'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      timeRange === r ? 'bg-inv-primary/20 text-inv-primary' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: '#94A3B8' }}
                  itemStyle={{ color: '#06B6D4' }}
                />
                <Area type="monotone" dataKey="value" stroke="#06B6D4" strokeWidth={2} fill="url(#areaGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-inv-card border border-inv-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">运行日志</h3>
            <div className="space-y-3">
              {[
                { icon: Settings, text: '配置参数下发', time: '10:30:15', color: 'text-inv-primary' },
                { icon: Activity, text: '状态变更: 在线', time: '09:15:42', color: 'text-inv-online' },
                { icon: AlertTriangle, text: '温度告警恢复', time: '08:45:00', color: 'text-inv-warning' },
                { icon: Clock, text: '系统启动', time: '08:00:00', color: 'text-slate-400' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <item.icon className={`w-3 h-3 ${item.color}`} />
                  </div>
                  <span className="text-sm flex-1">{item.text}</span>
                  <span className="text-xs text-slate-500 font-mono">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div className="grid grid-cols-5 gap-4">
          <div className="col-span-2 bg-inv-card border border-inv-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">配置变更时间线</h3>
            <div className="space-y-4">
              {configHistory.length === 0 ? (
                <div className="text-center text-slate-500 py-8 text-sm">暂无配置历史</div>
              ) : (
                configHistory.map((item, index) => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedHistoryId(selectedHistoryId === item.id ? null : item.id)}
                    className={`relative pl-6 pb-4 cursor-pointer transition-colors ${
                      index === configHistory.length - 1 ? '' : 'border-l-2 border-slate-700'
                    } ${selectedHistoryId === item.id ? 'opacity-100' : 'opacity-70 hover:opacity-100'}`}
                  >
                    <div className={`absolute left-0 top-0 w-3 h-3 rounded-full -translate-x-[5px] ${
                      item.status === 'success' ? 'bg-inv-online' : item.status === 'failed' ? 'bg-inv-fault' : 'bg-inv-warning'
                    }`} />
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-200">配置 #{item.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        item.status === 'success' ? 'bg-inv-online/20 text-inv-online' :
                        item.status === 'failed' ? 'bg-inv-fault/20 text-inv-fault' :
                        'bg-inv-warning/20 text-inv-warning'
                      }`}>
                        {item.status === 'success' ? '成功' : item.status === 'failed' ? '失败' : '进行中'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mb-1">
                      操作人: {item.appliedBy}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {new Date(item.appliedAt).toLocaleString('zh-CN')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="col-span-3 bg-inv-card border border-inv-border rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">配置变更详情</h3>
            {selectedHistory ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-400">配置版本:</span>
                  <span className="font-mono text-slate-200">#{selectedHistory.id}</span>
                  <span className="text-slate-400 ml-4">操作人:</span>
                  <span className="text-slate-200">{selectedHistory.appliedBy}</span>
                </div>
                {prevHistory ? (
                  <div>
                    <h4 className="text-xs text-slate-400 mb-3">与上一版本对比 (#{prevHistory.id})</h4>
                    <ConfigDiff
                      oldConfig={prevHistory.params}
                      newConfig={selectedHistory.params}
                      labelMap={paramLabelMap}
                    />
                  </div>
                ) : (
                  <div>
                    <h4 className="text-xs text-slate-400 mb-3">初始配置</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedHistory.params).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-3 px-3 py-2 rounded border bg-slate-800/50 border-slate-700">
                          <span className="text-sm text-slate-300 w-32">
                            {paramLabelMap[key as keyof ConfigParams] ?? key}
                          </span>
                          <span className="text-sm text-slate-400 font-mono">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
                点击左侧时间线查看配置变更详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
