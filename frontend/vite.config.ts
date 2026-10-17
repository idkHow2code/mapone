import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8001,
    strictPort: true,
    // File change events don't reach Docker containers through Windows/macOS bind mounts, so poll instead
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
  preview: { port: 8001, strictPort: true },
});
