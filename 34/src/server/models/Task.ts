import mongoose, { Schema, Document } from 'mongoose';
import { TaskStatus, CFDParameters, TaskChunk } from '../types';

export interface ITask extends Document {
  id: string;
  name: string;
  description?: string;
  parameters: CFDParameters;
  status: TaskStatus;
  priority: number;
  chunks: TaskChunk[];
  totalChunks: number;
  completedChunks: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: string;
  tags?: string[];
  estimatedDuration?: number;
  actualDuration?: number;
  error?: string;
}

const TaskChunkSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  taskId: { type: String, required: true },
  chunkIndex: { type: Number, required: true },
  totalChunks: { type: Number, required: true },
  subDomain: {
    xMin: { type: Number, required: true },
    xMax: { type: Number, required: true },
    yMin: { type: Number, required: true },
    yMax: { type: Number, required: true },
    zMin: { type: Number, required: true },
    zMax: { type: Number, required: true },
  },
  parameters: { type: Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: Object.values(TaskStatus),
    default: TaskStatus.PENDING,
  },
  assignedNode: { type: String },
  startTime: { type: Date },
  endTime: { type: Date },
  resultPath: { type: String },
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  checksum: { type: String },
  estimatedCellCount: { type: Number },
  weight: { type: Number },
  checkpointTime: { type: Number },
  checkpointPath: { type: String },
});

const TaskSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String },
    parameters: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: Object.values(TaskStatus),
      default: TaskStatus.PENDING,
      index: true,
    },
    priority: { type: Number, default: 5, min: 1, max: 10 },
    chunks: [TaskChunkSchema],
    totalChunks: { type: Number, default: 1 },
    completedChunks: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: String, required: true },
    tags: [{ type: String }],
    estimatedDuration: { type: Number },
    actualDuration: { type: Number },
    error: { type: String },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

TaskSchema.index({ status: 1, priority: -1, createdAt: 1 });
TaskSchema.index({ createdBy: 1, status: 1 });
TaskSchema.index({ tags: 1 });

export default mongoose.model<ITask>('Task', TaskSchema);
