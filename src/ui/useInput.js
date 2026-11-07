import { useEffect } from 'react';
import { useStore, runtime, viewRect } from '../state/store.js';

/** Id of the POI named by the #hash, or null (the room overview) when there is none or it is unknown. */
export function poiIdFromHash() {
  const id = decodeURIComponent((location.hash || '').slice(1));
  return useStore.getState().pois.some(p => p.id === id) ? id : null;
}

// free fly, by physical key position so other keyboard layouts get the same shape
const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);
const ARROW_DIR = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/**
 * Keyboard, wheel, swipe, pointer (for parallax) and #hash navigation; Esc leaves a zoomed-in screen.
 * WASD / QE, a middle-button drag (look) and, once flying, the wheel steer the camera by hand.
 */
export function useInput(stageRef, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const st = () => useStore.getState();
    const canFly = () => st().scene?.camera.freeFly !== false;
    const inUi = t => t.closest && t.closest('#panel, .options, .screen-ui, .editor, .confirm');

    const onKey = e => {
      if (e.key === 'Escape') {
        // also from inside the overlay's inputs
        if (st().confirm) st().cancelConfirm();
        else if (st().zoom) { document.activeElement?.blur?.(); st().exitZoom(); }
        else if (st().optionsOpen) st().toggleOptions();
        return;
      }
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (st().zoom) {
        // zoomed in: the arrows move between the POI's screens as laid out on the wall. Where the screen itself
        // takes the arrows (a video seeks with ← →, an input or textarea keeps them for its caret), Ctrl/⌘ + arrow
        // moves instead, always; PageUp / PageDown also stand in for ← → outside a textarea.
        if (e.altKey) return;
        const arrow = ARROW_DIR[e.key];
        const video = st().zoom.screen?.source === 'video';
        let dir = null;
        if (e.metaKey || e.ctrlKey) dir = arrow;
        else if (tag === 'textarea') return;
        else if (e.key === 'PageDown') dir = 'right';
        else if (e.key === 'PageUp') dir = 'left';
        else if (arrow && !typing && !(video && (arrow === 'left' || arrow === 'right'))) dir = arrow;
        if (dir) { e.preventDefault(); st().zoomMove(dir); }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing) return;
      if (e.key === ' ' && tag !== 'button') { e.preventDefault(); st().zoomIn(); return; }
      const { fly } = runtime;
      fly.slow = e.shiftKey;
      if (FLY_KEYS.has(e.code) && canFly()) { fly.keys.add(e.code); st().freeFly(); return; }
      const n = st().pois.length;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); st().next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); st().prev(); }
      else if (/^[1-9]$/.test(e.key) && +e.key <= n) st().goTo(+e.key - 1);
      else if (e.key === '0') st().home();
      else if (e.key === 'h' || e.key === 'H') st().togglePanel();
      else if (e.key === 'm' || e.key === 'M') st().toggleMarkers();
    };

    const onKeyUp = e => { runtime.fly.keys.delete(e.code); runtime.fly.slow = e.shiftKey; };
    // keys released while the window is in the background never send keyup
    const onBlur = () => { runtime.fly.keys.clear(); runtime.fly.slow = false; };

    let wheelAcc = 0, wheelLock = 0;
    const onWheel = e => {
      if (inUi(e.target) || st().zoom) return;
      if (st().free) { runtime.fly.dolly += e.deltaY; return; }
      wheelAcc += e.deltaY;
      const now = performance.now();
      if (now < wheelLock) return;
      if (Math.abs(wheelAcc) > 60) { wheelAcc > 0 ? st().next() : st().prev(); wheelAcc = 0; wheelLock = now + 900; }
    };

    const onMove = e => {
      if (e.pointerType === 'touch') { runtime.touch = true; return; }
      if (looking && !st().zoom) { st().freeFly(); runtime.fly.look.x += e.movementX; runtime.fly.look.y += e.movementY; }
      const { left, top, width, height } = viewRect();
      runtime.mouse.x = ((e.clientX - left) / width) * 2 - 1;
      runtime.mouse.y = ((e.clientY - top) / height) * 2 - 1;
    };

    let down = null, looking = false;
    const onDown = e => {
      if (e.button === 1 && canFly()) {
        // middle button looks around: no autoscroll or paste, and keep the drag when the pointer leaves the canvas
        e.preventDefault();
        stage.setPointerCapture(e.pointerId);
        looking = true;
        return;
      }
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = e => {
      if (!down || st().zoom || e.button !== 0) { down = null; return; }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? st().next() : st().prev();
      down = null;
    };

    const onLost = () => { looking = false; };

    const onHash = () => { const id = poiIdFromHash(); if (id !== st().current) st().goTo(id); };

    const stage = stageRef.current;
    addEventListener('keydown', onKey);
    addEventListener('keyup', onKeyUp);
    addEventListener('blur', onBlur);
    addEventListener('wheel', onWheel, { passive: true });
    addEventListener('pointermove', onMove);
    addEventListener('hashchange', onHash);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('lostpointercapture', onLost);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      onBlur();
      removeEventListener('wheel', onWheel);
      removeEventListener('pointermove', onMove);
      removeEventListener('hashchange', onHash);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('lostpointercapture', onLost);
    };
  }, [stageRef, enabled]);
}
