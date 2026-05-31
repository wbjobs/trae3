import { BaseParser } from './types';
import { JavaScriptParser } from './javascript';
import { PythonParser } from './python';
import type { ParseResult, ScriptLanguage } from '@/types';

const parserRegistry: Record<string, new () => BaseParser> = {
  javascript: JavaScriptParser,
  typescript: JavaScriptParser,
  python: PythonParser
};

export function parseScript(content: string, language: ScriptLanguage): ParseResult {
  const startTime = performance.now();
  
  const ParserClass = parserRegistry[language] || JavaScriptParser;
  const parser = new ParserClass();
  
  try {
    const tokens = parser.tokenize(content);
    const ast = parser.parse(content);
    const errors = parser.getErrors();
    
    return {
      language,
      tokens,
      ast: ast || undefined,
      errors,
      parseTime: Math.round((performance.now() - startTime) * 100) / 100
    };
  } catch (error) {
    return {
      language,
      tokens: [],
      errors: [{
        message: error instanceof Error ? error.message : 'Parse failed',
        line: 1,
        column: 1,
        length: 0
      }],
      parseTime: Math.round((performance.now() - startTime) * 100) / 100
    };
  }
}

export function tokenizeScript(content: string, language: ScriptLanguage) {
  const ParserClass = parserRegistry[language] || JavaScriptParser;
  const parser = new ParserClass();
  return parser.tokenize(content);
}

export function getSupportedLanguages(): ScriptLanguage[] {
  return ['javascript', 'typescript', 'python', 'rust', 'go', 'bash', 'powershell', 'sql', 'json', 'yaml'];
}

export function isLanguageSupported(language: string): boolean {
  return language in parserRegistry || ['rust', 'go', 'bash', 'powershell', 'sql', 'json', 'yaml'].includes(language);
}
