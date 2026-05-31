import { Injectable } from '@nestjs/common';
import { SensitiveMatch, IDesensitizer } from './desensitizer.interface';

export interface RegexRule {
  type: string;
  pattern: RegExp;
  mask: (match: string) => string;
  priority?: number;
  description?: string;
}

@Injectable()
export class RegexStrategy implements IDesensitizer {
  private readonly rules: RegexRule[] = [
    {
      type: 'phone',
      pattern: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g,
      mask: (m) => m.slice(0, 3) + '****' + m.slice(-4),
      priority: 100,
      description: '手机号码',
    },
    {
      type: 'phone_tel',
      pattern: /(?<!\d)0\d{2,3}[-\s]?\d{7,8}(?!\d)/g,
      mask: (m) => m.slice(0, 4) + '****' + m.slice(-2),
      priority: 95,
      description: '固定电话',
    },
    {
      type: 'id_card',
      pattern: /(?<!\d)([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])(?!\d)/g,
      mask: (m) => m.slice(0, 6) + '********' + m.slice(-4),
      priority: 90,
      description: '身份证号(18位)',
    },
    {
      type: 'id_card_old',
      pattern: /(?<!\d)([1-9]\d{7}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3})(?!\d)/g,
      mask: (m) => m.slice(0, 4) + '******' + m.slice(-2),
      priority: 85,
      description: '身份证号(15位)',
    },
    {
      type: 'bank_card',
      pattern: /(?<!\d)(?:62|4|5|3)\d{14,18}(?!\d)/g,
      mask: (m) => m.slice(0, 6) + '********' + m.slice(-4),
      priority: 80,
      description: '银行卡号',
    },
    {
      type: 'credit_card',
      pattern: /(?<!\d)(?:3[47]\d{13}|(?:6011|65)\d{14})(?!\d)/g,
      mask: (m) => '**** **** **** ' + m.slice(-4),
      priority: 78,
      description: '信用卡号',
    },
    {
      type: 'email',
      pattern: /(?<![a-zA-Z0-9])([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?![a-zA-Z0-9])/gi,
      mask: (m) => {
        const [name, domain] = m.split('@');
        if (name.length <= 2) return '*' + '@' + domain;
        return name[0] + '*'.repeat(Math.min(name.length - 2, 6)) + (name.length > 3 ? name.slice(-1) : '') + '@' + domain;
      },
      priority: 75,
      description: '电子邮箱',
    },
    {
      type: 'classified',
      pattern: /(绝密|机密|秘密|内部资料|内部公开|工作秘密|国家秘密|商业机密|保密|涉密)/g,
      mask: (m) => '[CLASSIFIED]',
      priority: 70,
      description: '涉密标识',
    },
    {
      type: 'ip_address',
      pattern: /(?<!\d)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?!\d)/g,
      mask: (m) => {
        const parts = m.split('.');
        return parts[0] + '.*.*.' + parts[3];
      },
      priority: 65,
      description: 'IPv4地址',
    },
    {
      type: 'ip_cidr',
      pattern: /(?<!\d)(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\/\d{1,2}(?!\d)/g,
      mask: (m) => {
        const [ip, mask] = m.split('/');
        const parts = ip.split('.');
        return parts[0] + '.*.*.' + parts[3] + '/' + mask;
      },
      priority: 64,
      description: 'CIDR地址段',
    },
    {
      type: 'mac_address',
      pattern: /(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f])/g,
      mask: (m) => m.slice(0, 8) + ':**:**',
      priority: 63,
      description: 'MAC地址',
    },
    {
      type: 'url',
      pattern: /(https?:\/\/(?:www\.)?[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z0-9][a-zA-Z0-9-.\/?=&#_%:-]*)/gi,
      mask: (m) => {
        try {
          const url = new URL(m);
          return url.protocol + '//[HIDDEN]/...';
        } catch {
          return '[URL]';
        }
      },
      priority: 60,
      description: 'URL链接',
    },
    {
      type: 'wechat',
      pattern: /(?<![a-zA-Z0-9_])(微信|wx|WeChat|微信号)[:：\s]*[a-zA-Z][a-zA-Z0-9_-]{5,19}(?![a-zA-Z0-9_-])/gi,
      mask: (m) => m.replace(/[:：\s]*[a-zA-Z][a-zA-Z0-9_-]{5,19}/i, ': ****'),
      priority: 55,
      description: '微信号',
    },
    {
      type: 'qq',
      pattern: /(?<![0-9])(QQ|qq|企鹅)[:：\s]*[1-9]\d{4,11}(?![0-9])/g,
      mask: (m) => m.replace(/[:：\s]*[1-9]\d{4,11}/, ': ****'),
      priority: 54,
      description: 'QQ号',
    },
    {
      type: 'passport',
      pattern: /(?<![A-Z0-9])(?:G|E|D|S|P|H|M)(?:\d{8}|\d{7})(?![A-Z0-9])/g,
      mask: (m) => m[0] + '**' + m.slice(-2),
      priority: 50,
      description: '护照号',
    },
    {
      type: 'military_id',
      pattern: /(?<![a-zA-Z0-9])(?:军|士|官|兵|武|警)[字第]?\d{6,10}号?/g,
      mask: (m) => m[0] + '**' + m.slice(-2) + '号',
      priority: 45,
      description: '军官证/士兵证',
    },
    {
      type: 'postcode',
      pattern: /(?<![0-9])([1-9]\d{5})(?![0-9])/g,
      mask: (m) => m.slice(0, 2) + '**' + m.slice(-2),
      priority: 40,
      description: '邮政编码',
    },
    {
      type: 'social_credit',
      pattern: /(?<![0-9A-Z])([0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10})(?![0-9A-Z])/g,
      mask: (m) => m.slice(0, 4) + '**********' + m.slice(-4),
      priority: 35,
      description: '统一社会信用代码',
    },
    {
      type: 'org_code',
      pattern: /(?<![0-9A-Z])([0-9A-Z]{8}-[0-9A-Z])(?![0-9A-Z])/g,
      mask: (m) => m.slice(0, 2) + '******-' + m.slice(-1),
      priority: 34,
      description: '组织机构代码',
    },
    {
      type: 'tax_number',
      pattern: /(?<![0-9])(\d{15})(?![0-9])/g,
      mask: (m) => m.slice(0, 4) + '*******' + m.slice(-4),
      priority: 33,
      description: '税务登记号',
    },
  ];

  private readonly sortedRules: RegexRule[];

  constructor() {
    this.sortedRules = [...this.rules].sort(
      (a, b) => (b.priority || 0) - (a.priority || 0),
    );
  }

  async detect(text: string): Promise<SensitiveMatch[]> {
    const matches: SensitiveMatch[] = [];
    const usedPositions = new Set<string>();

    for (const rule of this.sortedRules) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = rule.pattern.exec(text)) !== null) {
        const matchValue = match[0];
        const start = match.index;
        const end = start + matchValue.length;

        let overlap = false;
        for (let i = start; i < end; i++) {
          if (usedPositions.has(i.toString())) {
            overlap = true;
            break;
          }
        }

        if (!overlap) {
          matches.push({
            type: rule.type,
            value: matchValue,
            start,
            end,
            replacement: rule.mask(matchValue),
          });

          for (let i = start; i < end; i++) {
            usedPositions.add(i.toString());
          }
        }

        if (match[0].length === 0) {
          rule.pattern.lastIndex++;
        }
      }
    }

    return matches.sort((a, b) => a.start - b.start);
  }

  getRuleTypes(): string[] {
    return Array.from(new Set(this.rules.map((r) => r.type)));
  }

  getRules(): RegexRule[] {
    return [...this.rules];
  }

  addCustomRule(rule: RegexRule): void {
    this.rules.push(rule);
    this.sortedRules.push(rule);
    this.sortedRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
}
