import { getShared, setShared } from './shared.js';
import { syncClient, useSync } from './syncStore.js';

/**
 * Keeps a video screen in step for everyone in an event. The shared key `<screen key>.video` holds
 * `{ playing, at, t0, rate }`: whether it plays, the media time `at` it had at server time `t0`, and
 * the speed; so a viewer can work out where the video should be now from the server clock, however
 * late it joined. Only a visitor's own actions publish (src/ui/screens/VideoControls.jsx); the
 * <video> elements follow, seeking when they drift more than `DRIFT` seconds.
 */
const DRIFT = 0.6;
const serverNow = () => syncClient()?.serverNow() ?? Date.now();
const keyOf = screenKey => `${screenKey}.video`;

/** The speeds the transport bar offers are 0.25 to 2; a browser refuses (throws) beyond its own range, so stay well inside it. */
const MIN_RATE = 0.25, MAX_RATE = 4;

/**
 * Whether a shared `<screen>.video` value is a well-formed `{ playing, at, t0, rate? }`. Any visitor can write
 * the key, and applying a bad value throws inside the store listener (`currentTime = NaN` is a TypeError, an
 * unsupported `playbackRate` a NotSupportedError) on every viewer's page, so it is checked first.
 */
export function validVideoState(s) {
  return !!s && typeof s === 'object'
    && typeof s.playing === 'boolean'
    && Number.isFinite(s.at) && s.at >= 0
    && Number.isFinite(s.t0)
    && (s.rate == null || (Number.isFinite(s.rate) && s.rate >= MIN_RATE && s.rate <= MAX_RATE));
}

/** Announce the state of `video` after this visitor changed it. */
export function publishVideo(screenKey, video) {
  setShared(keyOf(screenKey), { playing: !video.paused, at: video.currentTime, t0: serverNow(), rate: video.playbackRate });
}

/** Where a shared video state says the video is now, in seconds. */
export function expectedTime(state, now = serverNow()) {
  if (!state) return null;
  return state.playing ? state.at + ((now - state.t0) / 1000) * (state.rate || 1) : state.at;
}

/** Steer `video` by the shared state of `screenKey`, now and on every change; returns the stop function. */
export function followVideo(screenKey, video) {
  const key = keyOf(screenKey);
  let last = null;
  const apply = () => {
    const state = getShared(key);
    if (!validVideoState(state) || (state === last && !state.playing)) return;
    last = state;
    if (state.rate && video.playbackRate !== state.rate) video.playbackRate = state.rate;
    let t = expectedTime(state);
    if (Number.isFinite(video.duration) && video.duration > 0 && video.loop) t %= video.duration;
    if (!Number.isFinite(t) || t < 0) t = 0;
    if (Math.abs(video.currentTime - t) > DRIFT) video.currentTime = t;
    if (state.playing && video.paused) video.play().catch(() => {});
    else if (!state.playing && !video.paused) video.pause();
  };
  apply();
  const off = useSync.subscribe((s, prev) => { if (s.version !== prev.version || s.status !== prev.status) apply(); });
  // a playing video drifts (buffering, tab throttling): check now and then
  const timer = setInterval(() => { if (getShared(key)?.playing) apply(); }, 4000);
  return () => { off(); clearInterval(timer); };
}
