import { Injectable } from '@nestjs/common';
import { IFileParser } from './parser.interface';
import * as XLSX from 'xlsx';

@Injectable()
export class ExcelParser implements IFileParser {
  async parse(buffer: Buffer, filename: string): Promise<string> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`=== ${sheetName} ===\n${csv}`);
    }

    return parts.join('\n\n');
  }
}
