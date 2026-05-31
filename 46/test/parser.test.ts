import { GCodeParser, FORMAT_PROFILES } from '../../src/parser';
import { CNCFormat } from '../../src/parser/types';

const SAMPLE_FANUC = `O0001
(SAMPLE FANUC PROGRAM)
G90 G54 G00 X0 Y0
G01 Z-5 F100
G01 X10 Y20
G02 X30 Y20 R10
G00 Z50
M30`;

const SAMPLE_SIEMENS = `%_MPF1;
G90 G54 G00 X0 Y0
G01 Z-5 F100
G01 X10 Y20
G02 X30 Y20 CR=10
G00 Z50
M30`;

const SAMPLE_MAC_CR = `O0001\r(SAMPLE FANUC PROGRAM)\rG90 G54 G00 X0 Y0\rG01 Z-5 F100\rG01 X10 Y20\rG00 Z50\rM30\r`;

const SAMPLE_MAC_CRLF = `O0001\r\n(SAMPLE FANUC PROGRAM)\r\nG90 G54 G00 X0 Y0\r\nG01 Z-5 F100\r\nG01 X10 Y20\r\nG00 Z50\r\nM30\r\n`;

const SAMPLE_MIXED_LINE_ENDINGS = `O0001\r\n(SAMPLE)\rG00 X0 Y0\nG01 Z-5\r\nM30`;

const SAMPLE_WITH_M02 = `O0001\nG90 G00 X0 Y0\nG01 Z-5 F100\nM02`;

const SAMPLE_WITH_NESTED_PARENS = `O0001\n(PARAM WITH (NESTED) PARENS)\nG01 X10 Y20\nM30`;

describe('GCodeParser', () => {
  test('should parse Fanuc format program', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    expect(result.header.format).toBe(CNCFormat.FANUC);
    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.metadata.totalCommands).toBeGreaterThan(0);
  });

  test('should extract G-code commands correctly', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    const gCommands = result.commands.filter(c => c.type === 'G');
    expect(gCommands.length).toBeGreaterThan(0);

    const g00 = gCommands.filter(c => c.code === 0);
    expect(g00.length).toBeGreaterThan(0);

    const g01 = gCommands.filter(c => c.code === 1);
    expect(g01.length).toBeGreaterThan(0);

    const g02 = gCommands.filter(c => c.code === 2);
    expect(g02.length).toBeGreaterThan(0);
  });

  test('should extract parameters from commands', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    const moveCmd = result.commands.find(
      c => c.type === 'G' && c.code === 1 && c.parameters.has('Z')
    );
    expect(moveCmd).toBeDefined();
    expect(moveCmd!.parameters.get('Z')).toBe(-5);
  });

  test('should compute correct metadata', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    expect(result.metadata.rapidMoves).toBeGreaterThan(0);
    expect(result.metadata.linearMoves).toBeGreaterThan(0);
    expect(result.metadata.arcMoves).toBeGreaterThan(0);
  });

  test('should compute bounding box', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    expect(result.metadata.boundingBox).toBeDefined();
    expect(result.metadata.boundingBox!.maxX).toBeGreaterThanOrEqual(10);
  });

  test('should detect program end (M30)', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);

    const hasEnd = result.commands.some(
      c => c.type === 'M' && c.code === 30
    );
    expect(hasEnd).toBe(true);
  });

  test('should validate program and return errors', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_FANUC);
    const errors = parser.validate(result);

    expect(Array.isArray(errors)).toBe(true);
  });

  test('should warn about missing end instruction', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const noEnd = 'G90 G00 X0 Y0\nG01 Z-5 F100';
    const result = parser.parse(noEnd);
    const errors = parser.validate(result);

    const endWarning = errors.find(e => e.message.includes('结束指令'));
    expect(endWarning).toBeDefined();
  });

  test('should handle empty input', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse('');

    expect(result.commands.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test('should parse Siemens format', () => {
    const parser = new GCodeParser(CNCFormat.SIEMENS);
    const result = parser.parse(SAMPLE_SIEMENS);

    expect(result.header.format).toBe(CNCFormat.SIEMENS);
    expect(result.commands.length).toBeGreaterThan(0);
  });
});

describe('GCodeParser - macOS line ending fixes', () => {
  test('should handle CR-only line endings (classic macOS)', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_MAC_CR);

    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);

    const hasG00 = result.commands.some(c => c.type === 'G' && c.code === 0);
    expect(hasG00).toBe(true);

    const hasM30 = result.commands.some(c => c.type === 'M' && c.code === 30);
    expect(hasM30).toBe(true);
  });

  test('should handle CRLF line endings (Windows/macOS modern)', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_MAC_CRLF);

    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
  });

  test('should handle mixed line endings', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_MIXED_LINE_ENDINGS);

    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
  });

  test('should not crash on empty lines after normalization', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const input = 'O0001\n\n\nG01 X10\n\n\nM30\n\n\n';
    const result = parser.parse(input);

    expect(result.commands.length).toBeGreaterThan(0);
    expect(result.errors.length).toBe(0);
  });

  test('should recognize M02 as end marker', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_WITH_M02);

    const hasEnd = result.commands.some(c => c.type === 'M' && c.code === 2);
    expect(hasEnd).toBe(true);
  });

  test('should handle non-greedy comment parsing', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const result = parser.parse(SAMPLE_WITH_NESTED_PARENS);

    expect(result.commands.length).toBeGreaterThan(0);

    const g01 = result.commands.find(c => c.type === 'G' && c.code === 1);
    expect(g01).toBeDefined();
    expect(g01!.parameters.get('X')).toBe(10);
    expect(g01!.parameters.get('Y')).toBe(20);
  });

  test('should handle NaN parameter values gracefully', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const input = 'O0001\nG01 X..5 Y10\nM30';
    const result = parser.parse(input);

    expect(result.commands.length).toBeGreaterThan(0);

    const nanWarnings = result.errors.filter(e => e.message.includes('值无效'));
    expect(nanWarnings.length).toBeGreaterThan(0);
  });
});

describe('FORMAT_PROFILES', () => {
  test('should have profiles for all formats', () => {
    const formats = Object.values(CNCFormat);
    for (const format of formats) {
      expect(FORMAT_PROFILES[format]).toBeDefined();
      expect(FORMAT_PROFILES[format].format).toBe(format);
    }
  });
});
