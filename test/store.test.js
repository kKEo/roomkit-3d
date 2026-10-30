import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/state/store.js';

const scene = (name = 's') => ({ name, effects: { markers: true, ease: 'quint', parallax: 0.8, warp: 12 } });
const pois = ids => ids.map(id => ({ id, label: id }));
const st = () => useStore.getState();

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true);
  st().setLoaded(scene(), pois(['a', 'b', 'c']));
});

describe('setLoaded', () => {
  it('installs the scene, its POIs and the effect settings', () => {
    expect(st().status).toBe('ready');
    expect(st().pois.map(p => p.id)).toEqual(['a', 'b', 'c']);
    expect(st().settings).toEqual({ ease: 'quint', parallax: 0.8, warp: 12 });
    expect(st().current).toBe(null);
  });

  it('keeps the visitor at the same POI when the same scene is loaded again with reordered POIs', () => {
    st().goTo('b'); st().showPanel('b');
    st().setLoaded(scene(), pois(['c', 'b', 'a']));
    expect(st().current).toBe('b');
    expect(st().shown).toBe('b');
    expect(st().indexOf('b')).toBe(1);
  });

  it('drops a selection whose POI no longer exists, and everything on a different scene', () => {
    st().goTo('b');
    st().setLoaded(scene(), pois(['a', 'c']));
    expect(st().current).toBe(null);
    st().goTo('a');
    st().setLoaded(scene('other'), pois(['a']));
    expect(st().current).toBe(null);
    expect(st().nav).toBe(null);
  });
});

describe('goTo and navigation', () => {
  it('accepts an id, an index or null', () => {
    st().goTo('b');
    expect(st().current).toBe('b');
    expect(st().nav).toMatchObject({ id: 'b', nonce: 1 });
    st().goTo(2);
    expect(st().current).toBe('c');
    st().goTo(null);
    expect(st().current).toBe(null);
    expect(st().nav.id).toBe(null);
  });

  it('wraps indices and treats negative ones and unknown ids as the overview', () => {
    expect(st().resolve(3)).toBe('a');
    expect(st().resolve(-1)).toBe(null);
    expect(st().resolve('zzz')).toBe(null);
  });

  it('next and prev wrap around and leave the overview sensibly', () => {
    st().next(); expect(st().current).toBe('a');
    st().next(); st().next(); st().next(); expect(st().current).toBe('a');
    st().goTo(null); st().prev(); expect(st().current).toBe('c');
    st().prev(); expect(st().current).toBe('b');
  });

  it('hides the panel and bumps the nonce on every flight; the panel is shown later by the rig', () => {
    st().goTo('a'); st().showPanel('a');
    expect(st().shown).toBe('a');
    st().goTo('b');
    expect(st().shown).toBe(null);
    expect(st().nav.nonce).toBe(2);
  });

  it('ignores a flight to where the visitor already is, except to leave a zoomed screen', () => {
    st().goTo('a'); st().showPanel('a');
    st().goTo('a');
    expect(st().nav.nonce).toBe(1);
    st().zoomTo({ key: 'k', poi: 'a' });
    expect(st().zoom).not.toBe(null);
    st().goTo('a');
    expect(st().zoom).toBe(null);
    expect(st().nav.nonce).toBe(1);
  });

  it('does nothing without POIs', () => {
    useStore.setState({ pois: [] });
    st().goTo(0);
    expect(st().nav).toBe(null);
  });
});

describe('zoom and markers', () => {
  it('zoomTo closes the settings and clears hover; the same screen twice is a no-op', () => {
    st().toggleSettings(); st().setHover('a');
    st().zoomTo({ key: 'k1', poi: 'a' });
    expect(st().settingsOpen).toBe(false);
    expect(st().hover).toBe(null);
    const z = st().zoom;
    st().zoomTo({ key: 'k1', poi: 'a' });
    expect(st().zoom).toBe(z);
  });

  it('toggleMarkers clears hover', () => {
    st().setHover('b');
    st().toggleMarkers();
    expect(st().markersVisible).toBe(false);
    expect(st().hover).toBe(null);
  });
});
