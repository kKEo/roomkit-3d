import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Dev-only test feeds for live screens and blocks (`make dev`; absent from the build):
 * - /__feeds/ticker       Server-Sent Events, one message a second
 * - /__feeds/ticker.json  the same value, fetched
 * Each value is screen fields usable without a transform: `values` for a graph, `stats` for a stats screen.
 */
function devFeeds() {
  let n = 0;
  const tick = () => {
    n++;
    const values = Array.from({ length: 12 }, (_, i) => Math.round(50 + 40 * Math.sin(n / 4 + i / 2) + Math.random() * 8));
    return {
      values, readout: `tick ${n}`,
      stats: [
        { value: n, label: 'ticks' },
        { value: values[0], unit: '%', label: 'first bar', delta: values[0] >= 50 ? '+' + (values[0] - 50) : String(values[0] - 50) },
        { value: new Date().toISOString().slice(11, 19), label: 'server time' },
      ],
    };
  };
  return {
    name: 'dev-feeds',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__feeds', (req, res, next) => {
        const path = req.url.split('?')[0];
        if (path === '/ticker.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(tick()));
        } else if (path === '/ticker') {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const send = () => res.write(`data: ${JSON.stringify(tick())}\n\n`);
          send();
          const timer = setInterval(send, 1000);
          req.on('close', () => clearInterval(timer));
        } else next();
      });
    },
  };
}

export default defineConfig({
  // relative base so the build works from any sub-path; scenes are fetched at runtime from ./scenes/
  base: './',
  plugins: [react(), devFeeds()],
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
