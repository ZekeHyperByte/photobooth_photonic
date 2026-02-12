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
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          state: ['zustand'],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
