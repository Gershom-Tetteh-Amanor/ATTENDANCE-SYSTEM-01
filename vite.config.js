import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 5173,
    https: false,
    open: true,
  },
  define: {
    'process.env': {}
  },
  envPrefix: 'VITE_',
});
