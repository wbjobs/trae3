import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { UploadFileDto, FileFilterDto } from './dto/upload.dto';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: UploadFileDto,
  ) {
    return this.storageService.uploadFile(file, {
      department: metadata.department,
      classification: metadata.classification,
      tags: metadata.tags,
    });
  }

  @Get('files')
  async getFiles(@Query() filter: FileFilterDto) {
    return this.storageService.getFiles(filter);
  }

  @Get('files/:id')
  async getFile(@Param('id') id: string) {
    return this.storageService.getFile(id);
  }

  @Get('files/:id/download')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const { buffer, record } = await this.storageService.downloadFile(id);
    res.setHeader('Content-Type', record.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${record.originalName}"`);
    res.send(buffer);
  }

  @Get('files/:id/desensitized')
  async downloadDesensitized(@Param('id') id: string, @Res() res: Response) {
    const { buffer, record } = await this.storageService.downloadDesensitized(id);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="desensitized_${record.originalName}"`,
    );
    res.send(buffer);
  }

  @Delete('files/:id')
  async deleteFile(@Param('id') id: string) {
    await this.storageService.deleteFile(id);
    return { message: 'File deleted successfully' };
  }
}
