import { reducedMotion } from './env.js';

/** Decode-style text reveal: unrevealed characters cycle through random glyphs. */
export function scramble(el, text, dur, glyphs) {
  const id = (el._sid = (el._sid || 0) + 1);
  if (reducedMotion) { el.textContent = text; return; }
  const start = performance.now();
  (function tick(now) {
    if (el._sid !== id) return;
    const p = Math.min(1, (now - start) / dur), n = Math.floor(p * text.length);
    let s = text.slice(0, n);
    for (let i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : glyphs[(Math.random() * glyphs.length) | 0];
    el.textContent = s;
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}
