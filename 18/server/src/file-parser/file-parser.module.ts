import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { FileParserController } from './file-parser.controller';
import { FileParserService } from './file-parser.service';
import { PdfParser } from './parsers/pdf.parser';
import { WordParser } from './parsers/word.parser';
import { ExcelParser } from './parsers/excel.parser';
import { OcrParser } from './parsers/ocr.parser';

@Module({
  imports: [MulterModule.register()],
  controllers: [FileParserController],
  providers: [FileParserService, PdfParser, WordParser, ExcelParser, OcrParser],
  exports: [FileParserService],
})
export class FileParserModule {}
