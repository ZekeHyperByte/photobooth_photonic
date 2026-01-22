import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@photonic/config': path.resolve(__dirname, '../../packages/config/src'),
      '@photonic/types': path.resolve(__dirname, '../../packages/types/src'),
      '@photonic/utils': path.resolve(__dirname, '../../packages/utils/src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
