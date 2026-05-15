import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src/dashboard',
  plugins: [react(), tailwindcss()],
  server: {
    port: 7072,
  },
  build: {
    outDir: '../../dist/dashboard',
    emptyOutDir: true,
  },
});
