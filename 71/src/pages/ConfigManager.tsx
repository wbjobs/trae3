import { useState, useEffect } from 'react'
import { Save, CheckCircle, XCircle } from 'lucide-react'
import { useDeviceStore } from '@/stores/deviceStore'
import { useConfigStore } from '@/stores/configStore'
import { Form } from '@/components/Form'
import type { ConfigParams } from '../../shared/types'

const defaultParams: ConfigParams = {
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
}

function isInvalidNumber(val: unknown): boolean {
  return typeof val !== 'number' || isNaN(val) || !isFinite(val)
}

export default function ConfigManager() {
  const devices = useDeviceStore((s) => s.devices)
  const fetchDevices = useDeviceStore((s) => s.fetchDevices)
  const templates = useConfigStore((s) => s.templates)
  const progress = useConfigStore((s) => s.progress)
  const fetchTemplates = useConfigStore((s) => s.fetchTemplates)
  const applyConfig = useConfigStore((s) => s.applyConfig)
  const saveTemplate = useConfigStore((s) => s.saveTemplate)
  const clearProgress = useConfigStore((s) => s.clearProgress)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [params, setParams] = useState<ConfigParams>({ ...defaultParams })
  const [templateName, setTemplateName] = useState('')
  const [templateDesc, setTemplateDesc] = useState('')
  const [isApplying, setIsApplying] = useState(false)

  useEffect(() => {
    fetchDevices()
    fetchTemplates()
  }, [fetchDevices, fetchTemplates])

  const toggleDevice = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(devices.map((d) => d.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const groups = [
    {
      name: 'basic',
      label: '基本参数',
      collapsed: false,
      fields: [
        {
          name: 'ratedPower' as const,
          label: '额定功率',
          type: 'number' as const,
          unit: 'kW',
          min: 1,
          max: 500,
          step: 1,
          required: true,
          validate: (v: number) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 1 || v > 500) return '范围: 1-500 kW'
            return null
          },
        },
        {
          name: 'overTempThreshold' as const,
          label: '过温阈值',
          type: 'number' as const,
          unit: '°C',
          min: 50,
          max: 100,
          step: 1,
          required: true,
          validate: (v: number) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 50 || v > 100) return '范围: 50-100 °C'
            return null
          },
        },
        {
          name: 'heartbeatInterval' as const,
          label: '心跳间隔',
          type: 'number' as const,
          unit: 's',
          min: 5,
          max: 300,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 5 || v > 300) return '范围: 5-300 s'
            if (!isInvalidNumber(all.reportInterval) && v < all.reportInterval) return '必须大于等于上报间隔'
            return null
          },
        },
        {
          name: 'reportInterval' as const,
          label: '上报间隔',
          type: 'number' as const,
          unit: 's',
          min: 1,
          max: 60,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 1 || v > 60) return '范围: 1-60 s'
            if (!isInvalidNumber(all.heartbeatInterval) && v > all.heartbeatInterval) return '必须小于等于心跳间隔'
            return null
          },
        },
      ],
    },
    {
      name: 'voltage',
      label: '电压参数',
      collapsed: true,
      fields: [
        {
          name: 'acVoltageMax' as const,
          label: '最大交流电压',
          type: 'number' as const,
          unit: 'V',
          min: 200,
          max: 300,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 200 || v > 300) return '范围: 200-300 V'
            if (!isInvalidNumber(all.acVoltageMin) && v <= all.acVoltageMin) return '必须大于最小交流电压'
            if (!isInvalidNumber(all.acVoltageMin) && v - all.acVoltageMin < 20) return '与最小电压差值至少20V'
            return null
          },
        },
        {
          name: 'acVoltageMin' as const,
          label: '最小交流电压',
          type: 'number' as const,
          unit: 'V',
          min: 100,
          max: 250,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 100 || v > 250) return '范围: 100-250 V'
            if (!isInvalidNumber(all.acVoltageMax) && v >= all.acVoltageMax) return '必须小于最大交流电压'
            if (!isInvalidNumber(all.acVoltageMax) && all.acVoltageMax - v < 20) return '与最大电压差值至少20V'
            return null
          },
        },
        {
          name: 'overVoltageThreshold' as const,
          label: '过压阈值',
          type: 'number' as const,
          unit: 'V',
          min: 200,
          max: 300,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 200 || v > 300) return '范围: 200-300 V'
            if (!isInvalidNumber(all.underVoltageThreshold) && v <= all.underVoltageThreshold) return '必须大于欠压阈值'
            if (!isInvalidNumber(all.acVoltageMax) && v > all.acVoltageMax) return '不能超过最大交流电压'
            return null
          },
        },
        {
          name: 'underVoltageThreshold' as const,
          label: '欠压阈值',
          type: 'number' as const,
          unit: 'V',
          min: 100,
          max: 250,
          step: 1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 100 || v > 250) return '范围: 100-250 V'
            if (!isInvalidNumber(all.overVoltageThreshold) && v >= all.overVoltageThreshold) return '必须小于过压阈值'
            if (!isInvalidNumber(all.acVoltageMin) && v < all.acVoltageMin) return '不能低于最小交流电压'
            return null
          },
        },
      ],
    },
    {
      name: 'frequency',
      label: '频率参数',
      collapsed: true,
      fields: [
        {
          name: 'overFreqThreshold' as const,
          label: '过频阈值',
          type: 'number' as const,
          unit: 'Hz',
          min: 50,
          max: 60,
          step: 0.1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 50 || v > 60) return '范围: 50-60 Hz'
            if (!isInvalidNumber(all.underFreqThreshold) && v <= all.underFreqThreshold) return '必须大于欠频阈值'
            if (!isInvalidNumber(all.underFreqThreshold) && v - all.underFreqThreshold < 1) return '与欠频阈值差值至少1Hz'
            return null
          },
        },
        {
          name: 'underFreqThreshold' as const,
          label: '欠频阈值',
          type: 'number' as const,
          unit: 'Hz',
          min: 45,
          max: 55,
          step: 0.1,
          required: true,
          validate: (v: number, all: ConfigParams) => {
            if (isInvalidNumber(v)) return '必须是有效数字'
            if (v < 45 || v > 55) return '范围: 45-55 Hz'
            if (!isInvalidNumber(all.overFreqThreshold) && v >= all.overFreqThreshold) return '必须小于过频阈值'
            if (!isInvalidNumber(all.overFreqThreshold) && all.overFreqThreshold - v < 1) return '与过频阈值差值至少1Hz'
            return null
          },
        },
      ],
    },
  ]

  const handleSubmit = async (values: ConfigParams) => {
    setIsApplying(true)
    clearProgress()
    await applyConfig(Array.from(selectedIds), values)
    setParams(values)
    setIsApplying(false)
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return
    await saveTemplate({ name: templateName, description: templateDesc, params })
    setTemplateName('')
    setTemplateDesc('')
  }

  const loadTemplate = (template: typeof templates[0]) => {
    setParams({ ...template.params })
  }

  const progressEntries = Object.entries(progress)

  return (
    <div className="space-y-4">
      <div className="bg-inv-card border border-inv-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">选择设备</h3>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs text-inv-primary hover:underline">全选</button>
            <span className="text-slate-600">|</span>
            <button onClick={deselectAll} className="text-xs text-slate-400 hover:underline">取消全选</button>
            <span className="text-xs text-slate-500 ml-2">已选 {selectedIds.size} 台</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => toggleDevice(d.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedIds.has(d.id)
                  ? 'border-inv-primary bg-inv-primary/10 text-inv-primary'
                  : 'border-inv-border text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${d.status === 'online' ? 'bg-inv-online' : 'bg-slate-500'}`} />
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-inv-card border border-inv-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">参数配置</h3>
          <Form<ConfigParams>
            groups={groups}
            initialValues={params}
            onSubmit={handleSubmit}
            submitText="下发配置"
            loading={isApplying}
            disabled={selectedIds.size === 0}
          />
        </div>

        <div className="bg-inv-card border border-inv-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">模板管理</h3>
          <div className="space-y-2 mb-4">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => loadTemplate(t)}
                className="w-full text-left px-3 py-2 rounded border border-inv-border hover:border-inv-primary/50 text-sm transition-colors"
              >
                <div className="font-medium text-slate-200">{t.name}</div>
                {t.description && <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>}
              </button>
            ))}
            {templates.length === 0 && <p className="text-xs text-slate-500 text-center py-4">暂无模板</p>}
          </div>

          <div className="border-t border-inv-border pt-3 space-y-2">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="模板名称"
              className="w-full px-3 py-2 rounded text-sm"
            />
            <input
              value={templateDesc}
              onChange={(e) => setTemplateDesc(e.target.value)}
              placeholder="模板描述（可选）"
              className="w-full px-3 py-2 rounded text-sm"
            />
            <button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim()}
              className="flex items-center gap-2 w-full px-4 py-2 rounded text-sm border border-inv-primary text-inv-primary hover:bg-inv-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              保存为模板
            </button>
          </div>
        </div>
      </div>

      {progressEntries.length > 0 && (
        <div className="bg-inv-card border border-inv-border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">下发进度</h3>
          <div className="space-y-2">
            {progressEntries.map(([deviceId, status]) => {
              const dev = devices.find((d) => d.id === deviceId)
              return (
                <div key={deviceId} className="flex items-center gap-3 px-3 py-2 rounded bg-slate-800">
                  <span className="text-sm flex-1">{dev?.name ?? deviceId}</span>
                  {status === 'pending' && <div className="w-4 h-4 border-2 border-inv-warning border-t-transparent rounded-full animate-spin" />}
                  {status === 'success' && <CheckCircle className="w-4 h-4 text-inv-online" />}
                  {status === 'failed' && <XCircle className="w-4 h-4 text-inv-fault" />}
                  <span className={`text-xs ${status === 'success' ? 'text-inv-online' : status === 'failed' ? 'text-inv-fault' : 'text-inv-warning'}`}>
                    {status === 'success' ? '成功' : status === 'failed' ? '失败' : '进行中'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
