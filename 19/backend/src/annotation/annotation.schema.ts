import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnnotationDocument = Annotation & Document;

@Schema()
export class Annotation {
  @Prop({ required: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Pipeline' })
  pipelineId: string;

  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop({ required: true })
  z: number;

  @Prop()
  type: string;

  @Prop()
  content: string;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  author: string;
}

export const AnnotationSchema = SchemaFactory.createForClass(Annotation);
