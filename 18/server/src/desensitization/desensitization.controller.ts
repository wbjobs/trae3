import { Controller, Post, Get, Param, Body, Sse, Delete } from '@nestjs/common';
import { Observable } from 'rxjs';
import { DesensitizationService } from './desensitization.service';
import { StreamingDesensitizeService, DesensitizeProgress } from './streaming-desensitize.service';
import { CreateDesensitizeDto } from './dto/desensitize.dto';

@Controller('desensitization')
export class DesensitizationController {
  constructor(
    private readonly service: DesensitizationService,
    private readonly streamingService: StreamingDesensitizeService,
  ) {}

  @Post('process')
  async process(@Body() dto: CreateDesensitizeDto) {
    return this.service.processText(dto.text, dto);
  }

  @Post('process-large')
  async processLarge(@Body() dto: CreateDesensitizeDto & { fileId?: string }) {
    const fileId = dto.fileId || crypto.randomUUID();
    return this.streamingService.desensitizeLargeText(fileId, dto.text, dto);
  }

  @Sse('process-stream/:fileId')
  processStream(
    @Param('fileId') fileId: string,
    @Body() dto: CreateDesensitizeDto,
  ): Observable<{ data: DesensitizeProgress }> {
    return this.streamingService.desensitizeStream(fileId, dto.text, dto).pipe(
      (obs) => new Observable<{ data: DesensitizeProgress }>((subscriber) => {
        return obs.subscribe({
          next: (progress) => subscriber.next({ data: progress }),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      }),
    );
  }

  @Get('progress/:fileId')
  async getProgress(@Param('fileId') fileId: string) {
    const progress = this.streamingService.getProgress(fileId);
    return { fileId, progress };
  }

  @Delete('cancel/:fileId')
  async cancelJob(@Param('fileId') fileId: string) {
    const cancelled = this.streamingService.cancelJob(fileId);
    return { fileId, cancelled };
  }

  @Post('process-file/:fileId')
  async processFile(@Param('fileId') fileId: string, @Body() dto: CreateDesensitizeDto) {
    return this.service.processTextForFile(fileId, dto.text, dto);
  }

  @Get('rules')
  async getRules() {
    const rules = this.service.getAllRuleTypes();
    return { rules };
  }

  @Get('history/:fileId')
  async getHistory(@Param('fileId') fileId: string) {
    const history = this.service.getHistory(fileId);
    return { fileId, history };
  }
}
