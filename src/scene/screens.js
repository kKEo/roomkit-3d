import * as THREE from 'three';
import { createRain } from './rain.js';
import { reducedMotion } from '../lib/env.js';
import { deltaDirection } from '../ui/blocks/schema.js';

/**
 * Canvas-drawn screens. Each `create…Screen(theme, config[, session])` returns
 * `{ texture, step(dt), update(config, status), dispose }`: `step` animates (called ~20×/s),
 * `update` takes new content in place (a live feed, an edit), so the screen is not rebuilt and its
 * animation does not restart. `status` is the feed's: "static" (no feed), "loading", "ok" or "error";
 * the title bar shows a mark for loading and error.
 */

const W = 512, H = 288;

function canvasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  return { ctx: canvas.getContext('2d'), texture: new THREE.CanvasTexture(canvas) };
}

const blinkOn = () => Math.floor(performance.now() / 500) % 2 === 0;

/** Title bar shared by the canvas screens; `status` adds a blinking "…" while loading and a "!" box on error. */
function header(ctx, theme, accent, title, right = '', status = 'static') {
  ctx.fillStyle = accent; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, 40); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.background; ctx.font = `600 22px ${theme.fonts.body}`;
  ctx.fillText(title, 14, 28, W - 150);
  let x = W - 14;
  if (right) { ctx.textAlign = 'right'; ctx.fillText(right, x, 28); ctx.textAlign = 'start'; x -= ctx.measureText(right).width + 12; }
  if (status === 'loading' && blinkOn()) { ctx.textAlign = 'right'; ctx.fillText('…', x, 28); ctx.textAlign = 'start'; }
  else if (status === 'error') {
    ctx.fillRect(x - 22, 7, 22, 26);
    ctx.fillStyle = theme.highlight; ctx.textAlign = 'center'; ctx.fillText('!', x - 11, 28); ctx.textAlign = 'start';
  }
}

const num = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/**
 * How much of a text screen stays typed when its lines change: all of it while the new text only
 * extends the old (a growing log), otherwise it types again from the start (or shows at once with
 * reduced motion).
 */
export function keepTyped(oldText, newText, typed, total, reduced = reducedMotion) {
  if (newText.startsWith(oldText)) return Math.min(typed, total);
  return reduced ? total : 0;
}

/** Terminal-style screen: a title bar and lines that type out, then repeat after a pause. */
export function createTextScreen(theme, config) {
  const { ctx, texture } = canvasTexture();
  let cfg = {}, accent, text = [], joined = '', total = 0, status = 'static';
  let typed = 0, hold = 0, t = 0;

  function update(next, st = 'static') {
    cfg = next; status = st;
    accent = cfg.color || theme.accent;
    const lines = (cfg.lines ?? []).map(String);
    const nextJoined = lines.join('\n');
    const nextTotal = lines.reduce((n, l) => n + l.length + 1, 0);
    typed = text.length ? keepTyped(joined, nextJoined, typed, nextTotal) : reducedMotion ? nextTotal : 0;
    text = lines; joined = nextJoined; total = nextTotal;
  }

  function step(dt) {
    t += dt;
    if (typed < total) typed = Math.min(total, typed + dt * 45);
    else if (!reducedMotion && (hold += dt) > 5) { typed = 0; hold = 0; }
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, cfg.title ?? '', '', status);
    ctx.fillStyle = accent; ctx.font = `19px ${theme.fonts.body}`;
    let left = Math.floor(typed), y = 74, cx = 14, cy = 74;
    for (const line of text) {
      if (left <= 0 || y > H - 8) break;
      const shown = line.slice(0, left);
      ctx.fillText(shown, 14, y, W - 40);
      cx = 14 + Math.min(ctx.measureText(shown).width, W - 40); cy = y;
      left -= line.length + 1; y += 28;
    }
    if (Math.floor(t * 2) % 2 === 0) ctx.fillRect(cx + 3, cy - 16, 11, 20);
    texture.needsUpdate = true;
  }
  update(config);
  step(0);
  return { texture, step, update, dispose: () => texture.dispose() };
}

/** The `[lo, hi]` a graph scales its values to: `min`/`max` when given, else the data's range (from 0 when `fromZero`). */
export function valueRange(values, { min, max } = {}, fromZero = false) {
  const lo = min ?? Math.min(fromZero ? 0 : Infinity, ...values);
  let hi = max ?? Math.max(...values);
  if (!(hi > lo)) hi = lo + 1;
  return [lo, hi];
}

/** `values` mapped into 0–1 over `[lo, hi]`, clamped. */
export const scaleSeries = (values, [lo, hi]) => values.map(v => Math.max(0, Math.min(1, (v - lo) / (hi - lo))));

/** The title-bar readout of a graph with data: `readout` if given, else the latest wave value, the bars' mean, the number of radar contacts. */
export function graphReadout(graph, { values, points, readout }) {
  if (readout != null) return String(readout);
  if (graph === 'radar') return points ? `${points.length} contacts` : '';
  if (!values?.length) return '';
  return graph === 'bars' ? num(values.reduce((a, b) => a + b, 0) / values.length) : num(values[values.length - 1]);
}

const DEG = Math.PI / 180;

/**
 * Animated chart screen: "wave" (signal), "bars" (levels) or "radar" (sweep with blips). With `values`
 * (or `points` for radar) it shows that data, easing bars toward each new value; without, demo data.
 */
export function createGraphScreen(theme, config) {
  const { ctx, texture } = canvasTexture();
  const top = 52, bottom = H - 14, left = 14, right = W - 14;
  const hist = new Float32Array(120).fill(0.5);
  let cfg = {}, accent, status = 'static';
  let bars = Array.from({ length: 16 }, () => Math.random());
  let targets = bars.slice();
  let blips = Array.from({ length: 7 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.7 }));
  let series = null; // scaled `values` for the wave
  let t = Math.random() * 10;

  function update(next, st = 'static') {
    cfg = next; status = st;
    accent = cfg.color || theme.accent;
    const graph = cfg.graph ?? 'wave';
    if (graph === 'bars' && cfg.values?.length) {
      const scaled = scaleSeries(cfg.values, valueRange(cfg.values, cfg, true));
      bars = scaled.map((v, i) => bars[i] ?? (reducedMotion ? v : 0));
      targets = scaled;
      if (reducedMotion) bars = scaled.slice();
    }
    series = graph === 'wave' && cfg.values?.length ? scaleSeries(cfg.values.slice(-120), valueRange(cfg.values.slice(-120), cfg)) : null;
    if (graph === 'radar' && cfg.points) blips = cfg.points.map(p => ({ a: (p.angle - 90) * DEG, r: p.distance, label: p.label }));
  }

  function grid() {
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.15; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = left; x <= right; x += 40) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = top; y <= bottom; y += 37) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function line(points) {
    ctx.lineWidth = 3; ctx.beginPath();
    points.forEach((h, i) => {
      const x = left + (i / Math.max(1, points.length - 1)) * (right - left), y = bottom - h * (bottom - top);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function step(dt) {
    t += dt;
    const graph = cfg.graph ?? 'wave';
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = accent; ctx.fillStyle = accent;
    let readout = '';

    if (graph === 'bars') {
      grid();
      const live = !!cfg.values?.length;
      const bw = (right - left) / bars.length;
      bars.forEach((v, i) => {
        if (!live && Math.random() < dt * 1.5) targets[i] = 0.15 + Math.random() * 0.8;
        bars[i] += (targets[i] - v) * Math.min(1, dt * 4);
        const h = bars[i] * (bottom - top);
        ctx.globalAlpha = 0.85; ctx.fillRect(left + i * bw + Math.min(3, bw / 6), bottom - h, bw - Math.min(6, bw / 3), h);
      });
      ctx.globalAlpha = 1;
      readout = live ? graphReadout(graph, cfg) : `${Math.round((bars.reduce((a, b) => a + b, 0) / bars.length) * 100)}%`;
    } else if (graph === 'radar') {
      const cx = W / 2, cy = (top + bottom) / 2, R = (bottom - top) / 2 - 2, sweep = (t * 1.4) % (Math.PI * 2);
      ctx.lineWidth = 1; ctx.globalAlpha = 0.3;
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx, cy, (R * k) / 3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
      for (let k = 0; k < 14; k++) { // fading sweep trail
        const a = sweep - k * 0.045;
        ctx.globalAlpha = 0.6 * (1 - k / 14); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
      }
      let seen = 0;
      ctx.font = `14px ${theme.fonts.body}`;
      blips.forEach(b => {
        const since = (((sweep - b.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // radians since the sweep passed
        const glow = reducedMotion ? 1 : Math.max(0, 1 - since / 3);
        if (glow > 0.05) seen++;
        const x = cx + Math.cos(b.a) * b.r * R, y = cy + Math.sin(b.a) * b.r * R;
        ctx.globalAlpha = 0.15 + 0.85 * glow;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        if (b.label && glow > 0.3) ctx.fillText(b.label, x + 9, y + 5, 120);
      });
      ctx.globalAlpha = 1;
      readout = cfg.points ? graphReadout(graph, cfg) : `${seen} contacts`;
    } else if (series) {
      grid();
      line(series);
      readout = graphReadout(graph, cfg);
    } else {
      grid();
      hist.copyWithin(0, 1);
      const v = 0.5 + 0.28 * Math.sin(t * 3.1) + 0.12 * Math.sin(t * 7.7) + (Math.random() - 0.5) * 0.12;
      hist[hist.length - 1] = Math.max(0.03, Math.min(0.97, v));
      line(hist);
      readout = `${(hist[hist.length - 1] * 100).toFixed(1)}`;
    }
    if (cfg.readout != null) readout = String(cfg.readout);
    header(ctx, theme, accent, cfg.title ?? '', readout, status);
    texture.needsUpdate = true;
  }
  update(config);
  step(0);
  return { texture, step, update, dispose: () => texture.dispose() };
}

/** Columns × rows of a stats screen with `n` numbers: one row up to 4, then two rows. */
export function statsGrid(n) {
  const count = Math.max(1, Math.min(8, n));
  return count <= 4 ? { cols: count, rows: 1 } : { cols: Math.ceil(count / 2), rows: 2 };
}

/** Big numbers with labels, units and up/down deltas (`stats`, like the panel's stats block); a changed value flashes. */
export function createStatsScreen(theme, config) {
  const { ctx, texture } = canvasTexture();
  let cfg = {}, accent, status = 'static', items = [], flash = [], dirty = true;

  function update(next, st = 'static') {
    const prev = items;
    cfg = next; status = st;
    accent = cfg.color || theme.accent;
    items = (cfg.stats ?? []).slice(0, 8);
    flash = items.map((it, i) => (prev[i] && prev[i].value !== it.value && !reducedMotion ? 1 : flash[i] ?? 0));
    dirty = true;
  }

  function draw() {
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, cfg.title ?? '', '', status);
    if (!items.length) return;
    const { cols, rows } = statsGrid(items.length);
    const cw = (W - 16) / cols, ch = (H - 56) / rows;
    items.forEach((it, i) => {
      const x = 8 + (i % cols) * cw, y = 48 + Math.floor(i / cols) * ch;
      if (flash[i] > 0) { ctx.globalAlpha = 0.25 * flash[i]; ctx.fillStyle = accent; ctx.fillRect(x + 2, y + 4, cw - 4, ch - 8); }
      ctx.globalAlpha = 1; ctx.fillStyle = accent;
      // the value as large as fits, the unit small after it
      let size = Math.min(ch * 0.5, 64);
      ctx.font = `${size}px ${theme.fonts.display}`;
      const unitW = it.unit ? 8 + it.unit.length * size * 0.28 : 0;
      while (size > 14 && ctx.measureText(it.value).width + unitW > cw - 16) { size -= 2; ctx.font = `${size}px ${theme.fonts.display}`; }
      const vy = y + ch * 0.55;
      ctx.fillText(it.value, x + 8, vy, cw - 16);
      if (it.unit) {
        const vw = Math.min(ctx.measureText(it.value).width, cw - 16);
        ctx.font = `${Math.round(size * 0.45)}px ${theme.fonts.body}`; ctx.globalAlpha = 0.8;
        ctx.fillText(it.unit, x + 12 + vw, vy, Math.max(10, cw - 24 - vw));
      }
      ctx.font = `16px ${theme.fonts.body}`; ctx.globalAlpha = 0.65;
      ctx.fillText(it.label, x + 8, y + ch * 0.55 + 24, cw - 16);
      if (it.delta != null) {
        const dir = deltaDirection(it.delta);
        ctx.globalAlpha = 1; ctx.fillStyle = dir === 'up' ? theme.highlight : accent;
        ctx.fillText(`${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'} ${it.delta}`, x + 8, y + ch * 0.55 + 46, cw - 16);
      }
      ctx.globalAlpha = 1;
    });
  }

  function step(dt) {
    const flashing = flash.some(f => f > 0);
    if (flashing) flash = flash.map(f => Math.max(0, f - dt * 1.5));
    if (!dirty && !flashing && status !== 'loading') return;
    dirty = false;
    draw();
    texture.needsUpdate = true;
  }
  update(config);
  step(0);
  return { texture, step, update, dispose: () => texture.dispose() };
}

/** A screen's own Matrix rain, with its own caption and/or colour (a colour change makes a new one). */
export function createOwnRain(theme, config) {
  const rain = createRain(config.color ? { ...theme, accent: config.color } : theme);
  let label = config.label ?? '';
  return { texture: rain.texture, step: () => rain.step(label), update: next => { label = next.label ?? ''; }, dispose: rain.dispose };
}

/** Terminal: the session log (banner `lines` until something is typed) and the prompt line being typed. */
export function createTerminalScreen(theme, config, session) {
  const { ctx, texture } = canvasTexture();
  let cfg = config, status = 'static';
  let t = 0;

  function step(dt) {
    t += dt;
    const { title = '', lines = [], prompt = '> ', color } = cfg;
    const accent = color || theme.accent;
    const log = session.log ?? lines.map(String);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, title, '', status);
    ctx.fillStyle = accent; ctx.font = `19px ${theme.fonts.body}`;
    const fit = Math.floor((H - 62) / 26) - 1;
    let y = 72;
    for (const line of log.slice(-fit)) { ctx.fillText(line, 14, y, W - 28); y += 26; }
    const typed = prompt + (session.input ?? '');
    ctx.fillText(typed, 14, y, W - 40);
    if (Math.floor(t * 2) % 2 === 0) ctx.fillRect(14 + Math.min(ctx.measureText(typed).width, W - 40) + 3, y - 16, 11, 20);
    texture.needsUpdate = true;
  }
  step(0);
  return { texture, step, update: (next, st = 'static') => { cfg = next; status = st; }, dispose: () => texture.dispose() };
}

/** Dashboard columns: as configured, else the keys of the first row. */
export const dashboardColumns = ({ rows = [], columns }) => columns ?? Object.keys(rows[0] ?? {});

/** Rows left after the chip filters ({ key: value }) and the free-text query. */
export function filterRows({ rows = [], columns }, { chips = {}, query = '' }) {
  const cols = dashboardColumns({ rows, columns });
  const q = query.trim().toLowerCase();
  return rows.filter(r =>
    Object.entries(chips).every(([k, v]) => v == null || String(r[k]) === v) &&
    (!q || cols.some(c => String(r[c] ?? '').toLowerCase().includes(q))));
}

/** Dashboard: one bar per filtered row (`value` column), active filters in the title bar. */
export function createDashboardScreen(theme, config, session) {
  const { ctx, texture } = canvasTexture();
  let cfg = {}, accent, name, max, status = 'static';

  function update(next, st = 'static') {
    cfg = next; status = st;
    accent = cfg.color || theme.accent;
    const { rows = [], value } = cfg;
    const cols = dashboardColumns(cfg);
    name = cols.find(c => c !== value) ?? cols[0];
    max = Math.max(1, ...rows.map(r => Number(r[value]) || 0));
  }

  function step() {
    const { title = '', rows = [], value } = cfg;
    const shown = filterRows(cfg, session);
    const active = [...Object.values(session.chips ?? {}).filter(v => v != null), session.query?.trim()].filter(Boolean);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, active.length ? `${title} · ${active.join(' · ')}` : title, `${shown.length}/${rows.length}`, status);
    ctx.fillStyle = accent; ctx.font = `18px ${theme.fonts.body}`;
    const fit = Math.floor((H - 56) / 26);
    shown.slice(0, fit).forEach((r, i) => {
      const y = 72 + i * 26;
      ctx.globalAlpha = 1; ctx.fillText(String(r[name] ?? ''), 14, y, 150);
      if (value != null) {
        const v = Number(r[value]) || 0;
        ctx.globalAlpha = 0.85; ctx.fillRect(176, y - 15, ((W - 250) * v) / max, 17);
        ctx.globalAlpha = 1; ctx.textAlign = 'right'; ctx.fillText(String(r[value]), W - 14, y); ctx.textAlign = 'start';
      }
    });
    ctx.globalAlpha = 1;
    texture.needsUpdate = true;
  }
  update(config);
  step();
  return { texture, step, update, dispose: () => texture.dispose() };
}

/** Form: its field labels and boxes and the submit button, drawn as a preview of what opens up close. */
export function createFormScreen(theme, config) {
  const { ctx, texture } = canvasTexture();
  let cfg = config, status = 'static', dirty = true;

  function draw() {
    const { title = '', form = {}, color } = cfg;
    const accent = color || theme.accent;
    const fields = form.fields ?? [];
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, title, '', status);
    ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 2; ctx.font = `16px ${theme.fonts.body}`;
    const rowH = Math.min(52, (H - 110) / Math.max(1, fields.length));
    fields.forEach((f, i) => {
      const y = 56 + i * rowH;
      ctx.globalAlpha = 0.75; ctx.fillText(f.label ?? f.name, 14, y + 14, W - 28);
      ctx.globalAlpha = 0.5; ctx.strokeRect(14, y + 20, W - 28, rowH - 26);
    });
    ctx.globalAlpha = 1;
    ctx.fillRect(14, H - 46, 150, 34);
    ctx.fillStyle = theme.background; ctx.font = `600 17px ${theme.fonts.body}`;
    ctx.fillText(form.submit ?? 'Send', 26, H - 23, 126);
    texture.needsUpdate = true;
  }
  // redrawn only when it changes (or blinks its loading mark)
  const step = () => { if (dirty || status === 'loading') { dirty = false; draw(); } };
  step();
  return { texture, step, update: (next, st = 'static') => { cfg = next; status = st; dirty = true; }, dispose: () => texture.dispose() };
}
