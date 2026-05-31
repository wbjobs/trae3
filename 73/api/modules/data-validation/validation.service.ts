interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSample(data: { name?: string; type?: string; source?: string; specification?: string; quantity?: number; unit?: string }): ValidationResult {
  const errors: string[] = [];

  if (!data.name || data.name.trim() === '') errors.push('样品名称不能为空');
  if (!data.type || data.type.trim() === '') errors.push('样品类型不能为空');
  if (!data.source || data.source.trim() === '') errors.push('样品来源不能为空');
  if (!data.specification || data.specification.trim() === '') errors.push('规格不能为空');
  if (data.quantity === undefined || data.quantity === null || data.quantity <= 0) errors.push('数量必须大于0');
  if (!data.unit || data.unit.trim() === '') errors.push('单位不能为空');

  return { valid: errors.length === 0, errors };
}

export function validateApproval(data: { action?: string; comment?: string }): ValidationResult {
  const errors: string[] = [];

  if (!data.action || !['approve', 'reject'].includes(data.action)) errors.push('审批操作无效');
  if (data.action === 'reject' && (!data.comment || data.comment.trim() === '')) errors.push('退回时必须填写原因');

  return { valid: errors.length === 0, errors };
}
