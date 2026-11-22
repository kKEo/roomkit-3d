import { useEffect } from 'react';
import { useStore, runtime, viewRect } from '../state/store.js';
import { coarsePointer } from '../lib/env.js';
import { createGestures } from '../lib/touch.js';
import { isPinch, wheelFly, pinchDelta } from '../lib/wheel.js';

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
 *
 * On a touchscreen the fingers steer it: a one-finger drag looks around, a two-finger drag slides and a pinch
 * moves forward or back (src/lib/touch.js); a tap stays a click. A drag with the mouse, or a press-and-drag on a
 * touchpad, looks around the same way, and a pinch on a touchpad moves forward or back (src/lib/wheel.js). Where
 * the scene has free flight off there is nothing to steer, so a drag swipes between stops. The editor keeps the
 * swipe as well and never learns about touch: its page has its own controls.
 */
export function useInput(stageRef, enabled) {
  useEffect(() => {
    if (!enabled) return;
    const st = () => useStore.getState();
    const canFly = () => st().scene?.camera.freeFly !== false;
    const inUi = t => t.closest && t.closest('#panel, .options, .screen-ui, .editor, .confirm');
    const editing = document.documentElement.classList.contains('editing');
    const gestures = createGestures();
    // fingers and the dragging mouse fly the camera here; false where they swipe between stops instead
    const fingersFly = () => !editing && canFly();
    if (!editing && coarsePointer) st().setTouch(true);

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
    const onBlur = () => {
      runtime.fly.keys.clear(); runtime.fly.slow = false;
      gestures.cancel();
      const t = runtime.fly.touch;
      t.look.x = t.look.y = t.pan.x = t.pan.y = t.pinch = 0;
      runtime.fly.slide = 0;
    };

    let wheelAcc = 0, wheelLock = 0;
    const onWheel = e => {
      if (inUi(e.target) || st().zoom) return;
      if (isPinch(e)) {
        // a pinch on a touchpad: forward or back, in place of the browser's page zoom; it starts the flight as fingers do
        if (!fingersFly()) return;
        e.preventDefault();
        st().freeFly();
      }
      if (st().free) { const w = wheelFly(e); runtime.fly.dolly += w.dolly; runtime.fly.slide += w.slide; return; }
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

    // the hints and controls follow the device last pressed with, so a laptop with a touchscreen gets both
    const onAnyDown = e => { if (!editing) st().setTouch(e.pointerType === 'touch'); };

    // Safari tells a touchpad pinch as gesture events with a scale (and repeats a touchscreen's pinch so: left alone)
    let pinchScale = 1;
    const onGestureStart = e => { if (!st().touch && fingersFly()) e.preventDefault(); pinchScale = 1; };
    const onGesture = e => {
      if (st().touch || !fingersFly() || st().zoom || inUi(e.target)) return;
      e.preventDefault();
      st().freeFly();
      if (st().free) runtime.fly.dolly += wheelFly({ ctrlKey: true, deltaY: pinchDelta(pinchScale, e.scale) }).dolly;
      pinchScale = e.scale;
    };

    // a finger, or the mouse with its main button held, dragging across the room
    const onTouchMove = e => {
      const g = gestures.move(e.pointerId, e.clientX, e.clientY);
      if (!g || st().zoom || !fingersFly()) return;
      st().freeFly();
      if (!st().free) return;
      // the mouse keeps its drag past the edge of the room (a finger does by itself); a drag is no longer a click
      if (e.pointerType !== 'touch' && !stage.hasPointerCapture(e.pointerId)) stage.setPointerCapture(e.pointerId);
      const t = runtime.fly.touch;
      t.look.x += g.look.x; t.look.y += g.look.y;
      t.pan.x += g.pan.x; t.pan.y += g.pan.y;
      t.pinch += g.pinch;
    };
    const onTouchEnd = e => gestures.up(e.pointerId);

    let down = null, looking = false;
    const onDown = e => {
      if (fingersFly() && (e.pointerType === 'touch' || e.button === 0)) { gestures.down(e.pointerId, e.clientX, e.clientY); return; }
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
    addEventListener('wheel', onWheel, { passive: false });
    addEventListener('pointermove', onMove);
    addEventListener('pointerdown', onAnyDown, true);
    addEventListener('hashchange', onHash);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('lostpointercapture', onLost);
    stage.addEventListener('pointermove', onTouchMove);
    stage.addEventListener('pointerup', onTouchEnd);
    stage.addEventListener('pointercancel', onTouchEnd);
    stage.addEventListener('gesturestart', onGestureStart);
    stage.addEventListener('gesturechange', onGesture);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
      onBlur();
      removeEventListener('wheel', onWheel);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerdown', onAnyDown, true);
      removeEventListener('hashchange', onHash);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('lostpointercapture', onLost);
      stage.removeEventListener('pointermove', onTouchMove);
      stage.removeEventListener('pointerup', onTouchEnd);
      stage.removeEventListener('pointercancel', onTouchEnd);
      stage.removeEventListener('gesturestart', onGestureStart);
      stage.removeEventListener('gesturechange', onGesture);
    };
  }, [stageRef, enabled]);
}
