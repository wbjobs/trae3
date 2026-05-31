const Joi = require('joi');

const archiveSchema = Joi.object({
  title: Joi.string().min(2).max(200).required().messages({
    'string.empty': '标题不能为空',
    'string.min': '标题至少2个字符',
    'string.max': '标题不能超过200个字符',
    'any.required': '标题是必填项'
  }),
  archiveNumber: Joi.string().pattern(/^[A-Z0-9-]+$/).required().messages({
    'string.empty': '档案编号不能为空',
    'string.pattern.base': '档案编号只能包含大写字母、数字和连字符',
    'any.required': '档案编号是必填项'
  }),
  category: Joi.string().valid('文书档案', '科技档案', '会计档案', '人事档案', '声像档案', '电子档案').required().messages({
    'any.only': '请选择有效的档案类别',
    'any.required': '档案类别是必填项'
  }),
  retentionPeriod: Joi.string().valid('永久', '30年', '10年', '5年').required().messages({
    'any.only': '请选择有效的保管期限',
    'any.required': '保管期限是必填项'
  }),
  description: Joi.string().max(1000).allow('').optional().messages({
    'string.max': '描述不能超过1000个字符'
  }),
  creator: Joi.string().min(2).max(50).required().messages({
    'string.empty': '创建人不能为空',
    'string.min': '创建人至少2个字符',
    'string.max': '创建人不能超过50个字符',
    'any.required': '创建人是必填项'
  }),
  creationDate: Joi.date().required().messages({
    'date.base': '请输入有效的日期',
    'any.required': '创建日期是必填项'
  }),
  department: Joi.string().min(2).max(100).required().messages({
    'string.empty': '所属部门不能为空',
    'string.min': '部门名称至少2个字符',
    'string.max': '部门名称不能超过100个字符',
    'any.required': '所属部门是必填项'
  }),
  keywords: Joi.array().items(Joi.string()).optional()
});

const searchSchema = Joi.object({
  keyword: Joi.string().allow('', null).optional(),
  category: Joi.string().allow('', null).optional(),
  archiveNumber: Joi.string().allow('', null).optional(),
  startDate: Joi.date().allow('', null).optional(),
  endDate: Joi.date().allow('', null).optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10)
});

function validateArchive(data) {
  const { error, value } = archiveSchema.validate(data, { abortEarly: false });
  if (error) {
    return {
      valid: false,
      errors: error.details.map(detail => detail.message)
    };
  }
  return { valid: true, data: value };
}

function validateSearch(data) {
  const { error, value } = searchSchema.validate(data);
  if (error) {
    return {
      valid: false,
      errors: error.details.map(detail => detail.message)
    };
  }
  return { valid: true, data: value };
}

module.exports = {
  validateArchive,
  validateSearch
};
