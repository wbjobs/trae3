import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PipelineDocument = Pipeline & Document;

@Schema()
export class Point {
  @Prop({ required: true })
  x: number;

  @Prop({ required: true })
  y: number;

  @Prop({ required: true })
  z: number;
}

@Schema()
export class Pipeline {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['water', 'sewage', 'electric', 'gas', 'heat'] })
  type: string;

  @Prop({ required: true })
  diameter: number;

  @Prop()
  material: string;

  @Prop({ type: [Point], required: true })
  points: Point[];

  @Prop()
  depth: number;

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop()
  description: string;
}

export const PipelineSchema = SchemaFactory.createForClass(Pipeline);
