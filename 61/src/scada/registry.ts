import type { ComponentType } from '../../shared/types';

export interface PropSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'sensor_binding';
  defaultValue: unknown;
  options?: string[];
}

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  icon: string;
  defaultWidth: number;
  defaultHeight: number;
  propSchema: PropSchema[];
  maxBindings: number;
}

export const componentRegistry: Record<ComponentType, ComponentDefinition> = {
  gauge: {
    type: 'gauge',
    label: '仪表盘',
    icon: 'gauge',
    defaultWidth: 160,
    defaultHeight: 120,
    maxBindings: 1,
    propSchema: [
      { key: 'min', label: '最小值', type: 'number', defaultValue: 0 },
      { key: 'max', label: '最大值', type: 'number', defaultValue: 100 },
      { key: 'unit', label: '单位', type: 'string', defaultValue: '' },
      { key: 'title', label: '标题', type: 'string', defaultValue: '' },
    ],
  },
  chart: {
    type: 'chart',
    label: '趋势图',
    icon: 'line-chart',
    defaultWidth: 400,
    defaultHeight: 160,
    maxBindings: 6,
    propSchema: [
      { key: 'title', label: '标题', type: 'string', defaultValue: '趋势图' },
      { key: 'chartType', label: '图表类型', type: 'select', defaultValue: 'line', options: ['line', 'area'] },
    ],
  },
  indicator: {
    type: 'indicator',
    label: '指示灯',
    icon: 'lightbulb',
    defaultWidth: 120,
    defaultHeight: 60,
    maxBindings: 1,
    propSchema: [
      { key: 'label', label: '标签', type: 'string', defaultValue: '' },
    ],
  },
  button: {
    type: 'button',
    label: '按钮',
    icon: 'mouse-pointer-2',
    defaultWidth: 120,
    defaultHeight: 60,
    maxBindings: 0,
    propSchema: [
      { key: 'label', label: '标签', type: 'string', defaultValue: '按钮' },
    ],
  },
  text: {
    type: 'text',
    label: '文本',
    icon: 'type',
    defaultWidth: 160,
    defaultHeight: 40,
    maxBindings: 0,
    propSchema: [
      { key: 'content', label: '内容', type: 'string', defaultValue: '文本' },
    ],
  },
  valve: {
    type: 'valve',
    label: '阀门',
    icon: 'circle-dot',
    defaultWidth: 100,
    defaultHeight: 60,
    maxBindings: 1,
    propSchema: [
      { key: 'label', label: '标签', type: 'string', defaultValue: '阀门' },
    ],
  },
  pipe: {
    type: 'pipe',
    label: '管道',
    icon: 'minus',
    defaultWidth: 200,
    defaultHeight: 20,
    maxBindings: 1,
    propSchema: [
      { key: 'label', label: '标签', type: 'string', defaultValue: '' },
    ],
  },
};

export function getComponentDef(type: ComponentType): ComponentDefinition {
  return componentRegistry[type];
}

export function createDefaultProps(type: ComponentType): Record<string, unknown> {
  const def = componentRegistry[type];
  const props: Record<string, unknown> = {};
  for (const schema of def.propSchema) {
    props[schema.key] = schema.defaultValue;
  }
  return props;
}
