import { z } from 'zod';
import { sessionKey, findScreen } from '../scene/screenState.js';

/**
 * Actions a scene can bind to a prefab hotspot (`objects[].actions`). No React here.
 * Each entry has a zod `schema` for its config and `run(action, store)`, where `store` is the
 * zustand state (`useStore.getState()`). Marker clicks, screen clicks and the terminal's `goto`
 * go through the same actions, so a scene can rebind what the built-in interactions do.
 */
export const ACTIONS = {
  /** Fly to a POI by id, or to the whole-room overview with `poi: null`. */
  goTo: {
    schema: z.strictObject({ type: z.literal('goTo'), poi: z.string().nullable() }),
    run: (a, st) => st.goTo(a.poi),
  },
  /** Zoom into a screen: the one the action is bound to, or `screen` (its id) of `poi` (default: the current POI). */
  zoom: {
    schema: z.strictObject({ type: z.literal('zoom'), poi: z.string().optional(), screen: z.string().optional() }),
    run: (a, st) => {
      if (!a.screen) return;
      const rec = findScreen(sessionKey(st.scene.name, a.poi ?? st.current, a.screen));
      if (rec) st.zoomTo(rec());
      else console.warn(`zoom: no screen "${a.screen}" in POI "${a.poi ?? st.current}"`);
    },
  },
  /** Open a link, in a new tab unless `newTab` is false. */
  openUrl: {
    schema: z.strictObject({ type: z.literal('openUrl'), url: z.string().min(1), newTab: z.boolean().default(true) }),
    run: a => { if (a.newTab) window.open(a.url, '_blank', 'noopener,noreferrer'); else location.assign(a.url); },
  },
  /** Collapse or expand the content panel. */
  togglePanel: {
    schema: z.strictObject({ type: z.literal('togglePanel') }),
    run: (_, st) => st.togglePanel(),
  },
  /** Dispatch a DOM `CustomEvent` named `scene-rooms:<name>` on `window`, for a page that embeds the viewer. */
  emit: {
    schema: z.strictObject({ type: z.literal('emit'), name: z.string().min(1), detail: z.any().optional() }),
    run: (a, st) => window.dispatchEvent(new CustomEvent(`scene-rooms:${a.name}`, { detail: { ...(a.detail ?? {}), poi: st.current } })),
  },
};

export const ACTION_TYPES = Object.keys(ACTIONS);

export const actionSchema = z.discriminatedUnion('type', Object.values(ACTIONS).map(a => a.schema));

/** Run a (validated) action against the store state. */
export function runAction(action, st) {
  const entry = ACTIONS[action?.type];
  if (!entry) { console.warn(`Unknown action "${action?.type}"`); return; }
  entry.run(action, st);
}
