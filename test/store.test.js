import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/state/store.js';
import { registerScreen } from '../src/scene/screenState.js';

const scene = (name = 's') => ({ name, effects: { markers: true, ease: 'quint', parallax: 0.8, warp: 12 } });
const pois = ids => ids.map(id => ({ id, label: id, camera: { position: [0, 2, 10], target: [0, 2, 0] } }));
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
    st().toggleOptions(); st().setHover('a');
    st().zoomTo({ key: 'k1', poi: 'a' });
    expect(st().optionsOpen).toBe(false);
    expect(st().hover).toBe(null);
    const z = st().zoom;
    st().zoomTo({ key: 'k1', poi: 'a' });
    expect(st().zoom).toBe(z);
  });

  describe('keyboard zoom', () => {
    // three screens on the far wall (z = 0) of POI "a", registered out of order; seen from +z, "right" is +x
    const screen = (key, x, poi = 'a', zoom = true) => ({ key, poi, screen: { source: 'image', zoom }, center: [x, 2, 0], normal: [0, 0, 1], up: [0, 1, 0], w: 1, h: 1 });
    const mount = recs => { const offs = recs.map(r => registerScreen(r.key, () => r)); return () => offs.forEach(f => f()); };

    it('zoomIn takes the screen the POI camera faces, only once the camera has arrived', () => {
      const off = mount([screen('r', 3), screen('m', 0.2), screen('l', -3)]);
      st().goTo('a');
      st().zoomIn();
      expect(st().zoom).toBe(null);
      st().showPanel('a');
      st().zoomIn();
      expect(st().zoom?.key).toBe('m');
      off();
    });

    it('zoomIn ignores the overview, free flight and screens of other POIs or with zoom off', () => {
      const off = mount([screen('other', 0, 'b'), screen('no', 0, 'a', false)]);
      st().home(); st().zoomIn();
      expect(st().zoom).toBe(null);
      st().goTo('a'); st().showPanel('a'); st().zoomIn();
      expect(st().zoom).toBe(null);
      st().freeFly(); st().zoomIn();
      expect(st().zoom).toBe(null);
      off();
    });

    it('zoomStep walks the screens left to right and wraps', () => {
      const off = mount([screen('r', 3), screen('m', 0), screen('l', -3)]);
      st().goTo('a'); st().showPanel('a'); st().zoomIn();
      st().zoomStep(1);
      expect(st().zoom.key).toBe('r');
      st().zoomStep(1);
      expect(st().zoom.key).toBe('l');
      st().zoomStep(-1);
      expect(st().zoom.key).toBe('r');
      expect(st().current).toBe('a');
      off();
    });

    it('zoomStep does nothing when not zoomed', () => {
      st().goTo('a'); st().zoomStep(1);
      expect(st().zoom).toBe(null);
    });
  });

  it('toggleMarkers clears hover', () => {
    st().setHover('b');
    st().toggleMarkers();
    expect(st().markersVisible).toBe(false);
    expect(st().hover).toBe(null);
  });
});

describe('freeFly', () => {
  it('leaves the current POI and its flight where the camera is', () => {
    st().goTo('b'); st().showPanel('b');
    st().freeFly();
    expect(st().free).toBe(true);
    expect(st().current).toBe(null);
    expect(st().shown).toBe(null);
    expect(st().nav).toBe(null);
  });

  it('ends with any navigation, including the overview', () => {
    st().freeFly();
    st().home();
    expect(st().free).toBe(false);
    expect(st().nav.id).toBe(null);
    st().freeFly();
    st().goTo('a');
    expect(st().free).toBe(false);
    expect(st().current).toBe('a');
  });

  it('is ignored while zoomed into a screen', () => {
    st().goTo('a');
    st().zoomTo({ key: 'k' });
    st().freeFly();
    expect(st().free).toBe(false);
    expect(st().current).toBe('a');
  });

  it('survives a reload of the same scene but not a different one', () => {
    st().freeFly();
    st().setLoaded(scene(), pois(['a', 'b', 'c']));
    expect(st().free).toBe(true);
    st().setLoaded(scene('other'), pois(['a']));
    expect(st().free).toBe(false);
  });
});

describe('gfx', () => {
  it('changes and resets rendering preferences', () => {
    st().setGfx('fps', 30);
    expect(st().gfx.fps).toBe(30);
    st().resetGfx();
    expect(st().gfx.fps).toBe(0);
  });
});
