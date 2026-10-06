import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 3004,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3003',
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', request => request.setHeader('Origin', 'http://127.0.0.1:3003'))
      }
    }
  }
});
