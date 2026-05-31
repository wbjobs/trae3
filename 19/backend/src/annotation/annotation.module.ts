import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Annotation, AnnotationSchema } from './annotation.schema';
import { AnnotationService } from './annotation.service';
import { AnnotationController } from './annotation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Annotation.name, schema: AnnotationSchema },
    ]),
  ],
  providers: [AnnotationService],
  controllers: [AnnotationController],
  exports: [AnnotationService],
})
export class AnnotationModule {}
