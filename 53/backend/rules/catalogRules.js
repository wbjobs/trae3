const CATEGORY_CODES = {
  '文书档案': 'WS',
  '科技档案': 'KJ',
  '会计档案': 'KD',
  '人事档案': 'RS',
  '声像档案': 'SX',
  '电子档案': 'DZ'
};

const RETENTION_CODES = {
  '永久': 'YJ',
  '30年': '30',
  '10年': '10',
  '5年': '05'
};

const CATEGORY_RULES = {
  '文书档案': {
    keywords: ['通知', '批复', '请示', '报告', '会议纪要', '函', '意见', '决定', '决议', '通报'],
    retention: { default: '30年', important: '永久' }
  },
  '科技档案': {
    keywords: ['项目', '研发', '设计', '图纸', '方案', '技术', '成果', '专利', '标准', '规范'],
    retention: { default: '永久', general: '30年' }
  },
  '会计档案': {
    keywords: ['凭证', '账簿', '报表', '决算', '审计', '发票', '收据', '记账', '财务', '预算'],
    retention: { default: '30年', important: '永久' }
  },
  '人事档案': {
    keywords: ['简历', '任免', '考核', '奖惩', '培训', '工资', '合同', '档案', '人事', '聘用'],
    retention: { default: '永久' }
  },
  '声像档案': {
    keywords: ['照片', '录音', '录像', '视频', '图片', '影像'],
    retention: { default: '30年', important: '永久' }
  },
  '电子档案': {
    keywords: ['电子', '数据', '系统', '软件', '数据库', '备份'],
    retention: { default: '10年', important: '永久' }
  }
};

const IMPORTANT_KEYWORDS = [
  '重要', '机密', '绝密', '核心', '关键', '战略', '规划', '年度', '重大',
  '党委', '党组', '总经理', '董事会', '股东大会', '国家级', '省部级'
];

function generateArchiveNumber(category, year, sequence) {
  const categoryCode = CATEGORY_CODES[category] || 'QT';
  const seq = String(sequence).padStart(4, '0');
  return `${categoryCode}-${year}-${seq}`;
}

function parseArchiveNumber(archiveNumber) {
  const parts = archiveNumber.split('-');
  if (parts.length !== 3) {
    return null;
  }
  return {
    categoryCode: parts[0],
    year: parts[1],
    sequence: parseInt(parts[2], 10)
  };
}

function getCategoryByCode(code) {
  for (const [category, categoryCode] of Object.entries(CATEGORY_CODES)) {
    if (categoryCode === code) {
      return category;
    }
  }
  return null;
}

function getKeywordsFromContent(title, description) {
  const keywords = [];
  const text = `${title} ${description}`;
  
  const commonKeywords = ['报告', '方案', '总结', '计划', '合同', '协议', '通知', '批复', '会议纪要', '项目'];
  commonKeywords.forEach(kw => {
    if (text.includes(kw)) {
      keywords.push(kw);
    }
  });
  
  return [...new Set(keywords)];
}

function autoClassifyByContent(title, description) {
  const text = `${title} ${description}`;
  const scores = {};
  
  for (const [category, rules] of Object.entries(CATEGORY_RULES)) {
    scores[category] = 0;
    rules.keywords.forEach(kw => {
      if (text.includes(kw)) {
        scores[category]++;
      }
    });
  }
  
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : null;
}

function suggestRetentionPeriod(category, title, description) {
  const text = `${title} ${description}`;
  const rules = CATEGORY_RULES[category];
  
  if (!rules) return '30年';
  
  const isImportant = IMPORTANT_KEYWORDS.some(kw => text.includes(kw));
  
  if (isImportant && rules.retention.important) {
    return rules.retention.important;
  }
  if (rules.retention.default) {
    return rules.retention.default;
  }
  
  return '30年';
}

function calculateRetentionScore(retentionPeriod) {
  const scores = {
    '永久': 100,
    '30年': 80,
    '10年': 50,
    '5年': 30
  };
  return scores[retentionPeriod] || 0;
}

function extractDates(text) {
  const datePatterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/g,
    /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/g
  ];
  
  const dates = [];
  datePatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      dates.push(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
    }
  });
  
  return [...new Set(dates)];
}

function extractDepartment(title, description) {
  const text = `${title} ${description}`;
  const departmentPatterns = [
    /([\u4e00-\u9fa5]+部)/g,
    /([\u4e00-\u9fa5]+处)/g,
    /([\u4e00-\u9fa5]+科)/g,
    /([\u4e00-\u9fa5]+室)/g,
    /([\u4e00-\u9fa5]+中心)/g
  ];
  
  const departments = [];
  departmentPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      departments.push(match[1]);
    }
  });
  
  return [...new Set(departments)];
}

function validateArchiveRules(archive) {
  const errors = [];
  
  const parsed = parseArchiveNumber(archive.archiveNumber);
  if (!parsed) {
    errors.push('档案编号格式不正确，应为：类别-年份-序号');
  } else {
    const category = getCategoryByCode(parsed.categoryCode);
    if (!category) {
      errors.push(`无法识别的档案类别代码: ${parsed.categoryCode}`);
    } else if (category !== archive.category) {
      errors.push(`档案编号类别代码与实际类别不匹配: ${parsed.categoryCode} vs ${CATEGORY_CODES[archive.category]}`);
    }
  }
  
  if (archive.retentionPeriod === '永久' && !archive.description) {
    errors.push('永久保管的档案必须填写详细描述');
  }
  
  const creationYear = new Date(archive.creationDate).getFullYear();
  const currentYear = new Date().getFullYear();
  if (creationYear > currentYear) {
    errors.push('创建日期不能晚于当前日期');
  }
  
  const suggestedCategory = autoClassifyByContent(archive.title, archive.description || '');
  if (suggestedCategory && suggestedCategory !== archive.category) {
    errors.push(`根据内容分析，建议归类为: ${suggestedCategory}`);
  }
  
  const suggestedRetention = suggestRetentionPeriod(
    archive.category, 
    archive.title, 
    archive.description || ''
  );
  if (suggestedRetention !== archive.retentionPeriod) {
    errors.push(`根据内容分析，建议保管期限为: ${suggestedRetention}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

function analyzeArchive(archiveData) {
  const { title, description } = archiveData;
  const text = `${title} ${description || ''}`;
  
  return {
    suggestedCategory: autoClassifyByContent(title, description || ''),
    suggestedRetention: suggestRetentionPeriod(archiveData.category, title, description || ''),
    extractedKeywords: getKeywordsFromContent(title, description || ''),
    extractedDates: extractDates(text),
    extractedDepartments: extractDepartment(text),
    isImportant: IMPORTANT_KEYWORDS.some(kw => text.includes(kw))
  };
}

module.exports = {
  generateArchiveNumber,
  parseArchiveNumber,
  getCategoryByCode,
  getKeywordsFromContent,
  calculateRetentionScore,
  validateArchiveRules,
  autoClassifyByContent,
  suggestRetentionPeriod,
  analyzeArchive,
  CATEGORY_CODES,
  RETENTION_CODES,
  CATEGORY_RULES
};
