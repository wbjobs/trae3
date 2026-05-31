import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Sse,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AiQaService } from './ai-qa.service';
import { AskDto } from './dto/qa.dto';
import { QAResponse, Conversation } from './types';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('ai-qa')
export class AiQaController {
  constructor(private readonly aiQaService: AiQaService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async ask(@Body() dto: AskDto): Promise<QAResponse> {
    return this.aiQaService.ask(dto);
  }

  @Sse('ask-stream')
  askStream(@Body() dto: AskDto): Observable<MessageEvent> {
    return this.aiQaService.askStream(dto).pipe(
      map((chunk) => ({ data: chunk } as MessageEvent)),
    );
  }

  @Get('conversations')
  getConversations(): Conversation[] {
    return this.aiQaService.getConversations();
  }

  @Get('conversations/:id')
  getConversation(@Param('id') id: string): Conversation {
    return this.aiQaService.getConversation(id);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConversation(@Param('id') id: string): void {
    this.aiQaService.deleteConversation(id);
  }

  @Get('performance-stats')
  getPerformanceStats() {
    return this.aiQaService.getPerformanceStats();
  }

  @Post('clear-cache')
  @HttpCode(HttpStatus.NO_CONTENT)
  clearCache(): void {
    this.aiQaService.clearCache();
  }
}
