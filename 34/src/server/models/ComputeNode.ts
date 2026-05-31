import mongoose, { Schema, Document } from 'mongoose';
import { NodeStatus } from '../types';

export interface IComputeNode extends Document {
  id: string;
  name: string;
  hostname: string;
  port: number;
  status: NodeStatus;
  cpuCores: number;
  memoryGB: number;
  gpuCount?: number;
  currentLoad: number;
  memoryUsage: number;
  currentTask?: string;
  lastHeartbeat: Date;
  registeredAt: Date;
  capabilities: string[];
  totalTasksCompleted: number;
  totalComputeTime: number;
}

const ComputeNodeSchema: Schema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    hostname: { type: String, required: true },
    port: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(NodeStatus),
      default: NodeStatus.OFFLINE,
      index: true,
    },
    cpuCores: { type: Number, required: true },
    memoryGB: { type: Number, required: true },
    gpuCount: { type: Number },
    currentLoad: { type: Number, default: 0 },
    memoryUsage: { type: Number, default: 0 },
    currentTask: { type: String },
    lastHeartbeat: { type: Date, default: Date.now },
    capabilities: [{ type: String }],
    totalTasksCompleted: { type: Number, default: 0 },
    totalComputeTime: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: 'registeredAt' },
  }
);

ComputeNodeSchema.index({ status: 1, currentLoad: 1 });
ComputeNodeSchema.index({ hostname: 1, port: 1 }, { unique: true });

export default mongoose.model<IComputeNode>('ComputeNode', ComputeNodeSchema);
