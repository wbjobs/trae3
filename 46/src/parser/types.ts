export interface GCodeCommand {
  type: 'G' | 'M' | 'T' | 'S' | 'F' | 'N' | 'other';
  code: number;
  parameters: Map<string, number>;
  rawLine: string;
  lineNumber: number;
  comment?: string;
}

export interface ParsedProgram {
  header: ProgramHeader;
  commands: GCodeCommand[];
  errors: ParseError[];
  metadata: ProgramMetadata;
}

export interface ProgramHeader {
  programNumber?: string;
  programName?: string;
  format?: CNCFormat;
  units?: 'mm' | 'inch';
  origin?: { x: number; y: number; z: number };
}

export interface ParseError {
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ProgramMetadata {
  totalLines: number;
  totalCommands: number;
  toolChanges: number;
  rapidMoves: number;
  linearMoves: number;
  arcMoves: number;
  dwellCount: number;
  estimatedDuration?: number;
  boundingBox?: {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
  };
}

export enum CNCFormat {
  FANUC = 'fanuc',
  SIEMENS = 'siemens',
  HEIDENHAIN = 'heidenhain',
  ISO = 'iso',
  HAAS = 'haas',
  MITSUBISHI = 'mitsubishi',
}

export interface FormatProfile {
  format: CNCFormat;
  lineEnding: string;
  programStart: string;
  programEnd: string;
  commentStart: string;
  commentEnd: string;
  decimalPoint: boolean;
  leadingZeros: number;
  trailingZeros: boolean;
  modalGroups: string[][];
  customCodes: Record<string, string>;
}
