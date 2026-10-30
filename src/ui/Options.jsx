import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, runtime } from '../state/store.js';
import { EASE, EASE_NAMES } from '../lib/easing.js';
import { GFX_CHOICES, GFX_RELOAD } from '../lib/gfx.js';
import { fmtBytes, fmtCount, fmtMs, reportText, graphicsInfo, displayInfo, deviceInfo } from '../lib/sysinfo.js';

function EaseCurve({ ease, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, c = cv.getContext('2d'), w = cv.width, h = cv.height, pad = 22;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = color; c.globalAlpha = 0.2; c.lineWidth = 1;
    c.beginPath(); c.moveTo(pad, h - pad); c.lineTo(w - pad, h - pad); c.moveTo(pad, h - pad); c.lineTo(pad, pad); c.stroke();
    c.setLineDash([4, 6]); c.beginPath(); c.moveTo(pad, h - pad); c.lineTo(w - pad, pad); c.stroke(); c.setLineDash([]);
    c.globalAlpha = 1; c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, X = pad + t * (w - 2 * pad), Y = h - pad - EASE[ease](t) * (h - 2 * pad);
      i ? c.lineTo(X, Y) : c.moveTo(X, Y);
    }
    c.stroke();
  }, [ease, color]);
  return <canvas ref={ref} width="476" height="180" aria-hidden="true" />;
}

/** Frame times as bars, with guides at 60 and 30 fps; a taller bar is a slower frame. */
export function FrameGraph({ hist, color, height = 90 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, c = cv.getContext('2d'), w = cv.width, h = cv.height;
    const top = 50; // ms at the top edge
    c.clearRect(0, 0, w, h);
    c.fillStyle = color; c.strokeStyle = color;
    c.globalAlpha = 0.25; c.setLineDash([4, 6]); c.beginPath();
    for (const ms of [1000 / 60, 1000 / 30]) { const y = h - (ms / top) * h; c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke(); c.setLineDash([]);
    c.globalAlpha = 0.8;
    const bw = w / hist.length;
    hist.forEach((ms, i) => { const bh = Math.min(h, (ms / top) * h); c.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh); });
  }, [hist, color]);
  return <canvas ref={ref} width="476" height={height * 2} style={{ height }} aria-hidden="true" />;
}

function Select({ label, value, options, onChange }) {
  return (
    <label>{label}
      <select value={String(value)} onChange={e => onChange(options.find(([v]) => String(v) === e.target.value)[0])}>
        {options.map(([v, text]) => <option key={String(v)} value={String(v)}>{text}</option>)}
      </select>
    </label>
  );
}

function General({ ui }) {
  const gfx = useStore(s => s.gfx);
  const { setGfx, resetGfx } = useStore.getState();
  const made = runtime.glAttrs || {};
  const reload = GFX_RELOAD.some(k => gfx[k] !== made[k]);
  return (
    <>
      <Select label={ui.resolution} value={gfx.dpr} onChange={v => setGfx('dpr', v)}
        options={GFX_CHOICES.dpr.map(v => [v, v === 'auto' ? ui.resolutionAuto : `${v * 100} %`])} />
      <Select label={ui.fpsLimit} value={gfx.fps} onChange={v => setGfx('fps', v)}
        options={GFX_CHOICES.fps.map(v => [v, v ? `${v} fps` : ui.fpsUnlimited])} />
      <Select label={ui.particlesLevel} value={gfx.particles} onChange={v => setGfx('particles', v)}
        options={GFX_CHOICES.particles.map(v => [v, ui.particlesLevels?.[v] || String(v)])} />
      <Select label={ui.gpuPower} value={gfx.power} onChange={v => setGfx('power', v)}
        options={GFX_CHOICES.power.map(v => [v, ui.gpuPowers?.[v] || v])} />
      <label className="check"><input type="checkbox" checked={gfx.antialias} onChange={e => setGfx('antialias', e.target.checked)} /> {ui.antialias}</label>
      <label className="check"><input type="checkbox" checked={gfx.hud} onChange={e => setGfx('hud', e.target.checked)} /> {ui.perfOverlay}</label>
      {reload && (
        <p className="note">{ui.needsReload} <button type="button" onClick={() => location.reload()}>{ui.reload}</button></p>
      )}
      <button type="button" onClick={resetGfx}>{ui.resetDefaults}</button>
    </>
  );
}

function Camera({ ui, scene }) {
  const settings = useStore(s => s.settings);
  const setSetting = useStore(s => s.setSetting);
  return (
    <>
      <label>{ui.easeLabel}
        <select value={settings.ease} onChange={e => setSetting('ease', e.target.value)}>
          {EASE_NAMES.map(n => <option key={n} value={n}>{ui.ease?.[n] || n}</option>)}
        </select>
        <EaseCurve ease={settings.ease} color={scene.theme.accent} />
      </label>
      <label>{ui.parallax}: <output>{settings.parallax}</output>
        <input type="range" min="0" max="1.6" step="0.05" value={settings.parallax} onChange={e => setSetting('parallax', +e.target.value)} />
      </label>
      <label>{ui.warp}: <output>{settings.warp}</output>°
        <input type="range" min="0" max="28" step="1" value={settings.warp} onChange={e => setSetting('warp', +e.target.value)} />
      </label>
    </>
  );
}

/** The live figures (from `runtime.stats`) and what the browser tells about the GPU, screen and device. */
function systemSections(ui, stats, gl, graphics, gfx) {
  const T = ui.systemSections || {}, na = ui.notReported;
  const s = stats || {};
  const sections = [
    { key: 'rendering', title: T.rendering, rows: [
      ['Frame rate', s.fps != null ? `${s.fps.toFixed(0)} fps${gfx.fps ? ` (limit ${gfx.fps})` : ''}` : '—'],
      ['Frame time', `${fmtMs(s.frame)} average, ${fmtMs(s.worst)} worst`],
      ['CPU per frame', fmtMs(s.cpu)],
      ['Main thread busy', s.busy != null ? `${(s.busy * 100).toFixed(0)} % (render loop)` : '—'],
      ['GPU per frame', s.gpu === undefined ? na : fmtMs(s.gpu)],
      ['Long tasks (10 s)', s.longTasks ? `${s.longTasks.count}, ${fmtMs(s.longTasks.ms)}` : na],
      ['Draw calls', fmtCount(s.calls)],
      ['Triangles', fmtCount(s.triangles)],
      ['Points / lines', `${fmtCount(s.points)} / ${fmtCount(s.lines)}`],
      ['Scene objects', fmtCount(s.objects)],
      ['Shader programs', fmtCount(s.programs)],
    ] },
    { key: 'memory', title: T.memory, rows: [
      ['JS heap used', s.heap ? fmtBytes(s.heap.used) : na],
      ['JS heap allocated', s.heap ? fmtBytes(s.heap.total) : na],
      ['JS heap limit', s.heap ? fmtBytes(s.heap.limit) : na],
      ['Device memory', navigator.deviceMemory ? `about ${navigator.deviceMemory} GB` : na],
      ['GPU geometries', fmtCount(s.geometries)],
      ['GPU textures', fmtCount(s.textures)],
    ] },
    { key: 'graphics', title: T.graphics, rows: graphics.rows },
    { key: 'display', title: T.display, rows: gl ? displayInfo(gl, runtime.view) : [] },
    { key: 'device', title: T.device, rows: deviceInfo() },
  ];
  return sections;
}

function System({ ui, scene }) {
  const gfx = useStore(s => s.gfx);
  const [stats, setStats] = useState(runtime.stats);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setStats(runtime.stats), 250);
    return () => clearInterval(id);
  }, []);
  const gl = runtime.gl;
  const graphics = useMemo(() => (gl ? graphicsInfo(gl) : { rows: [], extensions: [] }), [gl]);
  const { extensions } = graphics;
  const sections = useMemo(() => systemSections(ui, stats, gl, graphics, gfx), [ui, stats, gl, graphics, gfx]);
  const copy = () => {
    const text = reportText(sections, [`## ${ui.extensions}`, ...extensions, '', `scene: ${scene.name}`, `url: ${location.href}`, `time: ${new Date().toISOString()}`]);
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };
  return (
    <>
      {stats?.hist && <FrameGraph hist={stats.hist} color={scene.theme.accent} />}
      {sections.map(({ key, title, rows }) => (
        <section key={key}>
          <h4>{title}</h4>
          <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>
        </section>
      ))}
      <details>
        <summary>{ui.extensions} ({extensions.length})</summary>
        <ul>{extensions.map(e => <li key={e}>{e}</li>)}</ul>
      </details>
      <button type="button" onClick={copy}>{copied ? ui.copied : ui.copyReport}</button>
    </>
  );
}

const TABS = ['general', 'camera', 'system'];

/** The Options popover: rendering preferences, camera feel and a technical readout, one tab each. */
export function Options() {
  const open = useStore(s => s.optionsOpen);
  const tab = useStore(s => s.optionsTab);
  const scene = useStore(s => s.scene);
  const setTab = useStore(s => s.setOptionsTab);
  const ui = scene.ui;
  if (!open) return null;
  const onKey = e => {
    const i = TABS.indexOf(tab), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const next = TABS[(i + d + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`opt-tab-${next}`)?.focus();
  };
  return (
    <div className="options" id="options" role="dialog" aria-label={ui.options}>
      <h3>{ui.options}</h3>
      <div className="tabs" role="tablist" onKeyDown={onKey}>
        {TABS.map(t => (
          <button key={t} id={`opt-tab-${t}`} type="button" role="tab" aria-selected={tab === t} aria-controls="opt-panel" tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}>
            {ui.optionsTabs?.[t] || t}
          </button>
        ))}
      </div>
      <div className="tabpanel" id="opt-panel" role="tabpanel" aria-labelledby={`opt-tab-${tab}`}>
        {tab === 'general' && <General ui={ui} />}
        {tab === 'camera' && <Camera ui={ui} scene={scene} />}
        {tab === 'system' && <System ui={ui} scene={scene} />}
      </div>
    </div>
  );
}
