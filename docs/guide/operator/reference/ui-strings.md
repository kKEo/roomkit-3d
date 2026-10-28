# Interface strings

This page lists every word of the interface a scene can replace through `scene.json` → `ui`. Give only the keys you change; the rest keep the English defaults from `src/config/defaults.js`. `{name}` placeholders are filled in at runtime.

| Key | Default | Where |
| --- | --- | --- |
| `loading` | `Initializing room` | loading screen (see the note below) |
| `loadError` | `Could not load the scene` | heading above the error list |
| `kicker` | `{n} of {total}` | above the panel title; `{n}` and `{total}` are zero-padded |
| `hint` | `[←][→] or mouse wheel — move, [1]–[{total}] areas, click a marker in the room` | bottom hint; `[x]` renders as a key cap |
| `goTo` | `Go to {label}` | accessible name of marker labels |
| `home` | `go to start` | accessible name of the logo, after the brand |
| `navLabel` | `Areas of the room` | accessible name of the top navigation |
| `hidePanel` / `showPanel` | `Hide content panel (H)` / `Show content panel (H)` | panel button |
| `hideMarkers` / `showMarkers` | `Hide floating markers (M)` / `Show floating markers (M)` | marker button |
| `settings` | `Camera settings` | settings button and panel heading |
| `easeLabel` | `Transition curve` | settings |
| `ease.quint`, `ease.expo`, `ease.back`, `ease.sine`, `ease.linear` | descriptions such as `Quint in-out (smooth start and stop)` | settings select options |
| `parallax` | `Parallax` | settings |
| `warp` | `Warp effect (FOV change in flight)` | settings |
| `formPrototype` | `This is a prototype — the message was not sent.` | form without `action` |
| `formSent` | `Message sent. Thank you!` | form POST succeeded |
| `formFailed` | `Sending failed — please try again.` | form POST failed |
| `canvasLabel` | `3D room with {total} areas` | accessible name of the canvas |

> **Note.** The loading screen can only use a scene's own `loading` text once that scene has loaded, in the 650 ms pause before the fly-in. While the files are still downloading it shows the default, because the app does not yet know which strings to use. `loadError` is never taken from the scene: a scene is stored only when it loads without errors, so the error screen always uses the default. Change it in `src/config/defaults.js` if you need another language there.

Set `lang` in `scene.json` to the language you translate to, so screen readers pronounce it correctly.
