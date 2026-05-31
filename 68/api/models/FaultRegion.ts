import mongoose, { Schema, type Document, type Types } from 'mongoose'

export interface IFaultRegion extends Document {
  detectionId: Types.ObjectId
  x: number
  y: number
  width: number
  height: number
  confidence: number
  isManual: boolean
}

const faultRegionSchema = new Schema<IFaultRegion>({
  detectionId: { type: Schema.Types.ObjectId, ref: 'Detection', required: true, index: true },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  confidence: { type: Number, required: true },
  isManual: { type: Boolean, default: false },
}, {
  timestamps: true,
})

faultRegionSchema.index({ detectionId: 1, _id: -1 })

export default mongoose.model<IFaultRegion>('FaultRegion', faultRegionSchema)
