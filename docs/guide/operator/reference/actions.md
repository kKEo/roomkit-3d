# Actions and hotspots

This page lists what a scene can make clickable and what a click can do. The source is `src/actions/registry.js` (the actions) and each prefab's `hotspots` in `src/prefabs/<Name>.meta.js`.

## Binding

Every object (in a POI's `objects` or in `scene.json` `decor`) may carry `actions`: a map from a **hotspot name** to an **action**.

```json
{ "type": "pictureFrame", "position": [5, 3, -12],
  "actions": { "frame": { "type": "goTo", "poi": "studio" } } }
```

A hotspot with an action shows a hand cursor and a glowing outline on hover, and runs the action on click (a drag is not a click). Binding a name the prefab does not have is a load error that lists the names it has. The `loft` example scene binds actions on its picture frames and its door.

## Actions

| `type` | Keys | Does |
| --- | --- | --- |
| `goTo` | `poi`: a POI id, or `null` | flies to that POI (and opens its panel), or to the whole-room view |
| `zoom` | `screen`: a screen id, `poi`: its POI (default: the current one); both optional | zooms into a screen. Bound to a screen's own hotspot with no `screen` key, it zooms into that screen |
| `openUrl` | `url`, `newTab` (default `true`) | opens a link in a new tab, or navigates the page |
| `togglePanel` | — | hides or shows the content panel (the `H` key) |
| `emit` | `name`, `detail` (any JSON) | dispatches `new CustomEvent("scene-rooms:<name>", { detail })` on `window`, with the current POI id added to `detail`; for a page that embeds the viewer |

The built-in interactions use the same actions: a marker click and a screen click on another POI dispatch `goTo`, and the terminal's `goto` command does too.

## Hotspots by prefab

| Prefab | Hotspots | Part |
| --- | --- | --- |
| `bench` | `bench` | the block |
| `cinemaScreen` | `screen` | the screen surface |
| `controlDesk` | one per screen: its `id`, else `scr0`, `scr1`, … in list order | each screen surface |
| `desk` | `screen`, `chair` | the monitor, the chair |
| `door` | `door` | posts and lintel |
| `pedestal` | `solid` | the floating shape |
| `pictureFrame` | `frame`, `image` | the frame board, the picture (when `image` is set) |
| `primitive` | `shape` | the shape |
| `serverRack` | `rack` | the cabinets |
| `wardrobe` | `doors` | both doors |

## Screens and the default click

A screen inside a POI is clickable by default (unless its `zoom` is `false`): the first click on a screen of another POI flies there, a click on a screen of the current POI zooms in. Binding an action to the screen's hotspot replaces that default, everywhere, including `decor`. To keep the zoom and add nothing, bind `{ "type": "zoom" }`.

## Adding an action type

In `src/actions/registry.js`, add an entry to `ACTIONS` with a `z.strictObject` schema whose `type` is a `z.literal`, and a `run(action, store)` that calls the store (`useStore.getState()`: `goTo`, `zoomTo`, `togglePanel`, `showPanel`, …). The schema joins the discriminated union automatically, so the loader validates it, and `store.dispatch` runs it. Add a case to `test/actions.test.js` and a row to the table above.
