import { useState, useEffect } from 'react'
import { CheckCircle, Plus, Trash2, X } from 'lucide-react'
import { useAlertStore } from '@/stores/alertStore'
import { useDeviceStore } from '@/stores/deviceStore'
import type { AlertRule } from '../../shared/types'

const levelLabels: Record<string, string> = { critical: '紧急', warning: '警告', info: '信息' }
const levelBg: Record<string, string> = { critical: 'bg-inv-fault/20 text-inv-fault', warning: 'bg-inv-warning/20 text-inv-warning', info: 'bg-inv-primary/20 text-inv-primary' }

export default function AlertCenter() {
  const alerts = useAlertStore((s) => s.alerts)
  const rules = useAlertStore((s) => s.rules)
  const filters = useAlertStore((s) => s.filters)
  const fetchAlerts = useAlertStore((s) => s.fetchAlerts)
  const fetchRules = useAlertStore((s) => s.fetchRules)
  const acknowledgeAlert = useAlertStore((s) => s.acknowledgeAlert)
  const createRule = useAlertStore((s) => s.createRule)
  const deleteRule = useAlertStore((s) => s.deleteRule)
  const setFilters = useAlertStore((s) => s.setFilters)
  const devices = useDeviceStore((s) => s.devices)

  const [showRuleModal, setShowRuleModal] = useState(false)
  const [newRule, setNewRule] = useState({ name: '', paramName: 'acVoltage', operator: '>', threshold: 0, level: 'warning' as AlertRule['level'] })

  useEffect(() => {
    fetchAlerts()
    fetchRules()
  }, [fetchAlerts, fetchRules])

  useEffect(() => {
    fetchAlerts()
  }, [filters, fetchAlerts])

  const filteredAlerts = alerts.filter((a) => {
    if (filters.level && a.level !== filters.level) return false
    if (filters.acknowledged !== undefined && a.acknowledged !== filters.acknowledged) return false
    if (filters.deviceId && a.deviceId !== filters.deviceId) return false
    return true
  })

  const handleCreateRule = async () => {
    if (!newRule.name.trim()) return
    await createRule({ ...newRule, enabled: true })
    setShowRuleModal(false)
    setNewRule({ name: '', paramName: 'acVoltage', operator: '>', threshold: 0, level: 'warning' })
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <div className="flex items-center gap-3 bg-inv-card border border-inv-border rounded-lg p-3">
          <select
            value={filters.level ?? ''}
            onChange={(e) => setFilters({ ...filters, level: e.target.value || undefined })}
            className="text-xs rounded px-2 py-1.5"
          >
            <option value="">全部级别</option>
            <option value="critical">紧急</option>
            <option value="warning">警告</option>
            <option value="info">信息</option>
          </select>
          <select
            value={filters.acknowledged === undefined ? '' : String(filters.acknowledged)}
            onChange={(e) => setFilters({ ...filters, acknowledged: e.target.value === '' ? undefined : e.target.value === 'true' })}
            className="text-xs rounded px-2 py-1.5"
          >
            <option value="">全部状态</option>
            <option value="false">未确认</option>
            <option value="true">已确认</option>
          </select>
          <select
            value={filters.deviceId ?? ''}
            onChange={(e) => setFilters({ ...filters, deviceId: e.target.value || undefined })}
            className="text-xs rounded px-2 py-1.5"
          >
            <option value="">全部设备</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-inv-card border border-inv-border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-inv-border">
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">级别</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">设备</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">类型</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">消息</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">时间</th>
                <th className="text-left text-xs text-slate-400 font-medium px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert, i) => (
                <tr
                  key={alert.id}
                  className={`border-b border-inv-border hover:bg-slate-800/50 ${i === 0 && !alert.acknowledged ? 'animate-flash-alert' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${levelBg[alert.level]}`}>
                      {levelLabels[alert.level]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">{alert.deviceName}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{alert.type}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">{alert.message}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                    {new Date(alert.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                  </td>
                  <td className="px-4 py-3">
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledgeAlert(alert.id)}
                        className="flex items-center gap-1 text-xs text-inv-primary hover:underline"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        确认
                      </button>
                    )}
                    {alert.acknowledged && <span className="text-xs text-slate-600">已确认</span>}
                  </td>
                </tr>
              ))}
              {filteredAlerts.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-500 text-sm">暂无告警记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-inv-card border border-inv-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">告警规则</h3>
            <button
              onClick={() => setShowRuleModal(true)}
              className="flex items-center gap-1 text-xs text-inv-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              新增规则
            </button>
          </div>
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 px-3 py-2 rounded border border-inv-border">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{rule.name}</div>
                  <div className="text-xs text-slate-500">
                    {rule.paramName} {rule.operator} {rule.threshold}
                    <span className={`ml-2 ${levelBg[rule.level]} px-1.5 py-0.5 rounded text-xs`}>
                      {levelLabels[rule.level]}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="text-slate-500 hover:text-inv-fault transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {rules.length === 0 && <p className="text-xs text-slate-500 text-center py-4">暂无规则</p>}
          </div>
        </div>
      </div>

      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-inv-card border border-inv-border rounded-lg p-6 w-[400px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">新增告警规则</h3>
              <button onClick={() => setShowRuleModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">规则名称</label>
                <input
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  className="w-full px-3 py-2 rounded text-sm"
                  placeholder="如：过压告警"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">参数</label>
                  <select
                    value={newRule.paramName}
                    onChange={(e) => setNewRule({ ...newRule, paramName: e.target.value })}
                    className="w-full px-2 py-2 rounded text-sm"
                  >
                    <option value="acVoltage">AC电压</option>
                    <option value="dcVoltage">DC电压</option>
                    <option value="acCurrent">AC电流</option>
                    <option value="temperature">温度</option>
                    <option value="acFrequency">频率</option>
                    <option value="acPower">功率</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">条件</label>
                  <select
                    value={newRule.operator}
                    onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
                    className="w-full px-2 py-2 rounded text-sm"
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                    <option value="==">=</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">阈值</label>
                  <input
                    type="number"
                    value={newRule.threshold}
                    onChange={(e) => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-2 rounded text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">告警级别</label>
                <select
                  value={newRule.level}
                  onChange={(e) => setNewRule({ ...newRule, level: e.target.value as AlertRule['level'] })}
                  className="w-full px-2 py-2 rounded text-sm"
                >
                  <option value="critical">紧急</option>
                  <option value="warning">警告</option>
                  <option value="info">信息</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowRuleModal(false)}
                className="px-4 py-2 text-sm rounded border border-inv-border text-slate-400 hover:text-slate-200"
              >
                取消
              </button>
              <button
                onClick={handleCreateRule}
                disabled={!newRule.name.trim()}
                className="px-4 py-2 text-sm rounded bg-inv-primary text-white hover:bg-inv-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
