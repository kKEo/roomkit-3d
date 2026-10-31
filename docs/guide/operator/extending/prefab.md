# Adding a prefab

This page walks through adding a new built-in object type, a `lamp`, from geometry to auto-placement. It takes about twenty minutes. Three files change. If the type belongs to one scene rather than to the app, ship it with the scene instead: [Scene-shipped prefabs](scene-prefabs.md) needs no rebuild.

## 1. Write the component

Create `src/prefabs/Lamp.jsx`. A prefab receives `{ props, active, hovered }` and returns a group in **local space**: origin as documented, front facing +Z, metres. Build it from the helpers in `src/scene/core.jsx`:

- `<Solid shape args fill line …meshProps>`: a hatched mesh with an outline. `fill` is `"main"`, `"fine"` or `false`; `line` is a line style or `false`.
- `<Segs points line>`: line segments from a flat `[x,y,z, x,y,z, …]` array.
- `useWorld()`: `{ mats, rain, room, theme }`, for the shared materials, the rain texture and the room size.

```jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Solid } from '../scene/core.jsx';
import { reducedMotion } from '../lib/env.js';

/** Floor lamp (origin = floor centre). The shade grows slightly while its POI is open. */
export function Lamp({ props, active }) {
  const { height } = props;
  const shade = useRef();
  useFrame((_, dt) => {
    if (reducedMotion) return;
    const s = active ? 1.15 : 1;
    const x = shade.current.scale.x;
    shade.current.scale.setScalar(x + (s - x) * Math.min(1, dt * 3));
  });
  return (
    <group>
      <Solid shape="cylinder" args={[0.3, 0.35, 0.06, 16]} position={[0, 0.03, 0]} />
      <Solid shape="cylinder" args={[0.03, 0.03, height, 6]} position={[0, height / 2, 0]} line="mid" />
      <Solid ref={shade} shape="cone" args={[0.4, 0.5, 12, 1, true]} position={[0, height, 0]} fill="fine" line="glow" />
    </group>
  );
}
```

Rules that keep prefabs consistent:

- Respect `reducedMotion` for anything that moves continuously.
- Use `active` (panel open) for "reveal" animations, as the wardrobe does.
- Memoise anything derived from props (`useMemo`); `Segs` already compares its points by value.
- Don't create materials. Reuse `mats.fills` and `mats.lines` so the theme applies and nothing leaks.

## 2. Describe its props

Create `src/prefabs/Lamp.meta.js` next to the component. It has no React in it, so the config loader and the tests can import it:

```js
import { z } from 'zod';

/** Floor lamp (origin = floor centre). */
export const lamp = {
  schema: z.strictObject({
    height: z.number().positive().default(1.8),
  }),
  placement: p => ({ focus: [0, p.height * 0.7, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
};
```

- `schema` is a `z.strictObject` and **every key has a `.default()`**: the defaults become the prefab's `props`, a wrong type or a misspelt key is reported on the loading screen as `… › objects.0.props.height: …`, and an editor can build its inspector from it. Use `z.enum([...])` for choices and `.nullable().default(null)` for optional paths.
- Add `media: ['src']` if a prop holds a file path that should resolve against the scene folder; `'screen.src'` for a nested prop; `'items[].src'` for a path inside each entry of an array prop, as `controlDesk` does.
- For a screen, give the prop the `screenSchema` from `src/prefabs/screenSchema.js` (or `screenOrSource`, which also accepts a bare source name) and render `<ScreenSurface {...config} id="screen" w h />` from `src/prefabs/media.jsx`. Every screen source then works in your prefab. Pass a stable `id` so the screen's zoom and session state survive re-renders, and respect `zoom: false`.

- Name the parts a scene may make clickable in `hotspots` (a list, or a function of the props), and give the matching `<Solid>` a `hotspot="name"` prop. A `ScreenSurface`'s hotspot is its `id`. For the lamp, `hotspots: ['shade']` and `<Solid ref={shade} hotspot="shade" …>` let a scene write `"actions": { "shade": { "type": "goTo", "poi": "…" } }`; see [Actions and hotspots](../reference/actions.md).

Then register it in `src/prefabs/registry.js`: import `lamp` and add it to `META`. `normalisePrefab` checks it (defaults validate, placement is finite, hotspots are names) and it becomes part of `BUILTIN`; every registry the loader builds includes the built-ins, so `lamp` is now a valid `type` and the "unknown type" error lists it. `make test` checks every built-in prefab the same way.

## 3. Map the type to the component

Components load as separate chunks, fetched only by scenes that use the type. In `src/prefabs/loaders.js`, add `lamp: once(() => import('./Lamp.jsx'))` to `LOADERS` and `lamp: 'Lamp'` to `EXPORT_NAMES`. `PlacedObject` in `src/prefabs/index.jsx` wraps every object in `Suspense` (a faint box while the chunk loads) and an error boundary; `preloadPrefabs` fetches the chunks a scene uses while the loading screen is up. `test/loaders.test.js` checks that every registered type has a loader whose module exports the named component.

## 4. Try and document it

Add `{ "type": "lamp", "position": [3, 0, 3] }` to a scene's `decor`, run `make dev` and check it from several angles. Then add a section to the [Prefab reference](../reference/prefabs.md) and a row to the content guide's [objects page](../../user/objects.md).

## Adding a screen source

A screen source is a canvas drawer plus, if it is interactive, an overlay component:

1. In `src/scene/screens.js`, write `createXScreen(theme, config, session)` returning `{ texture, step(dt), update(config, status), dispose() }`. Draw on a 512 × 288 canvas and read whatever the overlay wrote into `session`. `update` receives new content in place (a live feed's answer, an editor change) and the feed `status`; keep your animation state across it and pass `status` to `header()` for the loading and error marks.
2. In `src/prefabs/screenSchema.js`, add the name to `SCREEN_SOURCES` (and to `INTERACTIVE_SOURCES` if it has an overlay) and any new config keys to `screenSchema`; a feed may then set those keys too (`liveScreenSchema`). In `src/prefabs/media.jsx`, add a branch to `makeCanvasScreen`. `ScreenSurface` passes every `screenSchema` key to the drawer and the overlay, so new keys need no other wiring.
3. For an overlay, write `src/ui/screens/X.jsx` taking `{ config, session, ui }`. Initialise its state from `session` and write changes back to it. Then add it to `KINDS` in `src/ui/ScreenOverlay.jsx`. Size text in `em`: the overlay sets its font size from the screen's height on the page.
4. Add any new interface strings to `src/config/defaults.js` and to [Interface strings](../reference/ui-strings.md), and the keys to the screen table in the [Prefab reference](../reference/prefabs.md#controldesk).
