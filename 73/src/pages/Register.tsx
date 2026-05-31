import { useState, useCallback } from 'react';
import { api } from '@/utils/api';
import { Upload, FileText, X, CheckCircle, AlertCircle } from 'lucide-react';

const SAMPLE_TYPES = ['化学试剂', '生物样品', '环境样品', '食品样品', '药品样品', '其他'];
const UNITS = ['个', '件', '瓶', '袋', '盒', 'mL', 'g', 'kg'];

interface UploadedFile {
  file: File;
  id?: string;
}

export default function Register() {
  const [form, setForm] = useState({
    name: '', type: '', source: '', specification: '', quantity: '', unit: '', description: '',
  });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ id: string; sampleNo: string } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors([]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped.map(f => ({ file: f }))]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected.map(f => ({ file: f }))]);
    }
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors([]);
    setSuccess(null);
    try {
      const result = await api.createSample({
        ...form,
        quantity: Number(form.quantity),
        createdBy: 'u002',
      });
      if (files.length > 0) {
        await api.uploadAttachments(result.id, files.map(f => f.file));
      }
      setSuccess({ id: result.id, sampleNo: result.sampleNo });
      setForm({ name: '', type: '', source: '', specification: '', quantity: '', unit: '', description: '' });
      setFiles([]);
    } catch (err: any) {
      const msg = err.message || '提交失败';
      setErrors(msg.includes(',') ? msg.split(', ') : [msg]);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-12 text-center">
          <CheckCircle size={64} className="mx-auto text-emerald-500 mb-4" />
          <h2 className="text-2xl font-bold text-[#0F4C75] mb-2">登记成功</h2>
          <p className="text-gray-500 mb-4">样品编号：<span className="font-mono font-bold text-[#E8A838] text-lg">{success.sampleNo}</span></p>
          <button
            onClick={() => setSuccess(null)}
            className="px-6 py-2.5 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0d3f63] transition-colors"
          >
            继续登记
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-[#0F4C75] mb-6">样品登记</h1>
      {errors.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>{errors.map((e, i) => <p key={i} className="text-red-600 text-sm">{e}</p>)}</div>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-6 space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">样品名称 <span className="text-red-500">*</span></label>
            <input name="name" value={form.name} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none" placeholder="请输入样品名称" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">样品类型 <span className="text-red-500">*</span></label>
            <select name="type" value={form.type} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none">
              <option value="">请选择</option>
              {SAMPLE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">样品来源 <span className="text-red-500">*</span></label>
            <input name="source" value={form.source} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none" placeholder="请输入来源" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">规格 <span className="text-red-500">*</span></label>
            <input name="specification" value={form.specification} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none" placeholder="请输入规格" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">数量 <span className="text-red-500">*</span></label>
            <input name="quantity" type="number" value={form.quantity} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none" placeholder="0" min="1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">单位 <span className="text-red-500">*</span></label>
            <select name="unit" value={form.unit} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none">
              <option value="">请选择</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0F4C75] focus:border-[#0F4C75] outline-none resize-none" placeholder="可选，填写补充说明" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">附件上传</label>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#0F4C75] transition-colors cursor-pointer"
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload size={32} className="mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500 text-sm">拖拽文件到此处或点击上传</p>
            <p className="text-gray-400 text-xs mt-1">支持图片、文档，单个文件不超过 10MB</p>
            <input id="file-input" type="file" multiple className="hidden" onChange={handleFileInput} />
          </div>
        </div>
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <FileText size={18} className="text-gray-400" />
                <span className="flex-1 text-sm text-gray-700 truncate">{f.file.name}</span>
                <span className="text-xs text-gray-400">{(f.file.size / 1024).toFixed(1)} KB</span>
                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-6 flex gap-3 justify-end">
        <button
          onClick={() => { setForm({ name: '', type: '', source: '', specification: '', quantity: '', unit: '', description: '' }); setFiles([]); setErrors([]); }}
          className="px-6 py-2.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        >
          重置
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="px-6 py-2.5 bg-[#0F4C75] text-white rounded-lg hover:bg-[#0d3f63] transition-colors disabled:opacity-50"
        >
          {submitting ? '提交中...' : '提交登记'}
        </button>
      </div>
    </div>
  );
}
