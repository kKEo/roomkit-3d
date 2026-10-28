import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative base so the build works from any sub-path; scenes are fetched at runtime from ./scenes/
  base: './',
  plugins: [react()],
  // three.js alone is ~700 kB minified
  build: { chunkSizeWarningLimit: 1600 },
});
