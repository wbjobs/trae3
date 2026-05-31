import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pipeline, PipelineDocument } from './pipeline.schema';

@Injectable()
export class PipelineService {
  constructor(
    @InjectModel(Pipeline.name) private pipelineModel: Model<PipelineDocument>,
  ) {}

  async findAll(type?: string): Promise<Pipeline[]> {
    const query = type ? { type } : {};
    return this.pipelineModel.find(query).exec();
  }

  async findOne(id: string): Promise<Pipeline> {
    return this.pipelineModel.findById(id).exec();
  }

  async create(pipelineData: any): Promise<Pipeline> {
    const createdPipeline = new this.pipelineModel(pipelineData);
    return createdPipeline.save();
  }

  async update(id: string, pipelineData: any): Promise<Pipeline> {
    return this.pipelineModel
      .findByIdAndUpdate(id, pipelineData, { new: true })
      .exec();
  }

  async delete(id: string): Promise<any> {
    return this.pipelineModel.findByIdAndDelete(id).exec();
  }

  async batchCreate(pipelines: any[]): Promise<Pipeline[]> {
    return this.pipelineModel.insertMany(pipelines);
  }

  async getPipelineTypes(): Promise<string[]> {
    return this.pipelineModel.distinct('type').exec();
  }

  async getStats(): Promise<any> {
    return this.pipelineModel.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgDiameter: { $avg: '$diameter' },
        },
      },
    ]);
  }
}
