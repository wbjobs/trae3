import { CNCFormat, FormatProfile, FORMAT_PROFILES } from '../parser/types';
import { ParsedProgram, GCodeCommand } from '../parser/types';

export interface ConversionOptions {
  sourceFormat: CNCFormat;
  targetFormat: CNCFormat;
  preserveComments: boolean;
  prettyPrint: boolean;
  lineNumbers: boolean;
  indentSize: number;
  customMappings?: Record<string, string>;
}

export interface ConversionResult {
  output: string;
  warnings: string[];
  stats: ConversionStats;
}

export interface ConversionStats {
  totalCommands: number;
  convertedCommands: number;
  skippedCommands: number;
  unmappedCodes: string[];
}

const CODE_MAPPINGS: Record<string, Record<string, string>> = {
  [`${CNCFormat.FANUC}->${CNCFormat.SIEMENS}`]: {
    'G28': 'G74',
    'G76': 'CYCLE86',
    'M03': 'M3',
    'M04': 'M4',
    'M05': 'M5',
    'M08': 'M8',
    'M09': 'M9',
  },
  [`${CNCFormat.SIEMENS}->${CNCFormat.FANUC}`]: {
    'G74': 'G28',
    'CYCLE81': 'G81',
    'CYCLE82': 'G82',
    'CYCLE83': 'G83',
    'CYCLE84': 'G84',
    'CYCLE85': 'G85',
    'CYCLE86': 'G76',
    'M3': 'M03',
    'M4': 'M04',
    'M5': 'M05',
    'M8': 'M08',
    'M9': 'M09',
  },
  [`${CNCFormat.FANUC}->${CNCFormat.HEIDENHAIN}`]: {
    'G00': 'L',
    'G01': 'L',
    'G02': 'C',
    'G03': 'C',
    'G90': '',
    'G91': '',
    'M03': 'M3',
    'M05': 'M5',
  },
  [`${CNCFormat.HEIDENHAIN}->${CNCFormat.FANUC}`]: {
    'L': 'G01',
    'C': 'G02',
    'CC': '',
    'CT': 'G02',
    'M3': 'M03',
    'M5': 'M05',
  },
  [`${CNCFormat.ISO}->${CNCFormat.FANUC}`]: {},
  [`${CNCFormat.FANUC}->${CNCFormat.ISO}`]: {},
};

export class FormatConverter {
  private options: ConversionOptions;

  constructor(options: ConversionOptions) {
    this.options = {
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
      ...options,
    };
  }

  convert(program: ParsedProgram): ConversionResult {
    const warnings: string[] = [];
    const unmappedCodes: string[] = [];
    let convertedCommands = 0;
    let skippedCommands = 0;

    const mappingKey = `${this.options.sourceFormat}->${this.options.targetFormat}`;
    const mapping = CODE_MAPPINGS[mappingKey] || {};
    const customMapping = this.options.customMappings || {};
    const allMappings = { ...mapping, ...customMapping };

    const targetProfile = FORMAT_PROFILES[this.options.targetFormat];
    const lines: string[] = [];

    lines.push(this.generateProgramStart(program, targetProfile));

    for (const cmd of program.commands) {
      const originalCode = `${cmd.type}${cmd.code}`;
      const mappedCode = allMappings[originalCode];

      if (mappedCode === '') {
        skippedCommands++;
        continue;
      }

      if (mappedCode !== undefined) {
        const convertedLine = this.convertCommand(cmd, mappedCode, targetProfile);
        lines.push(convertedLine);
        convertedCommands++;
      } else {
        const line = this.formatCommand(cmd, targetProfile);
        lines.push(line);
        convertedCommands++;

        if (!this.isStandardCode(cmd)) {
          if (!unmappedCodes.includes(originalCode)) {
            unmappedCodes.push(originalCode);
            warnings.push(`代码 ${originalCode} 在目标格式中无对应映射，保持原样`);
          }
        }
      }
    }

    lines.push(this.generateProgramEnd(program, targetProfile));

    const output = lines.join(targetProfile.lineEnding);

    return {
      output,
      warnings,
      stats: {
        totalCommands: program.commands.length,
        convertedCommands,
        skippedCommands,
        unmappedCodes,
      },
    };
  }

  private convertCommand(
    cmd: GCodeCommand,
    mappedCode: string,
    targetProfile: FormatProfile
  ): string {
    const parts: string[] = [mappedCode];

    if (cmd.parameters.size > 0) {
      cmd.parameters.forEach((value, axis) => {
        const formatted = targetProfile.decimalPoint
          ? value.toFixed(3).replace(/\.?0+$/, '') || '0'
          : Math.round(value).toString();
        parts.push(`${axis}${formatted}`);
      });
    }

    if (this.options.preserveComments && cmd.comment) {
      parts.push(
        ` ${targetProfile.commentStart}${cmd.comment}${targetProfile.commentEnd}`
      );
    }

    return parts.join(' ');
  }

  private formatCommand(cmd: GCodeCommand, targetProfile: FormatProfile): string {
    const parts: string[] = [];

    if (cmd.type === 'N') {
      parts.push(`N${Math.round(cmd.code)}`);
    } else {
      const codeStr = cmd.code % 1 === 0
        ? cmd.code.toFixed(0).padStart(2, '0')
        : cmd.code.toFixed(1);
      parts.push(`${cmd.type}${codeStr}`);
    }

    if (cmd.parameters.size > 0 && cmd.type !== 'N') {
      cmd.parameters.forEach((value, axis) => {
        const formatted = targetProfile.decimalPoint
          ? value.toFixed(3).replace(/\.?0+$/, '') || '0'
          : Math.round(value).toString();
        parts.push(`${axis}${formatted}`);
      });
    }

    if (this.options.preserveComments && cmd.comment) {
      parts.push(
        ` ${targetProfile.commentStart}${cmd.comment}${targetProfile.commentEnd}`
      );
    }

    return parts.join(' ');
  }

  private generateProgramStart(
    program: ParsedProgram,
    targetProfile: FormatProfile
  ): string {
    switch (targetProfile.format) {
      case CNCFormat.FANUC:
        return `O${program.header.programNumber || '0001'}`;
      case CNCFormat.SIEMENS:
        return `%_${program.header.programNumber || 'MPF1'};`;
      case CNCFormat.HEIDENHAIN:
        return `BEGIN PGM ${program.header.programName || 'PROGRAM'} MM`;
      case CNCFormat.ISO:
        return '%';
      default:
        return `% O${program.header.programNumber || '0001'}`;
    }
  }

  private generateProgramEnd(
    _program: ParsedProgram,
    targetProfile: FormatProfile
  ): string {
    switch (targetProfile.format) {
      case CNCFormat.FANUC:
        return 'M30';
      case CNCFormat.SIEMENS:
        return 'M30';
      case CNCFormat.HEIDENHAIN:
        return 'END PGM';
      case CNCFormat.ISO:
        return 'M30\n%';
      default:
        return 'M30';
    }
  }

  private isStandardCode(cmd: GCodeCommand): boolean {
    const standardGCodes = [0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 28, 40, 41, 42, 43, 49, 90, 91];
    const standardMCodes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 30];

    if (cmd.type === 'G') return standardGCodes.includes(cmd.code);
    if (cmd.type === 'M') return standardMCodes.includes(cmd.code);
    return true;
  }

  static getSupportedConversions(): Array<{ from: CNCFormat; to: CNCFormat }> {
    const formats = Object.values(CNCFormat);
    const conversions: Array<{ from: CNCFormat; to: CNCFormat }> = [];
    for (const from of formats) {
      for (const to of formats) {
        if (from !== to) {
          conversions.push({ from, to });
        }
      }
    }
    return conversions;
  }
}
