import { lazy } from 'react';

/** One lazy component per loaded module object, so a module's `component(sdk)` runs once. */
const COMPONENT_OF = new WeakMap();

const Missing = () => null;

/**
 * The React component of a scene-shipped prefab (a registry entry with `module` and `url`).
 * Keyed on the module object, not the URL: the editor re-imports a module under a fresh `?v=` and
 * gets a fresh component, while the viewer reuses one. Wrapped in `lazy` so it takes the same
 * Suspense path as the built-in chunks; a module without a `component` export rejects there and
 * ends in PrefabBoundary.
 */
export function externalComponent(entry) {
  if (!entry?.module) return Missing;
  let c = COMPONENT_OF.get(entry.module);
  if (!c) {
    c = lazy(async () => {
      if (typeof entry.module.component !== 'function') throw new Error(`${entry.url}: module has no "component" export`);
      // the SDK (with the glTF loader) is its own chunk: only scenes with their own prefabs fetch it
      const { makeSdk } = await import('./sdk.js');
      const made = entry.module.component(makeSdk(entry.url));
      if (typeof made !== 'function') throw new Error(`${entry.url}: component() did not return a component`);
      return { default: made };
    });
    COMPONENT_OF.set(entry.module, c);
  }
  return c;
}
