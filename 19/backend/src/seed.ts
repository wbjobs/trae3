import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PipelineService } from './pipeline/pipeline.service';
import { AnnotationService } from './annotation/annotation.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const pipelineService = app.get(PipelineService);
  const annotationService = app.get(AnnotationService);
  
  console.log('🌱 开始初始化测试数据...');
  
  const pipelines = generateMockPipelines();
  
  for (const pipeline of pipelines) {
    await pipelineService.create(pipeline);
    console.log(`✅ 创建管线: ${pipeline.name}`);
  }
  
  const annotations = generateMockAnnotations();
  
  for (const annotation of annotations) {
    await annotationService.create(annotation);
    console.log(`✅ 创建标注: ${annotation.name}`);
  }
  
  console.log('\n🎉 数据初始化完成!');
  console.log(`   - 管线数据: ${pipelines.length} 条`);
  console.log(`   - 标注数据: ${annotations.length} 条`);
  
  await app.close();
}

function generateMockPipelines() {
  const pipelines = [];
  const types = ['water', 'sewage', 'electric', 'gas', 'heat'];
  const typeNames = {
    water: '给水',
    sewage: '排水',
    electric: '电力',
    gas: '燃气',
    heat: '热力',
  };
  const materials = {
    water: '球墨铸铁管',
    sewage: 'HDPE双壁波纹管',
    electric: 'PVC-C电力管',
    gas: '无缝钢管',
    heat: '预制直埋保温管',
  };
  
  types.forEach((type, typeIndex) => {
    const baseY = -5 - typeIndex * 2;
    
    for (let i = 0; i < 5; i++) {
      const startX = -40 + i * 20;
      const points = [];
      const segments = 5 + Math.floor(Math.random() * 5);
      
      for (let j = 0; j < segments; j++) {
        points.push({
          x: startX + j * 8,
          y: baseY + (Math.random() - 0.5) * 2,
          z: -30 + typeIndex * 15 + (Math.random() - 0.5) * 5,
        });
      }
      
      pipelines.push({
        name: `${typeNames[type]}管线-${i + 1}`,
        type: type,
        diameter: 0.3 + Math.random() * 0.5,
        material: materials[type],
        points: points,
        depth: Math.abs(baseY),
        description: `这是一条${typeNames[type]}管线，用于城市地下管网系统`,
      });
    }
  });
  
  return pipelines;
}

function generateMockAnnotations() {
  return [
    {
      name: '阀门节点',
      type: 'valve',
      x: 0,
      y: -5,
      z: 0,
      content: '主供水阀门，型号: DN200，上次检修: 2024-01-15',
      author: '系统管理员',
    },
    {
      name: '转弯接头',
      type: 'joint',
      x: 20,
      y: -7,
      z: 10,
      content: '90度弯头，材质: 球墨铸铁',
      author: '系统管理员',
    },
    {
      name: '检查井',
      type: 'manhole',
      x: -20,
      y: -9,
      z: -15,
      content: '排水检查井，直径: 1000mm',
      author: '系统管理员',
    },
    {
      name: '变压器连接点',
      type: 'transformer',
      x: 10,
      y: -11,
      z: 25,
      content: '10kV电力接入点',
      author: '系统管理员',
    },
  ];
}

bootstrap();
