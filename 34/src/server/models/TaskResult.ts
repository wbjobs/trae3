import mongoose, { Schema, Document } from 'mongoose';

export interface ITaskResult extends Document {
  id: string;
  taskId: string;
  chunkId: string;
  nodeId: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  variables: string[];
  timesteps: number[];
  createdAt: Date;
  checksum?: string;
  dataIntegrityVerified?: boolean;
  metadata?: Record<string, any>;
}

const TaskResultSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    taskId: { type: String, required: true, index: true },
    chunkId: { type: String, required: true },
    nodeId: { type: String, required: true },
    filePath: { type: String, required: true },
    fileSize: { type: Number, required: true },
    fileType: { type: String, required: true },
    variables: [{ type: String }],
    timesteps: [{ type: Number }],
    checksum: { type: String },
    dataIntegrityVerified: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: 'createdAt' },
  }
);

TaskResultSchema.index({ taskId: 1, createdAt: -1 });
TaskResultSchema.index({ variables: 1 });

export default mongoose.model<ITaskResult>('TaskResult', TaskResultSchema);
