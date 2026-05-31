const MAX_QUANTITY_BY_LEVEL = {
  '剧毒': 50,
  '高毒': 500,
  '易燃': 5000,
  '易爆': 5000,
  '腐蚀': 5000,
  '其他': 5000
};

const DANGER_LEVELS = ['剧毒', '高毒', '易燃', '易爆', '腐蚀', '其他'];

const APPLICATION_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'distributing', 'completed', 'cancelled'];

const PHONE_REGEX = /^1[3-9]\d{9}$/;

module.exports = {
  MAX_QUANTITY_BY_LEVEL,
  DANGER_LEVELS,
  APPLICATION_STATUSES,
  PHONE_REGEX
};
