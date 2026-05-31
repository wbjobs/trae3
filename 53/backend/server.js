const express = require('express');
const cors = require('cors');
const path = require('path');

const archiveRoutes = require('./routes/archiveRoutes');
const fileRoutes = require('./routes/fileRoutes');
const importRoutes = require('./routes/importRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/archives', archiveRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/import', importRoutes);
app.use('/api/review', reviewRoutes);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '档案管理系统后端运行正常' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`API文档:
  - GET  /api/health - 健康检查
  
  档案管理:
  - POST /api/archives - 创建档案
  - GET  /api/archives - 查询档案列表
  - GET  /api/archives/:id - 获取档案详情
  - PUT  /api/archives/:id - 更新档案
  - DELETE /api/archives/:id - 删除档案
  - GET  /api/archives/number/generate - 生成档案编号
  
  文件管理:
  - POST /api/files/:archiveId - 上传文件
  - GET  /api/files/:archiveId/download - 下载文件
  - GET  /api/files/:archiveId/preview - 预览文件
  
  批量导入:
  - POST /api/import/upload - 上传导入文件
  - POST /api/import/confirm/:taskId - 确认导入
  - GET  /api/import/tasks - 查询导入任务
  - GET  /api/import/template - 下载导入模板
  
  审核流程:
  - GET    /api/review - 查询待审核列表
  - POST   /api/review/:id/submit - 提交审核
  - POST   /api/review/:id/approve - 审核通过
  - POST   /api/review/:id/reject - 审核驳回
  - POST   /api/review/:id/archive - 归档
  - GET    /api/review/:id/logs - 查询审核日志
  - GET    /api/review/stats - 审核统计
  - POST   /api/review/batch/approve - 批量审核通过
`);
});
