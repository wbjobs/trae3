import { Injectable } from '@nestjs/common';
import { IFileParser } from './parser.interface';
import { createWorker } from 'tesseract.js';

@Injectable()
export class OcrParser implements IFileParser {
  async parse(buffer: Buffer, filename: string): Promise<string> {
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data } = await worker.recognize(buffer as any);
    await worker.terminate();
    return data.text;
  }
}
