import { useEffect, useRef } from 'react';
import { useStore, runtime } from '../state/store.js';
import { SCENE_DEFAULTS } from '../config/defaults.js';
import { fmt } from '../lib/text.js';

/** Hint text where [x] renders as a key cap, {total} is the POI count and {keys} the highest number key (≤ 9). */
export function Hint() {
  const ui = useStore(s => s.scene.ui);
  const total = useStore(s => s.pois.length);
  const zoomed = useStore(s => (s.zoom ? (s.zoom.screen?.source === 'video' ? 'video' : 'screen') : null));
  const free = useStore(s => s.free);
  const parts = fmt(zoomed === 'video' ? ui.videoHint : zoomed ? ui.zoomHint : free ? ui.flyHint : ui.hint, { total, keys: Math.min(total, 9) }).split(/(\[[^\]]+\])/);
  return (
    <div className="hint">
      {parts.map((p, i) => (/^\[.+\]$/.test(p) ? <kbd key={i}>{p.slice(1, -1)}</kbd> : p))}
    </div>
  );
}

/** The question an `openUrl` action with `confirm` asks: where it goes (its label and the URL), with Go / Stay. */
export function Confirm() {
  const action = useStore(s => s.confirm);
  const ui = useStore(s => s.scene.ui);
  const accept = useStore(s => s.acceptConfirm);
  const cancel = useStore(s => s.cancelConfirm);
  const go = useRef(null);
  useEffect(() => { if (action) go.current?.focus(); }, [action]);
  if (!action) return null;
  let href = action.url;
  try { href = new URL(action.url, location.href).href; } catch { /* shown as written */ }
  const label = action.label ?? action.url;
  return (
    <div className="confirm" role="presentation" onClick={e => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h3 id="confirm-title">{ui.confirmTitle}</h3>
        {action.label && <p className="dest">{action.label}</p>}
        <code>{href}</code>
        <div className="row">
          <button ref={go} type="button" className="btn" onClick={accept}>{fmt(action.newTab ? ui.confirmGoTab : ui.confirmGo, { label })}</button>
          <button type="button" className="btn ghost" onClick={cancel}>{ui.confirmStay} <kbd>Esc</kbd></button>
        </div>
      </div>
    </div>
  );
}

export function Progress() {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      const el = ref.current;
      if (el) {
        el.classList.toggle('on', runtime.transiting);
        el.style.transform = `scaleX(${runtime.progress})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div id="progress" ref={ref} aria-hidden="true" />;
}

export function Loader({ done, unsupported }) {
  const status = useStore(s => s.status);
  const error = useStore(s => s.error);
  const ui = useStore(s => s.scene?.ui) || SCENE_DEFAULTS.ui;
  return (
    <div id="loader" className={done ? 'done' : ''}>
      {unsupported ? (
        <div className="err" role="alert">
          <h2>{ui.unsupported}</h2>
          <p>{ui.unsupportedHint}</p>
        </div>
      ) : status === 'error' ? (
        <div className="err" role="alert">
          <h2>{ui.loadError}</h2>
          <ul>{(error.lines || [error.message]).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      ) : (
        <div>{ui.loading}<span className="cur" /></div>
      )}
    </div>
  );
}
