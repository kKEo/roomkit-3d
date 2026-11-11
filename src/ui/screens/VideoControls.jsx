import { useEffect, useState } from 'react';
import { findVideo } from '../../scene/screenState.js';
import { publishVideo } from '../../net/videoSync.js';

const SPEEDS = [0.25, 0.5, 1, 2];
const SPEED_LABEL = { 0.25: '¼×', 0.5: '½×', 1: '1×', 2: '2×' };
const pad = n => String(Math.floor(n)).padStart(2, '0');
const clock = s => (Number.isFinite(s) ? `${pad(s / 60)}:${pad(s % 60)}` : '--:--');

/**
 * Transport bar over a zoomed-in video screen: play/pause, back to the start, ±10 s, a scrubber
 * and the playback speed. Steers the <video> behind the screen's texture (registered by its key),
 * so the big screen in the room follows, and in an event so does everyone else's (every action here
 * is published, src/net/videoSync.js). Keys while zoomed: Space, ← →, - +.
 */
export function VideoControls({ screenKey, ui }) {
  const video = findVideo(screenKey);
  const [state, setState] = useState(() => snapshot(video));
  // run an action on the video, then tell the event about the new state (after the browser applied it)
  const act = fn => { fn(video); requestAnimationFrame(() => publishVideo(screenKey, video)); };

  useEffect(() => {
    if (!video) return;
    const sync = () => setState(snapshot(video));
    const events = ['play', 'pause', 'timeupdate', 'ratechange', 'durationchange', 'seeked'];
    for (const e of events) video.addEventListener(e, sync);
    sync();
    return () => { for (const e of events) video.removeEventListener(e, sync); };
  }, [video]);

  useEffect(() => {
    if (!video) return;
    const onKey = e => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' && e.target.type !== 'range') return;
      if (e.key === ' ' || e.code === 'Space') act(toggle);
      else if (e.key === 'ArrowLeft') act(v => seek(v, -5));
      else if (e.key === 'ArrowRight') act(v => seek(v, 5));
      else if (e.key === '-' || e.key === '_') act(v => stepSpeed(v, -1));
      else if (e.key === '+' || e.key === '=') act(v => stepSpeed(v, 1));
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  if (!video) return null;
  const { paused, time, duration, rate } = state;
  return (
    <div className="vctl" role="group" aria-label={ui.zoomScreen}>
      <button type="button" onClick={() => act(v => { v.currentTime = 0; v.play().catch(() => {}); })} title={ui.videoRestart} aria-label={ui.videoRestart}>⏮</button>
      <button type="button" onClick={() => act(v => seek(v, -10))} title={ui.videoBack} aria-label={ui.videoBack}>◀◀</button>
      <button type="button" className="vplay" onClick={() => act(toggle)} title={paused ? ui.videoPlay : ui.videoPause} aria-label={paused ? ui.videoPlay : ui.videoPause}>
        {paused ? '▶' : '❚❚'}
      </button>
      <button type="button" onClick={() => act(v => seek(v, 10))} title={ui.videoForward} aria-label={ui.videoForward}>▶▶</button>
      <input
        type="range" min="0" max={Number.isFinite(duration) ? duration : 0} step="0.1" value={time}
        onChange={e => { const t = Number(e.target.value); act(v => { v.currentTime = t; }); }} aria-label={clock(time)}
      />
      <span className="vtime">{clock(time)} / {clock(duration)}</span>
      <span className="vspeed">
        <span>{ui.videoSpeed}</span>
        {SPEEDS.map(s => (
          <button key={s} type="button" aria-pressed={rate === s} onClick={() => act(v => { v.playbackRate = s; })}>{SPEED_LABEL[s]}</button>
        ))}
      </span>
    </div>
  );
}

const snapshot = v => ({ paused: v?.paused ?? true, time: v?.currentTime ?? 0, duration: v?.duration ?? NaN, rate: v?.playbackRate ?? 1 });
const toggle = v => { if (v.paused) v.play().catch(() => {}); else v.pause(); };
const seek = (v, by) => { if (Number.isFinite(v.duration)) v.currentTime = Math.min(v.duration - 0.05, Math.max(0, v.currentTime + by)); };
const stepSpeed = (v, dir) => { const i = SPEEDS.indexOf(v.playbackRate); v.playbackRate = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))]; };
