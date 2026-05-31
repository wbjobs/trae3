module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main/**',
    '!src/renderer/**',
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
