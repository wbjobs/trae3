/**
 * local server entry file, for local development
 */
import app from './app.js'
import { prewarmWorker } from './services/invoice.js'

/**
 * start server with port
 */
const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log('Warming up OCR worker...')
  prewarmWorker().then(() => {
    console.log('OCR worker ready')
  }).catch((err) => {
    console.error('OCR worker warmup failed:', err)
  })
})

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;