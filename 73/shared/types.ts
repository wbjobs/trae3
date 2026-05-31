export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'operator' | 'reviewer' | 'admin';
  createdAt: string;
}

export interface Sample {
  id: string;
  sampleNo: string;
  name: string;
  type: string;
  source: string;
  specification: string;
  quantity: number;
  unit: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  sampleId: string;
  fileName: string;
  fileSize: number;
  filePath: string;
  fileType: string;
  uploadedAt: string;
}

export interface FlowRecord {
  id: string;
  sampleId: string;
  step: string;
  action: 'submit' | 'approve' | 'reject' | 'resubmit';
  operator: string;
  comment?: string;
  createdAt: string;
}

export interface CreateSampleRequest {
  name: string;
  type: string;
  source: string;
  specification: string;
  quantity: number;
  unit: string;
  description?: string;
}

export interface CreateSampleResponse {
  id: string;
  sampleNo: string;
  status: 'pending';
  createdAt: string;
}

export interface SampleListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: SampleItem[];
}

export interface SampleItem {
  id: string;
  sampleNo: string;
  name: string;
  type: string;
  status: 'pending' | 'approved' | 'rejected';
  currentStep: string;
  handler: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveRequest {
  action: 'approve' | 'reject';
  comment: string;
}

export interface DashboardStats {
  totalSamples: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  recentActivities: RecentActivity[];
}

export interface RecentActivity {
  sampleNo: string;
  action: string;
  operator: string;
  timestamp: string;
}
