export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type PipelineType = 'water' | 'sewage' | 'electric' | 'gas' | 'heat';

export interface Pipeline {
  _id?: string;
  name: string;
  type: PipelineType;
  diameter: number;
  material: string;
  points: Point3D[];
  depth: number;
  description?: string;
  createdAt?: Date;
}

export type AnnotationType = 'valve' | 'joint' | 'manhole' | 'transformer' | 'general';

export interface Annotation {
  _id?: string;
  name: string;
  pipelineId?: string;
  x: number;
  y: number;
  z: number;
  type: AnnotationType;
  content?: string;
  author?: string;
  createdAt?: Date;
}

export interface PipelineStats {
  _id: PipelineType;
  count: number;
  avgDiameter: number;
}

export const PIPELINE_COLORS: Record<PipelineType, number> = {
  water: 0x3498db,
  sewage: 0x8e44ad,
  electric: 0xf39c12,
  gas: 0xe74c3c,
  heat: 0xe67e22,
};

export const PIPELINE_TYPE_NAMES: Record<PipelineType, string> = {
  water: '给水',
  sewage: '排水',
  electric: '电力',
  gas: '燃气',
  heat: '热力',
};

export const PIPELINE_MATERIALS: Record<PipelineType, string> = {
  water: '球墨铸铁管',
  sewage: 'HDPE双壁波纹管',
  electric: 'PVC-C电力管',
  gas: '无缝钢管',
  heat: '预制直埋保温管',
};

export const ANNOTATION_TYPE_NAMES: Record<AnnotationType, string> = {
  valve: '阀门',
  joint: '接头',
  manhole: '检查井',
  transformer: '变压器',
  general: '通用',
};
