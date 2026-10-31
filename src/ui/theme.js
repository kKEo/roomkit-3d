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
    '--highlight': t.highlight,
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
  // one stylesheet link for the theme fonts, kept in step with the current scene
  let link = document.querySelector('link[data-theme-fonts]');
  if (!t.fontsUrl) link?.remove();
  else if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = t.fontsUrl; link.dataset.themeFonts = '';
    document.head.appendChild(link);
  } else if (link.getAttribute('href') !== t.fontsUrl) link.href = t.fontsUrl;
}
