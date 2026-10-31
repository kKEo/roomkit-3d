import { LOADERS } from './loaders.js';

/** The prefab types a built scene places, decor and POIs together. */
export function usedTypes({ scene, pois }) {
  const types = new Set();
  for (const o of scene.decor) types.add(o.type);
  for (const p of pois) for (const o of p.objects) types.add(o.type);
  return types;
}

/**
 * Fetches the component code of every prefab a scene uses (built-in chunks; a scene's own modules are
 * already loaded with their meta) while the loading screen is still up, so the intro flight shows no
 * placeholders. A chunk that fails to load does not block: the object shows nothing and logs once
 * (PrefabBoundary in ./index.jsx).
 */
export async function preloadPrefabs(built) {
  const types = [...usedTypes(built)];
  const jobs = types.map(t => LOADERS[t]?.());
  // a scene's own prefabs render through the SDK chunk; fetch it now too
  if (types.some(t => built.scene.registry?.extra[t])) jobs.push(import('./sdk.js'));
  await Promise.allSettled(jobs);
  return built;
}
