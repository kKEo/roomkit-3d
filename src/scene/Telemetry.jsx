import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useStore, runtime } from '../state/store.js';

const HIST = 120;   // frame times kept for the graph
const WINDOW = 1;   // seconds the averages cover

/**
 * Drives the canvas at a capped frame rate: the canvas runs with `frameloop="never"` and this
 * advances it on the display's refresh whenever a full frame interval has passed.
 */
function FrameCap({ fps }) {
  const advance = useThree(s => s.advance);
  const clock = useThree(s => s.clock);
  useEffect(() => {
    const step = 1000 / fps;
    let raf, last = performance.now(), due = last;
    const tick = now => {
      raf = requestAnimationFrame(tick);
      if (now < due - 1) return;
      due = Math.max(due + step, now); // keep the rhythm, but never try to catch up a backlog
      // the clock counts seconds since the frame loop last switched mode; carry it on rather than jump to page time
      advance(clock.elapsedTime + Math.min(0.25, (now - last) / 1000));
      last = now;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, advance, clock]);
  return null;
}

/**
 * Measures every frame while it is mounted (the System tab is open, or the overlay is on) and
 * publishes the figures in `runtime.stats` about four times a second:
 * frame rate and frame time, CPU time of the frame (every useFrame callback plus three.js
 * submitting the draw calls), GPU time where the browser has EXT_disjoint_timer_query_webgl2,
 * what three.js drew, and the JS heap where the browser reports it.
 */
function Probe() {
  const gl = useThree(s => s.gl);
  const scene = useThree(s => s.scene);
  const t = useRef(null);
  if (!t.current) t.current = { frames: [], hist: new Float32Array(HIST), hi: 0, start: 0, cpu: [], gpu: [], query: null, published: 0, longTasks: [] };

  useEffect(() => {
    const m = t.current, ctx = gl.getContext();
    const ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2');
    const render = gl.render;
    gl.render = function (...args) {
      const timing = ext && !m.query;
      if (timing) { m.query = ctx.createQuery(); ctx.beginQuery(ext.TIME_ELAPSED_EXT, m.query); }
      render.apply(this, args);
      if (timing) ctx.endQuery(ext.TIME_ELAPSED_EXT);
      m.cpu.push(performance.now() - m.start);
      const { render: r, memory } = gl.info;
      m.drawn = { calls: r.calls, triangles: r.triangles, points: r.points, lines: r.lines, geometries: memory.geometries, textures: memory.textures, programs: gl.info.programs?.length ?? 0 };
    };
    // results arrive a few frames later; a disjoint result (GPU throttled, context switch) is dropped
    m.poll = () => {
      if (!m.query) return;
      if (!ctx.getQueryParameter(m.query, ctx.QUERY_RESULT_AVAILABLE)) return;
      if (!ctx.getParameter(ext.GPU_DISJOINT_EXT)) m.gpu.push(ctx.getQueryParameter(m.query, ctx.QUERY_RESULT) / 1e6);
      ctx.deleteQuery(m.query);
      m.query = null;
    };
    let obs = null;
    try {
      obs = new PerformanceObserver(list => { for (const e of list.getEntries()) m.longTasks.push({ at: e.startTime, ms: e.duration }); });
      obs.observe({ type: 'longtask', buffered: false });
    } catch { obs = null; /* Firefox and Safari have no long-task timing */ }
    m.longTaskSupport = !!obs;
    m.gpuSupport = !!ext;
    return () => {
      gl.render = render;
      if (m.query) ctx.deleteQuery(m.query);
      obs?.disconnect();
      runtime.stats = null;
    };
  }, [gl]);

  // first in the frame: start the CPU clock (negative priorities run before the others and keep auto-rendering on)
  useFrame(() => {
    const m = t.current, now = performance.now();
    m.start = now;
    if (m.last) { m.hist[m.hi++ % HIST] = now - m.last; m.frames.push(now); }
    m.last = now;
    m.poll?.();
    if (now - m.published < 250) return;
    m.published = now;
    while (m.frames.length && m.frames[0] < now - WINDOW * 1000) m.frames.shift();
    const n = m.frames.length;
    const recent = [];
    for (let i = 1; i <= Math.min(n, HIST); i++) recent.push(m.hist[(m.hi - i + HIST) % HIST]);
    const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
    const cpu = avg(m.cpu), gpu = avg(m.gpu);
    m.longTasks = m.longTasks.filter(e => e.at > now - 10000);
    const mem = performance.memory;
    let objects = 0;
    scene.traverse(() => { objects++; });
    runtime.stats = {
      fps: n / WINDOW,
      frame: avg(recent),
      worst: recent.length ? Math.max(...recent) : null,
      cpu,
      busy: cpu != null ? Math.min(1, (cpu * n) / (WINDOW * 1000)) : null,
      gpu: m.gpuSupport ? gpu : undefined,
      ...m.drawn,
      objects,
      heap: mem ? { used: mem.usedJSHeapSize, total: mem.totalJSHeapSize, limit: mem.jsHeapSizeLimit } : null,
      longTasks: m.longTaskSupport ? { count: m.longTasks.length, ms: m.longTasks.reduce((s, e) => s + e.ms, 0) } : undefined,
      hist: Array.from({ length: HIST }, (_, i) => m.hist[(m.hi + i) % HIST]),
    };
    m.cpu = []; m.gpu = [];
  }, -1000);
  return null;
}

/** Hands the renderer to the DOM overlays, caps the frame rate and, when asked for, measures the frames. */
export function Telemetry() {
  const gl = useThree(s => s.gl);
  const fps = useStore(s => s.gfx.fps);
  const measuring = useStore(s => s.gfx.hud || (s.optionsOpen && s.optionsTab === 'system'));
  useEffect(() => { runtime.gl = gl; return () => { runtime.gl = null; }; }, [gl]);
  return (
    <>
      {fps > 0 && <FrameCap fps={fps} />}
      {measuring && <Probe />}
    </>
  );
}
