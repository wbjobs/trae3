import type { Position, Token, ASTNode, ParseError, ParseResult } from '@/types';

export interface ParserState {
  source: string;
  position: number;
  line: number;
  column: number;
  tokens: Token[];
  errors: ParseError[];
}

export interface LanguageParser {
  parse(content: string): ParseResult;
  tokenize(content: string): Token[];
}

export abstract class BaseParser implements LanguageParser {
  protected state: ParserState = {
    source: '',
    position: 0,
    line: 1,
    column: 1,
    tokens: [],
    errors: []
  };

  abstract parse(content: string): ParseResult;
  abstract tokenize(content: string): Token[];

  protected init(content: string): void {
    this.state = {
      source: content,
      position: 0,
      line: 1,
      column: 1,
      tokens: [],
      errors: []
    };
  }

  protected peek(offset: number = 0): string {
    return this.state.source[this.state.position + offset] || '';
  }

  protected advance(): string {
    const char = this.state.source[this.state.position];
    this.state.position++;
    if (char === '\n') {
      this.state.line++;
      this.state.column = 1;
    } else {
      this.state.column++;
    }
    return char;
  }

  protected skipWhitespace(): void {
    while (this.state.position < this.state.source.length) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        this.advance();
      } else {
        break;
      }
    }
  }

  protected getCurrentPosition(): Position {
    return {
      line: this.state.line,
      column: this.state.column,
      offset: this.state.position
    };
  }

  protected addError(
    message: string,
    severity: 'error' | 'warning' | 'info' = 'error',
    code?: string
  ): void {
    this.state.errors.push({
      message,
      severity,
      position: this.getCurrentPosition(),
      code
    });
  }

  protected addToken(type: string, value: string, position: Position): void {
    this.state.tokens.push({
      type,
      value,
      position
    });
  }

  protected createNode(
    type: string,
    start: number,
    end: number,
    name?: string,
    value?: string,
    children?: ASTNode[]
  ): ASTNode {
    return {
      type,
      name,
      start,
      end,
      value,
      children
    };
  }

  protected matchKeyword(keyword: string): boolean {
    const slice = this.state.source.slice(
      this.state.position,
      this.state.position + keyword.length
    );
    if (slice === keyword) {
      const nextChar = this.state.source[this.state.position + keyword.length];
      if (!nextChar || !/[a-zA-Z0-9_]/.test(nextChar)) {
        return true;
      }
    }
    return false;
  }

  protected readIdentifier(): string {
    let result = '';
    while (this.state.position < this.state.source.length) {
      const char = this.peek();
      if (/[a-zA-Z0-9_]/.test(char)) {
        result += this.advance();
      } else {
        break;
      }
    }
    return result;
  }

  protected readNumber(): string {
    let result = '';
    let hasDot = false;
    while (this.state.position < this.state.source.length) {
      const char = this.peek();
      if (/[0-9]/.test(char)) {
        result += this.advance();
      } else if (char === '.' && !hasDot) {
        hasDot = true;
        result += this.advance();
      } else {
        break;
      }
    }
    return result;
  }

  protected readString(quote: string): string {
    let result = '';
    this.advance();
    while (this.state.position < this.state.source.length) {
      const char = this.advance();
      if (char === '\\') {
        const nextChar = this.advance();
        result += '\\' + nextChar;
      } else if (char === quote) {
        break;
      } else {
        result += char;
      }
    }
    return result;
  }
}
