import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'www/index.html'
      }
    },
    // 确保大文件（如wasm）被正确处理
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 35000
  },
  server: {
    port: 5173,
    host: true
  },
  // 配置WASM文件处理
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@ffmpeg/core-mt']
  }
});
