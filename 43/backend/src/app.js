const express = require('express');
const cors = require('cors');
const { initDatabases } = require('./config/database');
const { initDatabase } = require('./init');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use((req, res, next) => {
  res.status(404).json({
    code: 404,
    message: '请求的资源不存在'
  });
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误，请稍后重试'
  });
});

const PORT = process.env.PORT || 3003;

async function startServer() {
  try {
    await initDatabases();
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`服务器已启动，运行在 http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
