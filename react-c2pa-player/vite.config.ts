import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src/',
    },
  },
  server: {
    proxy: {
      '/playlists': {
        target: 'http://localhost:9000',
        changeOrigin: true,
        bypass: (req, res, options) => {
          // Bypass proxy for MP4 files - serve them from /public instead
          if (req.url?.endsWith('.mp4')) {
            return req.url;
          }
        },
      },
    },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
