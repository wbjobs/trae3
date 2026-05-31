import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PipelineModule } from './pipeline/pipeline.module';
import { AnnotationModule } from './annotation/annotation.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/pipeline-db', {
      
    }),
    PipelineModule,
    AnnotationModule,
  ],
})
export class AppModule {}
