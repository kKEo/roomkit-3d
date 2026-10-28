import { useEffect, useRef } from 'react';
import { useStore, runtime } from '../state/store.js';
import { pad2 } from '../lib/text.js';

/** Top-down map: room outline, pillars, POI markers and the camera's view cone. */
export function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!cv.clientWidth) return;
      const dpr = Math.min(devicePixelRatio || 1, 2), S = Math.round(cv.clientWidth * dpr);
      if (cv.width !== S) { cv.width = S; cv.height = S; }
      const { scene, pois, current } = useStore.getState();
      const { width: RW, depth: RD } = scene.room, accent = scene.theme.accent;
      const k = S / 150, pad = 12 * k, sc = (S - 2 * pad) / Math.max(RW, RD);
      const ox = (S - RW * sc) / 2, oz = (S - RD * sc) / 2;
      const X = x => ox + (x + RW / 2) * sc, Z = z => oz + (z + RD / 2) * sc;
      ctx.clearRect(0, 0, S, S);
      ctx.globalAlpha = 0.6; ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * k;
      ctx.strokeRect(X(-RW / 2), Z(-RD / 2), RW * sc, RD * sc);
      ctx.globalAlpha = 0.35; ctx.fillStyle = accent;
      scene.room.pillars.forEach(([x, z]) => ctx.fillRect(X(x) - 2 * k, Z(z) - 2 * k, 4 * k, 4 * k));
      ctx.font = `${9 * k}px ${scene.theme.fonts.body}`; ctx.textAlign = 'center';
      pois.forEach((p, i) => {
        const [mx, , mz] = p.marker.position;
        ctx.globalAlpha = i === current ? 1 : 0.45;
        ctx.beginPath(); ctx.arc(X(mx), Z(mz), (i === current ? 3.5 : 2.5) * k, 0, Math.PI * 2); ctx.fill();
        const ty = Z(mz) + (mz > -RD / 2 + 2 ? 12 * k : -6 * k);
        ctx.fillText(pad2(i + 1), Math.min(S - pad - 6 * k, Math.max(pad + 6 * k, X(mx))), Math.min(S - pad - 2 * k, Math.max(pad + 10 * k, ty)));
      });
      const [cx, , cz] = runtime.camPos, [fx, , fz] = runtime.camDir;
      const a = Math.atan2(fz, fx);
      ctx.globalAlpha = 0.18;
      ctx.beginPath(); ctx.moveTo(X(cx), Z(cz)); ctx.arc(X(cx), Z(cz), 26 * k, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = scene.theme.highlight;
      ctx.beginPath(); ctx.arc(X(cx), Z(cz), 3 * k, 0, Math.PI * 2); ctx.fill();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas id="minimap" ref={ref} aria-hidden="true" />;
}
