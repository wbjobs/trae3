import { BaseSyntaxChecker } from './types';
import type { SyntaxIssue, SyntaxRule } from '@/types';

export class PythonSyntaxChecker extends BaseSyntaxChecker {
  constructor(rules: SyntaxRule[] = []) {
    super(rules);
  }

  check(content: string) {
    const issues: SyntaxIssue[] = [];
    const lines = content.split('\n');
    
    let bracketStack: Array<{ type: string; line: number; column: number }> = [];
    let inString: string | null = null;
    let inTripleQuotes: string | null = null;
    let functionCount = 0;
    let classCount = 0;
    let commentCount = 0;
    let complexity = 1;
    let currentIndent = 0;
    let indentStack: number[] = [0];
    let maxNesting = 0;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineNum = lineIdx + 1;
      
      if (line.trim() === '') continue;
      
      const leadingSpaces = line.match(/^[ \t]*/)?.[0]?.length || 0;
      
      if (line.trim().startsWith('#')) {
        commentCount++;
        continue;
      }
      
      let i = 0;
      while (i < line.length) {
        const char = line[i];
        const col = i + 1;
        
        if (inTripleQuotes) {
          if (line.slice(i).includes(inTripleQuotes)) {
            i = line.indexOf(inTripleQuotes, i) + 3;
            inTripleQuotes = null;
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
        
        if ((char === '"' && line.slice(i, i + 3) === '"""') || 
            (char === "'" && line.slice(i, i + 3) === "'''")) {
          inTripleQuotes = char.repeat(3);
          commentCount++;
          i += 3;
          continue;
        }
        
        if (char === '"' || char === "'") {
          inString = char;
          i++;
          continue;
        }
        
        if (char === '#' && !inString && !inTripleQuotes) {
          commentCount++;
          break;
        }
        
        if (char === '(' || char === '[' || char === '{') {
          bracketStack.push({ type: char, line: lineNum, column: col });
          maxNesting = Math.max(maxNesting, bracketStack.length);
          
          if (bracketStack.length > 5) {
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
          
          if (/^(if|elif|for|while|with|try|except)\s+/.test(line.trim())) {
            complexity++;
          }
        }
        
        if (char === ')' || char === ']' || char === '}') {
          const matching = char === ')' ? '(' : char === ']' ? '[' : '{';
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
          }
        }
        
        i++;
      }
      
      if (line.trim().startsWith('def ')) {
        functionCount++;
      }
      
      if (line.trim().startsWith('class ')) {
        classCount++;
      }
      
      if (line.trim().match(/^(if|elif|for|while|with|try|except|def|class)\s+.*:$/) || 
          (line.trim().endsWith(':') && !line.trim().endsWith('::'))) {
        indentStack.push(currentIndent);
      }
      
      if (leadingSpaces < currentIndent) {
        while (indentStack.length > 0 && indentStack[indentStack.length - 1] > leadingSpaces) {
          indentStack.pop();
        }
      }
      currentIndent = leadingSpaces;
      
      if (/[ \t]/.test(line.trimLeft()[0] || '') && line.trimLeft().startsWith('\t')) {
        if (line.trimLeft().startsWith(' ') && line.trimLeft().includes('\t')) {
          issues.push({
            ruleId: 'mixed-indentation',
            message: '混合使用空格和制表符',
            severity: 'error',
            line: lineNum,
            column: 1,
            length: line.length,
            category: 'style',
            suggestion: '统一使用4个空格缩进'
          });
        }
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
      
      if (/eval\s*\(/.test(line)) {
        issues.push({
          ruleId: 'no-eval',
          message: '避免使用eval函数',
          severity: 'error',
          line: lineNum,
          column: line.indexOf('eval') + 1,
          length: 4,
          category: 'security',
          suggestion: '使用ast.literal_eval或其他安全方法替代'
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
      
      if (line.length > 120) {
        issues.push({
          ruleId: 'max-line-length',
          message: '行长度超过120字符',
          severity: 'warning',
          line: lineNum,
          column: 121,
          length: line.length - 120,
          category: 'style',
          suggestion: '使用反斜杠或括号换行'
        });
      }
      
      if (/\bprint\s*\(/.test(line) && lineIdx < lines.length - 1) {
        issues.push({
          ruleId: 'avoid-print',
          message: '建议使用logging替代print',
          severity: 'info',
          line: lineNum,
          column: line.indexOf('print') + 1,
          length: 5,
          category: 'best-practice',
          suggestion: '使用logging模块进行输出'
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
    
    return {
      issues,
      metrics: {
        complexity,
        loc: lines.length,
        functions: functionCount,
        classes: classCount,
        comments: commentCount,
        duplication: this.calculateDuplication(content)
      }
    };
  }
}
