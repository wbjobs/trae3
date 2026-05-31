import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { VectorEmbeddingService } from './vector-embedding.service';
import { EmbedDocumentDto, SearchDto } from './dto/embed.dto';
import { JwtGuard } from '../auth/jwt.guard';

@Controller('vector-embedding')
@UseGuards(JwtGuard)
export class VectorEmbeddingController {
  constructor(private readonly service: VectorEmbeddingService) {}

  @Post('embed')
  async embedDocument(@Body() dto: EmbedDocumentDto) {
    return this.service.embedDocument(dto.text, dto.documentId, dto.metadata);
  }

  @Post('search')
  async search(@Body() dto: SearchDto) {
    return this.service.search(
      dto.query,
      dto.topK || 5,
      dto.threshold || 0.5,
      dto.documentIds,
    );
  }

  @Delete('index/:documentId')
  async deleteIndex(@Param('documentId') documentId: string) {
    const deleted = this.service.deleteIndex(documentId);
    return { success: deleted, documentId };
  }

  @Get('stats')
  async getStats() {
    return this.service.getStats();
  }
}
