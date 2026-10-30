import { REVISION } from 'three';
import { version as REACT } from 'react';

/** 1536 → "1.5 KB"; null → "—". */
export function fmtBytes(n) {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${i ? n.toFixed(1) : n} ${units[i]}`;
}

/** 4.234 → "4.23 ms"; null → "—". */
export const fmtMs = ms => (ms == null ? '—' : `${ms < 10 ? ms.toFixed(2) : ms.toFixed(1)} ms`);

/** 12345 → "12 345", so big counts read at a glance. */
export const fmtCount = n => (n == null ? '—' : Math.round(n).toLocaleString('en').replace(/,/g, ' '));

/** Plain-text report of `[{ title, rows: [[label, value]] }]`, for pasting into a bug report. */
export function reportText(sections, extra = []) {
  const lines = [];
  for (const { title, rows } of sections) {
    lines.push(`## ${title}`);
    for (const [k, v] of rows) lines.push(`${k}: ${v}`);
    lines.push('');
  }
  return [...lines, ...extra].join('\n').trimEnd() + '\n';
}

const media = q => typeof matchMedia === 'function' && matchMedia(q).matches;

/** What the WebGL context is and can do; it doesn't change while the context lives. */
export function graphicsInfo(gl) {
  const ctx = gl.getContext(), attrs = ctx.getContextAttributes() || {};
  const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
  const p = k => ctx.getParameter(k);
  const ext = ctx.getSupportedExtensions() || [];
  return {
    rows: [
      ['WebGL', p(ctx.VERSION)],
      ['GLSL', p(ctx.SHADING_LANGUAGE_VERSION)],
      ['GPU vendor', dbg ? p(dbg.UNMASKED_VENDOR_WEBGL) : p(ctx.VENDOR)],
      ['GPU', dbg ? p(dbg.UNMASKED_RENDERER_WEBGL) : p(ctx.RENDERER)],
      ['Antialiasing', attrs.antialias ? `on, ${p(ctx.SAMPLES)}× MSAA` : 'off'],
      ['GPU preference', attrs.powerPreference || 'default'],
      ['Shader precision', gl.capabilities.precision],
      ['Max texture size', `${p(ctx.MAX_TEXTURE_SIZE)} px`],
      ['Max viewport', Array.from(p(ctx.MAX_VIEWPORT_DIMS)).join(' × ')],
      ['Max MSAA samples', p(ctx.MAX_SAMPLES)],
      ['Max anisotropy', gl.capabilities.getMaxAnisotropy()],
      ['Texture units', `${p(ctx.MAX_TEXTURE_IMAGE_UNITS)} fragment, ${p(ctx.MAX_COMBINED_TEXTURE_IMAGE_UNITS)} combined`],
      ['Extensions', ext.length],
      ['three.js', `r${REVISION}`],
      ['React', REACT],
    ],
    extensions: ext,
  };
}

/** The screen and the canvas on it. */
export function displayInfo(gl, view) {
  const ctx = gl.getContext();
  const gamut = media('(color-gamut: rec2020)') ? 'Rec. 2020' : media('(color-gamut: p3)') ? 'Display P3' : 'sRGB';
  return [
    ['Canvas', `${Math.round(view.width)} × ${Math.round(view.height)} CSS px`],
    ['Drawing buffer', `${ctx.drawingBufferWidth} × ${ctx.drawingBufferHeight} px`],
    ['Pixel ratio', `${+gl.getPixelRatio().toFixed(2)} rendered, ${+(globalThis.devicePixelRatio || 1).toFixed(2)} screen`],
    ['Screen', `${screen.width} × ${screen.height}, ${screen.colorDepth}-bit`],
    ['Colour gamut', `${gamut}${media('(dynamic-range: high)') ? ', HDR' : ''}`],
  ];
}

/** The machine and browser, as far as the browser tells. */
export function deviceInfo() {
  const n = globalThis.navigator || {};
  const brands = n.userAgentData?.brands?.filter(b => !/not.?a.?brand/i.test(b.brand)).map(b => `${b.brand} ${b.version}`).join(', ');
  const c = n.connection;
  return [
    ['CPU threads', n.hardwareConcurrency ?? '—'],
    ['Platform', n.userAgentData?.platform || n.platform || '—'],
    ['Browser', brands || n.userAgent || '—'],
    ['Touch points', n.maxTouchPoints ?? 0],
    ['Reduced motion', media('(prefers-reduced-motion: reduce)') ? 'yes' : 'no'],
    ['Network', c ? `${c.effectiveType || '?'}${c.downlink ? `, ~${c.downlink} Mbit/s` : ''}${c.saveData ? ', data saver' : ''}` : '—'],
  ];
}
