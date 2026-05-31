import type { SampleType, SampleStatus, TransferStatus, UserRole } from '@/types';

export const SAMPLE_TYPE_MAP: Record<SampleType, string> = {
  blood: '血液',
  tissue: '组织',
  cell: '细胞',
  dna: 'DNA',
  rna: 'RNA',
  protein: '蛋白质',
  other: '其他',
};

export const SAMPLE_STATUS_MAP: Record<SampleStatus, string> = {
  in_stock: '在库',
  in_transit: '流转中',
  received: '已签收',
  archived: '已归档',
  discarded: '已废弃',
};

export const TRANSFER_STATUS_MAP: Record<TransferStatus, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已驳回',
  in_transit: '流转中',
  received: '已签收',
};

export const ROLE_MAP: Record<UserRole, string> = {
  admin: '系统管理员',
  approver: '审批负责人',
  experimenter: '实验员',
  viewer: '查看者',
};

export const STATUS_COLORS: Record<string, string> = {
  in_stock: 'bg-emerald-100 text-emerald-700',
  in_transit: 'bg-amber-100 text-amber-700',
  received: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-700',
  discarded: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export const STORAGE_CONDITIONS = ['常温', '4°C冷藏', '-20°C冷冻', '-80°C超低温', '液氮', '干燥避光'];
export const UNITS = ['ml', 'g', 'mg', 'μl', '份', '管', '片', '个'];
