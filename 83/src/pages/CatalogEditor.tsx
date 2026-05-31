import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Send,
  CheckCircle,
  XCircle,
  History,
  Image,
  Loader2,
  Tag,
  Calendar,
  User,
  MapPin,
  BookOpen,
  FileText,
  Clock,
  Trash2,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiService } from '../services/api.service';
import { useAuthStore } from '../stores/auth.store';
import {
  RubbingMetadata,
  WorkflowRecord,
  WorkflowStatus,
  FileInfo,
} from '../../shared/types';
import { cn } from '../lib/utils';

const rubbingSchema = z.object({
  accessionNo: z.string().min(1, '登录号不能为空'),
  title: z.string().min(1, '题名不能为空'),
  dynasty: z.string().optional(),
  era: z.string().optional(),
  author: z.string().optional(),
  material: z.string().optional(),
  dimensions: z.string().optional(),
  location: z.string().optional(),
  inscriptionContent: z.string().optional(),
  transcription: z.string().optional(),
  bibliography: z.string().optional(),
  provenance: z.string().optional(),
  notes: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});

type RubbingFormData = z.infer<typeof rubbingSchema>;

const CatalogEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metadata, setMetadata] = useState<RubbingMetadata | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'basic' | 'image' | 'history'>('basic');
  const [keywordInput, setKeywordInput] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<RubbingFormData>({
    resolver: zodResolver(rubbingSchema),
    defaultValues: {
      keywords: [],
    },
  });

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (rubbingId: string) => {
    setLoading(true);
    try {
      const [data, workflow] = await Promise.all([
        apiService.getRubbing(rubbingId),
        apiService.getWorkflowHistory(rubbingId),
      ]);
      setMetadata(data);
      setFileInfo(data.fileInfo || null);
      setWorkflowHistory(workflow);

      let dimensionsStr = '';
      if (typeof data.dimensions === 'object' && data.dimensions) {
        const d = data.dimensions as { width?: number; height?: number; unit?: string };
        if (d.width && d.height) {
          dimensionsStr = `${d.width} × ${d.height} ${d.unit || 'cm'}`;
        }
      } else if (typeof data.dimensions === 'string') {
        dimensionsStr = data.dimensions;
      }

      const formData: RubbingFormData = {
        accessionNo: data.accessionNo,
        title: data.title,
        dynasty: data.dynasty,
        era: data.era,
        author: data.author,
        material: data.material,
        dimensions: dimensionsStr,
        location: data.location,
        inscriptionContent: data.inscriptionContent,
        transcription: data.transcription,
        bibliography: data.bibliography,
        provenance: data.provenance,
        notes: data.notes,
        keywords: data.keywords,
      };
      reset(formData);
    } catch (e) {
      console.error('加载数据失败', e);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: RubbingFormData) => {
    if (!id) return;
    setSaving(true);
    try {
      const updatedData = await apiService.updateRubbing(id, data);
      setMetadata(updatedData);

      let dimensionsStr = '';
      if (typeof updatedData.dimensions === 'object' && updatedData.dimensions) {
        const d = updatedData.dimensions as { width?: number; height?: number; unit?: string };
        if (d.width && d.height) {
          dimensionsStr = `${d.width} × ${d.height} ${d.unit || 'cm'}`;
        }
      } else if (typeof updatedData.dimensions === 'string') {
        dimensionsStr = updatedData.dimensions;
      }

      reset({
        accessionNo: updatedData.accessionNo,
        title: updatedData.title,
        dynasty: updatedData.dynasty,
        era: updatedData.era,
        author: updatedData.author,
        material: updatedData.material,
        dimensions: dimensionsStr,
        location: updatedData.location,
        inscriptionContent: updatedData.inscriptionContent,
        transcription: updatedData.transcription,
        bibliography: updatedData.bibliography,
        provenance: updatedData.provenance,
        notes: updatedData.notes,
        keywords: updatedData.keywords,
      });

      try {
        const workflow = await apiService.getWorkflowHistory(id);
        setWorkflowHistory(workflow);
      } catch (e) {
        console.error('加载工作流历史失败', e);
      }
    } catch (e) {
      console.error('保存失败', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!id) return;
    try {
      await apiService.submitRubbing(id);
      await loadData(id);
    } catch (e) {
      console.error('提交审核失败', e);
    }
  };

  const handleApprove = async () => {
    if (!id) return;
    try {
      await apiService.approveRubbing(id, '审核通过');
      await loadData(id);
    } catch (e) {
      console.error('审核通过失败', e);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    try {
      await apiService.rejectRubbing(id, '需要补充信息');
      await loadData(id);
    } catch (e) {
      console.error('审核驳回失败', e);
    }
  };

  const addKeyword = () => {
    if (!keywordInput.trim()) return;
    const currentKeywords = metadata?.keywords || [];
    if (currentKeywords.includes(keywordInput.trim())) {
      setKeywordInput('');
      return;
    }
    const newKeywords = [...currentKeywords, keywordInput.trim()];
    setValue('keywords', newKeywords, { shouldDirty: true });
    if (metadata) {
      setMetadata({ ...metadata, keywords: newKeywords });
    }
    setKeywordInput('');
  };

  const removeKeyword = (keyword: string) => {
    const newKeywords = (metadata?.keywords || []).filter((k) => k !== keyword);
    setValue('keywords', newKeywords, { shouldDirty: true });
    if (metadata) {
      setMetadata({ ...metadata, keywords: newKeywords });
    }
  };

  const getStatusBadge = (status: WorkflowStatus) => {
    const configs: Record<WorkflowStatus, { label: string; className: string }> = {
      draft: { label: '草稿', className: 'bg-ink-100 text-ink-600' },
      pending: { label: '待审核', className: 'bg-yellow-100 text-yellow-700' },
      published: { label: '已发布', className: 'bg-green-100 text-green-700' },
    };
    const config = configs[status] || configs.draft;
    return (
      <span className={cn('px-3 py-1 rounded-full text-sm font-medium', config.className)}>
        {config.label}
      </span>
    );
  };

  const canEdit =
    user?.role === 'admin' ||
    user?.role === 'operator' ||
    (user?.role === 'auditor' && metadata?.status === 'pending');

  const canSubmit = metadata?.status === 'draft' && (user?.role === 'admin' || user?.role === 'operator');
  const canReview = metadata?.status === 'pending' && (user?.role === 'admin' || user?.role === 'auditor');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
        <span className="ml-3 text-ink-500">加载中...</span>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="text-center p-12">
        <p className="text-ink-500">未找到数据</p>
        <button
          onClick={() => navigate('/catalog/list')}
          className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-scroll-reveal">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/catalog/list')}
            className="p-2 hover:bg-primary-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-primary-700" />
          </button>
          <div>
            <h1 className="font-serif text-3xl font-bold text-primary-800">
              著录编辑
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-ink-500">登录号：{metadata.accessionNo}</span>
              {getStatusBadge(metadata.status)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canSubmit && (
            <button
              onClick={handleSubmitReview}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              提交审核
            </button>
          )}
          {canReview && (
            <>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                审核通过
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                审核驳回
              </button>
            </>
          )}
          {canEdit && (
            <button
              onClick={handleSubmit(onSubmit)}
              disabled={saving || !isDirty}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-ink-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-primary-200">
        {[
          { id: 'basic', label: '基本信息', icon: BookOpen },
          { id: 'image', label: '图像预览', icon: Image },
          { id: 'history', label: '历史记录', icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              'px-4 py-3 font-medium transition-colors flex items-center gap-2 border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-ink-500 hover:text-primary-600'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'basic' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div className="bg-white rounded-xl border border-primary-100 p-6 space-y-6">
            <h2 className="font-serif text-xl font-semibold text-primary-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent-500" />
              基本著录项
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <Tag className="w-4 h-4" />
                    登录号 <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="text"
                  {...register('accessionNo')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all',
                    errors.accessionNo
                      ? 'border-red-300'
                      : 'border-primary-200',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入登录号"
                />
                {errors.accessionNo && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.accessionNo.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-4 h-4" />
                    题名 <span className="text-red-500">*</span>
                  </span>
                </label>
                <input
                  type="text"
                  {...register('title')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all',
                    errors.title ? 'border-red-300' : 'border-primary-200',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入题名"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-500">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    朝代
                  </span>
                </label>
                <select
                  {...register('dynasty')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 bg-white',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                >
                  <option value="">请选择朝代</option>
                  <option value="先秦">先秦</option>
                  <option value="秦">秦</option>
                  <option value="汉">汉</option>
                  <option value="三国">三国</option>
                  <option value="晋">晋</option>
                  <option value="南北朝">南北朝</option>
                  <option value="隋">隋</option>
                  <option value="唐">唐</option>
                  <option value="宋">宋</option>
                  <option value="元">元</option>
                  <option value="明">明</option>
                  <option value="清">清</option>
                  <option value="民国">民国</option>
                  <option value="现代">现代</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    年代
                  </span>
                </label>
                <input
                  type="text"
                  {...register('era')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="如：贞观年间、乾隆十年"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    作者/书者
                  </span>
                </label>
                <input
                  type="text"
                  {...register('author')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入作者"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    收藏地点
                  </span>
                </label>
                <input
                  type="text"
                  {...register('location')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入收藏地点"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  材质
                </label>
                <input
                  type="text"
                  {...register('material')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="如：宣纸、绢本"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  尺寸
                </label>
                <input
                  type="text"
                  {...register('dimensions')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="如：180×90cm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-primary-100 p-6 space-y-6">
            <h2 className="font-serif text-xl font-semibold text-primary-800 flex items-center gap-2">
              <Tag className="w-5 h-5 text-accent-500" />
              关键词
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {metadata.keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm"
                >
                  {kw}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </span>
              ))}
              {metadata.keywords.length === 0 && (
                <span className="text-ink-400 text-sm">暂无关键词</span>
              )}
            </div>

            {canEdit && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                  className="flex-1 px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500"
                  placeholder="输入关键词后按回车添加"
                />
                <button
                  type="button"
                  onClick={addKeyword}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                >
                  添加
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-primary-100 p-6 space-y-6">
            <h2 className="font-serif text-xl font-semibold text-primary-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-accent-500" />
              详细描述
            </h2>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  铭文内容
                </label>
                <textarea
                  rows={4}
                  {...register('inscriptionContent')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all resize-y',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入铭文内容"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  释文
                </label>
                <textarea
                  rows={4}
                  {...register('transcription')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all resize-y',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入释文"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  著录文献
                </label>
                <textarea
                  rows={3}
                  {...register('bibliography')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all resize-y',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入相关著录文献"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  流传经过
                </label>
                <textarea
                  rows={3}
                  {...register('provenance')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all resize-y',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入流传经过"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary-700 mb-2">
                  备注
                </label>
                <textarea
                  rows={3}
                  {...register('notes')}
                  disabled={!canEdit}
                  className={cn(
                    'w-full px-4 py-2.5 border border-primary-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500 transition-all resize-y',
                    !canEdit && 'bg-ink-50 cursor-not-allowed'
                  )}
                  placeholder="请输入备注信息"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {activeTab === 'image' && fileInfo && (
        <div className="bg-white rounded-xl border border-primary-100 p-6">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <img
                src={apiService.getPreviewUrl(metadata.fileId!, 'preview')}
                alt={metadata.title}
                className="w-full rounded-lg shadow-paper"
              />
            </div>
            <div className="w-72 space-y-4">
              <h3 className="font-serif text-lg font-semibold text-primary-800">
                文件信息
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-500">文件名</span>
                  <span className="text-primary-800">{fileInfo.filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">大小</span>
                  <span className="text-primary-800">
                    {(fileInfo.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">尺寸</span>
                  <span className="text-primary-800">
                    {fileInfo.width} × {fileInfo.height} px
                  </span>
                </div>
                {fileInfo.dpi && (
                  <div className="flex justify-between">
                    <span className="text-ink-500">DPI</span>
                    <span className="text-primary-800">{fileInfo.dpi}</span>
                  </div>
                )}
                {fileInfo.colorSpace && (
                  <div className="flex justify-between">
                    <span className="text-ink-500">色彩空间</span>
                    <span className="text-primary-800">{fileInfo.colorSpace}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-ink-500">文件类型</span>
                  <span className="text-primary-800">{fileInfo.mimeType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-500">MD5</span>
                  <span className="text-primary-800 font-mono text-xs">
                    {fileInfo.md5Hash?.slice(0, 16)}...
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-primary-100 space-y-2">
                <a
                  href={apiService.getDownloadUrl(metadata.fileId!)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full px-4 py-2 text-center bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors text-sm"
                >
                  下载原图
                </a>
                <a
                  href={apiService.getDownloadUrl(metadata.fileId!)}
                  className="block w-full px-4 py-2 text-center border border-primary-300 hover:bg-primary-50 rounded-lg transition-colors text-sm text-primary-700"
                >
                  下载附件
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-primary-100 p-6">
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-primary-200" />
            <div className="space-y-6">
              {workflowHistory.map((record, index) => (
                <div key={record.id} className="relative pl-12">
                  <div
                    className={cn(
                      'absolute left-0 w-10 h-10 rounded-full flex items-center justify-center border-4',
                      record.action === 'approve'
                        ? 'bg-green-100 border-green-200'
                        : record.action === 'reject'
                        ? 'bg-red-100 border-red-200'
                        : record.action === 'submit'
                        ? 'bg-yellow-100 border-yellow-200'
                        : 'bg-primary-100 border-primary-200'
                    )}
                  >
                    {record.action === 'approve' ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : record.action === 'reject' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : record.action === 'submit' ? (
                      <Send className="w-5 h-5 text-yellow-600" />
                    ) : (
                      <Clock className="w-5 h-5 text-primary-600" />
                    )}
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-primary-800">
                        {record.operatorName}
                      </span>
                      <span className="text-ink-500 text-sm">
                        {record.action === 'create'
                          ? '创建记录'
                          : record.action === 'update'
                          ? '编辑内容'
                          : record.action === 'submit'
                          ? '提交审核'
                          : record.action === 'approve'
                          ? '审核通过'
                          : record.action === 'reject'
                          ? '审核驳回'
                          : record.action}
                      </span>
                      <span className="text-ink-400 text-xs">
                        {new Date(record.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {record.comment && (
                      <p className="mt-1 text-sm text-ink-600">
                        备注：{record.comment}
                      </p>
                    )}
                    <span
                      className={cn(
                        'inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium',
                        record.toStatus === 'published'
                          ? 'bg-green-100 text-green-700'
                          : record.toStatus === 'pending'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-ink-100 text-ink-600'
                      )}
                    >
                      {record.toStatus === 'draft'
                        ? '草稿'
                        : record.toStatus === 'pending'
                        ? '待审核'
                        : '已发布'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogEditor;
