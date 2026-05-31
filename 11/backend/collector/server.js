const Koa = require('koa');
const Router = require('koa-router');
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser');
const dotenv = require('dotenv');
const DataSimulator = require('./dataSimulator');
const DataForwarder = require('./dataForwarder');

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });

const app = new Koa();
const router = new Router();
const simulator = new DataSimulator();
const forwarder = new DataForwarder();

const COLLECTOR_PORT = process.env.COLLECTOR_PORT || 3001;
const COLLECTION_INTERVAL = 5000;

let collectionInterval = null;
let isCollecting = false;

router.get('/health', (ctx) => {
  ctx.body = {
    status: 'ok',
    service: 'data-collector',
    collecting: isCollecting,
    timestamp: new Date().toISOString()
  };
});

router.post('/collect/start', (ctx) => {
  if (isCollecting) {
    ctx.body = { status: 'already collecting' };
    return;
  }

  isCollecting = true;

  collectionInterval = setInterval(async () => {
        const data = simulator.generateAllDevicesData();
        console.log(`[${new Date().toISOString()}] Collected data for`, data.length, `devices`);
        await forwarder.forward(data);
      }, COLLECTION_INTERVAL);

  ctx.body = { status: 'started', interval: `${COLLECTION_INTERVAL}ms` };
});

router.post('/collect/stop', (ctx) => {
  if (!isCollecting) {
    ctx.body = { status: 'not collecting' };
    return;
  }

  clearInterval(collectionInterval);
  isCollecting = false;
  ctx.body = { status: 'stopped' };
});

router.get('/collect/status', (ctx) => {
  ctx.body = {
    collecting: isCollecting,
    interval: COLLECTION_INTERVAL
  };
});

router.post('/collect/once', async (ctx) => {
  const data = simulator.generateAllDevicesData();
  await forwarder.forward(data);
  ctx.body = {
    status: 'collected',
    count: data.length,
    data: data
  };
});

router.get('/devices', (ctx) => {
  ctx.body = {
    devices: simulator.getDevices()
  };
});

app.use(cors());
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

async function startServer() {
  await forwarder.initMqtt();

  app.listen(COLLECTOR_PORT, () => {
    console.log(`Data Collector Service running on port ${COLLECTOR_PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Gateway URL: ${forwarder.gatewayUrl}`);
  });

  if (process.env.AUTO_START_COLLECTION === 'true') {
    setTimeout(() => {
      console.log('Auto-starting data collection...');
      isCollecting = true;
      collectionInterval = setInterval(async () => {
        const data = simulator.generateAllDevicesData();
        console.log(`[${new Date().toISOString()}] Auto-collected data for`, data.length, `devices`);
        await forwarder.forward(data);
      }, COLLECTION_INTERVAL);
    }, 3000);
  }
}

process.on('SIGINT', () => {
  console.log('Shutting down data collector...');
  if (collectionInterval) {
    clearInterval(collectionInterval);
  }
  forwarder.close();
  process.exit(0);
});

startServer();
