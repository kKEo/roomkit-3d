import * as THREE from 'three';
import { useStore, runtime, editGroups } from '../state/store.js';
import { viewNames, viewPose } from '../lib/still.js';

/**
 * The browser half of still mode (src/lib/still.js): `window.__roomkit`, the handle a script holds the camera by.
 *
 *   await __roomkit.view('studio')   put the camera at a view and wait until the picture has settled
 *   __roomkit.views()                the views this scene has
 *   __roomkit.measure()              where each object's solid parts really are, in its own space
 *
 * `document.documentElement.dataset.scene` turns "ready" once the first view is up, or "error" when the scene could
 * not be shown, with `__roomkit.error` the lines the loading screen would list.
 */

let loading = 0;

/** Counts the textures and models three.js is still fetching, so no picture is taken of a placeholder. Call it before the scene mounts. */
export function trackLoading() {
  const m = THREE.DefaultLoadingManager, { itemStart, itemEnd } = m;
  m.itemStart = url => { loading++; itemStart.call(m, url); };
  m.itemEnd = url => { loading = Math.max(0, loading - 1); itemEnd.call(m, url); }; // three calls it after a failure too
}

const frames = n => new Promise(resolve => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve()); step(); });
async function until(ok, ms) {
  for (const t0 = performance.now(); !ok();) { if (performance.now() - t0 > ms) return false; await frames(1); }
  return true;
}

/** Tells a waiting script that the scene cannot be shown, and why. */
export function stillFailed(lines) {
  window.__roomkit = { ...window.__roomkit, error: lines };
  document.documentElement.dataset.scene = 'error';
}

/** The box of an object's solid parts in its own space (lines and unseen click areas left out), or null. */
function solidBox(group) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(), box = new THREE.Box3(), v = new THREE.Vector3();
  group.traverse(o => {
    if (!o.isMesh || o.isLineSegments2 || !o.visible || o.material?.opacity === 0 || !o.geometry?.attributes.position) return;
    const m = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld), p = o.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m));
  });
  return box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
}

/** Installs the handle and shows the first view; the page is "ready" when that one has settled. */
export function installStill({ view: first }) {
  runtime.still = true;
  const hook = {
    views: () => viewNames(useStore.getState().pois),
    async view(spec) {
      const st = useStore.getState(), vw = runtime.view;
      const pose = viewPose(spec, st.scene, st.pois, vw.width ? vw.width / vw.height : innerWidth / innerHeight);
      if (pose.error) return { ok: false, error: pose.error };
      st.openAt(pose, 1);
      const nonce = useStore.getState().nav.nonce;
      const arrived = await until(() => runtime.arrived === nonce, 5000);
      const loaded = await until(() => loading === 0, 8000);
      await frames(3);
      return { ok: arrived, loaded, pose };
    },
    measure: () => [...editGroups].map(([key, group]) => ({ key, box: solidBox(group) })),
  };
  window.__roomkit = hook;
  (async () => {
    await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 3000))]);
    const r = await hook.view(first);
    if (r.ok) document.documentElement.dataset.scene = 'ready'; else stillFailed([r.error ?? 'the camera did not reach its view']);
  })();
  return hook;
}
