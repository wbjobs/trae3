process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

beforeAll(async () => {
  console.log('Test suite starting...');
});

afterAll(async () => {
  console.log('Test suite completed.');
});

process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection during test:', reason);
});
