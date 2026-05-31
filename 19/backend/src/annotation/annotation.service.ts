import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Annotation, AnnotationDocument } from './annotation.schema';

@Injectable()
export class AnnotationService {
  constructor(
    @InjectModel(Annotation.name)
    private annotationModel: Model<AnnotationDocument>,
  ) {}

  async findAll(pipelineId?: string): Promise<Annotation[]> {
    const query = pipelineId ? { pipelineId } : {};
    return this.annotationModel.find(query).exec();
  }

  async findOne(id: string): Promise<Annotation> {
    return this.annotationModel.findById(id).exec();
  }

  async create(annotationData: any): Promise<Annotation> {
    const createdAnnotation = new this.annotationModel(annotationData);
    return createdAnnotation.save();
  }

  async update(id: string, annotationData: any): Promise<Annotation> {
    return this.annotationModel
      .findByIdAndUpdate(id, annotationData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<any> {
    return this.annotationModel.findByIdAndDelete(id).exec();
  }
}
