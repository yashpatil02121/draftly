import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev, /api is proxied to the Fastify server so the browser sees one origin.
    proxy: { '/api': 'http://localhost:3001' },
  },
});
