import { ParsedProgram, GCodeCommand, CNCFormat, FormatProfile, FORMAT_PROFILES } from '../parser/types';

export interface SyntaxRule {
  id: string;
  name: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  description: string;
}

export interface SyntaxViolation {
  ruleId: string;
  ruleName: string;
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: string;
  suggestion?: string;
}

export interface SyntaxReport {
  violations: SyntaxViolation[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  rulesChecked: string[];
}

export const SYNTAX_RULES: SyntaxRule[] = [
  {
    id: 'SPINDLE_NOT_STARTED',
    name: '主轴未启动',
    severity: 'warning',
    category: 'safety',
    description: '切削进给前主轴应已启动',
  },
  {
    id: 'COOLANT_NOT_STARTED',
    name: '冷却未启动',
    severity: 'info',
    category: 'safety',
    description: '切削进给前建议启动冷却',
  },
  {
    id: 'SAFETY_HEIGHT',
    name: '安全高度不足',
    severity: 'warning',
    category: 'safety',
    description: '快速移动时Z轴安全高度过低',
  },
  {
    id: 'FEEDRATE_MISSING',
    name: '进给率缺失',
    severity: 'error',
    category: 'motion',
    description: '进给指令(F)未设置',
  },
  {
    id: 'SPINDLE_SPEED_MISSING',
    name: '转速缺失',
    severity: 'warning',
    category: 'motion',
    description: '主轴转速(S)未设置',
  },
  {
    id: 'TOOL_NOT_SELECTED',
    name: '刀具未选择',
    severity: 'warning',
    category: 'tool',
    description: '切削前应先选择刀具',
  },
  {
    id: 'TOOL_CHANGE_WITHOUT_STOP',
    name: '换刀不停主轴',
    severity: 'error',
    category: 'tool',
    description: '换刀时主轴应停止',
  },
  {
    id: 'COORDINATE_SYSTEM_UNSET',
    name: '坐标系未设置',
    severity: 'warning',
    category: 'coordinate',
    description: '未设置工件坐标系(G54-G59)',
  },
  {
    id: 'UNITS_INCONSISTENT',
    name: '单位不一致',
    severity: 'error',
    category: 'coordinate',
    description: '单位模式在程序中被切换',
  },
  {
    id: 'ABS_INCR_MIXED',
    name: '绝对/相对混合',
    severity: 'info',
    category: 'coordinate',
    description: '程序混合使用绝对(G90)和相对(G91)坐标',
  },
  {
    id: 'PLANE_INCONSISTENT',
    name: '平面不一致',
    severity: 'warning',
    category: 'coordinate',
    description: '圆弧指令与当前平面(G17/G18/G19)不匹配',
  },
  {
    id: 'ARC_RADIUS_INVALID',
    name: '圆弧半径无效',
    severity: 'error',
    category: 'motion',
    description: '圆弧半径(R)无效或与起止点不匹配',
  },
  {
    id: 'RETURN_POSITION',
    name: '未返回参考点',
    severity: 'info',
    category: 'motion',
    description: '程序结束前未返回参考位置',
  },
  {
    id: 'PROGRAM_END_MISSING',
    name: '缺少结束指令',
    severity: 'error',
    category: 'structure',
    description: '程序缺少结束指令(M02/M30)',
  },
  {
    id: 'LARGE_Z_MOVE',
    name: 'Z轴大幅移动',
    severity: 'warning',
    category: 'collision',
    description: '检测到Z轴大幅快速移动，可能发生碰撞',
  },
  {
    id: 'RAPID_IN_MATERIAL',
    name: '工件内快速移动',
    severity: 'error',
    category: 'collision',
    description: '在材料区域内使用快速移动(G00)',
  },
  {
    id: 'M_CODE_CONFLICT',
    name: 'M代码冲突',
    severity: 'error',
    category: 'auxiliary',
    description: '同一行包含冲突的M代码',
  },
  {
    id: 'MODAL_OVERWRITE',
    name: '模态代码重复',
    severity: 'info',
    category: 'optimization',
    description: '模态代码被不必要地重复指定',
  },
  {
    id: 'EMPTY_BLOCK',
    name: '空程序段',
    severity: 'info',
    category: 'optimization',
    description: '空程序段可以移除',
  },
  {
    id: 'LINE_NUMBER_GAP',
    name: '行号跳跃过大',
    severity: 'info',
    category: 'style',
    description: '行号间隔超过推荐值',
  },
];

interface StateContext {
  spindleOn: boolean;
  spindleSpeed: number;
  coolantOn: boolean;
  feedrate: number;
  toolSelected: boolean;
  currentTool: number;
  coordinateSet: boolean;
  coordinateSystem: number;
  units: 'mm' | 'inch' | null;
  absMode: boolean | null;
  plane: 'XY' | 'XZ' | 'YZ' | null;
  currentZ: number;
  safeZ: number;
  modalGCodes: Set<number>;
  modalMCodes: Set<number>;
  inMaterial: boolean;
  materialZSurface: number;
}

export class SyntaxChecker {
  private format: CNCFormat;
  private profile: FormatProfile;
  private state: StateContext;
  private violations: SyntaxViolation[];

  constructor(format: CNCFormat = CNCFormat.FANUC) {
    this.format = format;
    this.profile = FORMAT_PROFILES[format];
    this.state = this.createInitialState();
    this.violations = [];
  }

  private createInitialState(): StateContext {
    return {
      spindleOn: false,
      spindleSpeed: 0,
      coolantOn: false,
      feedrate: 0,
      toolSelected: false,
      currentTool: 0,
      coordinateSet: false,
      coordinateSystem: 0,
      units: null,
      absMode: null,
      plane: null,
      currentZ: 0,
      safeZ: 50,
      modalGCodes: new Set(),
      modalMCodes: new Set(),
      inMaterial: false,
      materialZSurface: 0,
    };
  }

  check(program: ParsedProgram): SyntaxReport {
    this.violations = [];
    this.state = this.createInitialState();

    this.checkStructure(program);

    for (let i = 0; i < program.commands.length; i++) {
      const cmd = program.commands[i];
      this.checkCommand(cmd, i);
    }

    this.checkFinalState();

    const errors = this.violations.filter(v => v.severity === 'error').length;
    const warnings = this.violations.filter(v => v.severity === 'warning').length;
    const infos = this.violations.filter(v => v.severity === 'info').length;

    return {
      violations: this.violations,
      summary: {
        total: this.violations.length,
        errors,
        warnings,
        infos,
      },
      rulesChecked: SYNTAX_RULES.map(r => r.id),
    };
  }

  private checkStructure(program: ParsedProgram): void {
    if (program.header.units) {
      this.state.units = program.header.units;
    }
  }

  private checkCommand(cmd: GCodeCommand, index: number): void {
    const line = cmd.lineNumber;

    switch (cmd.type) {
      case 'G':
        this.checkGCode(cmd, line);
        break;
      case 'M':
        this.checkMCode(cmd, line);
        break;
      case 'S':
        this.state.spindleSpeed = cmd.code;
        break;
      case 'F':
        this.state.feedrate = cmd.code;
        break;
      case 'T':
        this.checkToolChange(cmd, line);
        break;
    }

    this.checkAxisMoves(cmd, line);
  }

  private checkGCode(cmd: GCodeCommand, line: number): void {
    const code = cmd.code;
    const params = cmd.parameters;

    switch (code) {
      case 0:
        this.checkRapidMove(cmd, line);
        break;
      case 1:
        this.checkLinearMove(cmd, line);
        break;
      case 2:
      case 3:
        this.checkArcMove(cmd, line);
        break;
      case 17:
        this.state.plane = 'XY';
        break;
      case 18:
        this.state.plane = 'XZ';
        break;
      case 19:
        this.state.plane = 'YZ';
        break;
      case 20:
        if (this.state.units && this.state.units !== 'inch') {
          this.addViolation('UNITS_INCONSISTENT', line, '单位从公制切换为英制');
        }
        this.state.units = 'inch';
        break;
      case 21:
        if (this.state.units && this.state.units !== 'mm') {
          this.addViolation('UNITS_INCONSISTENT', line, '单位从英制切换为公制');
        }
        this.state.units = 'mm';
        break;
      case 28:
        break;
      case 40:
      case 41:
      case 42:
      case 43:
      case 49:
        break;
      case 54:
      case 55:
      case 56:
      case 57:
      case 58:
      case 59:
        this.state.coordinateSet = true;
        this.state.coordinateSystem = code;
        break;
      case 80:
        break;
      case 81:
      case 82:
      case 83:
      case 84:
      case 85:
      case 86:
      case 89:
        this.checkDrillingCycle(cmd, line);
        break;
      case 90:
        if (this.state.absMode === false) {
          this.addViolation('ABS_INCR_MIXED', line, '从相对坐标(G91)切换为绝对坐标(G90)');
        }
        this.state.absMode = true;
        break;
      case 91:
        if (this.state.absMode === true) {
          this.addViolation('ABS_INCR_MIXED', line, '从绝对坐标(G90)切换为相对坐标(G91)');
        }
        this.state.absMode = false;
        break;
    }

    if (this.state.modalGCodes.has(code)) {
      this.addViolation('MODAL_OVERWRITE', line, `G${code} 模态代码重复指定`, '建议移除重复的模态代码');
    }
    this.state.modalGCodes.add(code);
  }

  private checkMCode(cmd: GCodeCommand, line: number): void {
    const code = cmd.code;

    switch (code) {
      case 0:
      case 1:
        break;
      case 2:
      case 30:
        break;
      case 3:
        this.state.spindleOn = true;
        break;
      case 4:
        this.state.spindleOn = true;
        break;
      case 5:
        this.state.spindleOn = false;
        break;
      case 6:
        this.checkToolChangeM(line);
        break;
      case 7:
      case 8:
        this.state.coolantOn = true;
        break;
      case 9:
        this.state.coolantOn = false;
        break;
    }

    if (this.state.modalMCodes.has(code)) {
      this.addViolation('MODAL_OVERWRITE', line, `M${code} 模态代码重复指定`);
    }
    this.state.modalMCodes.add(code);
  }

  private checkRapidMove(cmd: GCodeCommand, line: number): void {
    const z = cmd.parameters.get('Z');
    const x = cmd.parameters.get('X');
    const y = cmd.parameters.get('Y');

    if (z !== undefined) {
      if (z < this.state.currentZ && this.state.inMaterial) {
        this.addViolation('RAPID_IN_MATERIAL', line, '在工件区域内Z轴快速移动', '建议改用G01进给');
      }
      if (z < this.state.materialZSurface - 0.5) {
        this.state.inMaterial = true;
      } else if (z >= this.state.materialZSurface) {
        this.state.inMaterial = false;
      }

      if (Math.abs(z - this.state.currentZ) > 100 && (x !== undefined || y !== undefined)) {
        this.addViolation('LARGE_Z_MOVE', line, 'Z轴大幅移动时同时移动XY轴', '建议先抬刀再水平移动');
      }
      this.state.currentZ = z;
    }
  }

  private checkLinearMove(cmd: GCodeCommand, line: number): void {
    if (this.state.feedrate === 0) {
      this.addViolation('FEEDRATE_MISSING', line, '直线进给前未设置进给率F', '请在切削前添加F指令');
    }

    if (!this.state.spindleOn) {
      this.addViolation('SPINDLE_NOT_STARTED', line, '切削进给前主轴未启动', '请添加M03/M04指令启动主轴');
    }

    const z = cmd.parameters.get('Z');
    if (z !== undefined) {
      if (z < this.state.materialZSurface) {
        if (!this.state.coolantOn) {
          this.addViolation('COOLANT_NOT_STARTED', line, '切入材料前冷却未启动', '建议添加M08/M07开启冷却');
        }
        this.state.inMaterial = true;
      }
      this.state.currentZ = z;
    }
  }

  private checkArcMove(cmd: GCodeCommand, line: number): void {
    if (this.state.feedrate === 0) {
      this.addViolation('FEEDRATE_MISSING', line, '圆弧进给前未设置进给率F');
    }

    if (!this.state.spindleOn) {
      this.addViolation('SPINDLE_NOT_STARTED', line, '圆弧切削前主轴未启动');
    }

    const hasR = cmd.parameters.has('R');
    const hasIJK = cmd.parameters.has('I') || cmd.parameters.has('J') || cmd.parameters.has('K');

    if (!hasR && !hasIJK) {
      this.addViolation('ARC_RADIUS_INVALID', line, '圆弧指令缺少半径R或圆心IJK参数');
    }

    if ((cmd.code === 2 || cmd.code === 3) && this.state.plane === null) {
      this.addViolation('PLANE_INCONSISTENT', line, '圆弧指令前未设置平面(G17/G18/G19)');
    }
  }

  private checkDrillingCycle(cmd: GCodeCommand, line: number): void {
    if (!this.state.spindleOn) {
      this.addViolation('SPINDLE_NOT_STARTED', line, '钻孔循环前主轴未启动');
    }

    if (!this.state.coordinateSet) {
      this.addViolation('COORDINATE_SYSTEM_UNSET', line, '钻孔前未设置工件坐标系(G54-G59)');
    }
  }

  private checkToolChange(cmd: GCodeCommand, line: number): void {
    this.state.toolSelected = true;
    this.state.currentTool = cmd.code;

    if (this.state.spindleOn) {
      this.addViolation('TOOL_CHANGE_WITHOUT_STOP', line, '刀具选择时主轴仍在运行', '建议先执行M05停止主轴');
    }
  }

  private checkToolChangeM(line: number): void {
    if (this.state.spindleOn) {
      this.addViolation('TOOL_CHANGE_WITHOUT_STOP', line, '换刀指令M06执行时主轴仍在运行');
    }
  }

  private checkAxisMoves(cmd: GCodeCommand, line: number): void {
    if (!this.state.toolSelected && (cmd.type === 'G' && cmd.code >= 1 && cmd.code <= 3)) {
      this.addViolation('TOOL_NOT_SELECTED', line, '切削前未选择刀具');
    }
  }

  private checkFinalState(): void {
    if (!this.state.modalMCodes.has(2) && !this.state.modalMCodes.has(30)) {
      this.addViolation('PROGRAM_END_MISSING', 0, '程序未检测到结束指令M02/M30');
    }

    if (!this.state.coordinateSet) {
      this.addViolation('COORDINATE_SYSTEM_UNSET', 0, '整个程序未设置工件坐标系(G54-G59)');
    }
  }

  private addViolation(ruleId: string, line: number, message: string, suggestion?: string): void {
    const rule = SYNTAX_RULES.find(r => r.id === ruleId);
    if (!rule) return;

    this.violations.push({
      ruleId,
      ruleName: rule.name,
      line,
      message,
      severity: rule.severity,
      category: rule.category,
      suggestion,
    });
  }

  static getRules(): SyntaxRule[] {
    return [...SYNTAX_RULES];
  }

  static getRulesByCategory(category: string): SyntaxRule[] {
    return SYNTAX_RULES.filter(r => r.category === category);
  }

  static getCategories(): string[] {
    return Array.from(new Set(SYNTAX_RULES.map(r => r.category)));
  }
}
