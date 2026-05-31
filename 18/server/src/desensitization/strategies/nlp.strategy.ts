import { Injectable } from '@nestjs/common';
import { SensitiveMatch, IDesensitizer } from './desensitizer.interface';

@Injectable()
export class NlpStrategy implements IDesensitizer {
  private readonly chineseSurnames = new Set([
    '王', '李', '张', '刘', '陈', '杨', '黄', '赵', '吴', '周',
    '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗',
    '郑', '梁', '谢', '宋', '唐', '许', '邓', '冯', '韩', '曹',
    '曾', '彭', '萧', '蔡', '潘', '田', '董', '袁', '于', '余',
    '叶', '蒋', '杜', '苏', '魏', '程', '吕', '丁', '沈', '任',
    '姚', '卢', '傅', '钟', '姜', '崔', '谭', '廖', '范', '汪',
    '陆', '金', '石', '戴', '贾', '韦', '夏', '邱', '方', '侯',
    '邹', '熊', '孟', '秦', '白', '江', '阎', '薛', '尹', '段',
    '雷', '黎', '史', '龙', '贺', '顾', '毛', '郝', '龚', '邵',
    '万', '钱', '严', '覃', '武', '戚', '柳', '谢', '施', '张',
    '章', '鲁', '葛', '伍', '韦', '申', '尤', '毕', '聂', '丛',
    '欧阳', '上官', '司马', '诸葛', '皇甫', '尉迟', '赫连', '澹台',
    '公冶', '宗政', '濮阳', '淳于', '单于', '太叔', '申屠', '公孙',
    '仲孙', '轩辕', '令狐', '钟离', '宇文', '长孙', '慕容', '鲜于',
    '闾丘', '司徒', '司空', '亓官', '司寇', '仉', '督', '子车',
  ]);

  private readonly nameContextPrefix = [
    '联系人', '负责人', '经理', '主管', '总监', '主任', '科长',
    '处长', '局长', '院长', '校长', '所长', '站长', '队长',
    '组长', '专员', '员工', '同志', '先生', '女士', '小姐',
    '同志', '教授', '老师', '医生', '护士', '工程师', '设计师',
    '由', '为', '是', '叫', '称', '即', '姓', '名',
  ];

  private readonly nameContextSuffix = [
    '同志', '先生', '女士', '经理', '主任', '总监', '主管',
    '负责', '联系人', '的', '说', '表示', '认为', '指出',
  ];

  private readonly provinces = [
    '北京', '上海', '天津', '重庆', '河北', '山西', '辽宁', '吉林',
    '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南',
    '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
    '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆',
    '香港', '澳门',
  ];

  private readonly cities = [
    '北京', '上海', '广州', '深圳', '杭州', '南京', '苏州', '成都',
    '武汉', '西安', '重庆', '天津', '郑州', '长沙', '沈阳', '青岛',
    '大连', '宁波', '厦门', '合肥', '福州', '南昌', '济南', '哈尔滨',
    '长春', '石家庄', '太原', '呼和浩特', '南宁', '海口', '贵阳', '昆明',
    '拉萨', '兰州', '西宁', '银川', '乌鲁木齐',
  ];

  private readonly districts = [
    '区', '县', '市', '镇', '乡', '街道', '村', '社区',
    '开发区', '园区', '新区', '工业区', '科技园', '工业园',
  ];

  private readonly addressSuffixes = [
    '路', '街', '道', '巷', '弄', '号', '栋', '楼', '层',
    '室', '单元', '座', '幢', '坊', '里', '弄堂', '胡同',
    '大道', '大街', '小巷', '马路',
  ];

  private readonly companyTypes = [
    '有限公司', '股份有限公司', '集团', '公司', '厂', '矿',
    '企业', '单位', '机构', '中心', '研究院', '研究所',
    '大学', '学院', '学校', '医院', '银行', '局', '厅',
    '部', '署', '司', '处', '科', '办', '室',
  ];

  async detect(text: string): Promise<SensitiveMatch[]> {
    const matches: SensitiveMatch[] = [];

    const nameMatches = this.detectChineseNames(text);
    matches.push(...nameMatches);

    const addressMatches = this.detectAddresses(text);
    matches.push(...addressMatches);

    const orgMatches = this.detectOrganizations(text);
    matches.push(...orgMatches);

    return matches.sort((a, b) => a.start - b.start);
  }

  private detectChineseNames(text: string): SensitiveMatch[] {
    const matches: SensitiveMatch[] = [];
    const foundPositions = new Set<string>();

    for (const surname of this.chineseSurnames) {
      const surnamePattern = new RegExp(
        `(?<![\\u4e00-\\u9fa5])${surname}[\\u4e00-\\u9fa5]{1,2}(?![\\u4e00-\\u9fa5])`,
        'g',
      );
      let match: RegExpExecArray | null;

      while ((match = surnamePattern.exec(text)) !== null) {
        const fullName = match[0];
        const start = match.index;
        const end = start + fullName.length;

        const posKey = `${start}-${end}`;
        if (foundPositions.has(posKey)) continue;

        if (this.isValidNameContext(text, start, end, fullName)) {
          if (!this.isCommonWord(fullName)) {
            matches.push({
              type: 'name',
              value: fullName,
              start,
              end,
              replacement: this.maskName(fullName),
            });
            foundPositions.add(posKey);
          }
        }
      }
    }

    return matches;
  }

  private isValidNameContext(
    text: string,
    start: number,
    end: number,
    name: string,
  ): boolean {
    const prefixLen = 10;
    const suffixLen = 10;

    const prefixStart = Math.max(0, start - prefixLen);
    const prefixText = text.slice(prefixStart, start);

    const suffixEnd = Math.min(text.length, end + suffixLen);
    const suffixText = text.slice(end, suffixEnd);

    const hasPrefixContext = this.nameContextPrefix.some((ctx) =>
      prefixText.includes(ctx),
    );
    const hasSuffixContext = this.nameContextSuffix.some((ctx) =>
      suffixText.includes(ctx),
    );

    if (hasPrefixContext || hasSuffixContext) {
      return true;
    }

    const beforeChar = start > 0 ? text[start - 1] : '';
    const afterChar = end < text.length ? text[end] : '';

    const beforeIsChinese = /[\u4e00-\u9fa5]/.test(beforeChar);
    const afterIsChinese = /[\u4e00-\u9fa5]/.test(afterChar);

    if (!beforeIsChinese && !afterIsChinese && name.length >= 2) {
      return true;
    }

    return false;
  }

  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      '今天', '明天', '昨天', '今年', '明年', '去年',
      '大家', '我们', '你们', '他们', '它们', '这个', '那个',
      '什么', '怎么', '为什么', '哪里', '如何', '因为', '所以',
      '但是', '而且', '或者', '如果', '虽然', '然而', '其实',
      '公司', '集团', '中心', '大学', '学院', '医院',
      '产品', '服务', '系统', '项目', '方案', '计划',
      '中国', '美国', '日本', '韩国', '英国', '法国', '德国',
    ]);
    return commonWords.has(word);
  }

  private maskName(name: string): string {
    if (name.length <= 1) return '*';
    if (name.length === 2) return name[0] + '*';
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  }

  private detectAddresses(text: string): SensitiveMatch[] {
    const matches: SensitiveMatch[] = [];
    const foundPositions = new Set<string>();

    for (const province of this.provinces) {
      const pattern = new RegExp(
        `${province}(?:省|市)?(?:[\\u4e00-\\u9fa5]{2,10}(?:市|区|县|镇|乡|街道)?)?(?:[\\u4e00-\\u9fa5]{2,10}(?:路|街|道|巷|号|栋|楼|室))?`,
        'g',
      );
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const addr = match[0];
        const start = match.index;
        const end = start + addr.length;

        const posKey = `${start}-${end}`;
        if (foundPositions.has(posKey)) continue;

        if (addr.length >= 4) {
          matches.push({
            type: 'address',
            value: addr,
            start,
            end,
            replacement: this.maskAddress(addr, province),
          });
          foundPositions.add(posKey);
        }
      }
    }

    for (const city of this.cities) {
      const pattern = new RegExp(
        `${city}(?:市)?[\\u4e00-\\u9fa5]{2,20}(?:区|县|路|街|道|巷|号)`,
        'g',
      );
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const addr = match[0];
        const start = match.index;
        const end = start + addr.length;

        const posKey = `${start}-${end}`;
        if (foundPositions.has(posKey)) continue;

        let overlap = false;
        for (let i = start; i < end; i++) {
          if (Array.from(foundPositions).some((key) => {
            const [s, e] = key.split('-').map(Number);
            return i >= s && i < e;
          })) {
            overlap = true;
            break;
          }
        }

        if (!overlap && addr.length >= 4) {
          matches.push({
            type: 'address',
            value: addr,
            start,
            end,
            replacement: this.maskAddress(addr, city),
          });
          foundPositions.add(posKey);
        }
      }
    }

    return matches;
  }

  private maskAddress(addr: string, prefix: string): string {
    const prefixLen = Math.min(prefix.length, 4);
    return addr.slice(0, prefixLen) + '***';
  }

  private detectOrganizations(text: string): SensitiveMatch[] {
    const matches: SensitiveMatch[] = [];
    const foundPositions = new Set<string>();

    for (const orgType of this.companyTypes) {
      const pattern = new RegExp(
        `[\\u4e00-\\u9fa5]{2,20}(?:${orgType})`,
        'g',
      );
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(text)) !== null) {
        const org = match[0];
        const start = match.index;
        const end = start + org.length;

        const posKey = `${start}-${end}`;
        if (foundPositions.has(posKey)) continue;

        if (this.isSensitiveOrganization(org)) {
          matches.push({
            type: 'organization',
            value: org,
            start,
            end,
            replacement: this.maskOrganization(org, orgType),
          });
          foundPositions.add(posKey);
        }
      }
    }

    return matches;
  }

  private isSensitiveOrganization(org: string): boolean {
    const sensitiveKeywords = [
      '保密', '秘密', '机密', '绝密', '军事', '部队', '军队',
      '国防', '军工', '涉密', '保密', '机要', '情报',
      '公安', '警察', '安全', '检察', '法院', '司法',
      '政府', '党委', '省委', '市委', '县委',
    ];
    return sensitiveKeywords.some((kw) => org.includes(kw));
  }

  private maskOrganization(org: string, orgType: string): string {
    return org.slice(0, 2) + '***' + orgType;
  }

  getRuleTypes(): string[] {
    return ['name', 'address', 'organization'];
  }
}
