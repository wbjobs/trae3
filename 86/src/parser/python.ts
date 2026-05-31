import { BaseParser } from './types';
import type { ParseResult, ASTNode, Token } from '@/types';

const PYTHON_KEYWORDS = new Set([
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break',
  'continue', 'import', 'from', 'as', 'try', 'except', 'finally', 'raise',
  'with', 'pass', 'lambda', 'yield', 'global', 'nonlocal', 'assert', 'del',
  'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'async', 'await'
]);

export class PythonParser extends BaseParser {
  private indentStack: number[] = [0];

  parse(content: string): ParseResult {
    this.init(content);
    this.indentStack = [0];
    const ast = this.parseModule();
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
      if (this.peek() === '\n') {
        this.advance();
        this.handleIndentation();
        continue;
      }
      if (this.peek() === ' ' || this.peek() === '\t') {
        this.advance();
        continue;
      }
      if (this.state.position >= this.state.source.length) break;
      this.readNextToken();
    }
    return this.state.tokens;
  }

  private handleIndentation(): void {
    let indent = 0;
    while (this.peek() === ' ' || this.peek() === '\t') {
      indent += this.peek() === '\t' ? 8 : 1;
      this.advance();
    }
    
    const lastIndent = this.indentStack[this.indentStack.length - 1];
    if (indent > lastIndent) {
      this.indentStack.push(indent);
      this.addToken('Indent', 'INDENT', this.getCurrentPosition());
    } else {
      while (indent < lastIndent && this.indentStack.length > 1) {
        this.indentStack.pop();
        this.addToken('Dedent', 'DEDENT', this.getCurrentPosition());
      }
    }
  }

  private parseModule(): ASTNode {
    const start = this.state.position;
    const children: ASTNode[] = [];
    
    while (this.state.position < this.state.source.length) {
      this.skipWhitespaceAndComments();
      if (this.state.position >= this.state.source.length) break;
      const stmt = this.parseStatement();
      if (stmt) children.push(stmt);
    }
    
    return this.createNode('Module', start, this.state.position, undefined, undefined, children);
  }

  private parseStatement(): ASTNode | null {
    const start = this.state.position;
    this.skipWhitespaceAndComments();
    
    if (this.matchKeyword('def')) {
      return this.parseFunctionDef(start);
    }
    
    if (this.matchKeyword('class')) {
      return this.parseClassDef(start);
    }
    
    if (this.matchKeyword('if')) {
      return this.parseIfStatement(start);
    }
    
    if (this.matchKeyword('for') || this.matchKeyword('while')) {
      return this.parseLoop(start);
    }
    
    if (this.matchKeyword('return')) {
      return this.parseReturn(start);
    }
    
    if (this.matchKeyword('import') || this.matchKeyword('from')) {
      return this.parseImport(start);
    }
    
    if (this.peek() === '\n') {
      this.advance();
      return null;
    }
    
    return this.parseAssignmentOrExpr(start);
  }

  private parseFunctionDef(start: number): ASTNode {
    this.advanceKeyword('def');
    this.skipWhitespace();
    
    const name = this.readIdentifier();
    this.addToken('Identifier', name, this.getCurrentPosition());
    this.skipWhitespace();
    
    this.expect('(');
    const params = this.parseParameters();
    this.expect(')');
    this.skipWhitespace();
    
    let returnType: ASTNode | undefined;
    if (this.peek() === '-' && this.peek(1) === '>') {
      this.advance();
      this.advance();
      this.skipWhitespace();
      returnType = this.parseExpression();
    }
    
    this.expect(':');
    const body = this.parseSuite();
    
    return this.createNode(
      'FunctionDef',
      start,
      this.state.position,
      name,
      undefined,
      returnType ? [...params, body, returnType] : [...params, body]
    );
  }

  private parseClassDef(start: number): ASTNode {
    this.advanceKeyword('class');
    this.skipWhitespace();
    
    const name = this.readIdentifier();
    this.addToken('Identifier', name, this.getCurrentPosition());
    this.skipWhitespace();
    
    let bases: ASTNode[] = [];
    if (this.peek() === '(') {
      this.advance();
      while (this.peek() !== ')') {
        bases.push(this.parseExpression());
        if (this.peek() === ',') this.advance();
        this.skipWhitespace();
      }
      this.advance();
    }
    
    this.expect(':');
    const body = this.parseSuite();
    
    return this.createNode(
      'ClassDef',
      start,
      this.state.position,
      name,
      undefined,
      [...bases, body]
    );
  }

  private parseIfStatement(start: number): ASTNode {
    this.advanceKeyword('if');
    this.skipWhitespace();
    
    const test = this.parseExpression();
    this.expect(':');
    const body = this.parseSuite();
    
    const children: ASTNode[] = [test, body];
    
    this.skipWhitespaceAndComments();
    while (this.matchKeyword('elif')) {
      this.advanceKeyword('elif');
      this.skipWhitespace();
      const elifTest = this.parseExpression();
      this.expect(':');
      const elifBody = this.parseSuite();
      children.push(elifTest, elifBody);
    }
    
    this.skipWhitespaceAndComments();
    if (this.matchKeyword('else')) {
      this.advanceKeyword('else');
      this.expect(':');
      const elseBody = this.parseSuite();
      children.push(elseBody);
    }
    
    return this.createNode('If', start, this.state.position, undefined, undefined, children);
  }

  private parseLoop(start: number): ASTNode {
    const kind = this.matchKeyword('for') ? 'for' : 'while';
    this.advanceKeyword(kind);
    this.skipWhitespace();
    
    if (kind === 'for') {
      const target = this.parseExpression();
      this.skipWhitespace();
      this.advanceKeyword('in');
      this.skipWhitespace();
      const iter = this.parseExpression();
      this.expect(':');
      const body = this.parseSuite();
      return this.createNode('For', start, this.state.position, undefined, undefined, [target, iter, body]);
    } else {
      const test = this.parseExpression();
      this.expect(':');
      const body = this.parseSuite();
      return this.createNode('While', start, this.state.position, undefined, undefined, [test, body]);
    }
  }

  private parseReturn(start: number): ASTNode {
    this.advanceKeyword('return');
    this.skipWhitespace();
    
    let value: ASTNode | undefined;
    if (this.peek() !== '\n') {
      value = this.parseExpression();
    }
    
    return this.createNode('Return', start, this.state.position, undefined, undefined, value ? [value] : undefined);
  }

  private parseImport(start: number): ASTNode {
    if (this.matchKeyword('from')) {
      this.advanceKeyword('from');
      this.skipWhitespace();
      const module = this.readDottedName();
      this.skipWhitespace();
      this.advanceKeyword('import');
      this.skipWhitespace();
      
      const names: ASTNode[] = [];
      do {
        const name = this.readIdentifier();
        names.push(this.createNode('Alias', this.state.position - name.length, this.state.position, name));
        this.addToken('Identifier', name, this.getCurrentPosition());
        this.skipWhitespace();
        if (this.peek() === ',') {
          this.advance();
          this.skipWhitespace();
        }
      } while (this.peek() !== '\n');
      
      return this.createNode('ImportFrom', start, this.state.position, module, undefined, names);
    } else {
      this.advanceKeyword('import');
      this.skipWhitespace();
      const names: ASTNode[] = [];
      do {
        const module = this.readDottedName();
        names.push(this.createNode('Alias', this.state.position - module.length, this.state.position, module));
        this.skipWhitespace();
        if (this.peek() === ',') {
          this.advance();
          this.skipWhitespace();
        }
      } while (this.peek() !== '\n');
      
      return this.createNode('Import', start, this.state.position, undefined, undefined, names);
    }
  }

  private parseAssignmentOrExpr(start: number): ASTNode {
    const expr = this.parseExpression();
    
    if (this.peek() === '=') {
      this.advance();
      this.addToken('Punctuator', '=', this.getCurrentPosition());
      this.skipWhitespace();
      const value = this.parseExpression();
      return this.createNode('Assign', start, this.state.position, undefined, undefined, [expr, value]);
    }
    
    return this.createNode('Expr', start, this.state.position, undefined, undefined, [expr]);
  }

  private parseSuite(): ASTNode {
    const start = this.state.position;
    this.skipWhitespace();
    
    if (this.peek() === '\n') {
      this.advance();
      this.handleIndentation();
      
      const children: ASTNode[] = [];
      while (this.state.position < this.state.source.length) {
        this.skipWhitespaceAndComments();
        if (this.peek() === '\n') {
          this.advance();
          continue;
        }
        const stmt = this.parseStatement();
        if (stmt) children.push(stmt);
        
        const currentIndent = this.getCurrentIndent();
        const lastIndent = this.indentStack[this.indentStack.length - 1];
        if (currentIndent < lastIndent) break;
      }
      
      return this.createNode('Suite', start, this.state.position, undefined, undefined, children);
    } else {
      const stmt = this.parseStatement();
      return this.createNode('Suite', start, this.state.position, undefined, undefined, stmt ? [stmt] : []);
    }
  }

  private parseExpression(): ASTNode {
    return this.parseOr();
  }

  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.matchKeyword('or')) {
      const start = left.start;
      this.advanceKeyword('or');
      this.skipWhitespace();
      const right = this.parseAnd();
      left = this.createNode('BoolOp', start, this.state.position, undefined, 'or', [left, right]);
    }
    return left;
  }

  private parseAnd(): ASTNode {
    let left = this.parseNot();
    while (this.matchKeyword('and')) {
      const start = left.start;
      this.advanceKeyword('and');
      this.skipWhitespace();
      const right = this.parseNot();
      left = this.createNode('BoolOp', start, this.state.position, undefined, 'and', [left, right]);
    }
    return left;
  }

  private parseNot(): ASTNode {
    if (this.matchKeyword('not')) {
      const start = this.state.position;
      this.advanceKeyword('not');
      this.skipWhitespace();
      const operand = this.parseNot();
      return this.createNode('UnaryOp', start, this.state.position, undefined, 'not', [operand]);
    }
    return this.parseCompare();
  }

  private parseCompare(): ASTNode {
    const left = this.parseArithmetic();
    this.skipWhitespace();
    
    const ops = ['==', '!=', '<', '<=', '>', '>=', 'is', 'is not', 'in', 'not in'];
    for (const op of ops) {
      if (this.peekMulti(op)) {
        const start = left.start;
        this.advanceMulti(op);
        this.addToken('Punctuator', op, this.getCurrentPosition());
        this.skipWhitespace();
        const right = this.parseArithmetic();
        return this.createNode('Compare', start, this.state.position, undefined, op, [left, right]);
      }
    }
    
    return left;
  }

  private parseArithmetic(): ASTNode {
    let left = this.parseTerm();
    while (['+', '-'].includes(this.peek())) {
      const start = left.start;
      const op = this.advance();
      this.addToken('Punctuator', op, this.getCurrentPosition());
      this.skipWhitespace();
      const right = this.parseTerm();
      left = this.createNode('BinOp', start, this.state.position, undefined, op, [left, right]);
    }
    return left;
  }

  private parseTerm(): ASTNode {
    let left = this.parseFactor();
    while (['*', '/', '%', '//'].includes(this.peek()) || (this.peek() === '/' && this.peek(1) === '/')) {
      const start = left.start;
      let op = this.advance();
      if (op === '/' && this.peek() === '/') {
        op += this.advance();
      }
      this.addToken('Punctuator', op, this.getCurrentPosition());
      this.skipWhitespace();
      const right = this.parseFactor();
      left = this.createNode('BinOp', start, this.state.position, undefined, op, [left, right]);
    }
    return left;
  }

  private parseFactor(): ASTNode {
    if (['+', '-', '~'].includes(this.peek())) {
      const start = this.state.position;
      const op = this.advance();
      this.addToken('Punctuator', op, this.getCurrentPosition());
      this.skipWhitespace();
      const operand = this.parseFactor();
      return this.createNode('UnaryOp', start, this.state.position, undefined, op, [operand]);
    }
    return this.parsePrimary();
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
    
    if (this.peek() === '[') {
      this.advance();
      const elements: ASTNode[] = [];
      while (this.peek() !== ']') {
        elements.push(this.parseExpression());
        if (this.peek() === ',') this.advance();
        this.skipWhitespace();
      }
      this.expect(']');
      return this.createNode('List', start, this.state.position, undefined, undefined, elements);
    }
    
    if (this.peek() === '{') {
      this.advance();
      const elements: ASTNode[] = [];
      while (this.peek() !== '}') {
        const key = this.parseExpression();
        this.expect(':');
        const value = this.parseExpression();
        elements.push(this.createNode('DictEntry', key.start, value.end, undefined, undefined, [key, value]));
        if (this.peek() === ',') this.advance();
        this.skipWhitespace();
      }
      this.expect('}');
      return this.createNode('Dict', start, this.state.position, undefined, undefined, elements);
    }
    
    if (this.peek() === '"' || this.peek() === "'") {
      const quote = this.peek();
      const pos = this.getCurrentPosition();
      const value = this.readString(quote);
      this.addToken('String', value, pos);
      return this.createNode('Constant', start, this.state.position, undefined, value);
    }
    
    if (/[0-9]/.test(this.peek())) {
      const pos = this.getCurrentPosition();
      const value = this.readNumber();
      this.addToken('Number', value, pos);
      return this.createNode('Constant', start, this.state.position, undefined, value);
    }
    
    if (this.matchKeyword('True') || this.matchKeyword('False') || this.matchKeyword('None')) {
      const pos = this.getCurrentPosition();
      const value = this.readIdentifier();
      this.addToken('Keyword', value, pos);
      return this.createNode('Constant', start, this.state.position, undefined, value);
    }
    
    if (/[a-zA-Z_]/.test(this.peek())) {
      const pos = this.getCurrentPosition();
      const name = this.readIdentifier();
      const tokenType = PYTHON_KEYWORDS.has(name) ? 'Keyword' : 'Identifier';
      this.addToken(tokenType, name, pos);
      return this.createNode('Name', start, this.state.position, name);
    }
    
    this.addError(`Unexpected character: ${this.peek()}`);
    this.advance();
    return this.createNode('Unknown', start, this.state.position);
  }

  private parseParameters(): ASTNode[] {
    const params: ASTNode[] = [];
    this.skipWhitespace();
    
    while (this.peek() !== ')') {
      const start = this.state.position;
      const name = this.readIdentifier();
      this.addToken('Identifier', name, this.getCurrentPosition());
      
      let typeAnnotation: ASTNode | undefined;
      if (this.peek() === ':') {
        this.advance();
        this.skipWhitespace();
        typeAnnotation = this.parseExpression();
      }
      
      let defaultValue: ASTNode | undefined;
      if (this.peek() === '=') {
        this.advance();
        this.skipWhitespace();
        defaultValue = this.parseExpression();
      }
      
      const children: ASTNode[] = [];
      if (typeAnnotation) children.push(typeAnnotation);
      if (defaultValue) children.push(defaultValue);
      
      params.push(this.createNode('Param', start, this.state.position, name, undefined, children));
      
      this.skipWhitespace();
      if (this.peek() === ',') {
        this.advance();
        this.skipWhitespace();
      }
    }
    
    return params;
  }

  private readDottedName(): string {
    let result = this.readIdentifier();
    while (this.peek() === '.') {
      this.advance();
      result += '.' + this.readIdentifier();
    }
    return result;
  }

  private readNextToken(): void {
    const pos = this.getCurrentPosition();
    const char = this.peek();
    
    if (char === '#') {
      while (this.peek() !== '\n' && this.state.position < this.state.source.length) {
        this.advance();
      }
      return;
    }
    
    if (char === '"' || char === "'") {
      const quote = char;
      const value = this.readString(quote);
      this.addToken('String', value, pos);
      return;
    }
    
    if (/[0-9]/.test(char)) {
      const value = this.readNumber();
      this.addToken('Number', value, pos);
      return;
    }
    
    if (/[a-zA-Z_]/.test(char)) {
      const value = this.readIdentifier();
      const tokenType = PYTHON_KEYWORDS.has(value) ? 'Keyword' : 'Identifier';
      this.addToken(tokenType, value, pos);
      return;
    }
    
    if (['=', '!', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '~'].includes(char)) {
      let op = this.advance();
      if (this.peek() === '=') {
        op += this.advance();
      }
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

  private peekMulti(str: string): boolean {
    return this.state.source.slice(this.state.position, this.state.position + str.length) === str;
  }

  private advanceMulti(str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.advance();
    }
  }

  private skipWhitespaceAndComments(): void {
    while (this.state.position < this.state.source.length) {
      const char = this.peek();
      if (char === ' ' || char === '\t' || char === '\r') {
        this.advance();
      } else if (char === '#') {
        while (this.peek() !== '\n' && this.state.position < this.state.source.length) {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  private getCurrentIndent(): number {
    let pos = this.state.position;
    while (pos > 0 && this.state.source[pos - 1] !== '\n') {
      pos--;
    }
    
    let indent = 0;
    while (pos < this.state.source.length && (this.state.source[pos] === ' ' || this.state.source[pos] === '\t')) {
      indent += this.state.source[pos] === '\t' ? 8 : 1;
      pos++;
    }
    return indent;
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

export const pythonParser = new PythonParser();
