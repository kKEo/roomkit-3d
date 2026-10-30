import * as THREE from 'three';
import { createRain } from './rain.js';
import { reducedMotion } from '../lib/env.js';

const W = 512, H = 288;

function canvasTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  return { ctx: canvas.getContext('2d'), texture: new THREE.CanvasTexture(canvas) };
}

/** Title bar shared by text and graph screens. */
function header(ctx, theme, accent, title, right = '') {
  ctx.fillStyle = accent; ctx.globalAlpha = 0.9; ctx.fillRect(0, 0, W, 40); ctx.globalAlpha = 1;
  ctx.fillStyle = theme.background; ctx.font = `600 22px ${theme.fonts.body}`;
  ctx.fillText(title, 14, 28, W - 150);
  if (right) { ctx.textAlign = 'right'; ctx.fillText(right, W - 14, 28); ctx.textAlign = 'start'; }
}

/** Terminal-style screen: a title bar and lines that type out, then repeat after a pause. */
export function createTextScreen(theme, { title = '', lines = [], color }) {
  const { ctx, texture } = canvasTexture();
  const accent = color || theme.accent;
  const text = lines.map(String);
  const total = text.reduce((n, l) => n + l.length + 1, 0);
  let typed = reducedMotion ? total : 0, hold = 0, t = 0;

  function step(dt) {
    t += dt;
    if (typed < total) typed = Math.min(total, typed + dt * 45);
    else if (!reducedMotion && (hold += dt) > 5) { typed = 0; hold = 0; }
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, title);
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
  step(0);
  return { texture, step, dispose: () => texture.dispose() };
}

/** Animated chart screen: "wave" (scrolling signal), "bars" (live levels) or "radar" (sweep with blips). */
export function createGraphScreen(theme, { title = '', graph = 'wave', color }) {
  const { ctx, texture } = canvasTexture();
  const accent = color || theme.accent;
  const top = 52, bottom = H - 14, left = 14, right = W - 14;
  const hist = new Float32Array(120).fill(0.5);
  const bars = Array.from({ length: 16 }, () => Math.random());
  const targets = bars.slice();
  const blips = Array.from({ length: 7 }, () => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.7 }));
  let t = Math.random() * 10;

  function grid() {
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.15; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = left; x <= right; x += 40) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
    for (let y = top; y <= bottom; y += 37) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
  }

  function step(dt) {
    t += dt;
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = accent; ctx.fillStyle = accent;
    let readout = '';

    if (graph === 'bars') {
      grid();
      const bw = (right - left) / bars.length;
      bars.forEach((v, i) => {
        if (Math.random() < dt * 1.5) targets[i] = 0.15 + Math.random() * 0.8;
        bars[i] += (targets[i] - v) * Math.min(1, dt * 4);
        const h = bars[i] * (bottom - top);
        ctx.globalAlpha = 0.85; ctx.fillRect(left + i * bw + 3, bottom - h, bw - 6, h);
      });
      ctx.globalAlpha = 1;
      readout = `${Math.round((bars.reduce((a, b) => a + b, 0) / bars.length) * 100)}%`;
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
      blips.forEach(b => {
        const since = (sweep - b.a + Math.PI * 4) % (Math.PI * 2); // radians since the sweep passed
        const glow = Math.max(0, 1 - since / 3);
        if (glow > 0.05) seen++;
        ctx.globalAlpha = 0.15 + 0.85 * glow;
        ctx.beginPath(); ctx.arc(cx + Math.cos(b.a) * b.r * R, cy + Math.sin(b.a) * b.r * R, 5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      readout = `${seen} contacts`;
    } else {
      grid();
      hist.copyWithin(0, 1);
      const v = 0.5 + 0.28 * Math.sin(t * 3.1) + 0.12 * Math.sin(t * 7.7) + (Math.random() - 0.5) * 0.12;
      hist[hist.length - 1] = Math.max(0.03, Math.min(0.97, v));
      ctx.lineWidth = 3; ctx.beginPath();
      hist.forEach((h, i) => {
        const x = left + (i / (hist.length - 1)) * (right - left), y = bottom - h * (bottom - top);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      readout = `${(hist[hist.length - 1] * 100).toFixed(1)}`;
    }
    header(ctx, theme, accent, title, readout);
    texture.needsUpdate = true;
  }
  step(0);
  return { texture, step, dispose: () => texture.dispose() };
}

/** A screen's own Matrix rain, with its own caption and/or colour. */
export function createOwnRain(theme, { label = '', color }) {
  const rain = createRain(color ? { ...theme, accent: color } : theme);
  return { texture: rain.texture, step: () => rain.step(label), dispose: rain.dispose };
}

/** Terminal: the session log (banner `lines` until something is typed) and the prompt line being typed. */
export function createTerminalScreen(theme, { title = '', lines = [], prompt = '> ', color }, session) {
  const { ctx, texture } = canvasTexture();
  const accent = color || theme.accent;
  let t = 0;

  function step(dt) {
    t += dt;
    const log = session.log ?? lines.map(String);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, title);
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
  return { texture, step, dispose: () => texture.dispose() };
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
  const { title = '', rows = [], value, color } = config;
  const accent = color || theme.accent;
  const cols = dashboardColumns(config);
  const name = cols.find(c => c !== value) ?? cols[0];
  const max = Math.max(1, ...rows.map(r => Number(r[value]) || 0));

  function step() {
    const shown = filterRows(config, session);
    const active = [...Object.values(session.chips ?? {}).filter(v => v != null), session.query?.trim()].filter(Boolean);
    ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
    header(ctx, theme, accent, active.length ? `${title} · ${active.join(' · ')}` : title, `${shown.length}/${rows.length}`);
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
  step();
  return { texture, step, dispose: () => texture.dispose() };
}

/** Form: its field labels and boxes and the submit button, drawn as a preview of what opens up close. */
export function createFormScreen(theme, { title = '', form = {}, color }) {
  const { ctx, texture } = canvasTexture();
  const accent = color || theme.accent;
  const fields = form.fields ?? [];
  ctx.fillStyle = theme.background; ctx.fillRect(0, 0, W, H);
  header(ctx, theme, accent, title);
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
  return { texture, step: () => {}, dispose: () => texture.dispose() };
}
