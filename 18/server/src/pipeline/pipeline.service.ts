import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { EventBus, EventTypes, RetryService } from '../common/common.module';
import { v4 as uuidv4 } from 'uuid';

export interface PipelineStatus {
  fileId: string;
  step: 'upload' | 'parsing' | 'parsed' | 'desensitizing' | 'desensitized' | 'embedding' | 'embedded' | 'completed' | 'failed';
  progress: number;
  message: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: any;
}

export interface PipelineContext {
  fileId: string;
  buffer?: Buffer;
  filename: string;
  mimeType: string;
  parsedText?: string;
  desensitizedText?: string;
  desensitizeResult?: any;
  embedResult?: any;
  metadata: {
    department: string;
    classification: string;
    tags?: string[];
    userId: string;
    username: string;
  };
}

@Injectable()
export class PipelineService implements OnModuleInit {
  private readonly logger = new Logger(PipelineService.name);
  private readonly statusMap = new Map<string, PipelineStatus>();
  private readonly contextMap = new Map<string, PipelineContext>();

  constructor(
    private readonly eventBus: EventBus,
    private readonly retryService: RetryService,
  ) {}

  onModuleInit() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.eventBus.subscribe(EventTypes.FILE_PARSED, async (event) => {
      const { fileId, text } = event.payload;
      this.logger.log(`File parsed: ${fileId}, text length: ${text?.length}`);
      this.updateStatus(fileId, 'parsed', 35, '文件解析完成');
      const ctx = this.contextMap.get(fileId);
      if (ctx) {
        ctx.parsedText = text;
        await this.startDesensitization(ctx);
      }
    });

    this.eventBus.subscribe(EventTypes.FILE_DESENSITIZED, async (event) => {
      const { fileId, result } = event.payload;
      this.logger.log(`File desensitized: ${fileId}, matches: ${result?.matches?.length}`);
      this.updateStatus(fileId, 'desensitized', 65, '内容脱敏完成');
      const ctx = this.contextMap.get(fileId);
      if (ctx) {
        ctx.desensitizedText = result?.desensitizedText;
        ctx.desensitizeResult = result;
        await this.startEmbedding(ctx);
      }
    });

    this.eventBus.subscribe(EventTypes.FILE_EMBEDDED, async (event) => {
      const { fileId } = event.payload;
      this.logger.log(`File embedded: ${fileId}`);
      this.updateStatus(fileId, 'embedded', 90, '向量化存储完成');
      const ctx = this.contextMap.get(fileId);
      if (ctx) {
        await this.completePipeline(ctx);
      }
    });

    this.eventBus.subscribe(EventTypes.ERROR, (event) => {
      const { fileId, error } = event.payload;
      if (fileId) {
        this.updateStatus(fileId, 'failed', 0, '处理失败', error);
      }
    });
  }

  async processFile(
    file: Express.Multer.File,
    metadata: PipelineContext['metadata'],
  ): Promise<{ fileId: string; status: PipelineStatus }> {
    const fileId = uuidv4();
    const startTime = Date.now();

    const context: PipelineContext = {
      fileId,
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      metadata,
    };

    this.contextMap.set(fileId, context);
    this.updateStatus(fileId, 'upload', 5, '文件上传中...');

    try {
      this.eventBus.publish(EventTypes.FILE_UPLOADED, {
        fileId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        department: metadata.department,
        classification: metadata.classification,
        uploadedBy: metadata.userId,
      }, { source: 'pipeline', correlationId: fileId });

      this.updateStatus(fileId, 'parsing', 15, '文件解析中...');
      await this.startParsing(context);

      return { fileId, status: this.statusMap.get(fileId)! };
    } catch (error: any) {
      this.updateStatus(fileId, 'failed', 0, '处理失败', error.message);
      this.eventBus.publish(EventTypes.ERROR, { fileId, error: error.message });
      throw error;
    }
  }

  private async startParsing(ctx: PipelineContext): Promise<void> {
    try {
      await this.retryService.execute(
        async () => {
          this.eventBus.publish(EventTypes.FILE_PARSED, {
            fileId: ctx.fileId,
            text: `Mock parsed content for ${ctx.filename}`,
          }, { source: 'pipeline', correlationId: ctx.fileId });
          return Promise.resolve();
        },
        {
          maxRetries: 2,
          initialDelay: 500,
          shouldRetry: (err) => this.retryService.isRetryableError(err),
        },
      );
    } catch (error: any) {
      this.eventBus.publish(EventTypes.ERROR, {
        fileId: ctx.fileId,
        error: `Parsing failed: ${error.message}`,
      });
      throw error;
    }
  }

  private async startDesensitization(ctx: PipelineContext): Promise<void> {
    if (!ctx.parsedText) return;
    this.updateStatus(ctx.fileId, 'desensitizing', 45, '内容脱敏中...');

    try {
      this.eventBus.publish(EventTypes.FILE_DESENSITIZED, {
        fileId: ctx.fileId,
        result: {
          desensitizedText: ctx.parsedText,
          matches: [],
          statistics: {},
        },
      }, { source: 'pipeline', correlationId: ctx.fileId });
    } catch (error: any) {
      this.eventBus.publish(EventTypes.ERROR, {
        fileId: ctx.fileId,
        error: `Desensitization failed: ${error.message}`,
      });
      throw error;
    }
  }

  private async startEmbedding(ctx: PipelineContext): Promise<void> {
    if (!ctx.desensitizedText) return;
    this.updateStatus(ctx.fileId, 'embedding', 75, '向量化存储中...');

    try {
      this.eventBus.publish(EventTypes.FILE_EMBEDDED, {
        fileId: ctx.fileId,
        chunkCount: 1,
      }, { source: 'pipeline', correlationId: ctx.fileId });
    } catch (error: any) {
      this.eventBus.publish(EventTypes.ERROR, {
        fileId: ctx.fileId,
        error: `Embedding failed: ${error.message}`,
      });
      throw error;
    }
  }

  private async completePipeline(ctx: PipelineContext): Promise<void> {
    this.updateStatus(ctx.fileId, 'completed', 100, '全流程处理完成');
    this.logger.log(`Pipeline completed for ${ctx.fileId}: ${ctx.filename}`);
  }

  getStatus(fileId: string): PipelineStatus | undefined {
    return this.statusMap.get(fileId);
  }

  private updateStatus(
    fileId: string,
    step: PipelineStatus['step'],
    progress: number,
    message: string,
    error?: string,
  ): void {
    const now = new Date();
    const existing = this.statusMap.get(fileId);
    this.statusMap.set(fileId, {
      fileId,
      step,
      progress,
      message,
      error,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }
}
