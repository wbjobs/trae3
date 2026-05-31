import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(({ mode }) => {
  return {
    plugins: [angular()],
    resolve: {
      mainFields: ['module'],
      alias: {
        '@app': '/src/app',
        '@core': '/src/app/core',
        '@shared': '/src/app/shared',
        '@modules': '/src/app/modules',
        '@assets': '/src/assets',
        '@styles': '/src/styles',
      },
    },
    server: {
      port: 4200,
      host: 'localhost',
      open: true,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist/ancient-book-collation-platform',
      sourcemap: mode === 'development',
      minify: mode === 'production',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
  };
});
