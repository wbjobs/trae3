import type { SyntaxRule, SyntaxIssue, Position } from './types';
import type { ScriptLanguage } from '@/types';

const allLanguages: ScriptLanguage[] = ['javascript', 'typescript', 'python', 'rust', 'go', 'bash', 'powershell', 'sql', 'json', 'yaml'];

const jsTsLanguages: ScriptLanguage[] = ['javascript', 'typescript'];

export const basicRules: SyntaxRule[] = [
  {
    id: 'no-hardcoded-secrets',
    name: '禁止硬编码密钥',
    description: '检测代码中的硬编码密码、API密钥等敏感信息',
    type: 'error',
    category: 'security',
    languages: allLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const patterns = [
        { pattern: /(password|pwd|passwd)\s*[:=]\s*["'][^"']+["']/gi, message: '检测到硬编码密码' },
        { pattern: /(api_key|apikey|apiKey)\s*[:=]\s*["'][^"']{20,}["']/gi, message: '检测到硬编码API密钥' },
        { pattern: /(secret|token)\s*[:=]\s*["'][^"']{20,}["']/gi, message: '检测到硬编码令牌' },
        { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, message: '检测到私钥' }
      ];
      
      patterns.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          issues.push({
            message,
            severity: 'error',
            position: findPosition(content, match.index)
          });
        }
      });
      
      return issues;
    }
  },
  {
    id: 'no-eval',
    name: '禁止使用eval',
    description: 'eval函数可能导致安全漏洞',
    type: 'warning',
    category: 'security',
    languages: jsTsLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const pattern = /\beval\s*\(/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        issues.push({
          message: '避免使用eval函数，可能存在安全风险',
          severity: 'warning',
          position: findPosition(content, match.index),
          suggestion: '考虑使用JSON.parse或其他更安全的替代方案'
        });
      }
      return issues;
    }
  },
  {
    id: 'prefer-const',
    name: '优先使用const',
    description: '建议使用const而非let或var',
    type: 'info',
    category: 'style',
    languages: jsTsLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const pattern = /\blet\s+(\w+)\s*=/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const varName = match[1];
        const reassignmentPattern = new RegExp(`\\b${varName}\\s*=[^=]`, 'g');
        reassignmentPattern.lastIndex = match.index + match[0].length;
        if (!reassignmentPattern.test(content)) {
          issues.push({
            message: `变量 '${varName}' 未被重新赋值，建议使用const`,
            severity: 'info',
            position: findPosition(content, match.index),
            suggestion: `将 let ${varName} 改为 const ${varName}`
          });
        }
      }
      return issues;
    }
  },
  {
    id: 'no-unused-vars',
    name: '检测未使用变量',
    description: '检测声明但未使用的变量',
    type: 'warning',
    category: 'best_practice',
    languages: allLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const jsPattern = /\b(?:const|let|var)\s+(\w+)\b/g;
      let match;
      
      while ((match = jsPattern.exec(content)) !== null) {
        const varName = match[1];
        if (varName.startsWith('_')) continue;
        
        const usagePattern = new RegExp(`\\b${varName}\\b`, 'g');
        const usages = [...content.matchAll(usagePattern)];
        
        if (usages.length === 1) {
          issues.push({
            message: `变量 '${varName}' 已声明但未使用`,
            severity: 'warning',
            position: findPosition(content, match.index),
            suggestion: '删除未使用的变量或添加前缀 _'
          });
        }
      }
      
      return issues;
    }
  },
  {
    id: 'use-strict-equal',
    name: '使用严格相等',
    description: '建议使用===代替==，!==代替!=',
    type: 'warning',
    category: 'best_practice',
    languages: jsTsLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const patterns = [
        { pattern: /[^=!]==[^=]/g, message: '使用 == 代替 ===' },
        { pattern: /!=[^=]/g, message: '使用 != 代替 !==' }
      ];
      
      patterns.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          issues.push({
            message: `建议${message}以避免类型转换问题`,
            severity: 'warning',
            position: findPosition(content, match.index),
            suggestion: '使用严格相等运算符'
          });
        }
      });
      
      return issues;
    }
  },
  {
    id: 'python-snake-case',
    name: 'Python命名规范',
    description: 'Python函数和变量应使用snake_case',
    type: 'info',
    category: 'style',
    languages: ['python'],
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const patterns = [
        { pattern: /^def\s+([A-Za-z]+[A-Z][A-Za-z]*)\s*\(/gm, message: '函数名' },
        { pattern: /^\s*(\w+[A-Z]\w*)\s*=/gm, message: '变量名' }
      ];
      
      patterns.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1];
          if (/[A-Z]/.test(name)) {
            issues.push({
              message: `${message} '${name}' 不符合snake_case命名规范`,
              severity: 'info',
              position: findPosition(content, match.index),
              suggestion: `建议使用 ${name.replace(/[A-Z]/g, c => '_' + c.toLowerCase()).replace(/^_/, '')}`
            });
          }
        }
      });
      
      return issues;
    }
  },
  {
    id: 'sql-injection-risk',
    name: 'SQL注入风险检测',
    description: '检测潜在的SQL注入漏洞',
    type: 'error',
    category: 'security',
    languages: ['sql', ...jsTsLanguages, 'python'],
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const patterns = [
        { pattern: /["']\s*\+\s*\w+\s*\+\s*["']/g, message: '字符串拼接可能导致SQL注入' },
        { pattern: /\$\{[^}]+\}/g, message: '模板字符串可能导致SQL注入' },
        { pattern: /%s|%d|%f[^"]/g, message: '格式化字符串可能导致SQL注入' }
      ];
      
      patterns.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const context = content.substring(Math.max(0, match.index - 30), match.index + 30).toLowerCase();
          if (context.includes('select') || context.includes('insert') || context.includes('update') || context.includes('delete')) {
            issues.push({
              message,
              severity: 'error',
              position: findPosition(content, match.index),
              suggestion: '使用参数化查询或ORM代替字符串拼接'
            });
          }
        }
      });
      
      return issues;
    }
  },
  {
    id: 'no-empty-blocks',
    name: '禁止空代码块',
    description: '检测空的if、for、while、function等代码块',
    type: 'warning',
    category: 'best_practice',
    languages: allLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const pattern = /(if|for|while|catch|function|def|class)\s*[\s\S]*?\{\s*\}/g;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        issues.push({
          message: '检测到空代码块',
          severity: 'warning',
          position: findPosition(content, match.index),
          suggestion: '添加代码逻辑或添加注释说明为何为空'
        });
      }
      return issues;
    }
  },
  {
    id: 'max-nested-depth',
    name: '最大嵌套深度',
    description: '检测过深的代码嵌套',
    type: 'warning',
    category: 'performance',
    languages: allLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      let depth = 0;
      let maxDepth = 0;
      let maxDepthPos = 0;
      
      for (let i = 0; i < content.length; i++) {
        if (content[i] === '{') {
          depth++;
          if (depth > maxDepth) {
            maxDepth = depth;
            maxDepthPos = i;
          }
        } else if (content[i] === '}') {
          depth--;
        }
      }
      
      if (maxDepth > 5) {
        issues.push({
          message: `代码嵌套过深 (${maxDepth}层)，建议重构`,
          severity: 'warning',
          position: findPosition(content, maxDepthPos),
          suggestion: '考虑提取函数或使用卫语句减少嵌套'
        });
      }
      
      return issues;
    }
  },
  {
    id: 'todo-comment',
    name: '待办事项提醒',
    description: '检测TODO、FIXME等注释',
    type: 'info',
    category: 'best_practice',
    languages: allLanguages,
    check: (content: string): SyntaxIssue[] => {
      const issues: SyntaxIssue[] = [];
      const patterns = [
        { pattern: /TODO:?\s*(.+)/gi, message: '待办事项' },
        { pattern: /FIXME:?\s*(.+)/gi, message: '需要修复' },
        { pattern: /HACK:?\s*(.+)/gi, message: '临时方案' },
        { pattern: /XXX:?\s*(.+)/gi, message: '需要注意' },
        { pattern: /NOTE:?\s*(.+)/gi, message: '注意事项' }
      ];
      
      patterns.forEach(({ pattern, message }) => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          issues.push({
            message: `${message}: ${match[1].trim()}`,
            severity: 'info',
            position: findPosition(content, match.index)
          });
        }
      });
      
      return issues;
    }
  }
];

function findPosition(content: string, offset: number): Position {
  let line = 1;
  let column = 1;
  
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  
  return { line, column, offset };
}

export function getRulesForLanguage(language: ScriptLanguage): SyntaxRule[] {
  return basicRules.filter(rule => rule.languages.includes(language));
}
