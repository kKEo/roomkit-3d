import { useEffect, useState } from 'react';
import { useStore, runtime } from '../state/store.js';
import { fmtMs } from '../lib/sysinfo.js';
import { FrameGraph } from './Options.jsx';

/** The small performance readout (Options → General → Show performance overlay). */
export function PerfHud() {
  const on = useStore(s => s.gfx.hud);
  const accent = useStore(s => s.scene.theme.accent);
  const [s, setS] = useState(null);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setS(runtime.stats), 250);
    return () => clearInterval(id);
  }, [on]);
  if (!on) return null;
  return (
    <div className="perfhud" aria-hidden="true">
      <div><b>{s?.fps != null ? s.fps.toFixed(0) : '—'}</b> fps · {fmtMs(s?.frame)}</div>
      <div>CPU {fmtMs(s?.cpu)}{s?.gpu != null && <> · GPU {fmtMs(s.gpu)}</>}</div>
      <div>{s?.calls ?? '—'} calls · {s?.triangles != null ? `${(s.triangles / 1000).toFixed(1)}k` : '—'} tris</div>
      {s?.heap && <div>heap {(s.heap.used / 1048576).toFixed(0)} MB</div>}
      {s?.hist && <FrameGraph hist={s.hist} color={accent} height={36} />}
    </div>
  );
}
