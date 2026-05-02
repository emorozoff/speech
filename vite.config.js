import { defineConfig } from 'vite';

// GitHub Pages serves the project at /<repo-name>/, so base must match.
// For local dev (`npm run dev`), base is automatically "/".
export default defineConfig({
  base: '/speech/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
});
