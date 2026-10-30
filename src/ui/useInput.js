import { useEffect } from 'react';
import { useStore, runtime, viewRect } from '../state/store.js';

/** Id of the POI named by the #hash, or null (the room overview) when there is none or it is unknown. */
export function poiIdFromHash() {
  const id = decodeURIComponent((location.hash || '').slice(1));
  return useStore.getState().pois.some(p => p.id === id) ? id : null;
}

/** Keyboard, wheel, swipe, pointer (for parallax) and #hash navigation; Esc leaves a zoomed-in screen. */
export function useInput(stageRef, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const st = () => useStore.getState();
    const inUi = t => t.closest && t.closest('#panel, .settings, .screen-ui, .editor');

    const onKey = e => {
      if (e.key === 'Escape') {
        // also from inside the overlay's inputs
        if (st().zoom) { document.activeElement?.blur?.(); st().exitZoom(); }
        else if (st().settingsOpen) st().toggleSettings();
        return;
      }
      if (st().zoom) return; // zoomed in: only Esc (or the Back button) leaves
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = st().pois.length;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); st().next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); st().prev(); }
      else if (/^[1-9]$/.test(e.key) && +e.key <= n) st().goTo(+e.key - 1);
      else if (e.key === '0') st().home();
      else if (e.key === 'h' || e.key === 'H') st().togglePanel();
      else if (e.key === 'm' || e.key === 'M') st().toggleMarkers();
    };

    let wheelAcc = 0, wheelLock = 0;
    const onWheel = e => {
      if (inUi(e.target) || st().zoom) return;
      wheelAcc += e.deltaY;
      const now = performance.now();
      if (now < wheelLock) return;
      if (Math.abs(wheelAcc) > 60) { wheelAcc > 0 ? st().next() : st().prev(); wheelAcc = 0; wheelLock = now + 900; }
    };

    const onMove = e => {
      if (e.pointerType === 'touch') { runtime.touch = true; return; }
      const { left, top, width, height } = viewRect();
      runtime.mouse.x = ((e.clientX - left) / width) * 2 - 1;
      runtime.mouse.y = ((e.clientY - top) / height) * 2 - 1;
    };

    let down = null;
    const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = e => {
      if (!down || st().zoom) { down = null; return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? st().next() : st().prev();
      down = null;
    };

    const onHash = () => { const id = poiIdFromHash(); if (id !== st().current) st().goTo(id); };

    const stage = stageRef.current;
    addEventListener('keydown', onKey);
    addEventListener('wheel', onWheel, { passive: true });
    addEventListener('pointermove', onMove);
    addEventListener('hashchange', onHash);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('wheel', onWheel);
      removeEventListener('pointermove', onMove);
      removeEventListener('hashchange', onHash);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
    };
  }, [stageRef, enabled]);
}
