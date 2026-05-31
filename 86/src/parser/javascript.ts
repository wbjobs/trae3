import { BaseParser } from './types';
import type { ParseResult, ASTNode, Token } from '@/types';

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'new',
  'this', 'super', 'import', 'export', 'default', 'from', 'async', 'await',
  'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of',
  'true', 'false', 'null', 'undefined', 'void', 'delete'
]);

export class JavaScriptParser extends BaseParser {
  parse(content: string): ParseResult {
    this.init(content);
    const ast = this.parseProgram();
    return {
      success: this.state.errors.length === 0,
      ast,
      errors: this.state.errors,
      tokens: this.state.tokens
    };
  }

  tokenize(content: string): Token[] {
    this.init(content);
    while (this.state.position < this.state.source.length) {
      this.skipWhitespace();
      if (this.state.position >= this.state.source.length) break;
      this.readNextToken();
    }
    return this.state.tokens;
  }

  private parseProgram(): ASTNode {
    const start = this.state.position;
    const children: ASTNode[] = [];
    
    while (this.state.position < this.state.source.length) {
      this.skipWhitespace();
      if (this.state.position >= this.state.source.length) break;
      const stmt = this.parseStatement();
      if (stmt) children.push(stmt);
    }
    
    return this.createNode('Program', start, this.state.position, undefined, undefined, children);
  }

  private parseStatement(): ASTNode | null {
    const start = this.state.position;
    this.skipWhitespace();
    
    if (this.matchKeyword('const') || this.matchKeyword('let') || this.matchKeyword('var')) {
      return this.parseVariableDeclaration(start);
    }
    
    if (this.matchKeyword('function')) {
      return this.parseFunctionDeclaration(start);
    }
    
    if (this.matchKeyword('return')) {
      return this.parseReturnStatement(start);
    }
    
    if (this.matchKeyword('if')) {
      return this.parseIfStatement(start);
    }
    
    if (this.matchKeyword('for') || this.matchKeyword('while')) {
      return this.parseLoopStatement(start);
    }
    
    if (this.peek() === '{') {
      return this.parseBlock(start);
    }
    
    return this.parseExpressionStatement(start);
  }

  private parseVariableDeclaration(start: number): ASTNode {
    const kind = this.readIdentifier();
    const pos = this.getCurrentPosition();
    this.addToken('Keyword', kind, pos);
    this.skipWhitespace();
    
    const name = this.readIdentifier();
    this.addToken('Identifier', name, this.getCurrentPosition());
    this.skipWhitespace();
    
    let init: ASTNode | undefined;
    if (this.peek() === '=') {
      this.advance();
      this.addToken('Punctuator', '=', this.getCurrentPosition());
      this.skipWhitespace();
      init = this.parseExpression();
    }
    
    if (this.peek() === ';') {
      this.advance();
    }
    
    return this.createNode(
      'VariableDeclaration',
      start,
      this.state.position,
      name,
      kind,
      init ? [init] : undefined
    );
  }

  private parseFunctionDeclaration(start: number): ASTNode {
    this.advanceKeyword('function');
    this.skipWhitespace();
    
    const name = this.readIdentifier();
    this.addToken('Identifier', name, this.getCurrentPosition());
    this.skipWhitespace();
    
    this.expect('(');
    this.skipWhitespace();
    
    const params: ASTNode[] = [];
    while (this.peek() !== ')') {
      const paramName = this.readIdentifier();
      params.push(this.createNode('Parameter', this.state.position - paramName.length, this.state.position, paramName));
      this.addToken('Identifier', paramName, this.getCurrentPosition());
      this.skipWhitespace();
      if (this.peek() === ',') {
        this.advance();
        this.skipWhitespace();
      }
    }
    
    this.expect(')');
    this.skipWhitespace();
    
    const body = this.parseBlock(this.state.position);
    
    return this.createNode(
      'FunctionDeclaration',
      start,
      this.state.position,
      name,
      undefined,
      [...params, body]
    );
  }

  private parseReturnStatement(start: number): ASTNode {
    this.advanceKeyword('return');
    this.skipWhitespace();
    
    let arg: ASTNode | undefined;
    if (this.peek() !== ';' && this.peek() !== '}') {
      arg = this.parseExpression();
    }
    
    if (this.peek() === ';') {
      this.advance();
    }
    
    return this.createNode(
      'ReturnStatement',
      start,
      this.state.position,
      undefined,
      undefined,
      arg ? [arg] : undefined
    );
  }

  private parseIfStatement(start: number): ASTNode {
    this.advanceKeyword('if');
    this.skipWhitespace();
    
    this.expect('(');
    this.skipWhitespace();
    const test = this.parseExpression();
    this.skipWhitespace();
    this.expect(')');
    this.skipWhitespace();
    
    const consequent = this.parseStatement()!;
    let alternate: ASTNode | undefined;
    
    this.skipWhitespace();
    if (this.matchKeyword('else')) {
      this.advanceKeyword('else');
      this.skipWhitespace();
      alternate = this.parseStatement()!;
    }
    
    return this.createNode(
      'IfStatement',
      start,
      this.state.position,
      undefined,
      undefined,
      alternate ? [test, consequent, alternate] : [test, consequent]
    );
  }

  private parseLoopStatement(start: number): ASTNode {
    const kind = this.peek() === 'f' ? 'for' : 'while';
    this.advanceKeyword(kind);
    this.skipWhitespace();
    
    this.expect('(');
    this.skipWhitespace();
    
    const test = this.parseExpression();
    this.skipWhitespace();
    this.expect(')');
    this.skipWhitespace();
    
    const body = this.parseStatement()!;
    
    return this.createNode(
      kind === 'for' ? 'ForStatement' : 'WhileStatement',
      start,
      this.state.position,
      undefined,
      undefined,
      [test, body]
    );
  }

  private parseBlock(start: number): ASTNode {
    this.expect('{');
    const children: ASTNode[] = [];
    
    while (this.peek() !== '}' && this.state.position < this.state.source.length) {
      const stmt = this.parseStatement();
      if (stmt) children.push(stmt);
    }
    
    this.expect('}');
    
    return this.createNode(
      'BlockStatement',
      start,
      this.state.position,
      undefined,
      undefined,
      children
    );
  }

  private parseExpressionStatement(start: number): ASTNode {
    const expr = this.parseExpression();
    if (this.peek() === ';') {
      this.advance();
    }
    return this.createNode(
      'ExpressionStatement',
      start,
      this.state.position,
      undefined,
      undefined,
      [expr]
    );
  }

  private parseExpression(): ASTNode {
    return this.parseAssignment();
  }

  private parseAssignment(): ASTNode {
    const left = this.parseBinary();
    this.skipWhitespace();
    
    if (this.peek() === '=') {
      const start = left.start;
      this.advance();
      this.addToken('Punctuator', '=', this.getCurrentPosition());
      this.skipWhitespace();
      const right = this.parseAssignment();
      return this.createNode('AssignmentExpression', start, this.state.position, undefined, '=', [left, right]);
    }
    
    return left;
  }

  private parseBinary(): ASTNode {
    let left = this.parseUnary();
    this.skipWhitespace();
    
    while (['+', '-', '*', '/', '%', '===', '!==', '==', '!=', '<', '>', '<=', '>=', '&&', '||'].includes(this.peekBinaryOp())) {
      const start = left.start;
      const op = this.readBinaryOp();
      this.addToken('Punctuator', op, this.getCurrentPosition());
      this.skipWhitespace();
      const right = this.parseUnary();
      left = this.createNode('BinaryExpression', start, this.state.position, undefined, op, [left, right]);
      this.skipWhitespace();
    }
    
    return left;
  }

  private parseUnary(): ASTNode {
    if (['+', '-', '!', '~'].includes(this.peek())) {
      const start = this.state.position;
      const op = this.advance();
      this.addToken('Punctuator', op, this.getCurrentPosition());
      this.skipWhitespace();
      const arg = this.parseUnary();
      return this.createNode('UnaryExpression', start, this.state.position, undefined, op, [arg]);
    }
    return this.parseCall();
  }

  private parseCall(): ASTNode {
    let callee = this.parsePrimary();
    this.skipWhitespace();
    
    while (this.peek() === '(' || this.peek() === '.') {
      const start = callee.start;
      if (this.peek() === '(') {
        this.advance();
        this.skipWhitespace();
        
        const args: ASTNode[] = [];
        while (this.peek() !== ')') {
          args.push(this.parseExpression());
          this.skipWhitespace();
          if (this.peek() === ',') {
            this.advance();
            this.skipWhitespace();
          }
        }
        
        this.expect(')');
        callee = this.createNode('CallExpression', start, this.state.position, undefined, undefined, [callee, ...args]);
      } else {
        this.advance();
        const prop = this.readIdentifier();
        this.addToken('Identifier', prop, this.getCurrentPosition());
        callee = this.createNode('MemberExpression', start, this.state.position, prop, undefined, [callee]);
      }
      this.skipWhitespace();
    }
    
    return callee;
  }

  private parsePrimary(): ASTNode {
    const start = this.state.position;
    this.skipWhitespace();
    
    if (this.peek() === '(') {
      this.advance();
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }
    
    if (this.peek() === '"' || this.peek() === "'") {
      const quote = this.peek();
      const pos = this.getCurrentPosition();
      const value = this.readString(quote);
      this.addToken('String', value, pos);
      return this.createNode('Literal', start, this.state.position, undefined, value);
    }
    
    if (this.peek() === '`') {
      this.advance();
      let value = '';
      while (this.peek() !== '`' && this.state.position < this.state.source.length) {
        value += this.advance();
      }
      this.advance();
      this.addToken('TemplateLiteral', value, this.getCurrentPosition());
      return this.createNode('TemplateLiteral', start, this.state.position, undefined, value);
    }
    
    if (/[0-9]/.test(this.peek())) {
      const pos = this.getCurrentPosition();
      const value = this.readNumber();
      this.addToken('Number', value, pos);
      return this.createNode('Literal', start, this.state.position, undefined, value);
    }
    
    if (this.matchKeyword('true') || this.matchKeyword('false') || this.matchKeyword('null') || this.matchKeyword('undefined')) {
      const pos = this.getCurrentPosition();
      const value = this.readIdentifier();
      this.addToken('Keyword', value, pos);
      return this.createNode('Literal', start, this.state.position, undefined, value);
    }
    
    if (/[a-zA-Z_]/.test(this.peek())) {
      const pos = this.getCurrentPosition();
      const name = this.readIdentifier();
      const tokenType = KEYWORDS.has(name) ? 'Keyword' : 'Identifier';
      this.addToken(tokenType, name, pos);
      return this.createNode('Identifier', start, this.state.position, name);
    }
    
    this.addError(`Unexpected character: ${this.peek()}`);
    this.advance();
    return this.createNode('Unknown', start, this.state.position);
  }

  private readNextToken(): void {
    const start = this.state.position;
    const pos = this.getCurrentPosition();
    const char = this.peek();
    
    if (char === '/' && this.peek(1) === '/') {
      while (this.peek() !== '\n' && this.state.position < this.state.source.length) {
        this.advance();
      }
      return;
    }
    
    if (char === '/' && this.peek(1) === '*') {
      this.advance();
      this.advance();
      while (!(this.peek() === '*' && this.peek(1) === '/') && this.state.position < this.state.source.length) {
        this.advance();
      }
      this.advance();
      this.advance();
      return;
    }
    
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      const value = this.readString(quote);
      this.addToken(quote === '`' ? 'TemplateLiteral' : 'String', value, pos);
      return;
    }
    
    if (/[0-9]/.test(char)) {
      const value = this.readNumber();
      this.addToken('Number', value, pos);
      return;
    }
    
    if (/[a-zA-Z_]/.test(char)) {
      const value = this.readIdentifier();
      const tokenType = KEYWORDS.has(value) ? 'Keyword' : 'Identifier';
      this.addToken(tokenType, value, pos);
      return;
    }
    
    if (['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|'].includes(char)) {
      const op = this.readBinaryOp();
      this.addToken('Punctuator', op, pos);
      return;
    }
    
    if (['(', ')', '{', '}', '[', ']', ';', ',', '.', ':'].includes(char)) {
      this.advance();
      this.addToken('Punctuator', char, pos);
      return;
    }
    
    this.advance();
    this.addToken('Unknown', char, pos);
  }

  private readBinaryOp(): string {
    const char = this.advance();
    if ((char === '=' && this.peek() === '=') ||
        (char === '!' && this.peek() === '=') ||
        (char === '<' && this.peek() === '=') ||
        (char === '>' && this.peek() === '=') ||
        (char === '&' && this.peek() === '&') ||
        (char === '|' && this.peek() === '|')) {
      return char + this.advance();
    }
    if ((char === '=' && this.peek() === '=' && this.peek(1) === '=') ||
        (char === '!' && this.peek() === '=' && this.peek(1) === '=')) {
      return char + this.advance() + this.advance();
    }
    return char;
  }

  private peekBinaryOp(): string {
    const pos = this.state.position;
    const char = this.state.source[pos];
    if (!char) return '';
    if ((char === '=' && this.state.source[pos + 1] === '=') ||
        (char === '!' && this.state.source[pos + 1] === '=') ||
        (char === '<' && this.state.source[pos + 1] === '=') ||
        (char === '>' && this.state.source[pos + 1] === '=') ||
        (char === '&' && this.state.source[pos + 1] === '&') ||
        (char === '|' && this.state.source[pos + 1] === '|')) {
      return char + this.state.source[pos + 1];
    }
    if ((char === '=' && this.state.source[pos + 1] === '=' && this.state.source[pos + 2] === '=') ||
        (char === '!' && this.state.source[pos + 1] === '=' && this.state.source[pos + 2] === '=')) {
      return char + this.state.source[pos + 1] + this.state.source[pos + 2];
    }
    return char;
  }

  private advanceKeyword(keyword: string): void {
    const pos = this.getCurrentPosition();
    for (let i = 0; i < keyword.length; i++) {
      this.advance();
    }
    this.addToken('Keyword', keyword, pos);
  }

  private expect(char: string): void {
    const pos = this.getCurrentPosition();
    if (this.peek() === char) {
      this.advance();
      this.addToken('Punctuator', char, pos);
    } else {
      this.addError(`Expected '${char}' but found '${this.peek()}'`);
    }
  }
}

export const javaScriptParser = new JavaScriptParser();
