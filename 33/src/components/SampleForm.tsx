import { useState } from 'react';
import type { Sample, SampleType } from '@/types';
import { useSampleStore } from '@/stores/sampleStore';
import { useLabStore } from '@/stores/labStore';
import { SAMPLE_TYPE_MAP, STORAGE_CONDITIONS, UNITS } from '@/utils/constants';
import { Save, Loader2 } from 'lucide-react';

interface SampleFormProps {
  onSuccess?: () => void;
}

export default function SampleForm({ onSuccess }: SampleFormProps) {
  const { createSample } = useSampleStore();
  const { labs } = useLabStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: '' as SampleType | '',
    source: '',
    quantity: '',
    unit: '份',
    storageCondition: '常温',
    labId: '' as number | '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = '样本名称必填';
    if (!form.type) errs.type = '请选择样本类型';
    if (!form.quantity || Number(form.quantity) <= 0) errs.quantity = '数量必须大于0';
    if (!form.labId) errs.labId = '请选择所属实验室';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await createSample({
        name: form.name,
        type: form.type as SampleType,
        source: form.source,
        quantity: Number(form.quantity),
        unit: form.unit,
        storageCondition: form.storageCondition,
        labId: Number(form.labId),
      } as Partial<Sample>);
      setForm({ name: '', type: '', source: '', quantity: '', unit: '份', storageCondition: '常温', labId: '' });
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-[#1E3A5F]">新样本登记</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">样本名称 <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.name ? 'border-red-400' : 'border-gray-200'}`}
            placeholder="请输入样本名称"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">样本类型 <span className="text-red-500">*</span></label>
          <select
            value={form.type}
            onChange={(e) => updateField('type', e.target.value)}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.type ? 'border-red-400' : 'border-gray-200'}`}
          >
            <option value="">请选择类型</option>
            {Object.entries(SAMPLE_TYPE_MAP).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">来源</label>
          <input
            type="text"
            value={form.source}
            onChange={(e) => updateField('source', e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            placeholder="样本来源"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm text-gray-600">数量 <span className="text-red-500">*</span></label>
            <input
              type="number"
              value={form.quantity}
              onChange={(e) => updateField('quantity', e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.quantity ? 'border-red-400' : 'border-gray-200'}`}
              placeholder="0"
              min="0"
              step="0.01"
            />
            {errors.quantity && <p className="mt-1 text-xs text-red-500">{errors.quantity}</p>}
          </div>
          <div className="w-24">
            <label className="mb-1 block text-sm text-gray-600">单位</label>
            <select
              value={form.unit}
              onChange={(e) => updateField('unit', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">存储条件</label>
          <select
            value={form.storageCondition}
            onChange={(e) => updateField('storageCondition', e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {STORAGE_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-600">所属实验室 <span className="text-red-500">*</span></label>
          <select
            value={form.labId}
            onChange={(e) => updateField('labId', Number(e.target.value))}
            className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${errors.labId ? 'border-red-400' : 'border-gray-200'}`}
          >
            <option value="">请选择实验室</option>
            {labs.map((lab) => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
          </select>
          {errors.labId && <p className="mt-1 text-xs text-red-500">{errors.labId}</p>}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          登记样本
        </button>
      </div>
    </form>
  );
}
