import { BaseSyntaxChecker } from './types';
import { JavaScriptSyntaxChecker } from './javascript';
import { PythonSyntaxChecker } from './python';
import { basicRules } from './rules';
import type { SyntaxCheckResult, ScriptLanguage, SyntaxRule } from '@/types';

const checkerRegistry: Record<string, new () => BaseSyntaxChecker> = {
  javascript: JavaScriptSyntaxChecker,
  typescript: JavaScriptSyntaxChecker,
  python: PythonSyntaxChecker
};

export function checkSyntax(
  content: string,
  language: ScriptLanguage,
  customRules?: SyntaxRule[]
): SyntaxCheckResult {
  const startTime = performance.now();
  const rules = customRules || basicRules;
  
  const CheckerClass = checkerRegistry[language] || JavaScriptSyntaxChecker;
  const checker = new CheckerClass(rules);
  
  try {
    const result = checker.check(content);
    
    return {
      ...result,
      checkTime: Math.round((performance.now() - startTime) * 100) / 100
    };
  } catch (error) {
    return {
      issues: [{
        ruleId: 'internal-error',
        message: error instanceof Error ? error.message : 'Syntax check failed',
        severity: 'error',
        line: 1,
        column: 1,
        length: 0,
        category: 'internal',
        suggestion: undefined
      }],
      metrics: {
        complexity: 0,
        loc: content.split('\n').length,
        functions: 0,
        classes: 0,
        comments: 0,
        duplication: 0
      },
      checkTime: Math.round((performance.now() - startTime) * 100) / 100
    };
  }
}

export function getAvailableRules(): SyntaxRule[] {
  return basicRules;
}

export function getRulesByCategory(category: string): SyntaxRule[] {
  return basicRules.filter(r => r.category === category);
}

export function getRuleById(ruleId: string): SyntaxRule | undefined {
  return basicRules.find(r => r.id === ruleId);
}

export function formatCode(content: string, language: ScriptLanguage): string {
  const lines = content.split('\n');
  const formatted: string[] = [];
  let indentLevel = 0;
  const indentSize = 2;
  
  const increaseIndentPatterns = [/\{[^}]*$/, /\($/, /:\s*$/, /def\s+\w+\s*\(/, /class\s+\w+/, /if\s*\(.*\)\s*$/, /for\s*\(.*\)\s*$/, /while\s*\(.*\)\s*$/, /try\s*$/, /except\s*.*:/, /finally\s*:/, /else\s*:\s*$/, /elif\s*.*:\s*$/];
  
  const decreaseIndentPatterns = [/^\s*\}/, /^\s*\)/, /^\s*else\s*:/, /^\s*elif\s/, /^\s*except\s/, /^\s*finally\s*:/];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    if (line === '') {
      formatted.push('');
      continue;
    }
    
    if (decreaseIndentPatterns.some(p => p.test(line))) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    const indent = ' '.repeat(indentLevel * indentSize);
    formatted.push(indent + line);
    
    if (increaseIndentPatterns.some(p => p.test(line)) && !line.includes('}')) {
      indentLevel++;
    }
  }
  
  return formatted.join('\n');
}
