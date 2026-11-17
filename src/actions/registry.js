import { z } from 'zod';
import { findScreenIn } from '../scene/screenState.js';
import { setShared, toggleShared } from '../net/shared.js';

/**
 * Actions a scene can bind to a prefab hotspot (`objects[].actions`). No React here.
 * Each entry has a zod `schema` for its config and `run(action, store)`, where `store` is the
 * zustand state (`useStore.getState()`). Marker clicks, screen clicks and the terminal's `goto`
 * go through the same actions, so a scene can rebind what the built-in interactions do.
 */
export const ACTIONS = {
  /** Fly to a POI by id, or to the whole-room overview with `poi: null`. */
  goTo: {
    schema: z.strictObject({ type: z.literal('goTo'), poi: z.string().nullable() }).describe('fly to the stop with that id and open its panel; poi null is the whole-room view'),
    run: (a, st) => st.goTo(a.poi),
  },
  /** Zoom into a screen: the one the action is bound to, or `screen` (its id) of `poi` (default: the current POI). */
  zoom: {
    schema: z.strictObject({ type: z.literal('zoom'), poi: z.string().optional(), screen: z.string().optional() }).describe('zoom into a screen: the one it is bound to, or the screen with that id of that stop'),
    run: (a, st) => {
      if (!a.screen) return;
      const rec = findScreenIn(a.poi ?? st.current, a.screen);
      if (rec) st.zoomTo(rec);
      else console.warn(`zoom: no screen "${a.screen}" in POI "${a.poi ?? st.current}"`);
    },
  },
  /**
   * Open a link, in a new tab unless `newTab` is false. `label` names the destination for people;
   * with `confirm`, the viewer asks first (the store holds the pending action meanwhile).
   */
  openUrl: {
    schema: z.strictObject({
      type: z.literal('openUrl'),
      url: z.string().min(1),
      newTab: z.boolean().default(true),
      label: z.string().min(1).optional(),
      confirm: z.boolean().default(false),
    }).describe('open a link, in a new tab unless newTab is false; with confirm the visitor is asked first, seeing the label'),
    run: (a, st) => { if (a.confirm) st.askConfirm(a); else openLink(a); },
  },
  /** Collapse or expand the content panel. */
  togglePanel: {
    schema: z.strictObject({ type: z.literal('togglePanel') }).describe('hide or show the content panel'),
    run: (_, st) => st.togglePanel(),
  },
  /** Set a shared key (src/net/shared.js) to `value` for everyone in the event (or this page alone outside one). */
  set: {
    schema: z.strictObject({ type: z.literal('set'), key: z.string().min(1).max(200), value: z.any() }).describe('set a shared value for everyone in the event'),
    run: a => setShared(a.key, a.value),
  },
  /** Flip a boolean shared key; `initial` is what it counts as before anyone set it. */
  toggle: {
    schema: z.strictObject({ type: z.literal('toggle'), key: z.string().min(1).max(200), initial: z.boolean().default(false) }).describe('flip a shared true/false value'),
    run: a => toggleShared(a.key, a.initial),
  },
  /** Dispatch a DOM `CustomEvent` named `scene-rooms:<name>` on `window`, for a page that embeds the viewer. */
  emit: {
    schema: z.strictObject({ type: z.literal('emit'), name: z.string().min(1), detail: z.any().optional() }).describe('send a DOM event scene-rooms:<name> to a page that embeds the viewer'),
    run: (a, st) => window.dispatchEvent(new CustomEvent(`scene-rooms:${a.name}`, { detail: { ...(a.detail ?? {}), poi: st.current } })),
  },
};

/** Follow an `openUrl` action right away. */
export function openLink(a) {
  if (a.newTab) window.open(a.url, '_blank', 'noopener,noreferrer'); else location.assign(a.url);
}

export const ACTION_TYPES = Object.keys(ACTIONS);

export const actionSchema = z.discriminatedUnion('type', Object.values(ACTIONS).map(a => a.schema));

/** Run a (validated) action against the store state. */
export function runAction(action, st) {
  const entry = ACTIONS[action?.type];
  if (!entry) { console.warn(`Unknown action "${action?.type}"`); return; }
  entry.run(action, st);
}
