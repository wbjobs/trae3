import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FileParserModule } from './file-parser/file-parser.module';
import { DesensitizationModule } from './desensitization/desensitization.module';
import { VectorEmbeddingModule } from './vector-embedding/vector-embedding.module';
import { AiQaModule } from './ai-qa/ai-qa.module';
import { AuthModule } from './auth/auth.module';
import { StorageModule } from './storage/storage.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { CommonModule, TimeoutInterceptor } from './common/common.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      logging: false,
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'intranet-jwt-secret-key',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
    }),
    CommonModule,
    FileParserModule,
    DesensitizationModule,
    VectorEmbeddingModule,
    AiQaModule,
    AuthModule,
    StorageModule,
    PipelineModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
  ],
})
export class AppModule {}
