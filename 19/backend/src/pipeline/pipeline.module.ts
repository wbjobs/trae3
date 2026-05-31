import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Pipeline, PipelineSchema } from './pipeline.schema';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
  ],
  providers: [PipelineService],
  controllers: [PipelineController],
  exports: [PipelineService],
})
export class PipelineModule {}
