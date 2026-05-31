import { createWorker, type Worker, type WorkerParams } from 'tesseract.js'
import type { Invoice } from '../../shared/types.js'
import { preprocessImage, cleanupPreprocessed } from './preprocess.js'

let workerPool: Worker | null = null
let workerInitializing = false
let workerReady = false

const FIELD_PATTERNS = [
  { key: 'invoiceCode', label: '发票代码', patterns: [/发票代码[：:\s]*(\d{10,12})/, /代码[：:\s]*(\d{10,12})/], type: 'string' },
  { key: 'invoiceNumber', label: '发票号码', patterns: [/发票号码[：:\s]*(\d{8})/, /号码[：:\s]*(\d{8})/], type: 'string' },
  { key: 'invoiceDate', label: '开票日期', patterns: [/开票日期[：:\s]*([\d\s年月日/-]+)/, /开票日期[：:\s]*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/], type: 'date' },
  { key: 'checkCode', label: '校验码', patterns: [/校验码[：:\s]*(\d{6,20})/], type: 'string' },
]

const AMOUNT_PATTERNS = [
  { key: 'amount', label: '金额', patterns: [/^\s*金\s*额[：:\s]*[￥¥]?([\d,，.]+)/m, /金\s*额[：:\s]*[￥¥]?([\d,，.]+)/], type: 'number' },
  { key: 'taxAmount', label: '税额', patterns: [/^\s*税\s*额[：:\s]*[￥¥]?([\d,，.]+)/m, /税\s*额[：:\s]*[￥¥]?([\d,，.]+)/], type: 'number' },
  { key: 'totalAmount', label: '价税合计', patterns: [/价税合计[：:\s（(大写)]*.*?[￥¥]([\d,，.]+)/, /合计[：:\s]*[￥¥]?([\d,，.]+)/], type: 'number' },
]

interface Segment {
  label: string
  bbox: [number, number, number, number]
  text: string
  confidence: number
}

interface RecognizeResult {
  fields: Partial<Invoice>
  segments: Segment[]
}

async function getWorker(): Promise<Worker> {
  if (workerReady && workerPool) {
    return workerPool
  }

  if (workerInitializing) {
    while (workerInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (workerReady && workerPool) {
        return workerPool
      }
    }
  }

  workerInitializing = true

  try {
    workerPool = await createWorker('chi_sim+eng', 1, {
      logger: () => {},
      cacheMethod: 'none',
    })
    const params = {
      tessedit_pageseg_mode: 6,
    } as unknown as WorkerParams
    await workerPool!.setParameters(params)
    workerReady = true
    workerInitializing = false
    return workerPool!
  } catch (e) {
    workerInitializing = false
    throw e
  }
}

function extractByPatterns(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1].trim()
    }
  }
  return null
}

function parseAmount(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[￥¥,，\s元]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseDate(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/(\d{4})\s*年?\s*(\d{1,2})\s*月?\s*(\d{1,2})\s*日?/)
  if (match) {
    const y = match[1]
    const m = match[2].padStart(2, '0')
    const d = match[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const dateMatch = value.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/)
  return dateMatch ? dateMatch[1].replace(/[年月/-]/g, '-').replace(/日/g, '') : null
}

function extractPartyName(text: string, partyType: 'seller' | 'buyer'): string | null {
  const prefixes = partyType === 'seller'
    ? ['销售方', '卖方', '收款单位', '销方', '销售', '开票方']
    : ['购买方', '买方', '付款单位', '购方', '采购']

  const suffixes = ['名称', '名', '全称', '公司', '单位']

  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      const pattern = new RegExp(`${prefix}.*?${suffix}[：:\\s]*([^\\n\\r\\d]{2,60}?)(?:[：:]|纳税人|识别|地址|电话|银行|$)`)
      const match = text.match(pattern)
      if (match) {
        const name = match[1]
          .replace(/^\s*[：:]\s*/, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (name && name.length >= 2 && name.length <= 60) {
          return name
        }
      }
    }
  }
  return null
}

function extractTaxNumber(text: string, partyType: 'seller' | 'buyer'): string | null {
  const prefixes = partyType === 'seller'
    ? ['销售方', '卖方', '销方', '销售']
    : ['购买方', '买方', '购方', '采购']

  for (const prefix of prefixes) {
    const patterns = [
      new RegExp(`${prefix}.*?纳税人识别号[：:\\s]*([A-Z0-9]{15,20})`),
      new RegExp(`${prefix}.*?识别号[：:\\s]*([A-Z0-9]{15,20})`),
      new RegExp(`${prefix}.*?税号[：:\\s]*([A-Z0-9]{15,20})`),
    ]
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        return match[1]
      }
    }
  }
  return null
}

function extractRemarks(text: string): string | null {
  const patterns = [
    /备\s*注[：:\s]*([^\n\r]{1,100})/,
    /备\s*注[：:\s]*(.+?)(?=\n\n|$)/s,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const remarks = match[1].trim()
      if (remarks && remarks.length > 0) {
        return remarks
      }
    }
  }
  return null
}

function normalizeText(text: string): string {
  let normalized = text
    .replace(/\n\s+/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .trim()

  return normalized
}

function extractFields(text: string): { fields: Partial<Invoice>; confidence: Record<string, number> } {
  const normalized = normalizeText(text)
  const fields: Partial<Invoice> = {}
  const confidence: Record<string, number> = {}
  const fieldsAny = fields as Record<string, unknown>

  for (const fp of FIELD_PATTERNS) {
    const value = extractByPatterns(normalized, fp.patterns)
    if (value) {
      if (fp.type === 'date') {
        const parsed = parseDate(value)
        if (parsed) {
          fieldsAny[fp.key] = parsed
          confidence[fp.key] = 0.85
        } else {
          confidence[fp.key] = 0.3
        }
      } else {
        fieldsAny[fp.key] = value
        confidence[fp.key] = 0.9
      }
    }
  }

  for (const ap of AMOUNT_PATTERNS) {
    const value = extractByPatterns(normalized, ap.patterns)
    if (value) {
      const parsed = parseAmount(value)
      if (parsed !== null) {
        fieldsAny[ap.key] = parsed
        confidence[ap.key] = 0.8
      } else {
        confidence[ap.key] = 0.3
      }
    }
  }

  const sellerName = extractPartyName(normalized, 'seller')
  if (sellerName) {
    fields.sellerName = sellerName
    confidence.sellerName = 0.75
  }

  const sellerTax = extractTaxNumber(normalized, 'seller')
  if (sellerTax) {
    fields.sellerTaxNumber = sellerTax
    confidence.sellerTaxNumber = 0.85
  }

  const buyerName = extractPartyName(normalized, 'buyer')
  if (buyerName) {
    fields.buyerName = buyerName
    confidence.buyerName = 0.75
  }

  const buyerTax = extractTaxNumber(normalized, 'buyer')
  if (buyerTax) {
    fields.buyerTaxNumber = buyerTax
    confidence.buyerTaxNumber = 0.85
  }

  const remarks = extractRemarks(normalized)
  if (remarks) {
    fields.remarks = remarks
    confidence.remarks = 0.7
  }

  if (fields.totalAmount !== undefined && fields.amount !== undefined && fields.taxAmount !== undefined) {
    const calculated = fields.amount + fields.taxAmount
    if (Math.abs(fields.totalAmount - calculated) > 0.01) {
      fields.totalAmount = calculated
      confidence.totalAmount = Math.min(confidence.amount || 0.8, confidence.taxAmount || 0.8) * 0.9
    }
  }

  return { fields, confidence }
}

function buildSegments(words: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }>): Segment[] {
  const fieldLabels: Array<{ label: string; pattern: RegExp }> = [
    { label: '发票代码', pattern: /发票代码/ },
    { label: '发票号码', pattern: /发票号码/ },
    { label: '开票日期', pattern: /开票日期/ },
    { label: '金额', pattern: /金\s*额/ },
    { label: '税额', pattern: /税\s*额/ },
    { label: '价税合计', pattern: /价税合计/ },
    { label: '销售方', pattern: /销售方|卖方/ },
    { label: '购买方', pattern: /购买方|买方/ },
    { label: '纳税人识别号', pattern: /纳税人识别号/ },
    { label: '校验码', pattern: /校验码/ },
  ]

  const segments: Segment[] = []

  for (const word of words) {
    if (!word.text.trim()) continue
    let label = '其他'
    for (const fp of fieldLabels) {
      if (fp.pattern.test(word.text)) {
        label = fp.label
        break
      }
    }
    segments.push({
      label,
      bbox: [word.bbox.x0, word.bbox.y0, word.bbox.x1, word.bbox.y1],
      text: word.text,
      confidence: word.confidence,
    })
  }

  return segments
}

export async function recognizeInvoice(filePath: string): Promise<RecognizeResult> {
  let processedPath: string | null = null

  try {
    processedPath = await preprocessImage(filePath)
    const worker = await getWorker()

    const { data } = await worker.recognize(processedPath)
    const text = data.text

    const { fields, confidence } = extractFields(text)
    fields.confidence = JSON.stringify(confidence)

    const words = (data as unknown as Record<string, unknown>).words as Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }> | undefined
    const segments = buildSegments(words || [])

    return { fields, segments }
  } catch (error) {
    console.error('OCR recognition error:', error)
    throw error
  } finally {
    if (processedPath && processedPath !== filePath) {
      cleanupPreprocessed(processedPath)
    }
  }
}

export async function prewarmWorker() {
  getWorker().catch(console.error)
}

export { getWorker }
