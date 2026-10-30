import { useStore } from '../state/store.js';
import { pad2 } from '../lib/text.js';

function Brand({ text }) {
  const parts = text.split('/');
  return parts.map((p, i) => <span key={i}>{i > 0 && <span className="dim">/</span>}{p}</span>);
}

export function Header() {
  const scene = useStore(s => s.scene);
  const pois = useStore(s => s.pois);
  const current = useStore(s => s.current);
  const collapsed = useStore(s => s.panelCollapsed);
  const optionsOpen = useStore(s => s.optionsOpen);
  const markersVisible = useStore(s => s.markersVisible);
  const { goTo, togglePanel, toggleMarkers, toggleOptions } = useStore.getState();
  const ui = scene.ui;

  return (
    <header className="top">
      <button className="brand" aria-label={`${scene.brand} — ${ui.home}`} onClick={() => goTo(-1)}><Brand text={scene.brand} /></button>
      <nav aria-label={ui.navLabel}>
        {pois.map((p, i) => (
          <button key={p.id} aria-current={p.id === current} onClick={() => goTo(p.id)}>
            <b>{pad2(i + 1)}</b><span className="t">{p.label}</span>
          </button>
        ))}
      </nav>
      <button className="iconbtn" aria-pressed={collapsed} title={collapsed ? ui.showPanel : ui.hidePanel} aria-label={collapsed ? ui.showPanel : ui.hidePanel} onClick={togglePanel}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1.5" y="2.5" width="13" height="11" /><path d="M10 2.5v11" /></svg>
      </button>
      <button className="iconbtn" aria-pressed={!markersVisible} title={markersVisible ? ui.hideMarkers : ui.showMarkers} aria-label={markersVisible ? ui.hideMarkers : ui.showMarkers} onClick={toggleMarkers}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5 12.5 7 8 12.5 3.5 7Z" /><path d="M3.5 7h9" />{!markersVisible && <path d="M2 14.5 14 1.5" />}</svg>
      </button>
      <button className="iconbtn" aria-expanded={optionsOpen} aria-controls="options" title={ui.options} aria-label={ui.options} onClick={toggleOptions}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h7M13 4h1M2 12h1M7 12h7" /><circle cx="11" cy="4" r="1.8" /><circle cx="5" cy="12" r="1.8" /></svg>
      </button>
    </header>
  );
}
