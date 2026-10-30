import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // relative base so the build works from any sub-path; scenes are fetched at runtime from ./scenes/
  base: './',
  plugins: [react()],
  // three.js alone is ~700 kB minified
  build: {
    chunkSizeWarningLimit: 1600,
    // two pages: the viewer (index.html) and the editor (edit.html)
    rollupOptions: { input: { main: fileURLToPath(new URL('index.html', import.meta.url)), edit: fileURLToPath(new URL('edit.html', import.meta.url)) } },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
