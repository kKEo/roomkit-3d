import { useEffect, useRef } from 'react';
import { useStore } from '../state/store.js';
import { EASE, EASE_NAMES } from '../lib/easing.js';

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

export function SettingsPanel() {
  const open = useStore(s => s.settingsOpen);
  const settings = useStore(s => s.settings);
  const scene = useStore(s => s.scene);
  const setSetting = useStore(s => s.setSetting);
  const ui = scene.ui;
  if (!open) return null;
  return (
    <div className="settings" id="settings">
      <h3>{ui.settings}</h3>
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
    </div>
  );
}
