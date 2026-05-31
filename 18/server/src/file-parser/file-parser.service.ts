import { Injectable } from '@nestjs/common';
import { PdfParser } from './parsers/pdf.parser';
import { WordParser } from './parsers/word.parser';
import { ExcelParser } from './parsers/excel.parser';
import { OcrParser } from './parsers/ocr.parser';
import { IFileParser } from './parsers/parser.interface';

type ParseJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ParseJob {
  id: string;
  filename: string;
  status: ParseJobStatus;
  result?: string;
  error?: string;
  createdAt: Date;
}

const MIME_PARSER_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
  'image/png': 'ocr',
  'image/jpeg': 'ocr',
  'image/tiff': 'ocr',
};

@Injectable()
export class FileParserService {
  private readonly jobs = new Map<string, ParseJob>();
  private readonly parsers: Record<string, IFileParser>;

  constructor(
    private readonly pdfParser: PdfParser,
    private readonly wordParser: WordParser,
    private readonly excelParser: ExcelParser,
    private readonly ocrParser: OcrParser,
  ) {
    this.parsers = {
      pdf: this.pdfParser,
      word: this.wordParser,
      excel: this.excelParser,
      ocr: this.ocrParser,
    };
  }

  async createJob(buffer: Buffer, filename: string, mimetype: string): Promise<ParseJob> {
    const id = crypto.randomUUID();
    const job: ParseJob = {
      id,
      filename,
      status: 'pending',
      createdAt: new Date(),
    };
    this.jobs.set(id, job);

    const parserType = MIME_PARSER_MAP[mimetype];
    if (!parserType) {
      job.status = 'failed';
      job.error = `Unsupported file type: ${mimetype}`;
      return job;
    }

    job.status = 'processing';
    this.processJob(job, buffer, filename, parserType);

    return job;
  }

  getJob(id: string): ParseJob | undefined {
    return this.jobs.get(id);
  }

  private async processJob(job: ParseJob, buffer: Buffer, filename: string, parserType: string): Promise<void> {
    try {
      const parser = this.parsers[parserType];
      const result = await parser.parse(buffer, filename);
      job.status = 'completed';
      job.result = result;
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }
}
