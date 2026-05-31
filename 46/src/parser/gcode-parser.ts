import {
  GCodeCommand,
  ParsedProgram,
  ProgramHeader,
  ParseError,
  ProgramMetadata,
  CNCFormat,
  FormatProfile,
} from './types';

const FANUC_PROFILE: FormatProfile = {
  format: CNCFormat.FANUC,
  lineEnding: '\n',
  programStart: 'O',
  programEnd: 'M30',
  commentStart: '(',
  commentEnd: ')',
  decimalPoint: true,
  leadingZeros: 0,
  trailingZeros: false,
  modalGroups: [
    ['G00', 'G01', 'G02', 'G03', 'G33'],
    ['G17', 'G18', 'G19'],
    ['G90', 'G91'],
    ['G20', 'G21'],
  ],
  customCodes: {},
};

const SIEMENS_PROFILE: FormatProfile = {
  format: CNCFormat.SIEMENS,
  lineEnding: '\n',
  programStart: '%',
  programEnd: 'M30',
  commentStart: ';',
  commentEnd: '',
  decimalPoint: true,
  leadingZeros: 0,
  trailingZeros: false,
  modalGroups: [
    ['G00', 'G01', 'G02', 'G03', 'G33'],
    ['G17', 'G18', 'G19'],
    ['G90', 'G91'],
    ['G70', 'G71'],
  ],
  customCodes: {
    'CYCLE81': 'DRILLING',
    'CYCLE82': 'COUNTER_BORING',
    'CYCLE83': 'DEEP_DRILLING',
    'CYCLE84': 'TAPPING',
    'CYCLE85': 'REAMING',
  },
};

const HEIDENHAIN_PROFILE: FormatProfile = {
  format: CNCFormat.HEIDENHAIN,
  lineEnding: '\n',
  programStart: 'BEGIN PGM',
  programEnd: 'END PGM',
  commentStart: ';',
  commentEnd: '',
  decimalPoint: true,
  leadingZeros: 0,
  trailingZeros: false,
  modalGroups: [
    ['L', 'C', 'CC', 'CT'],
    ['P', 'FP', 'F'],
  ],
  customCodes: {
    'L': 'LINEAR',
    'C': 'CIRCULAR',
    'CC': 'CIRCLE_CENTER',
    'CT': 'TANGENTIAL_CIRCLE',
    'CR': 'CIRCLE_RADIUS',
  },
};

const ISO_PROFILE: FormatProfile = {
  format: CNCFormat.ISO,
  lineEnding: '\r\n',
  programStart: '%',
  programEnd: 'M30',
  commentStart: '(',
  commentEnd: ')',
  decimalPoint: true,
  leadingZeros: 2,
  trailingZeros: false,
  modalGroups: [
    ['G00', 'G01', 'G02', 'G03'],
    ['G17', 'G18', 'G19'],
    ['G90', 'G91'],
  ],
  customCodes: {},
};

export const FORMAT_PROFILES: Record<CNCFormat, FormatProfile> = {
  [CNCFormat.FANUC]: FANUC_PROFILE,
  [CNCFormat.SIEMENS]: SIEMENS_PROFILE,
  [CNCFormat.HEIDENHAIN]: HEIDENHAIN_PROFILE,
  [CNCFormat.ISO]: ISO_PROFILE,
  [CNCFormat.HAAS]: { ...FANUC_PROFILE, format: CNCFormat.HAAS },
  [CNCFormat.MITSUBISHI]: { ...FANUC_PROFILE, format: CNCFormat.MITSUBISHI },
};

const RE_PROG_START = /^[O%](\w+)/;
const RE_HEADER_GCODE = /^(N\d+|[GMTS]\d)/;
const RE_M02_M30 = /^M0?2$|^M30$/;
const RE_END_PGM = /^END PGM/;
const RE_G20 = /G20/;
const RE_G21 = /G21/;
const RE_COMMENT_PAREN = /\(([^)]*)\)/;
const RE_COMMENT_SEMI = /;(.*)/;
const RE_CMD_LETTER = /^([GMTSFN])([\d.]+)/i;
const RE_PARAM = /^([XYZABCUVWIJKRQPDLH])([-+]?[\d.]+)/i;
const RE_MULTI_START = /^[A-Z]+\d*/i;

const MAX_LINE_CACHE = 5000;

interface LineCacheEntry {
  tokens: string[];
  timestamp: number;
}

export class GCodeParser {
  private profile: FormatProfile;
  private errors: ParseError[] = [];
  private lineCache: Map<string, LineCacheEntry> = new Map();
  private multiLetterPatterns: string[];
  private multiLetterPatternsSet: Set<string>;

  constructor(format: CNCFormat = CNCFormat.FANUC) {
    this.profile = FORMAT_PROFILES[format];
    this.multiLetterPatterns = Object.keys(this.profile.customCodes);
    this.multiLetterPatternsSet = new Set(this.multiLetterPatterns);
  }

  parse(source: string): ParsedProgram {
    this.errors = [];

    const normalized = this.normalizeLineEndings(source);
    const lines = this.splitLinesFast(normalized);

    const commands: GCodeCommand[] = new Array(Math.floor(lines.length * 0.8));
    let cmdIdx = 0;

    const header = this.parseHeaderFast(lines);
    const startIndex = this.getHeaderEndLineFast(lines);

    let rapidMoves = 0, linearMoves = 0, arcMoves = 0;
    let toolChanges = 0, dwellCount = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let lastLineNum = 0;

    const profile = this.profile;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const len = line.length;
      if (len === 0) continue;

      const trimmed = this.trimInline(line);
      if (!trimmed) continue;

      if (this.isEndMarkerFast(trimmed)) break;
      if (this.isCommentLineFast(trimmed)) continue;

      const lineNumber = i + 1;
      lastLineNum = lineNumber;

      const [codePart, comment] = this.extractCommentFast(trimmed);
      if (!codePart) continue;

      const tokens = this.tokenizeFast(codePart);
      if (tokens.length === 0) continue;

      let currentType: GCodeCommand['type'] | null = null;
      let currentCode = 0;
      let currentParams: Map<string, number> | null = null;

      for (let ti = 0; ti < tokens.length; ti++) {
        const token = tokens[ti];
        const cmdMatch = token.match(RE_CMD_LETTER);

        if (cmdMatch) {
          if (currentType !== null && currentParams !== null) {
            commands[cmdIdx++] = {
              type: currentType,
              code: currentCode,
              parameters: currentParams,
              rawLine: trimmed,
              lineNumber,
              comment,
            };
          }

          const letter = cmdMatch[1].toUpperCase() as GCodeCommand['type'];
          const codeVal = parseFloat(cmdMatch[2]);
          currentType = letter === 'N' ? 'N' : letter;
          currentCode = isNaN(codeVal) ? 0 : codeVal;
          currentParams = new Map();
        } else if (currentParams !== null) {
          const paramMatch = token.match(RE_PARAM);
          if (paramMatch) {
            const axis = paramMatch[1].toUpperCase();
            const value = parseFloat(paramMatch[2]);
            if (!isNaN(value)) {
              currentParams.set(axis, value);

              if (axis === 'X') {
                if (value < minX) minX = value;
                if (value > maxX) maxX = value;
              } else if (axis === 'Y') {
                if (value < minY) minY = value;
                if (value > maxY) maxY = value;
              } else if (axis === 'Z') {
                if (value < minZ) minZ = value;
                if (value > maxZ) maxZ = value;
              }
            } else {
              this.errors.push({
                line: lineNumber,
                message: `参数 ${axis} 的值无效: ${paramMatch[2]}`,
                severity: 'warning',
              });
            }
          } else if (currentType !== null) {
            this.errors.push({
              line: lineNumber,
              message: `无法识别的令牌: ${token}`,
              severity: 'warning',
            });
          }
        }
      }

      if (currentType !== null && currentParams !== null) {
        commands[cmdIdx++] = {
          type: currentType,
          code: currentCode,
          parameters: currentParams,
          rawLine: trimmed,
          lineNumber,
          comment,
        };

        if (currentType === 'G') {
          switch (currentCode) {
            case 0: rapidMoves++; break;
            case 1: linearMoves++; break;
            case 2: case 3: arcMoves++; break;
            case 4: dwellCount++; break;
          }
        }
        if (currentType === 'T') toolChanges++;
        if (currentType === 'M' && currentCode === 6) toolChanges++;
      }
    }

    commands.length = cmdIdx;

    const hasBounds = minX !== Infinity;

    return {
      header,
      commands,
      errors: [...this.errors],
      metadata: {
        totalLines: lastLineNum,
        totalCommands: cmdIdx,
        toolChanges,
        rapidMoves,
        linearMoves,
        arcMoves,
        dwellCount,
        boundingBox: hasBounds
          ? { minX, maxX, minY, maxY, minZ, maxZ }
          : undefined,
      },
    };
  }

  private normalizeLineEndings(source: string): string {
    if (source.indexOf('\r') === -1) return source;
    return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  private splitLinesFast(str: string): string[] {
    return str.split('\n');
  }

  private trimInline(s: string): string {
    let start = 0;
    let end = s.length - 1;
    while (start <= end && s.charCodeAt(start) <= 32) start++;
    while (end >= start && s.charCodeAt(end) <= 32) end--;
    return start > end ? '' : s.substring(start, end + 1);
  }

  private parseHeaderFast(lines: string[]): ProgramHeader {
    const header: ProgramHeader = {
      format: this.profile.format,
      units: 'mm',
    };

    const maxLines = Math.min(lines.length, 20);

    for (let i = 0; i < maxLines; i++) {
      const line = this.trimInline(lines[i]);
      if (!line) continue;

      const progMatch = line.match(RE_PROG_START);
      if (progMatch && !header.programNumber) {
        header.programNumber = progMatch[1];
      }

      const parenMatch = line.match(RE_COMMENT_PAREN);
      if (parenMatch && !header.programName) {
        header.programName = parenMatch[1];
      }

      if (RE_G20.test(line)) header.units = 'inch';
      if (RE_G21.test(line)) header.units = 'mm';
    }

    return header;
  }

  private getHeaderEndLineFast(lines: string[]): number {
    const maxLines = Math.min(lines.length, 10);
    for (let i = 0; i < maxLines; i++) {
      if (RE_HEADER_GCODE.test(this.trimInline(lines[i]))) {
        return i;
      }
    }
    return 0;
  }

  private extractCommentFast(line: string): [string, string | undefined] {
    let comment: string | undefined;
    let codePart = line;

    if (this.profile.commentStart === ';') {
      const semiIdx = line.indexOf(';');
      if (semiIdx !== -1) {
        comment = line.substring(semiIdx + 1).trim();
        codePart = line.substring(0, semiIdx).trim();
      }
    } else {
      const parenMatch = line.match(RE_COMMENT_PAREN);
      if (parenMatch) {
        comment = parenMatch[1];
        codePart = line.replace(parenMatch[0], '').trim();
      }
    }

    return [codePart, comment];
  }

  private isCommentLineFast(line: string): boolean {
    const first = line.charCodeAt(0);
    if (this.profile.commentStart === ';') {
      return first === 59;
    }
    return first === 40 && line.charCodeAt(line.length - 1) === 41;
  }

  private isEndMarkerFast(line: string): boolean {
    if (RE_M02_M30.test(line)) return true;
    if (RE_END_PGM.test(line)) return true;
    return false;
  }

  private tokenizeFast(code: string): string[] {
    const cached = this.lineCache.get(code);
    if (cached) {
      cached.timestamp = Date.now();
      return cached.tokens;
    }

    const tokens: string[] = [];
    let current = '';
    const patterns = this.multiLetterPatterns;
    const patternsSet = this.multiLetterPatternsSet;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const codeChar = char.charCodeAt(0);

      if ((codeChar >= 65 && codeChar <= 90) || (codeChar >= 97 && codeChar <= 122)) {
        if (current.length > 0) {
          const potentialMulti = code.substring(i).match(RE_MULTI_START);
          if (potentialMulti && patternsSet.size > 0) {
            const upper = potentialMulti[0].toUpperCase();
            let matched = false;
            for (const pattern of patterns) {
              if (upper.startsWith(pattern)) {
                const currentTrimmed = this.trimInline(current);
                if (currentTrimmed) tokens.push(currentTrimmed);

                const endIdx = i + pattern.length;
                let tokenEnd = endIdx;
                while (tokenEnd < code.length) {
                  const cc = code.charCodeAt(tokenEnd);
                  if ((cc >= 48 && cc <= 57) || cc === 46) tokenEnd++;
                  else break;
                }

                tokens.push(code.substring(i, tokenEnd));
                i = tokenEnd - 1;
                current = '';
                matched = true;
                break;
              }
            }
            if (matched) continue;
          }

          const currentTrimmed = this.trimInline(current);
          if (currentTrimmed) tokens.push(currentTrimmed);
          current = char;
        } else {
          current = char;
        }
      } else {
        current += char;
      }
    }

    const currentTrimmed = this.trimInline(current);
    if (currentTrimmed) tokens.push(currentTrimmed);

    if (this.lineCache.size >= MAX_LINE_CACHE) {
      const arr = Array.from(this.lineCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(MAX_LINE_CACHE * 0.25));
      for (const [key] of arr) {
        this.lineCache.delete(key);
      }
    }

    this.lineCache.set(code, { tokens, timestamp: Date.now() });

    return tokens;
  }

  parseStreaming(
    source: string,
    onCommand?: (cmd: GCodeCommand, index: number) => void,
    onProgress?: (percent: number) => void
  ): ParsedProgram {
    const normalized = this.normalizeLineEndings(source);
    const lines = this.splitLinesFast(normalized);
    const totalLines = lines.length;

    const commands: GCodeCommand[] = [];
    this.errors = [];

    const header = this.parseHeaderFast(lines);
    const startIndex = this.getHeaderEndLineFast(lines);

    let rapidMoves = 0, linearMoves = 0, arcMoves = 0;
    let toolChanges = 0, dwellCount = 0;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let lastLineNum = 0;
    let cmdIdx = 0;

    let lastProgress = 0;

    for (let i = startIndex; i < totalLines; i++) {
      const line = this.trimInline(lines[i]);
      if (!line) continue;
      if (this.isEndMarkerFast(line)) break;
      if (this.isCommentLineFast(line)) continue;

      const lineNumber = i + 1;
      lastLineNum = lineNumber;

      const [codePart, comment] = this.extractCommentFast(line);
      if (!codePart) continue;

      const tokens = this.tokenizeFast(codePart);
      if (tokens.length === 0) continue;

      let currentType: GCodeCommand['type'] | null = null;
      let currentCode = 0;
      let currentParams: Map<string, number> | null = null;

      for (let ti = 0; ti < tokens.length; ti++) {
        const token = tokens[ti];
        const cmdMatch = token.match(RE_CMD_LETTER);

        if (cmdMatch) {
          if (currentType !== null && currentParams !== null) {
            const cmd: GCodeCommand = {
              type: currentType,
              code: currentCode,
              parameters: currentParams,
              rawLine: line,
              lineNumber,
              comment,
            };
            commands.push(cmd);
            if (onCommand) onCommand(cmd, cmdIdx);
            cmdIdx++;
          }

          const letter = cmdMatch[1].toUpperCase() as GCodeCommand['type'];
          const codeVal = parseFloat(cmdMatch[2]);
          currentType = letter === 'N' ? 'N' : letter;
          currentCode = isNaN(codeVal) ? 0 : codeVal;
          currentParams = new Map();
        } else if (currentParams !== null) {
          const paramMatch = token.match(RE_PARAM);
          if (paramMatch) {
            const axis = paramMatch[1].toUpperCase();
            const value = parseFloat(paramMatch[2]);
            if (!isNaN(value)) {
              currentParams.set(axis, value);
              if (axis === 'X') { if (value < minX) minX = value; if (value > maxX) maxX = value; }
              if (axis === 'Y') { if (value < minY) minY = value; if (value > maxY) maxY = value; }
              if (axis === 'Z') { if (value < minZ) minZ = value; if (value > maxZ) maxZ = value; }
            }
          }
        }
      }

      if (currentType !== null && currentParams !== null) {
        const cmd: GCodeCommand = {
          type: currentType,
          code: currentCode,
          parameters: currentParams,
          rawLine: line,
          lineNumber,
          comment,
        };
        commands.push(cmd);
        if (onCommand) onCommand(cmd, cmdIdx);
        cmdIdx++;

        if (currentType === 'G') {
          switch (currentCode) {
            case 0: rapidMoves++; break;
            case 1: linearMoves++; break;
            case 2: case 3: arcMoves++; break;
            case 4: dwellCount++; break;
          }
        }
        if (currentType === 'T') toolChanges++;
        if (currentType === 'M' && currentCode === 6) toolChanges++;
      }

      if (onProgress) {
        const progress = Math.floor((i / totalLines) * 100);
        if (progress >= lastProgress + 5) {
          onProgress(progress);
          lastProgress = progress;
        }
      }
    }

    const hasBounds = minX !== Infinity;

    return {
      header,
      commands,
      errors: [...this.errors],
      metadata: {
        totalLines: lastLineNum,
        totalCommands: commands.length,
        toolChanges,
        rapidMoves,
        linearMoves,
        arcMoves,
        dwellCount,
        boundingBox: hasBounds
          ? { minX, maxX, minY, maxY, minZ, maxZ }
          : undefined,
      },
    };
  }

  clearCache(): void {
    this.lineCache.clear();
  }

  getCacheStats(): { size: number; max: number } {
    return {
      size: this.lineCache.size,
      max: MAX_LINE_CACHE,
    };
  }

  validate(program: ParsedProgram): ParseError[] {
    const errors: ParseError[] = [...program.errors];

    let hasG0 = false, hasG1 = false;
    let hasG20 = false, hasG21 = false;
    let hasEnd = false;

    for (let i = 0; i < program.commands.length; i++) {
      const cmd = program.commands[i];
      if (cmd.type === 'G') {
        if (cmd.code === 0) hasG0 = true;
        if (cmd.code === 1) hasG1 = true;
        if (cmd.code === 20) hasG20 = true;
        if (cmd.code === 21) hasG21 = true;
      }
      if (cmd.type === 'M' && (cmd.code === 2 || cmd.code === 30)) {
        hasEnd = true;
      }
    }

    if (!hasG0 && !hasG1) {
      errors.push({ line: 0, message: '程序缺少运动指令 (G00/G01)', severity: 'warning' });
    }

    if (hasG20 && hasG21) {
      errors.push({ line: 0, message: '程序同时包含英制(G20)和公制(G21)指令', severity: 'error' });
    }

    if (!hasEnd) {
      errors.push({ line: 0, message: '程序缺少结束指令 (M02/M30)', severity: 'warning' });
    }

    return errors;
  }
}
