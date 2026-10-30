import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store.js';
import { fmt } from '../../lib/text.js';

const BUILT_INS = ['help', 'clear', 'goto', 'exit'];

/** Command line: `commands` from the config ({ name: line | [lines] }) plus help, clear, goto <n|id>, exit. */
export function Terminal({ config, session, ui }) {
  const { prompt = '> ', lines = [], commands = {} } = config;
  const [log, setLog] = useState(() => session.log ?? lines.map(String));
  const [input, setInput] = useState(session.input ?? '');
  const history = useRef(session.history ?? []);
  const at = useRef(-1);
  const out = useRef(null);

  useEffect(() => { session.log = log; out.current?.scrollTo(0, out.current.scrollHeight); }, [log, session]);
  useEffect(() => { session.input = input; }, [input, session]);

  const run = line => {
    const [word = '', ...args] = line.trim().split(/\s+/);
    const cmd = word.toLowerCase();
    const st = useStore.getState();
    let reply = [];
    if (!cmd) reply = [];
    else if (cmd === 'clear') { setLog([]); return; }
    else if (cmd === 'exit') { st.exitZoom(); }
    else if (cmd === 'help') reply = [fmt(ui.termHelp, { commands: [...Object.keys(commands), ...BUILT_INS].join('  ') })];
    else if (cmd === 'goto') {
      const arg = args[0] ?? '';
      const i = /^\d+$/.test(arg) ? +arg - 1 : st.indexOf(arg);
      if (i >= 0 && i < st.pois.length) st.dispatch({ type: 'goTo', poi: st.pois[i].id });
      else reply = [fmt(ui.termNoArea, { arg })];
    } else if (Object.hasOwn(commands, cmd)) reply = [].concat(commands[cmd]).map(String);
    else reply = [fmt(ui.termUnknown, { cmd: word })];
    if (cmd) history.current = [...history.current, line].slice(-50);
    session.history = history.current;
    setLog(l => [...l, prompt + line, ...reply].slice(-200));
  };

  const onKeyDown = e => {
    const h = history.current;
    if (!h.length || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    at.current = e.key === 'ArrowUp' ? (at.current < 0 ? h.length - 1 : Math.max(0, at.current - 1)) : at.current < 0 ? -1 : at.current + 1;
    if (at.current >= h.length) at.current = -1;
    setInput(at.current < 0 ? '' : h[at.current]);
  };

  return (
    <div className="term">
      <div className="term-log" ref={out} aria-live="polite">
        {log.map((l, i) => <div key={i}>{l || ' '}</div>)}
      </div>
      <form onSubmit={e => { e.preventDefault(); run(input); setInput(''); at.current = -1; }}>
        <label>
          <span aria-hidden="true">{prompt}</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label={config.title || ui.zoomScreen}
            autoComplete="off" autoCapitalize="off" spellCheck={false}
          />
        </label>
      </form>
    </div>
  );
}
