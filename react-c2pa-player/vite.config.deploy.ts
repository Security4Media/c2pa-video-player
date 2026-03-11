import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployment config for GitHub Pages
export default defineConfig({
  base: '/react-c2pa-player/', // Set to repo subfolder
  plugins: [react()],
  build: {
    outDir: '../docs', // Output to /docs for GitHub Pages
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
