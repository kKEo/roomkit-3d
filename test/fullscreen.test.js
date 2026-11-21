import { describe, it, expect } from 'vitest';
import { canFullscreen, isFullscreen, toggleFullscreen, onFullscreenChange } from '../src/lib/fullscreen.js';
import { SCENE_DEFAULTS } from '../src/config/defaults.js';

/** A document that knows full screen the standard way, or only with Safari's prefix. */
function fakeDoc({ prefix = false, enabled = true, refuse = false } = {}) {
  const listeners = {};
  const d = {
    documentElement: {},
    addEventListener: (type, fn) => { (listeners[type] ??= new Set()).add(fn); },
    removeEventListener: (type, fn) => { listeners[type]?.delete(fn); },
    fire: type => listeners[type]?.forEach(fn => fn()),
    count: type => listeners[type]?.size ?? 0,
  };
  const elementKey = prefix ? 'webkitFullscreenElement' : 'fullscreenElement';
  const event = prefix ? 'webkitfullscreenchange' : 'fullscreenchange';
  d[elementKey] = null;
  d[prefix ? 'webkitFullscreenEnabled' : 'fullscreenEnabled'] = enabled;
  d.documentElement[prefix ? 'webkitRequestFullscreen' : 'requestFullscreen'] = function () {
    if (refuse) return Promise.reject(new Error('refused'));
    d[elementKey] = this; d.fire(event);
    return prefix ? undefined : Promise.resolve();
  };
  d[prefix ? 'webkitExitFullscreen' : 'exitFullscreen'] = function () {
    d[elementKey] = null; d.fire(event);
    return prefix ? undefined : Promise.resolve();
  };
  return d;
}

describe('full screen', () => {
  it('is not there without a document, or where the browser has no such call (an iPhone)', () => {
    expect(canFullscreen(null)).toBe(false);
    expect(isFullscreen(null)).toBe(false);
    expect(canFullscreen({ documentElement: {} })).toBe(false);
    expect(() => toggleFullscreen({ documentElement: {} })).not.toThrow();
    expect(onFullscreenChange(() => {}, null)).toBeTypeOf('function');
  });

  it('is not there where the page is not allowed it', () => {
    expect(canFullscreen(fakeDoc({ enabled: false }))).toBe(false);
    expect(canFullscreen(fakeDoc({ prefix: true, enabled: false }))).toBe(false);
  });

  for (const prefix of [false, true]) {
    it(`enters and leaves, telling the listener each time${prefix ? ' (Safari prefix)' : ''}`, () => {
      const d = fakeDoc({ prefix });
      const seen = [];
      const stop = onFullscreenChange(v => seen.push(v), d);
      expect(canFullscreen(d)).toBe(true);
      expect(isFullscreen(d)).toBe(false);
      toggleFullscreen(d);
      expect(isFullscreen(d)).toBe(true);
      toggleFullscreen(d);
      expect(isFullscreen(d)).toBe(false);
      expect(seen).toEqual([true, false]);
      stop();
      expect(d.count('fullscreenchange') + d.count('webkitfullscreenchange')).toBe(0);
      toggleFullscreen(d);
      expect(seen).toEqual([true, false]);
    });
  }

  it('stays as it was when the browser refuses', async () => {
    const d = fakeDoc({ refuse: true });
    toggleFullscreen(d);
    await Promise.resolve();
    expect(isFullscreen(d)).toBe(false);
  });

  it('has a name for the button in both states', () => {
    expect(SCENE_DEFAULTS.ui.enterFullscreen).toBeTruthy();
    expect(SCENE_DEFAULTS.ui.exitFullscreen).toBeTruthy();
  });
});
