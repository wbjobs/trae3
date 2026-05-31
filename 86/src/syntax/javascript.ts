import { BaseSyntaxChecker } from './types';
import type { SyntaxIssue, SyntaxRule } from '@/types';

export class JavaScriptSyntaxChecker extends BaseSyntaxChecker {
  constructor(rules: SyntaxRule[] = []) {
    super(rules);
  }

  check(content: string) {
    const issues: SyntaxIssue[] = [];
    const lines = content.split('\n');
    
    let bracketStack: Array<{ type: string; line: number; column: number }> = [];
    let inString: string | null = null;
    let inComment = false;
    let functionCount = 0;
    let commentCount = 0;
    let complexity = 1;
    let maxNesting = 0;
    let currentNesting = 0;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      let lineNum = lineIdx + 1;
      
      let i = 0;
      while (i < line.length) {
        const char = line[i];
        const col = i + 1;
        
        if (inComment) {
          if (line.slice(i).includes('*/')) {
            inComment = false;
            i = line.indexOf('*/', i) + 2;
            continue;
          }
          i++;
          continue;
        }
        
        if (inString) {
          if (char === inString && line[i - 1] !== '\\') {
            inString = null;
          }
          i++;
          continue;
        }
        
        if (char === '/' && line[i + 1] === '/') {
          commentCount++;
          break;
        }
        
        if (char === '/' && line[i + 1] === '*') {
          commentCount++;
          inComment = true;
          i += 2;
          continue;
        }
        
        if (char === '"' || char === "'" || char === '`') {
          inString = char;
          i++;
          continue;
        }
        
        if (char === '(' || char === '{' || char === '[') {
          bracketStack.push({ type: char, line: lineNum, column: col });
          currentNesting++;
          maxNesting = Math.max(maxNesting, currentNesting);
          
          if (currentNesting > 5) {
            issues.push({
              ruleId: 'max-nested-depth',
              message: `嵌套深度超过5层`,
              severity: 'warning',
              line: lineNum,
              column: col,
              length: 1,
              category: 'performance',
              suggestion: '考虑重构减少嵌套'
            });
          }
          
          if (char === '{' && /(if|for|while|switch|catch)\s*\(/.test(line.slice(Math.max(0, i - 20), i))) {
            complexity++;
          }
        }
        
        if (char === ')' || char === '}' || char === ']') {
          const matching = char === ')' ? '(' : char === '}' ? '{' : '[';
          const last = bracketStack.pop();
          
          if (!last || last.type !== matching) {
            issues.push({
              ruleId: 'bracket-mismatch',
              message: `不匹配的${char}`,
              severity: 'error',
              line: lineNum,
              column: col,
              length: 1,
              category: 'syntax',
              suggestion: '检查括号是否匹配'
            });
          } else {
            currentNesting--;
          }
        }
        
        i++;
      }
      
      if (/function\s+\w+/.test(line) || /const\s+\w+\s*=\s*(async\s+)?\(/.test(line) || /\w+\s*:\s*(async\s+)?\(/.test(line)) {
        functionCount++;
      }
      
      this.rules.forEach(rule => {
        if (rule.pattern && new RegExp(rule.pattern).test(line)) {
          const match = line.match(new RegExp(rule.pattern));
          issues.push({
            ruleId: rule.id,
            message: rule.message,
            severity: rule.severity,
            line: lineNum,
            column: match ? match.index! + 1 : 1,
            length: match ? match[0].length : line.length,
            category: rule.category,
            suggestion: rule.suggestion
          });
        }
      });
      
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          ruleId: 'no-eval',
          message: '避免使用eval函数',
          severity: 'error',
          line: lineNum,
          column: line.indexOf('eval') + 1,
          length: 4,
          category: 'security',
          suggestion: '使用JSON.parse或其他安全方法替代'
        });
      }
      
      if (/(password|secret|api_key|apikey|token)\s*[=:]\s*["'][^"']+["']/i.test(line)) {
        const match = line.match(/(password|secret|api_key|apikey|token)\s*[=:]\s*["'][^"']+["']/i);
        issues.push({
          ruleId: 'no-hardcoded-secrets',
          message: '检测到硬编码密钥',
          severity: 'error',
          line: lineNum,
          column: match ? match.index! + 1 : 1,
          length: match ? match[0].length : 0,
          category: 'security',
          suggestion: '使用环境变量或配置文件存储密钥'
        });
      }
      
      if (/(\.query|\.execute|\.exec)\s*\(\s*`[^`]*\$\{/.test(line) || /(\.query|\.execute|\.exec)\s*\(\s*["'][^"']*\+/.test(line)) {
        const match = line.match(/(\.query|\.execute|\.exec)\s*\(/);
        issues.push({
          ruleId: 'sql-injection-risk',
          message: '检测到SQL注入风险',
          severity: 'error',
          line: lineNum,
          column: match ? match.index! + 1 : 1,
          length: match ? match[0].length : 0,
          category: 'security',
          suggestion: '使用参数化查询替代字符串拼接'
        });
      }
      
      if (line.length > 120) {
        issues.push({
          ruleId: 'max-line-length',
          message: '行长度超过120字符',
          severity: 'warning',
          line: lineNum,
          column: 121,
          length: line.length - 120,
          category: 'style',
          suggestion: '考虑换行'
        });
      }
    }
    
    bracketStack.forEach(unclosed => {
      issues.push({
        ruleId: 'unclosed-bracket',
        message: `未闭合的${unclosed.type}`,
        severity: 'error',
        line: unclosed.line,
        column: unclosed.column,
        length: 1,
        category: 'syntax',
        suggestion: '添加闭合括号'
      });
    });
    
    const variableDeclarations = new Map<string, number>();
    const variableUsages = new Set<string>();
    
    lines.forEach((line, idx) => {
      const varMatches = line.matchAll(/(?:const|let|var)\s+(\w+)/g);
      for (const match of varMatches) {
        variableDeclarations.set(match[1], idx + 1);
      }
      
      const idMatches = line.matchAll(/\b(\w+)\b/g);
      for (const match of idMatches) {
        variableUsages.add(match[1]);
      }
    });
    
    variableDeclarations.forEach((lineNum, name) => {
      if (!variableUsages.has(name) || (line.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length <= 1) {
        const line = lines[lineNum - 1];
        if (line && new RegExp(`\\b${name}\\b`).test(line)) {
          const count = (line.match(new RegExp(`\\b${name}\\b`, 'g')) || []).length;
          if (count === 1) {
            issues.push({
              ruleId: 'no-unused-vars',
              message: `变量 ${name} 已声明但未使用`,
              severity: 'warning',
              line: lineNum,
              column: line.indexOf(name) + 1,
              length: name.length,
              category: 'best-practice',
              suggestion: '删除未使用的变量'
            });
          }
        }
      }
    });
    
    return {
      issues,
      metrics: {
        complexity,
        loc: lines.length,
        functions: functionCount,
        classes: (content.match(/\bclass\s+\w+/g) || []).length,
        comments: commentCount,
        duplication: this.calculateDuplication(content)
      }
    };
  }
}
