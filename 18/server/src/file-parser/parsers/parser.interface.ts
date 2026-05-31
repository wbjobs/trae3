export interface IFileParser {
  parse(buffer: Buffer, filename: string): Promise<string>;
}
