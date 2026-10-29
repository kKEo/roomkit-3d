import { useEffect, useRef } from 'react';
import { useStore, runtime } from '../state/store.js';
import { SCENE_DEFAULTS } from '../config/defaults.js';
import { fmt } from '../lib/text.js';

/** Hint text where [x] renders as a key cap and {total} is the POI count. */
export function Hint() {
  const ui = useStore(s => s.scene.ui);
  const total = useStore(s => s.pois.length);
  const zoomed = useStore(s => !!s.zoom);
  const parts = fmt(zoomed ? ui.zoomHint : ui.hint, { total }).split(/(\[[^\]]+\])/);
  return (
    <div className="hint">
      {parts.map((p, i) => (/^\[.+\]$/.test(p) ? <kbd key={i}>{p.slice(1, -1)}</kbd> : p))}
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

export function Loader({ done }) {
  const status = useStore(s => s.status);
  const error = useStore(s => s.error);
  const ui = useStore(s => s.scene?.ui) || SCENE_DEFAULTS.ui;
  return (
    <div id="loader" className={done ? 'done' : ''}>
      {status === 'error' ? (
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
