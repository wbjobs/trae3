import type { Point3D, Pipeline, Annotation, PipelineType, AnnotationType } from './types';

export function isValidPoint3D(point: any): point is Point3D {
  return (
    point &&
    typeof point === 'object' &&
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    typeof point.z === 'number' &&
    !isNaN(point.x) &&
    !isNaN(point.y) &&
    !isNaN(point.z)
  );
}

export function isValidPipelineType(type: any): type is PipelineType {
  return ['water', 'sewage', 'electric', 'gas', 'heat'].includes(type);
}

export function isValidAnnotationType(type: any): type is AnnotationType {
  return ['valve', 'joint', 'manhole', 'transformer', 'general'].includes(type);
}

export function isValidPipeline(pipeline: any): pipeline is Pipeline {
  if (!pipeline || typeof pipeline !== 'object') return false;
  
  const hasRequiredFields = 
    typeof pipeline.name === 'string' &&
    isValidPipelineType(pipeline.type) &&
    typeof pipeline.diameter === 'number' &&
    pipeline.diameter > 0 &&
    typeof pipeline.depth === 'number' &&
    Array.isArray(pipeline.points) &&
    pipeline.points.length >= 2;
  
  if (!hasRequiredFields) return false;
  
  const hasValidPoints = pipeline.points.every(isValidPoint3D);
  
  return hasValidPoints;
}

export function isValidAnnotation(annotation: any): annotation is Annotation {
  if (!annotation || typeof annotation !== 'object') return false;
  
  return (
    typeof annotation.name === 'string' &&
    typeof annotation.x === 'number' &&
    typeof annotation.y === 'number' &&
    typeof annotation.z === 'number' &&
    !isNaN(annotation.x) &&
    !isNaN(annotation.y) &&
    !isNaN(annotation.z) &&
    isValidAnnotationType(annotation.type)
  );
}

export function sanitizePoint3D(point: any): Point3D {
  return {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    z: Number(point.z) || 0,
  };
}

export function sanitizePipeline(pipeline: any): Pipeline {
  return {
    name: String(pipeline.name || '未命名管线'),
    type: isValidPipelineType(pipeline.type) ? pipeline.type : 'water',
    diameter: Math.max(0.1, Number(pipeline.diameter) || 0.5),
    material: String(pipeline.material || '未知'),
    points: (Array.isArray(pipeline.points) ? pipeline.points : [])
      .filter(isValidPoint3D)
      .map(sanitizePoint3D),
    depth: Math.abs(Number(pipeline.depth) || 0),
    description: pipeline.description ? String(pipeline.description) : undefined,
  };
}

export function sanitizeAnnotation(annotation: any): Annotation {
  return {
    name: String(annotation.name || '未命名标注'),
    pipelineId: annotation.pipelineId ? String(annotation.pipelineId) : undefined,
    x: Number(annotation.x) || 0,
    y: Number(annotation.y) || 0,
    z: Number(annotation.z) || 0,
    type: isValidAnnotationType(annotation.type) ? annotation.type : 'general',
    content: annotation.content ? String(annotation.content) : undefined,
    author: annotation.author ? String(annotation.author) : undefined,
  };
}

export function validatePipelineData(pipelines: any[]): { valid: Pipeline[]; invalid: any[] } {
  const valid: Pipeline[] = [];
  const invalid: any[] = [];
  
  pipelines.forEach((pipeline, index) => {
    if (isValidPipeline(pipeline)) {
      valid.push(sanitizePipeline(pipeline));
    } else {
      invalid.push({ index, data: pipeline, error: 'Invalid pipeline data format' });
    }
  });
  
  return { valid, invalid };
}

export function validateAnnotationData(annotations: any[]): { valid: Annotation[]; invalid: any[] } {
  const valid: Annotation[] = [];
  const invalid: any[] = [];
  
  annotations.forEach((annotation, index) => {
    if (isValidAnnotation(annotation)) {
      valid.push(sanitizeAnnotation(annotation));
    } else {
      invalid.push({ index, data: annotation, error: 'Invalid annotation data format' });
    }
  });
  
  return { valid, invalid };
}
