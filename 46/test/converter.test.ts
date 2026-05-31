import { FormatConverter } from '../../src/converter/types';
import { GCodeParser } from '../../src/parser';
import { CNCFormat } from '../../src/parser/types';

const SAMPLE_FANUC = `O0001
G90 G54 G00 X0 Y0
G01 Z-5 F100
G01 X10 Y20
G02 X30 Y20 R10
G00 Z50
M30`;

describe('FormatConverter', () => {
  test('should convert Fanuc to Siemens', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const parsed = parser.parse(SAMPLE_FANUC);

    const converter = new FormatConverter({
      sourceFormat: CNCFormat.FANUC,
      targetFormat: CNCFormat.SIEMENS,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = converter.convert(parsed);

    expect(result.output).toBeDefined();
    expect(result.output.length).toBeGreaterThan(0);
    expect(result.stats.convertedCommands).toBeGreaterThan(0);
  });

  test('should convert Fanuc to Heidenhain', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const parsed = parser.parse(SAMPLE_FANUC);

    const converter = new FormatConverter({
      sourceFormat: CNCFormat.FANUC,
      targetFormat: CNCFormat.HEIDENHAIN,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = converter.convert(parsed);

    expect(result.output).toContain('BEGIN PGM');
    expect(result.output).toContain('END PGM');
  });

  test('should convert Siemens to Fanuc', () => {
    const parser = new GCodeParser(CNCFormat.SIEMENS);
    const siemens = `%_MPF1;\nG90 G54 G00 X0 Y0\nG01 Z-5 F100\nM30`;
    const parsed = parser.parse(siemens);

    const converter = new FormatConverter({
      sourceFormat: CNCFormat.SIEMENS,
      targetFormat: CNCFormat.FANUC,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = converter.convert(parsed);

    expect(result.output).toMatch(/^O/);
    expect(result.output).toContain('M30');
  });

  test('should generate correct program start for each format', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const parsed = parser.parse(SAMPLE_FANUC);

    const fanucConverter = new FormatConverter({
      sourceFormat: CNCFormat.FANUC,
      targetFormat: CNCFormat.FANUC,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = fanucConverter.convert(parsed);
    expect(result.output).toMatch(/^O/);
  });

  test('should preserve comments when option is set', () => {
    const withComment = `O0001\n(TEST COMMENT)\nG01 X10 Y20\nM30`;
    const parser = new GCodeParser(CNCFormat.FANUC);
    const parsed = parser.parse(withComment);

    const converter = new FormatConverter({
      sourceFormat: CNCFormat.FANUC,
      targetFormat: CNCFormat.SIEMENS,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = converter.convert(parsed);
    expect(result.output).toContain('TEST COMMENT');
  });

  test('should report conversion stats', () => {
    const parser = new GCodeParser(CNCFormat.FANUC);
    const parsed = parser.parse(SAMPLE_FANUC);

    const converter = new FormatConverter({
      sourceFormat: CNCFormat.FANUC,
      targetFormat: CNCFormat.SIEMENS,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    const result = converter.convert(parsed);

    expect(result.stats.totalCommands).toBeGreaterThan(0);
    expect(result.stats.convertedCommands).toBeGreaterThan(0);
    expect(typeof result.stats.skippedCommands).toBe('number');
    expect(Array.isArray(result.stats.unmappedCodes)).toBe(true);
  });

  test('getSupportedConversions should return all format pairs', () => {
    const conversions = FormatConverter.getSupportedConversions();
    expect(conversions.length).toBeGreaterThan(0);

    const fanucToSiemens = conversions.find(
      c => c.from === CNCFormat.FANUC && c.to === CNCFormat.SIEMENS
    );
    expect(fanucToSiemens).toBeDefined();
  });
});
