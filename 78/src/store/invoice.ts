import { create } from 'zustand'
import type { UploadResponse, ExtractResult, Invoice } from '@/types/invoice'

interface ApiResponse<T> {
  success: boolean
  data: T
  total?: number
  error?: string
}

interface InvoiceStore {
  uploadList: UploadResponse[]
  currentInvoice: ExtractResult | null
  invoices: Invoice[]
  totalCount: number
  loading: boolean
  uploading: boolean

  uploadFiles: (files: File[]) => Promise<void>
  fetchInvoice: (id: string) => Promise<void>
  fetchInvoices: (filters: Record<string, string | number>) => Promise<void>
  updateInvoice: (id: string, data: Partial<Invoice>) => Promise<void>
  deleteInvoice: (id: string) => Promise<void>
  setCurrentInvoice: (invoice: ExtractResult | null) => void
}

export const useInvoiceStore = create<InvoiceStore>((set) => ({
  uploadList: [],
  currentInvoice: null,
  invoices: [],
  totalCount: 0,
  loading: false,
  uploading: false,

  uploadFiles: async (files: File[]) => {
    set({ uploading: true })
    const newItems: UploadResponse[] = files.map((f) => ({
      id: crypto.randomUUID(),
      fileName: f.name,
      status: 'pending' as const,
    }))
    set((s) => ({ uploadList: [...newItems, ...s.uploadList] }))

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const itemId = newItems[i].id
      set((s) => ({
        uploadList: s.uploadList.map((u) =>
          u.id === itemId ? { ...u, status: 'processing' as const } : u
        ),
      }))
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/invoices/upload', { method: 'POST', body: form })
        if (!res.ok) throw new Error('上传失败')
        const json: ApiResponse<UploadResponse[]> = await res.json()
        const serverData = json.data
        if (serverData && serverData.length > 0) {
          const serverItem = serverData[0]
          set((s) => ({
            uploadList: s.uploadList.map((u) =>
              u.id === itemId
                ? { ...u, status: 'completed' as const, id: serverItem.id, fileName: serverItem.fileName }
                : u
            ),
          }))
        } else {
          set((s) => ({
            uploadList: s.uploadList.map((u) =>
              u.id === itemId ? { ...u, status: 'completed' as const } : u
            ),
          }))
        }
      } catch {
        set((s) => ({
          uploadList: s.uploadList.map((u) =>
            u.id === itemId ? { ...u, status: 'failed' as const } : u
          ),
        }))
      }
    }
    set({ uploading: false })
  },

  fetchInvoice: async (id: string) => {
    set({ loading: true })
    try {
      const res = await fetch(`/api/invoices/${id}`)
      if (!res.ok) throw new Error('获取失败')
      const json: ApiResponse<ExtractResult> = await res.json()
      set({ currentInvoice: json.data, loading: false })
    } catch {
      set({ currentInvoice: null, loading: false })
    }
  },

  fetchInvoices: async (filters: Record<string, string | number>) => {
    set({ loading: true })
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
      })
      const res = await fetch(`/api/invoices?${params.toString()}`)
      if (!res.ok) throw new Error('获取失败')
      const json: ApiResponse<Invoice[]> = await res.json()
      set({
        invoices: json.data || [],
        totalCount: json.total || 0,
        loading: false,
      })
    } catch {
      set({ invoices: [], totalCount: 0, loading: false })
    }
  },

  updateInvoice: async (id: string, data: Partial<Invoice>) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('更新失败')
      const json: ApiResponse<Invoice> = await res.json()
      set((s) => ({
        invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...json.data } : inv)),
      }))
    } catch {
      /* handled silently */
    }
  },

  deleteInvoice: async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('删除失败')
      set((s) => ({
        invoices: s.invoices.filter((inv) => inv.id !== id),
        totalCount: s.totalCount - 1,
      }))
    } catch {
      /* handled silently */
    }
  },

  setCurrentInvoice: (invoice: ExtractResult | null) => set({ currentInvoice: invoice }),
}))
