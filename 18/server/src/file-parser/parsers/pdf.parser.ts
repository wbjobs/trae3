import { Injectable } from '@nestjs/common';
import { IFileParser } from './parser.interface';
import * as pdfParse from 'pdf-parse';

@Injectable()
export class PdfParser implements IFileParser {
  async parse(buffer: Buffer, filename: string): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
  }
}
