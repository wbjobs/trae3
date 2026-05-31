import mongoose, { Schema, type Document, type Types } from 'mongoose'

export interface IFaultClassification extends Document {
  regionId: Types.ObjectId
  detectionId: Types.ObjectId
  faultType: 'overheating' | 'connection_loose' | 'insulation_failure' | 'load_unbalance' | 'normal'
  severity: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  description: string
  suggestion: string
  isManual: boolean
  notes: string
  createdAt: Date
  updatedAt: Date
}

const faultClassificationSchema = new Schema<IFaultClassification>({
  regionId: { type: Schema.Types.ObjectId, ref: 'FaultRegion', required: true, index: true },
  detectionId: { type: Schema.Types.ObjectId, ref: 'Detection', required: true, index: true },
  faultType: {
    type: String,
    enum: ['overheating', 'connection_loose', 'insulation_failure', 'load_unbalance', 'normal'],
    required: true,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true,
  },
  confidence: { type: Number, required: true },
  description: { type: String, default: '' },
  suggestion: { type: String, default: '' },
  isManual: { type: Boolean, default: false },
  notes: { type: String, default: '' },
}, {
  timestamps: true,
})

faultClassificationSchema.index({ detectionId: 1, _id: -1 })

export default mongoose.model<IFaultClassification>('FaultClassification', faultClassificationSchema)
