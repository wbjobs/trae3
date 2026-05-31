export type UserRole = 'admin' | 'approver' | 'experimenter' | 'viewer';
export type SampleType = 'blood' | 'tissue' | 'cell' | 'dna' | 'rna' | 'protein' | 'other';
export type SampleStatus = 'in_stock' | 'in_transit' | 'received' | 'archived' | 'discarded';
export type TransferStatus = 'pending' | 'approved' | 'rejected' | 'in_transit' | 'received';
export type MessageType = 'approval_pending' | 'approval_result' | 'transfer_received' | 'system';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  labId: number;
  labName: string;
}

export interface Sample {
  id: number;
  sampleCode: string;
  name: string;
  type: SampleType;
  source: string;
  quantity: number;
  unit: string;
  storageCondition: string;
  status: SampleStatus;
  labId: number;
  labName: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transfer {
  id: number;
  sampleId: number;
  sampleCode: string;
  sampleName: string;
  fromLabId: number;
  fromLabName: string;
  toLabId: number;
  toLabName: string;
  reason: string;
  status: TransferStatus;
  appliedBy: number;
  appliedAt: string;
  approvedBy?: number;
  approvedAt?: string;
  receivedBy?: number;
  receivedAt?: string;
  rejectReason?: string;
}

export interface Lab {
  id: number;
  name: string;
  code: string;
  floor: number;
  positionX: number;
  positionY: number;
  capacity: number;
  currentCount: number;
  contactPerson: string;
  contactPhone: string;
}

export interface Message {
  id: number;
  type: MessageType;
  title: string;
  content: string;
  read: boolean;
  userId: number;
  relatedId?: number;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StatisticsOverview {
  totalSamples: number;
  inStockCount: number;
  inTransitCount: number;
  receivedCount: number;
  pendingApprovalCount: number;
  byStatus?: { status: string; count: number }[];
  byType?: { type: string; count: number }[];
}

export interface TransferTrend {
  date: string;
  count: number;
}

export interface LabLoad {
  labId: number;
  labName: string;
  currentCount: number;
  capacity: number;
  utilizationRate: number;
}

export interface ApprovalEfficiency {
  averageApprovalHours: number;
  approvalRate: number;
  rejectionRate: number;
  totalApproved: number;
  totalRejected: number;
}
