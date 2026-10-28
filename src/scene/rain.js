import * as THREE from 'three';

/** Matrix-rain CanvasTexture shared by every screen in the scene, with a boxed caption. */
export function createRain(theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 288;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = theme.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const FS = 14, COLS = Math.floor(canvas.width / FS);
  const drops = Array.from({ length: COLS }, () => Math.random() * -30);
  const texture = new THREE.CanvasTexture(canvas);
  const fade = new THREE.Color(theme.background);
  const fadeStyle = a => `rgba(${fade.r * 255 | 0},${fade.g * 255 | 0},${fade.b * 255 | 0},${a})`;
  const glyphs = theme.glyphs;

  function step(label) {
    ctx.fillStyle = fadeStyle(0.085); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = FS + 'px monospace';
    for (let i = 0; i < COLS; i++) {
      const y = drops[i] * FS;
      ctx.fillStyle = Math.random() > 0.96 ? '#e6ffee' : theme.accent;
      ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * FS, y);
      if (y > canvas.height && Math.random() > 0.97) drops[i] = 0;
      drops[i] += 1;
    }
    if (label) {
      ctx.fillStyle = fadeStyle(0.75); ctx.fillRect(96, 116, 320, 56);
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2; ctx.strokeRect(96, 116, 320, 56);
      ctx.fillStyle = theme.highlight; ctx.font = '600 26px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, 256, 153, 300); ctx.textAlign = 'start';
    }
    texture.needsUpdate = true;
  }
  step('');
  return { texture, step, dispose: () => texture.dispose() };
}
