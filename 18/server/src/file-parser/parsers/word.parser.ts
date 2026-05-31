import { Injectable } from '@nestjs/common';
import { IFileParser } from './parser.interface';
import * as mammoth from 'mammoth';

@Injectable()
export class WordParser implements IFileParser {
  async parse(buffer: Buffer, filename: string): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
