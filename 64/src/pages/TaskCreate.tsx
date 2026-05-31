import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Upload, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { useAppStore } from '../store/useStore';
import { api } from '../utils/api';
import { cn } from '../lib/utils';
import type { SoilProperties, LoadCondition, BoundaryCondition, CalculationParameters, CreateTaskRequest } from '../../shared/types';

interface FormErrors {
  name?: string;
  gridSize?: string;
  timeSteps?: string;
  youngModulus?: string;
  poissonRatio?: string;
  density?: string;
  cohesion?: string;
  frictionAngle?: string;
  loads?: string;
  boundaries?: string;
}

export default function TaskCreate() {
  const navigate = useNavigate();
  const { setLoading, setError, loading } = useAppStore();
  const [activeSection, setActiveSection] = useState<'basic' | 'calc' | 'soil' | 'load' | 'boundary' | 'file'>('basic');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    priority: 1,
    gridSize: 100,
    timeSteps: 1000,
    soilProperties: {
      youngModulus: 30e6,
      poissonRatio: 0.3,
      density: 2000,
      cohesion: 20e3,
      frictionAngle: 30,
    } as SoilProperties,
    loadConditions: [
      { x: 50, y: 50, magnitude: 100e3, area: 4 },
    ] as LoadCondition[],
    boundaryConditions: [
      { type: 'fixed', xMin: true, xMax: false, yMin: false, yMax: false },
      { type: 'roller', xMin: false, xMax: false, yMin: true, yMax: false },
    ] as BoundaryCondition[],
    modelFile: null as File | null,
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const sections = [
    { key: 'basic', label: '基本信息', icon: FileText },
    { key: 'calc', label: '计算参数', icon: FileText },
    { key: 'soil', label: '土壤属性', icon: FileText },
    { key: 'load', label: '载荷条件', icon: FileText },
    { key: 'boundary', label: '边界条件', icon: FileText },
    { key: 'file', label: '文件上传', icon: Upload },
  ];

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '任务名称不能为空';
    } else if (formData.name.length > 100) {
      newErrors.name = '任务名称不能超过100个字符';
    }

    if (formData.gridSize < 10 || formData.gridSize > 1000) {
      newErrors.gridSize = '网格大小必须在10-1000之间';
    }

    if (formData.timeSteps < 1 || formData.timeSteps > 100000) {
      newErrors.timeSteps = '时间步数必须在1-100000之间';
    }

    if (formData.soilProperties.youngModulus <= 0) {
      newErrors.youngModulus = '弹性模量必须大于0';
    }

    if (formData.soilProperties.poissonRatio < 0 || formData.soilProperties.poissonRatio >= 0.5) {
      newErrors.poissonRatio = '泊松比必须在0-0.5之间';
    }

    if (formData.soilProperties.density <= 0) {
      newErrors.density = '密度必须大于0';
    }

    if (formData.soilProperties.cohesion < 0) {
      newErrors.cohesion = '黏聚力不能为负';
    }

    if (formData.soilProperties.frictionAngle < 0 || formData.soilProperties.frictionAngle > 90) {
      newErrors.frictionAngle = '内摩擦角必须在0-90度之间';
    }

    if (formData.loadConditions.length === 0) {
      newErrors.loads = '至少需要一个载荷条件';
    }

    if (formData.boundaryConditions.length === 0) {
      newErrors.boundaries = '至少需要一个边界条件';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const parameters: CalculationParameters = {
        gridSize: formData.gridSize,
        timeSteps: formData.timeSteps,
        soilProperties: formData.soilProperties,
        loadConditions: formData.loadConditions,
        boundaryConditions: formData.boundaryConditions,
      };

      const requestData: Omit<CreateTaskRequest, 'modelFile'> & { modelFile?: File } = {
        name: formData.name,
        parameters,
        priority: formData.priority,
      };

      if (formData.modelFile) {
        requestData.modelFile = formData.modelFile;
      }

      const res = await api.createTask(requestData);

      if (res.success) {
        setSubmitSuccess(true);
        setTimeout(() => {
          navigate('/tasks');
        }, 1500);
      } else {
        setError(res.message || '创建任务失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
    } finally {
      setLoading(false);
    }
  };

  const addLoadCondition = () => {
    setFormData(prev => ({
      ...prev,
      loadConditions: [...prev.loadConditions, { x: 0, y: 0, magnitude: 0, area: 1 }],
    }));
  };

  const removeLoadCondition = (index: number) => {
    setFormData(prev => ({
      ...prev,
      loadConditions: prev.loadConditions.filter((_, i) => i !== index),
    }));
  };

  const updateLoadCondition = (index: number, field: keyof LoadCondition, value: number) => {
    setFormData(prev => ({
      ...prev,
      loadConditions: prev.loadConditions.map((load, i) =>
        i === index ? { ...load, [field]: value } : load
      ),
    }));
  };

  const updateBoundaryCondition = (index: number, field: keyof BoundaryCondition, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      boundaryConditions: prev.boundaryConditions.map((boundary, i) =>
        i === index ? { ...boundary, [field]: value } : boundary
      ),
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, modelFile: file }));
    }
  };

  const priorityOptions = [
    { value: 0, label: '低', color: 'bg-gray-700 text-gray-300' },
    { value: 1, label: '中', color: 'bg-blue-900/50 text-blue-400' },
    { value: 2, label: '高', color: 'bg-yellow-900/50 text-yellow-400' },
    { value: 3, label: '紧急', color: 'bg-red-900/50 text-red-400' },
  ];

  const boundaryTypes = [
    { value: 'fixed', label: '固定边界' },
    { value: 'roller', label: '滚动边界' },
    { value: 'free', label: '自由边界' },
  ];

  if (submitSuccess) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">任务创建成功</h2>
          <p className="text-industrial-400 mb-6">正在跳转到任务列表...</p>
          <div className="w-48 h-1 bg-space-800 rounded-full mx-auto overflow-hidden">
            <div className="h-full bg-green-500 animate-progress" style={{ width: '100%' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/tasks')}
          className="p-2 rounded-lg hover:bg-space-800 text-industrial-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">创建计算任务</h2>
          <p className="text-sm text-industrial-400 mt-1">配置计算参数并提交任务</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {sections.map((section, index) => (
          <button
            key={section.key}
            onClick={() => setActiveSection(section.key as typeof activeSection)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
              activeSection === section.key
                ? 'bg-cyber-600 text-white shadow-lg shadow-cyber-500/20'
                : 'bg-space-800/50 text-industrial-400 hover:bg-space-700 hover:text-white border border-space-700'
            )}
          >
            <span className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-xs',
              activeSection === section.key ? 'bg-white/20' : 'bg-space-700'
            )}>
              {index + 1}
            </span>
            {section.label}
          </button>
        ))}
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="p-4 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">请修正以下错误：</span>
          </div>
          <ul className="text-sm space-y-1 ml-7 list-disc">
            {Object.values(errors).map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-space-700 bg-space-900/50 backdrop-blur-sm p-6">
        {activeSection === 'basic' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                任务名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="请输入任务名称"
                className={cn(
                  'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                  errors.name
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                )}
              />
              {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                任务描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="请输入任务描述（可选）"
                rows={4}
                className="w-full px-4 py-2.5 bg-space-800/50 border border-space-700 rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:border-cyber-500 focus:ring-1 focus:ring-cyber-500 transition-colors resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-3">
                优先级
              </label>
              <div className="flex gap-3">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, priority: option.value }))}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium transition-all border-2',
                      formData.priority === option.value
                        ? `${option.color} border-current`
                        : 'bg-space-800/30 text-industrial-400 border-transparent hover:bg-space-700/50'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'calc' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                网格大小 <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={formData.gridSize}
                onChange={(e) => setFormData(prev => ({ ...prev, gridSize: Number(e.target.value) }))}
                min={10}
                max={1000}
                className={cn(
                  'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                  errors.gridSize
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                )}
              />
              <p className="mt-1 text-xs text-industrial-500">建议值：50-200，范围：10-1000</p>
              {errors.gridSize && <p className="mt-1 text-sm text-red-400">{errors.gridSize}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                时间步数 <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={formData.timeSteps}
                onChange={(e) => setFormData(prev => ({ ...prev, timeSteps: Number(e.target.value) }))}
                min={1}
                max={100000}
                className={cn(
                  'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                  errors.timeSteps
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                )}
              />
              <p className="mt-1 text-xs text-industrial-500">建议值：500-5000，范围：1-100000</p>
              {errors.timeSteps && <p className="mt-1 text-sm text-red-400">{errors.timeSteps}</p>}
            </div>

            <div className="p-4 bg-cyber-900/20 border border-cyber-800/50 rounded-lg">
              <p className="text-sm text-cyber-300">
                <strong>提示：</strong>较大的网格大小和时间步数会显著增加计算时间和资源消耗。
              </p>
            </div>
          </div>
        )}

        {activeSection === 'soil' && (
          <div className="space-y-6 max-w-2xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">
                  弹性模量 (Pa) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={formData.soilProperties.youngModulus}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    soilProperties: { ...prev.soilProperties, youngModulus: Number(e.target.value) }
                  }))}
                  min={0}
                  step="1e6"
                  className={cn(
                    'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                    errors.youngModulus
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                  )}
                />
                <p className="mt-1 text-xs text-industrial-500">典型值：1e6 - 1e8 Pa</p>
                {errors.youngModulus && <p className="mt-1 text-sm text-red-400">{errors.youngModulus}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">
                  泊松比 <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={formData.soilProperties.poissonRatio}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    soilProperties: { ...prev.soilProperties, poissonRatio: Number(e.target.value) }
                  }))}
                  min={0}
                  max={0.499}
                  step={0.01}
                  className={cn(
                    'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                    errors.poissonRatio
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                  )}
                />
                <p className="mt-1 text-xs text-industrial-500">典型值：0.2 - 0.4</p>
                {errors.poissonRatio && <p className="mt-1 text-sm text-red-400">{errors.poissonRatio}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">
                  密度 (kg/m³) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={formData.soilProperties.density}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    soilProperties: { ...prev.soilProperties, density: Number(e.target.value) }
                  }))}
                  min={0}
                  step={100}
                  className={cn(
                    'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                    errors.density
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                  )}
                />
                <p className="mt-1 text-xs text-industrial-500">典型值：1500 - 2500 kg/m³</p>
                {errors.density && <p className="mt-1 text-sm text-red-400">{errors.density}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-industrial-200 mb-2">
                  黏聚力 (Pa) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  value={formData.soilProperties.cohesion}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    soilProperties: { ...prev.soilProperties, cohesion: Number(e.target.value) }
                  }))}
                  min={0}
                  step="1e3"
                  className={cn(
                    'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors',
                    errors.cohesion
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                  )}
                />
                <p className="mt-1 text-xs text-industrial-500">典型值：1e3 - 1e5 Pa</p>
                {errors.cohesion && <p className="mt-1 text-sm text-red-400">{errors.cohesion}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                内摩擦角 (°) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                value={formData.soilProperties.frictionAngle}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  soilProperties: { ...prev.soilProperties, frictionAngle: Number(e.target.value) }
                }))}
                min={0}
                max={90}
                step={1}
                className={cn(
                  'w-full px-4 py-2.5 bg-space-800/50 border rounded-lg text-white placeholder-industrial-500 focus:outline-none focus:ring-1 transition-colors max-w-xs',
                  errors.frictionAngle
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-space-700 focus:border-cyber-500 focus:ring-cyber-500'
                )}
              />
              <p className="mt-1 text-xs text-industrial-500">典型值：20° - 45°</p>
              {errors.frictionAngle && <p className="mt-1 text-sm text-red-400">{errors.frictionAngle}</p>}
            </div>
          </div>
        )}

        {activeSection === 'load' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-industrial-200">
                载荷条件 <span className="text-red-400">*</span>
              </h3>
              <button
                onClick={addLoadCondition}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyber-600 hover:bg-cyber-500 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加载荷
              </button>
            </div>

            {errors.loads && (
              <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 text-sm">
                {errors.loads}
              </div>
            )}

            <div className="space-y-4">
              {formData.loadConditions.map((load, index) => (
                <div key={index} className="p-4 bg-space-800/30 rounded-lg border border-space-700">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-industrial-300">载荷点 #{index + 1}</span>
                    {formData.loadConditions.length > 1 && (
                      <button
                        onClick={() => removeLoadCondition(index)}
                        className="p-1.5 rounded-lg hover:bg-red-900/30 text-industrial-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-industrial-500 mb-1">X 坐标</label>
                      <input
                        type="number"
                        value={load.x}
                        onChange={(e) => updateLoadCondition(index, 'x', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-industrial-500 mb-1">Y 坐标</label>
                      <input
                        type="number"
                        value={load.y}
                        onChange={(e) => updateLoadCondition(index, 'y', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-industrial-500 mb-1">大小 (N)</label>
                      <input
                        type="number"
                        value={load.magnitude}
                        onChange={(e) => updateLoadCondition(index, 'magnitude', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-industrial-500 mb-1">面积 (m²)</label>
                      <input
                        type="number"
                        value={load.area}
                        onChange={(e) => updateLoadCondition(index, 'area', Number(e.target.value))}
                        min={0.1}
                        step={0.1}
                        className="w-full px-3 py-2 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'boundary' && (
          <div className="space-y-6">
            <h3 className="text-sm font-medium text-industrial-200">
              边界条件 <span className="text-red-400">*</span>
            </h3>

            {errors.boundaries && (
              <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-lg text-red-400 text-sm">
                {errors.boundaries}
              </div>
            )}

            <div className="space-y-4">
              {formData.boundaryConditions.map((boundary, index) => (
                <div key={index} className="p-4 bg-space-800/30 rounded-lg border border-space-700">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-sm font-medium text-industrial-300">边界条件 #{index + 1}</span>
                    <select
                      value={boundary.type}
                      onChange={(e) => updateBoundaryCondition(index, 'type', e.target.value)}
                      className="px-3 py-1.5 bg-space-800/50 border border-space-700 rounded-lg text-white text-sm focus:outline-none focus:border-cyber-500"
                    >
                      {boundaryTypes.map(type => (
                        <option key={type.value} value={type.value}>{type.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(['xMin', 'xMax', 'yMin', 'yMax'] as const).map((edge) => (
                      <label key={edge} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={boundary[edge] || false}
                          onChange={(e) => updateBoundaryCondition(index, edge, e.target.checked)}
                          className="w-4 h-4 rounded border-space-600 bg-space-800 text-cyber-500 focus:ring-cyber-500"
                        />
                        <span className="text-sm text-industrial-300">
                          {{ xMin: 'X 最小值', xMax: 'X 最大值', yMin: 'Y 最小值', yMax: 'Y 最大值' }[edge]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'file' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-industrial-200 mb-2">
                模型文件（可选）
              </label>
              <div className="border-2 border-dashed border-space-700 rounded-lg p-8 text-center hover:border-cyber-500 transition-colors">
                <input
                  type="file"
                  id="modelFile"
                  onChange={handleFileUpload}
                  accept=".json,.csv,.stl,.obj"
                  className="hidden"
                />
                <label htmlFor="modelFile" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-industrial-500 mx-auto mb-3" />
                  {formData.modelFile ? (
                    <div>
                      <p className="text-cyber-400 font-medium">{formData.modelFile.name}</p>
                      <p className="text-xs text-industrial-500 mt-1">
                        {(formData.modelFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-industrial-300">点击上传模型文件</p>
                      <p className="text-xs text-industrial-500 mt-1">支持 .json, .csv, .stl, .obj 格式</p>
                    </div>
                  )}
                </label>
              </div>
              {formData.modelFile && (
                <button
                  onClick={() => setFormData(prev => ({ ...prev, modelFile: null }))}
                  className="mt-2 text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  移除文件
                </button>
              )}
            </div>

            <div className="p-4 bg-space-800/30 rounded-lg border border-space-700">
              <h4 className="text-sm font-medium text-industrial-200 mb-3">参数预览</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-industrial-500">任务名称</span>
                  <span className="text-white">{formData.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-500">优先级</span>
                  <span className="text-white">{{ 0: '低', 1: '中', 2: '高', 3: '紧急' }[formData.priority]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-500">网格大小</span>
                  <span className="text-white">{formData.gridSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-500">时间步数</span>
                  <span className="text-white">{formData.timeSteps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-500">载荷点数</span>
                  <span className="text-white">{formData.loadConditions.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-industrial-500">边界条件数</span>
                  <span className="text-white">{formData.boundaryConditions.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/tasks')}
          className="px-6 py-2.5 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors"
        >
          取消
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => {
              const currentIndex = sections.findIndex(s => s.key === activeSection);
              if (currentIndex > 0) {
                setActiveSection(sections[currentIndex - 1].key as typeof activeSection);
              }
            }}
            disabled={sections.findIndex(s => s.key === activeSection) === 0}
            className="px-6 py-2.5 bg-space-800 hover:bg-space-700 text-industrial-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            上一步
          </button>
          {sections.findIndex(s => s.key === activeSection) < sections.length - 1 ? (
            <button
              onClick={() => {
                const currentIndex = sections.findIndex(s => s.key === activeSection);
                setActiveSection(sections[currentIndex + 1].key as typeof activeSection);
              }}
              className="px-6 py-2.5 bg-cyber-600 hover:bg-cyber-500 text-white rounded-lg transition-colors"
            >
              下一步
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-space-500 to-cyber-500 hover:from-space-400 hover:to-cyber-400 text-white rounded-lg transition-all shadow-lg shadow-space-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              提交任务
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
