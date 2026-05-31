import { ProjectFile, ValidationResult, ValidationError, LanguageExtensions } from '../../shared/types';
import { getLanguageFromFileName } from '../../shared/utils';

interface ValidationRule {
  pattern: RegExp;
  message: string;
  severity: 'error' | 'warning';
  ruleId: string;
}

interface LanguageRules {
  [language: string]: ValidationRule[];
}

const commonRules: ValidationRule[] = [
  {
    pattern: /\s+$/,
    message: '行尾存在多余空白字符',
    severity: 'warning',
    ruleId: 'TRAILING_WHITESPACE',
  },
  {
    pattern: /^.{121,}$/m,
    message: '行长度超过120字符',
    severity: 'warning',
    ruleId: 'LINE_TOO_LONG',
  },
];

const javascriptRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /console\.(log|debug|info)\s*\(/,
    message: '不建议在生产代码中使用console.log',
    severity: 'warning',
    ruleId: 'JS_CONSOLE_LOG',
  },
  {
    pattern: /\bvar\s+\w+/,
    message: '建议使用let或const替代var',
    severity: 'warning',
    ruleId: 'JS_VAR_USAGE',
  },
  {
    pattern: /(?:^|[(!=<>])\s*==(?!=)/,
    message: '建议使用===进行严格相等比较',
    severity: 'warning',
    ruleId: 'JS_LOOSE_EQUALITY',
  },
  {
    pattern: /(?:^|[(!<>])\s*!=(?!=)/,
    message: '建议使用!==进行严格不等比较',
    severity: 'warning',
    ruleId: 'JS_LOOSE_INEQUALITY',
  },
  {
    pattern: /\beval\s*\(/,
    message: '不建议使用eval函数，存在安全风险',
    severity: 'error',
    ruleId: 'JS_EVAL_USAGE',
  },
];

const typescriptRules: ValidationRule[] = [
  ...javascriptRules,
  {
    pattern: /:\s*any\b/,
    message: '避免使用any类型，建议使用更具体的类型',
    severity: 'warning',
    ruleId: 'TS_ANY_TYPE',
  },
  {
    pattern: /@ts-ignore/,
    message: '不建议使用@ts-ignore忽略类型检查',
    severity: 'warning',
    ruleId: 'TS_IGNORE',
  },
  {
    pattern: /\bas\s+\w+/,
    message: '使用类型断言时请确保类型安全',
    severity: 'warning',
    ruleId: 'TS_TYPE_ASSERTION',
  },
];

const pythonRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /\beval\s*\(/,
    message: '不建议使用eval函数，存在安全风险',
    severity: 'error',
    ruleId: 'PY_EVAL_USAGE',
  },
  {
    pattern: /\bexec\s*\(/,
    message: '不建议使用exec函数，存在安全风险',
    severity: 'error',
    ruleId: 'PY_EXEC_USAGE',
  },
  {
    pattern: /except\s*:/,
    message: '建议指定具体的异常类型而非使用裸except',
    severity: 'warning',
    ruleId: 'PY_BARE_EXCEPT',
  },
  {
    pattern: /\bprint\s*\(/,
    message: '不建议在生产代码中使用print语句',
    severity: 'warning',
    ruleId: 'PY_PRINT_USAGE',
  },
];

const javaRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /System\.out\.print(ln)?\s*\(/,
    message: '不建议在生产代码中使用System.out.println',
    severity: 'warning',
    ruleId: 'JAVA_SYSTEM_OUT',
  },
  {
    pattern: /catch\s*\(\s*Exception\s+\w+\s*\)\s*\{\s*\}/,
    message: '空的catch块会隐藏错误',
    severity: 'error',
    ruleId: 'JAVA_EMPTY_CATCH',
  },
  {
    pattern: /@SuppressWarnings\s*\(\s*["']all["']\s*\)/,
    message: '不建议抑制所有警告',
    severity: 'warning',
    ruleId: 'JAVA_SUPPRESS_ALL',
  },
];

const cppRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /\busing\s+namespace\s+std\s*;/,
    message: '不建议使用using namespace std',
    severity: 'warning',
    ruleId: 'CPP_USING_NAMESPACE_STD',
  },
  {
    pattern: /\b(malloc|free|calloc|realloc)\s*\(/,
    message: '建议使用new/delete或智能指针替代C风格内存管理',
    severity: 'warning',
    ruleId: 'CPP_C_MEMORY',
  },
  {
    pattern: /\bprintf\s*\(/,
    message: '建议使用cout或fmt库替代printf',
    severity: 'warning',
    ruleId: 'CPP_PRINTF',
  },
  {
    pattern: /\bchar\s*\*\s*\w+\s*=\s*"[^"]+"/,
    message: '字符串字面量应为const char*',
    severity: 'error',
    ruleId: 'CPP_STRING_LITERAL',
  },
];

const htmlRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /on\w+\s*=\s*["'][^"']*javascript:/gi,
    message: '不建议使用javascript:伪协议',
    severity: 'error',
    ruleId: 'HTML_JS_PROTOCOL',
  },
];

const cssRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /!important/,
    message: '不建议使用!important',
    severity: 'warning',
    ruleId: 'CSS_IMPORTANT',
  },
  {
    pattern: /:\s*0(px|em|rem|%|pt)\b/g,
    message: '零值不需要单位',
    severity: 'warning',
    ruleId: 'CSS_ZERO_UNIT',
  },
];

const jsonRules: ValidationRule[] = [
  {
    pattern: /,\s*[\]}]/,
    message: 'JSON不允许尾随逗号',
    severity: 'error',
    ruleId: 'JSON_TRAILING_COMMA',
  },
];

const yamlRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /\t/,
    message: 'YAML不允许使用制表符',
    severity: 'error',
    ruleId: 'YAML_TAB',
  },
];

const sqlRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /DELETE\s+FROM\s+\w+\s*(?!WHERE)/i,
    message: 'DELETE语句缺少WHERE条件',
    severity: 'error',
    ruleId: 'SQL_DELETE_NO_WHERE',
  },
  {
    pattern: /DROP\s+TABLE/i,
    message: 'DROP TABLE操作请谨慎执行',
    severity: 'error',
    ruleId: 'SQL_DROP_TABLE',
  },
];

const shellRules: ValidationRule[] = [
  ...commonRules,
  {
    pattern: /\brm\s+-rf\s+[\/~]/,
    message: '危险操作：递归删除根目录',
    severity: 'error',
    ruleId: 'SHELL_DANGEROUS_RM',
  },
  {
    pattern: /curl\s+.*\|\s*bash/i,
    message: '通过管道执行远程脚本存在安全风险',
    severity: 'error',
    ruleId: 'SHELL_PIPE_BASH',
  },
];

const languageRules: LanguageRules = {
  javascript: javascriptRules,
  typescript: typescriptRules,
  python: pythonRules,
  java: javaRules,
  cpp: cppRules,
  c: cppRules,
  csharp: commonRules,
  go: commonRules,
  rust: commonRules,
  html: htmlRules,
  css: cssRules,
  scss: cssRules,
  json: jsonRules,
  yaml: yamlRules,
  markdown: [],
  sql: sqlRules,
  shell: shellRules,
  bat: shellRules,
  plaintext: [],
};

export class SyntaxValidator {
  private static instance: SyntaxValidator;

  public static getInstance(): SyntaxValidator {
    if (!SyntaxValidator.instance) {
      SyntaxValidator.instance = new SyntaxValidator();
    }
    return SyntaxValidator.instance;
  }

  public validateFile(file: ProjectFile): ValidationResult {
    const language = file.language || getLanguageFromFileName(file.name);
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (language === 'json' && file.content.trim().length > 0) {
      try {
        JSON.parse(file.content);
      } catch (e) {
        const errMsg = (e as Error).message;
        let line = 1;
        let column = 1;

        const posMatch = errMsg.match(/position\s+(\d+)/i);
        if (posMatch) {
          const position = parseInt(posMatch[1]);
          const beforeError = file.content.substring(0, position);
          const lines = beforeError.split('\n');
          line = lines.length;
          column = lines[lines.length - 1].length + 1;
        } else {
          const lineMatch = errMsg.match(/line\s+(\d+)/i);
          if (lineMatch) {
            line = parseInt(lineMatch[1]);
          }
        }

        errors.push({
          line,
          column,
          message: 'JSON语法错误: ' + errMsg,
          severity: 'error',
          ruleId: 'JSON_SYNTAX',
        });
      }
    }

    const rules = languageRules[language];
    if (!rules || rules.length === 0) {
      return {
        fileId: file.id,
        filePath: file.path,
        isValid: errors.length === 0,
        errors,
        warnings,
        timestamp: Date.now(),
      };
    }

    const lines = file.content.split('\n');

    lines.forEach((line, lineIndex) => {
      rules.forEach(rule => {
        try {
          const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
          let match;
          const safetyLimit = 100;
          let matchCount = 0;
          while ((match = regex.exec(line)) !== null && matchCount < safetyLimit) {
            matchCount++;
            const error: ValidationError = {
              line: lineIndex + 1,
              column: match.index + 1,
              message: rule.message,
              severity: rule.severity,
              ruleId: rule.ruleId,
            };

            if (rule.severity === 'error') {
              errors.push(error);
            } else {
              warnings.push(error);
            }

            if (!rule.pattern.flags.includes('g')) break;
            if (match.index === regex.lastIndex) {
              regex.lastIndex++;
            }
          }
        } catch {
          // skip invalid regex
        }
      });
    });

    return {
      fileId: file.id,
      filePath: file.path,
      isValid: errors.length === 0,
      errors,
      warnings,
      timestamp: Date.now(),
    };
  }

  public validateProject(files: ProjectFile[]): ValidationResult[] {
    return files.map(file => this.validateFile(file));
  }

  public getSupportedLanguages(): string[] {
    return Object.keys(LanguageExtensions);
  }

  public getRulesForLanguage(language: string): ValidationRule[] {
    return languageRules[language] || [];
  }
}
