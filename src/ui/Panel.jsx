import { useEffect, useRef } from 'react';
import { useStore, runtime } from '../state/store.js';
import { Markdown, Block, ScrambleHeading } from './Markdown.jsx';
import { fmt, pad2 } from '../lib/text.js';

function PanelContent({ index }) {
  const pois = useStore(s => s.pois);
  const ui = useStore(s => s.scene.ui);
  const goTo = useStore(s => s.goTo);
  const poi = pois[index], N = pois.length;
  const prev = (index - 1 + N) % N, next = (index + 1) % N;
  return (
    <>
      <p className="kicker">{fmt(ui.kicker, { n: pad2(index + 1), total: pad2(N) })}{poi.kicker ? ` · ${poi.kicker}` : ''}</p>
      {poi.content.blocks.map((b, i) => {
        if (b.type === 'markdown') return <Markdown key={i} text={b.text ?? b.data ?? ''} />;
        if (b.type === 'heading') return <ScrambleHeading key={i}>{b.text ?? b.data}</ScrambleHeading>;
        return <Block key={i} type={b.type} data={b.data} feed={b.feed} />;
      })}
      {N > 1 && (
        <div className="pager">
          <button type="button" className="btn ghost" onClick={() => goTo(pois[prev].id)}>← {pois[prev].label}</button>
          <button type="button" className="btn ghost" onClick={() => goTo(pois[next].id)}>{pois[next].label} →</button>
        </div>
      )}
    </>
  );
}

/** Sliding content panel. Keeps the last content while fading out. */
export function Panel() {
  const shown = useStore(s => s.shown);
  const collapsed = useStore(s => s.panelCollapsed);
  const pois = useStore(s => s.pois);
  const zoomed = useStore(s => !!s.zoom);
  const last = useRef(null);
  const inner = useRef(null);
  if (shown != null) last.current = shown;
  const index = pois.findIndex(p => p.id === last.current);

  useEffect(() => { if (shown != null && inner.current) inner.current.scrollTop = 0; }, [shown]);

  // DOM layer drifts opposite to the camera parallax, which reads as depth
  useEffect(() => {
    let raf;
    const tick = () => {
      const P = useStore.getState().settings.parallax;
      if (inner.current) inner.current.style.transform = `translate3d(${-runtime.ms.x * P * 7}px, ${-runtime.ms.y * P * 5}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <aside id="panel" className={`panel${shown != null && !zoomed ? ' on' : ''}${collapsed ? ' collapsed' : ''}`} aria-live="polite">
      <div className="panel-inner" ref={inner}>
        {index >= 0 && <PanelContent key={pois[index].id} index={index} />}
      </div>
    </aside>
  );
}
