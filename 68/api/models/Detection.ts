import mongoose, { Schema, type Document } from 'mongoose'

export interface IDetection extends Document {
  filename: string
  originalUrl: string
  processedUrl: string
  status: 'processing' | 'completed' | 'failed'
  preprocessing: {
    denoised: boolean
    enhanced: boolean
    normalized: boolean
    contrastRatio: number
    enhancementFactor: number
    noiseLevel: number
    dynamicRange: number
    isLowContrast: boolean
    multiScaleEnhanced: boolean
    claheApplied: boolean
    bilateralFiltered: boolean
    edgeDetected: boolean
    clipLimit: number
    tileGridSize: number
    enhancementLevels: {
      low: number
      medium: number
      high: number
    }
    edgeStrength: number
    processingTimeMs: number
  }
  createdAt: Date
  updatedAt: Date
}

const detectionSchema = new Schema<IDetection>({
  filename: { type: String, required: true, index: true },
  originalUrl: { type: String, required: true },
  processedUrl: { type: String, default: '' },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing',
    index: true,
  },
  preprocessing: {
    denoised: { type: Boolean, default: false },
    enhanced: { type: Boolean, default: false },
    normalized: { type: Boolean, default: false },
    contrastRatio: { type: Number, default: 0 },
    enhancementFactor: { type: Number, default: 1 },
    noiseLevel: { type: Number, default: 0 },
    dynamicRange: { type: Number, default: 0 },
    isLowContrast: { type: Boolean, default: false },
    multiScaleEnhanced: { type: Boolean, default: false },
    claheApplied: { type: Boolean, default: false },
    bilateralFiltered: { type: Boolean, default: false },
    edgeDetected: { type: Boolean, default: false },
    clipLimit: { type: Number, default: 0 },
    tileGridSize: { type: Number, default: 0 },
    enhancementLevels: {
      low: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
    },
    edgeStrength: { type: Number, default: 0 },
    processingTimeMs: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
})

detectionSchema.index({ status: 1, createdAt: -1 })
detectionSchema.index({ createdAt: -1 })
detectionSchema.index({ _id: 1, createdAt: -1 })

export default mongoose.model<IDetection>('Detection', detectionSchema)
