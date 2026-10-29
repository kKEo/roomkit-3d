# Adding a prefab

This page walks through adding a new object type, a `lamp`, from geometry to auto-placement. It takes about twenty minutes. Three files change.

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

## 2. Register its metadata

In `src/prefabs/registry.js` add:

```js
lamp: {
  props: { height: 1.8 },
  placement: p => ({ focus: [0, p.height * 0.7, 0], cameraDistance: 4, cameraHeight: 2, markerOffset: [0, p.height + 0.6, 0] }),
},
```

Add `media: ['src']` if a prop holds a file path that should resolve against the scene folder, or `media: ['items[].src']` for a path inside each entry of an array prop, as `controlDesk` does for its screens. For a screen, render `<ScreenSurface {...config} w h />` from `src/prefabs/media.jsx`, and every screen source works in your prefab too. Inside a POI the screen is also clickable and zoomable; add a `zoom: true` prop and pass it through so scenes can switch that off, and pass a stable `id` when a prefab has several screens so their state survives re-renders. The schema reads `PREFAB_TYPES` from this file, so `lamp` is now a valid `type`, and the "unknown type" error lists it.

## 3. Map the type to the component

In `src/prefabs/index.jsx`, import `Lamp` and add `lamp: Lamp` to `COMPONENTS`.

## 4. Try and document it

Add `{ "type": "lamp", "position": [3, 0, 3] }` to a scene's `decor`, run `make dev` and check it from several angles. Then add a section to the [Prefab reference](../reference/prefabs.md) and a row to the content guide's [objects page](../../user/objects.md).

## Adding a screen source

A screen source is a canvas drawer plus, if it is interactive, an overlay component:

1. In `src/scene/screens.js`, write `createXScreen(theme, config, session)` returning `{ texture, step(dt), dispose() }`. Draw on a 512 × 288 canvas and read whatever the overlay wrote into `session`.
2. In `src/prefabs/media.jsx`, add the name to `SCREEN_SOURCES` (and to `INTERACTIVE_SOURCES` if it has an overlay), add a branch to `useCanvasScreen`, and destructure any new config keys in `ScreenSurface` so they reach both the drawer and `config`.
3. For an overlay, write `src/ui/screens/X.jsx` taking `{ config, session, ui }`. Initialise its state from `session` and write changes back to it. Then add it to `KINDS` in `src/ui/ScreenOverlay.jsx`. Size text in `em`: the overlay sets its font size from the screen's height on the page.
4. Add any new interface strings to `src/config/defaults.js` and to [Interface strings](../reference/ui-strings.md), and the keys to the screen table in the [Prefab reference](../reference/prefabs.md#controldesk).
