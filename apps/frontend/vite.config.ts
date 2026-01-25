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
    // Disable source maps in production for smaller bundles
    sourcemap: false,
    // Use terser for better minification and to strip console.* calls
    minify: 'terser',
    terserOptions: {
      compress: {
        // Remove console.* in production builds
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
      output: {
        // Code splitting for better caching
        manualChunks: {
          // Vendor chunk for React ecosystem
          vendor: ['react', 'react-dom'],
          // State management
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
