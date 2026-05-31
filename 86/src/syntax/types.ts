import type { ScriptLanguage, SyntaxCheckResult, ParseError, Suggestion, Position } from '@/types';

export interface LanguageSyntaxChecker {
  check(content: string): SyntaxCheckResult;
}

export interface SyntaxRule {
  id: string;
  name: string;
  description: string;
  type: 'error' | 'warning' | 'info';
  category: 'syntax' | 'style' | 'performance' | 'security' | 'best_practice';
  languages: ScriptLanguage[];
  check: (content: string, tokens: any[]) => SyntaxIssue[];
}

export interface SyntaxIssue {
  message: string;
  severity: 'error' | 'warning' | 'info';
  position: Position;
  ruleId?: string;
  suggestion?: string;
}

export abstract class BaseSyntaxChecker implements LanguageSyntaxChecker {
  protected abstract rules: SyntaxRule[];
  protected abstract language: ScriptLanguage;

  abstract check(content: string): SyntaxCheckResult;

  protected createPosition(line: number, column: number, offset: number = 0): Position {
    return { line, column, offset };
  }

  protected createError(
    message: string,
    position: Position,
    severity: 'error' | 'warning' | 'info' = 'error',
    code?: string
  ): ParseError {
    return {
      message,
      severity,
      position,
      code
    };
  }

  protected createSuggestion(
    message: string,
    type: Suggestion['type'],
    position: Position
  ): Suggestion {
    return {
      message,
      type,
      position
    };
  }

  protected findLineAndColumn(content: string, offset: number): Position {
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

  protected checkBasicRules(content: string): ParseError[] {
    const errors: ParseError[] = [];
    const lines = content.split('\n');
    
    lines.forEach((line, index) => {
      if (line.length > 120) {
        errors.push(this.createError(
          `行长度超过120字符 (${line.length})`,
          this.createPosition(index + 1, 121),
          'warning',
          'LINE_TOO_LONG'
        ));
      }
      
      if (line.endsWith(' ')) {
        errors.push(this.createError(
          '行尾存在多余空格',
          this.createPosition(index + 1, line.length),
          'warning',
          'TRAILING_WHITESPACE'
        ));
      }
      
      if (line.includes('\t')) {
        errors.push(this.createError(
          '使用制表符而不是空格',
          this.createPosition(index + 1, line.indexOf('\t') + 1),
          'warning',
          'TAB_USED'
        ));
      }
    });
    
    if (!content.endsWith('\n') && content.length > 0) {
      errors.push(this.createError(
        '文件末尾缺少换行符',
        this.findLineAndColumn(content, content.length - 1),
        'info',
        'NO_NEWLINE_AT_END'
      ));
    }
    
    return errors;
  }

  protected checkCommonPatterns(content: string): ParseError[] {
    const errors: ParseError[] = [];
    
    const debugPatterns = [
      { pattern: /console\.(log|debug|warn|error)/g, message: '调试代码', code: 'DEBUG_CODE' },
      { pattern: /print\s*\(/g, message: '调试代码', code: 'DEBUG_CODE' },
      { pattern: /debugger;/g, message: 'debugger语句', code: 'DEBUGGER_STATEMENT' },
      { pattern: /TODO|FIXME|HACK/g, message: '待处理标记', code: 'TODO_COMMENT' }
    ];
    
    debugPatterns.forEach(({ pattern, message, code }) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const pos = this.findLineAndColumn(content, match.index);
        errors.push(this.createError(message, pos, 'info', code));
      }
    });
    
    return errors;
  }
}
