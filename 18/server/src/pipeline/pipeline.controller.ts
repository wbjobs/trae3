import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PipelineService } from './pipeline.service';
import { JwtGuard } from '../auth/jwt.guard';
import { AuditLog } from '../auth/audit-log.decorator';

@Controller('pipeline')
@UseGuards(JwtGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @AuditLog('pipeline_process')
  async uploadAndProcess(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: { department: string; classification: string; tags?: string },
    @Request() req: any,
  ) {
    return this.pipelineService.processFile(file, {
      department: metadata.department,
      classification: metadata.classification,
      tags: metadata.tags ? metadata.tags.split(',') : undefined,
      userId: req.user.id,
      username: req.user.username,
    });
  }

  @Get('status/:fileId')
  async getStatus(@Param('fileId') fileId: string) {
    const status = this.pipelineService.getStatus(fileId);
    if (!status) {
      return { success: false, message: 'File not found' };
    }
    return status;
  }
}
