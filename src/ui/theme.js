import { rgba } from '../lib/math.js';

/** Pushes scene.theme into CSS custom properties, fonts and document metadata. */
export function applyTheme(scene) {
  const t = scene.theme, s = document.documentElement.style;
  const vars = {
    '--bg': t.background,
    '--surface': t.surface,
    '--line': rgba(t.accent, 0.28),
    '--line-strong': t.accent,
    '--text': t.text,
    '--text-dim': t.textDim,
    '--accent': t.accent,
    '--accent-ink': t.accentInk,
    '--glow': `0 0 14px ${rgba(t.accent, 0.35)}`,
    '--display': t.fonts.display,
    '--body': t.fonts.body,
  };
  for (const [k, v] of Object.entries(vars)) s.setProperty(k, v);
  document.documentElement.classList.toggle('no-scanlines', !t.scanlines);
  document.documentElement.classList.toggle('no-vignette', !t.vignette);
  document.documentElement.lang = scene.lang;
  document.title = scene.title;
  if (t.fontsUrl && !document.querySelector(`link[data-theme-fonts]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = t.fontsUrl; l.dataset.themeFonts = '';
    document.head.appendChild(l);
  }
}
