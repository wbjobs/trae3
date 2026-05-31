import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileParserService } from './file-parser.service';

@Controller('file-parser')
export class FileParserController {
  constructor(private readonly fileParserService: FileParserService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: Express.Multer.File) {
    const job = await this.fileParserService.createJob(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return { id: job.id, filename: job.filename, status: job.status };
  }

  @Get('status/:id')
  getStatus(@Param('id') id: string) {
    const job = this.fileParserService.getJob(id);
    if (!job) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }
    return { id: job.id, filename: job.filename, status: job.status, error: job.error };
  }

  @Get('result/:id')
  getResult(@Param('id') id: string) {
    const job = this.fileParserService.getJob(id);
    if (!job) {
      throw new NotFoundException(`Job with id ${id} not found`);
    }
    if (job.status !== 'completed') {
      return { id: job.id, status: job.status, error: job.error };
    }
    return { id: job.id, filename: job.filename, status: job.status, result: job.result };
  }
}
