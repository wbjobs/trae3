import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import sensorRoutes from './routes/sensors.js';
import panelRoutes from './routes/panels.js';
import dataRoutes from './routes/data.js';
import metadataRoutes from './routes/metadata.js';
import { requireAuth, requirePermission } from './middleware/permission.js';
import './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app: express.Application = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authRoutes);

app.use('/api/sensors', requireAuth, requirePermission('sensor:read'), sensorRoutes);
app.use('/api/panels', requireAuth, requirePermission('panel:read'), panelRoutes);
app.use('/api/data', requireAuth, requirePermission('data:read'), dataRoutes);
app.use('/api/metadata', requireAuth, requirePermission('metadata:read'), metadataRoutes);

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    });
  },
);

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', error.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Server internal error' : error.message,
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  });
});

export default app;
