import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileRecord } from './entities/file-record.entity';
import { DesensitizedFile } from './entities/desensitized-file.entity';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { MinioProvider, MinioClientProvider } from './minio.provider';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecord, DesensitizedFile])],
  controllers: [StorageController],
  providers: [StorageService, MinioProvider, MinioClientProvider],
  exports: [StorageService, MinioProvider],
})
export class StorageModule {}
