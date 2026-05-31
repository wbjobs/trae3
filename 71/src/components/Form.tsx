import { ReactNode, useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react'

interface FieldConfig<T> {
  name: keyof T
  label: string
  type: 'number' | 'text' | 'select' | 'checkbox'
  unit?: string
  placeholder?: string
  min?: number
  max?: number
  step?: number
  options?: Array<{ label: string; value: string | number }>
  validate?: (value: T[keyof T], allValues: T) => string | null
  required?: boolean
}

interface FieldGroup<T> {
  name: string
  label: string
  fields: FieldConfig<T>[]
  collapsed?: boolean
}

interface FormProps<T extends Record<string, unknown>> {
  fields?: FieldConfig<T>[]
  groups?: FieldGroup<T>[]
  initialValues: T
  onSubmit: (values: T) => void | Promise<void>
  onReset?: () => void
  submitText?: string
  resetText?: string
  disabled?: boolean
  loading?: boolean
  showReset?: boolean
  children?: ReactNode
}

export function Form<T extends Record<string, unknown>>({
  fields,
  groups,
  initialValues,
  onSubmit,
  onReset,
  submitText = '提交',
  resetText = '重置',
  disabled,
  loading,
  showReset = true,
  children,
}: FormProps<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  useEffect(() => {
    if (groups) {
      const initialCollapsed: Record<string, boolean> = {}
      groups.forEach((g) => {
        if (g.collapsed) initialCollapsed[g.name] = true
      })
      setCollapsedGroups(initialCollapsed)
    }
  }, [groups])

  const getAllFields = useCallback((): FieldConfig<T>[] => {
    if (fields) return fields
    if (groups) return groups.flatMap((g) => g.fields)
    return []
  }, [fields, groups])

  const validateField = useCallback((name: keyof T, value: T[keyof T], allValues: T): string | null => {
    const field = getAllFields().find(f => f.name === name)
    if (!field) return null
    if (field.required && (value === undefined || value === null || value === '')) {
      return '此字段必填'
    }
    if (field.validate) {
      return field.validate(value, allValues)
    }
    return null
  }, [getAllFields])

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof T, string>> = {}
    let valid = true
    for (const field of getAllFields()) {
      const err = validateField(field.name, values[field.name], values)
      if (err) {
        newErrors[field.name] = err
        valid = false
      }
    }
    setErrors(newErrors)
    return valid
  }, [getAllFields, values, validateField])

  const handleChange = (name: keyof T, value: T[keyof T]) => {
    const newValues = { ...values, [name]: value }
    setValues(newValues)
    setTouched(prev => ({ ...prev, [name]: true }))
    const err = validateField(name, value, newValues)
    setErrors(prev => ({ ...prev, [name]: err || undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const allTouched = {} as Record<keyof T, boolean>
    getAllFields().forEach(f => { allTouched[f.name] = true })
    setTouched(allTouched)
    if (!validateAll()) return
    setIsSubmitting(true)
    try {
      await onSubmit(values)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setValues(initialValues)
    setErrors({})
    setTouched({})
    onReset?.()
  }

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }))
  }

  const renderField = (field: FieldConfig<T>) => (
    <div key={String(field.name)} className="space-y-1">
      <label className="block text-sm text-slate-300">
        {field.label}
        {field.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <div className="relative">
        {field.type === 'number' && (
          <input
            type="number"
            step={field.step || 'any'}
            min={field.min}
            max={field.max}
            value={values[field.name] as number | ''}
            onChange={e => handleChange(field.name, (e.target.value === '' ? '' : Number(e.target.value)) as T[keyof T])}
            className={`w-full bg-slate-900 border rounded px-3 py-2 text-slate-100 ${errors[field.name] && touched[field.name] ? 'border-red-500' : 'border-slate-600'} focus:border-cyan-500 focus:outline-none`}
            disabled={disabled || loading || isSubmitting}
            placeholder={field.placeholder}
          />
        )}
        {field.type === 'text' && (
          <input
            type="text"
            value={values[field.name] as string}
            onChange={e => handleChange(field.name, e.target.value as T[keyof T])}
            className={`w-full bg-slate-900 border rounded px-3 py-2 text-slate-100 ${errors[field.name] && touched[field.name] ? 'border-red-500' : 'border-slate-600'} focus:border-cyan-500 focus:outline-none`}
            disabled={disabled || loading || isSubmitting}
            placeholder={field.placeholder}
          />
        )}
        {field.type === 'select' && field.options && (
          <select
            value={values[field.name] as string | number}
            onChange={e => handleChange(field.name, e.target.value as T[keyof T])}
            className={`w-full bg-slate-900 border rounded px-3 py-2 text-slate-100 ${errors[field.name] && touched[field.name] ? 'border-red-500' : 'border-slate-600'} focus:border-cyan-500 focus:outline-none`}
            disabled={disabled || loading || isSubmitting}
          >
            {field.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        {field.type === 'checkbox' && (
          <input
            type="checkbox"
            checked={values[field.name] as boolean}
            onChange={e => handleChange(field.name, e.target.checked as T[keyof T])}
            className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
            disabled={disabled || loading || isSubmitting}
          />
        )}
        {field.unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{field.unit}</span>
        )}
      </div>
      {touched[field.name] && errors[field.name] && (
        <p className="text-red-400 text-xs">{errors[field.name]}</p>
      )}
      {field.min !== undefined && field.max !== undefined && !errors[field.name] && (
        <p className="text-slate-500 text-xs">范围: {field.min} - {field.max} {field.unit || ''}</p>
      )}
    </div>
  )

  const isDisabled = disabled || loading || isSubmitting

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {children}
      {fields && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fields.map(renderField)}
        </div>
      )}
      {groups && groups.map((group) => (
        <div key={group.name} className="border border-slate-700 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup(group.name)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/50 hover:bg-slate-800 transition-colors"
          >
            <span className="text-sm font-medium text-slate-200">{group.label}</span>
            {collapsedGroups[group.name] ? (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {!collapsedGroups[group.name] && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.fields.map(renderField)}
            </div>
          )}
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-4">
        {showReset && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isDisabled}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 text-slate-300 rounded hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            {resetText}
          </button>
        )}
        <button
          type="submit"
          disabled={isDisabled || Object.keys(errors).length > 0}
          className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {(loading || isSubmitting) && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitText}
        </button>
      </div>
    </form>
  )
}
