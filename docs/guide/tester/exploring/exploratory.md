# Exploratory testing

This page is a checklist for a manual session, grouped by area. Pick the areas your change touches; a full pass takes about thirty minutes. Keep the browser console open throughout: any red line is a finding.

## Arrival and navigation

| Try | Expect |
| --- | --- |
| Load `/` | loader with blinking cursor, then the camera rises to the whole-room view: every stop visible from above, no ceiling grid or lamps in the way, the far wall not faded; no panel, no hash |
| From any stop, `0`, then the logo | both fly back to the whole-room view, the panel closes and the hash is cleared |
| From the whole-room view, `→` and `←` | `→` goes to stop 01, `←` to the last stop |
| Load `/#contact`, and `/#nonsense` | the first lands directly at the contact stop; the second opens the whole-room view |
| `→` repeatedly, past the last stop | wraps to 01; the top-bar highlight, hash and minimap dot follow |
| Number keys, including one higher than the number of stops | valid keys jump; the higher key does nothing |
| Mouse wheel: one notch, then a hard flick | each moves exactly one stop; further scrolling is ignored for 0.9 s (long trackpad momentum may move once more after that) |
| Scroll inside a long panel | the panel scrolls; the room does not move |
| Click a diamond, a floating label, a nav button, the pager | each goes to its stop |
| Drag across the canvas and release on a diamond | a mostly horizontal drag over 50 px moves one stop as a swipe; it never also counts as a click on the diamond |
| Type in the contact form, including the letters H, M and digits | text is entered; panel, markers and stops do not change |
| Change the hash by hand in the address bar | the camera flies to that stop |

## Free fly

| Try | Expect |
| --- | --- |
| At a stop, hold `W` | the panel closes, the hash and the top-bar highlight clear, the hint lists the fly keys; the camera glides forward and eases to a stop on release |
| `A`, `S`, `D`, `Q`, `E`, then with `Shift` | left, back, right, down, up; a third of the speed with `Shift`; never below the floor |
| Middle-drag on the canvas, also out past its edge | the view turns with the mouse (down looks down) and stops short of straight up or down; no autoscroll, no stop change |
| Wheel while flying | slides forward / back smoothly instead of changing stops |
| `W` during a flight between stops | the flight stops where it is; no panel opens |
| Then `0`, `2`, a diamond, a nav button | each flies there from the current spot and ends free fly; the hint and hash come back |
| Hold `W`, switch to another window, come back | the camera is not still flying |
| Zoomed into a screen: `W`, middle-drag | nothing happens; typing `w` in the console just types |
| Type in the contact form, including W, A, S, D | text is entered; the camera does not move |

## Panel and content

| Try | Expect |
| --- | --- |
| Watch a panel open | title "decodes" from random characters; lead paragraph larger; pager shows the previous and next labels |
| `H`, then navigate, then `H` | the panel stays hidden across stops, and the view re-centres; it comes back on the current stop |
| Submit the form with no `action` | the prototype message appears; no network request |
| Wardrobe stop | doors swing open as the panel appears, and close when you leave |
| Control stop (`neo-room` 07) | nine different screens: a moving wave, status lines typing out with a blinking cursor, a radar sweep lighting up contacts, the floor-plan picture, rain captioned "uplink // secure", a console, a node table, a report form, amber bars; buttons blink on the consoles |

## Zoomed-in screens

| Try | Expect |
| --- | --- |
| Hover any screen of the current stop | pointer cursor; the screen brightens slightly |
| Click a screen of another stop (e.g. the cinema screen from stop 01) | the camera flies straight to that screen; the top bar and the `#hash` show that stop while up close |
| `Esc` after that | the camera flies back to exactly where it was before the click; the top bar and `#hash` show stop 01 again. From free flight (WASD), `Esc` returns to the spot and flying resumes |
| Click a screen of the current stop | a straight, short flight; the screen fills most of the view; panel, diamonds and labels disappear; the hint says `Esc` goes back |
| Console: `help`, `status`, `foo`, `↑` | command list; status lines; `command not found: foo`; `↑` recalls the last command |
| Console: `goto 1` | leaves the screen and flies to stop 01 |
| Node table: click a chip, type in the filter | rows and the count change; after `Esc` the 3D screen shows the filtered bars and the filters in its title bar |
| Report form: submit | the prototype message appears |
| `Esc` while the cursor is in an input | leaves the screen (it does not just clear the field) |
| `→`, the wheel, `H` while zoomed | nothing happens |
| **← Back**, and a click on the wall outside the screen | both fly back to the stop; the panel returns |
| Click the next screen at the edge of the view | the zoom switches to it |
| Resize the window while zoomed | the overlay stays on the screen's edges |
| Desk monitor, cinema screen, a framed picture | they zoom too, with only the Back button over them |

## Live data

Run `make dev` and open stop 07 of the default room. Its node table, FLEET numbers, NODE LOAD bars and the panel's second `stats` row read `public/scenes/neo-room/data/nodes.json` every 15 s.

| Try | Expect |
| --- | --- |
| Load stop 07 and watch the network tab | one request for `data/nodes.json` every 15 s, not one per screen |
| Change a `load` or a `status` in `nodes.json` and wait up to 15 s | all four update; the bars ease to the new heights; the STATUS and NETWORK screens keep animating (nothing restarts) |
| Zoom into the node table while editing the file | the overlay's rows follow the file |
| Break `nodes.json` (delete the closing brace) | within 15 s a `!` appears on the live screens' title bars, "not updating" in the zoomed overlay and under the panel numbers; the last data stays; the console shows one `Feed …: not JSON` line, not one per retry |
| Restore the file | the marks disappear on the next retry (up to about 30 s with backoff) |
| Switch to another browser tab for a minute, then back | no requests while hidden; one request right after returning |
| In the editor, set a screen to `{ "source": "stats", "feed": { "stream": "/__feeds/ticker" } }` | the numbers tick once a second |
| In the editor, name a transform that does not exist in a screen's `feed` | the error list shows `… .feed.transform: unknown transform "…"` |
| A `video` screen with a public `.m3u8` test stream, in Chrome, Firefox and Safari | it plays in all three (natively in Safari and recent Chrome, through hls.js elsewhere: an `hls.light` chunk appears in the network tab) |
| A screen reader on the Control panel | the live numbers are not announced on every refresh |

## Markers and labels

| Try | Expect |
| --- | --- |
| `M`, and the diamond button | diamonds disappear and reappear; labels stay; the button shows pressed while hidden |
| Hover a diamond | it grows and spins faster; the cursor becomes a pointer |
| Hide markers while hovering one | the cursor returns to normal |
| Labels during a flight | labels stay pinned above their diamonds; labels behind the camera or off-screen are hidden; the current stop's label is hidden |

## Options

| Try | Expect |
| --- | --- |
| Click the sliders button, then `Esc` | Options opens on the last tab used (General at first) and closes; `←` / `→` on a focused tab switch tabs without moving the camera |
| General: render resolution 50 %, then Auto | the picture turns soft at once, then sharp again; System shows the drawing buffer shrink and grow |
| General: frame rate limit 30, then Unlimited | System and the overlay show about 30 fps, then the display rate; animations keep going at the same speed |
| General: dust particles Half, Off | fewer specks, none; System's points count drops |
| General: untick smooth edges, or change the GPU preference | a "Takes effect after a reload" note with **Reload now**; after the reload System → Graphics shows antialiasing off; setting it back removes the note |
| General: show performance overlay, then reload the page | the overlay appears top-left and is still there after the reload, as are the other General choices |
| General: restore defaults | every General choice back to its default; the overlay disappears |
| System, in Chrome and in Firefox or Safari | figures update about four times a second; where the browser keeps GPU time, long tasks or heap to itself the row says *not reported by this browser*, never an error |
| System: Copy report, paste into a text editor | plain text with every section, the extension list, the scene name, URL and time |
| Camera: each transition curve | the preview curve updates; `back` overshoots and settles without jumping |
| Parallax 0 and 1.6 | 0: mouse movement does nothing; 1.6: strong but smooth sway |
| Warp 0 | no FOV pulse and no roll during flights |

## Layout and accessibility

| Try | Expect |
| --- | --- |
| Window narrower than 760 px | panel becomes a bottom sheet; nav shows numbers only; minimap and hint hidden; subject shifted above the sheet |
| Portrait phone (device emulation) | wider FOV; swipe left and right navigates |
| Reduced motion (DevTools → Rendering → `prefers-reduced-motion`), then reload | short transitions, no parallax, no idle bob, no scramble, no warp |
| Keyboard only: `Tab` through the header | visible focus ring on each control; `Enter` activates |

## Scenes and config

| Try | Expect |
| --- | --- |
| `?scene=gallery` | amber theme on the lines, panel, header and minimap (the loader is green while files download); pictures in frames and on the screen |
| `?scene=does-not-exist` | `does-not-exist/scene.json: file not found` |
| A copy of a scene with a misspelt `type` and a missing POI file | both problems listed at once, each with file and field |
| A media path that does not exist | the screen shows rain; a console warning names the file |

## Editor: scene tree

Open `/edit.html?scene=cinema` on the dev server.

| Try | Expect |
| --- | --- |
| Look at the tree | Room (the title), Scenery 9 (projector, seats 1–6, bench 1–2), Stops 6 in tour order; ⌖ on the stop the camera is at |
| Click `seats 3` | the row highlights, a box appears around that row of seats in the room, the inspector shows position, rotation, scale and the seats' settings, `riser` marked with a bar and ↺ |
| Change `count` to 6, press `Enter` | the row of seats grows; **Files** › `scene.json` shows only that number changed, on the same line |
| **Select**, click the server rack in the room | the rack is selected and its stop 04 opens in the tree; the doors do not open, screens do not zoom; double-click flies to it |
| **Preview**, click the big screen | the rack's box, handles and inspector go (nothing is selected); the screen zooms in as for visitors |
| Lock the projector (⊘), click through its beam | the object behind is selected; in Select mode lines never pick, only surfaces |
| **+ Add**, type `ped`, `Enter` | a pedestal appears in the scenery where the camera looks, aside from what stands there, facing the camera; a message offers **Make it a stop** |
| **Make it a stop**, type `The exhibit`, `Enter` | a stop 07 appears in the top bar and the tree; its id is `the-exhibit`, its page `content/the-exhibit.md`; its diamond and camera are placed from the pedestal |
| Drag `bench 2` onto `03 Booth`, then onto **Scenery** | it moves into the stop and back, staying where it is in the room |
| Drag stop 06 above stop 01 | the top bar and the number keys follow the new order |
| Drag a stop onto an object row | refused, with "Stops cannot go inside other stops…" |
| Stop 06's **Turn into scenery** | a question lists the 4 objects, the page that goes and what links to the stop; after it, the doors are in the scenery; `⌘Z` (with focus anywhere outside a text field) brings the stop back, `⇧⌘Z` repeats it |
| Misspell a prop in **Files**, back to **Objects** | the object, its stop and **Stops** carry ⚠ 1; selected, the object shows the line above its settings |
| Filter `t:pic` | only the three picture frames, under stop 02 |
| Keyboard in the tree: `↓` `→` `←` `Home` `End`, a letter, `F2`, `Delete`, `⌘D`, `Alt+↑` | moves, opens and closes, jumps, renames, deletes (an Undo in the message), duplicates, reorders; the room never moves with these keys |
| Right-click a stop › **Show only this stop** | everything else disappears from the preview until **Show everything** |
| `/edit.html`, **+ Add** a desk, make it a stop | it builds; the desk does not land inside the start pedestal |
| Select `seats 1`, drag the red arrow sideways | the seats slide along x in 10 cm steps; on release the position in its settings changes, `scene.json` changes only that line; the camera stays (no swipe to another stop) |
| `R`, drag the green ring | the seats turn in 15° steps; past 90° the rotation reads `[0, -120, 0]`, not with 180° tilts; `⌘Z` twice undoes the turn, then the move |
| Drag with `Shift` held; press `Esc` in the middle of a drag | free movement; the object jumps back and nothing is written |
| In Select mode, click a handle without dragging, then click the floor | the first keeps the selection; the second clears it and the handles go |
| Select a stop, or zoom into a screen | no handles |

## Editor: screens

Open `/edit.html?scene=neo-room#control` on the dev server and select the control desk of stop 07.

| Try | Expect |
| --- | --- |
| Look under its settings | no `screens` JSON box; a wall of 12 tiles in 4 columns, as on the desk in the room; ⟳ on FLEET, NODES and NODE LOAD |
| **Select**, click the FLEET screen in the room | the desk is selected, the FLEET tile is highlighted, its settings show *Stats* with its feed (`data/nodes.json`, every 15 s, transform `nodeStats`); a pale box marks that screen in the room |
| Pick *Graph* for the uplink rain (tile 4) | the screen turns into a wave; a message says `label` was removed; `color` stays; `⌘Z` brings the rain and its caption back |
| On the STATUS tile, edit **lines**, leave the field | the screen types the new lines; the file changes only that screen's `lines` |
| CONSOLE: add a command `ping` → `pong`, zoom in on it in **Preview**, type `ping` | the console answers `pong` |
| NODES: tick and untick **filters** chips; pick **bar** | the chips on the zoomed-in table follow |
| **On click** › *Go to a stop* › 01 on any tile | `actions` gains `scr<n>` (or the screen's id) with `goTo`; ↗ on the tile; in Preview a click on that screen flies to stop 01 |
| Give that screen an id | the action moves to the new id |
| **+ Screen**, then **Remove** | a rain tile is added at the end and selected; Remove takes that one away again, nothing else |
| ◀ on a screen with a click set up | it moves one place earlier; its action follows it (`scr5` → `scr4`) |
| **On click** › *Nothing* | `zoom: false`, ⊘ on the tile; the screen no longer zooms |
| Select stop 06's desk | one screen (no wall); below it **Other clickable parts** › `chair` with an action picker |
| Select stop 04's cinema screen | its settings hide `source` and `src` (the full screen config replaces them) |
| In `?scene=cinema`, **+ Add** a control desk | six rain tiles; changing one writes the whole list of six into the file, the others as `{}` |

## Editor: object types from the web

Open `/edit.html` (no `?scene=`) on the dev server. The sample modules are served by the dev server itself, so they count as the page's own origin.

| Try | Expect |
| --- | --- |
| **+ Add**, read the groups | **Built-in** only; the last line reads **+ Add a type from the web…** |
| Click it, paste `http://localhost:5180/scenes/cinema/prefabs/projector.js`, **Look up** | one row: ◇ `projector`, the URL under it; a note that code from `http://localhost:5180` runs in the page |
| **Check** | the row turns green: settings `throw, width, height, drop, elevation, beam, spin` · clickable `lens`; **Add type** is enabled |
| **Add type** | a message "Added the type projector…"; the palette opens with **From the web › projector**; **Files** › `scene.json` has `"prefabs": { "projector": "http://localhost:5180/…/projector.js" }` |
| Pick it | a projector appears in the scenery; the inspector shows its settings with ↺ on none |
| Select **Room** | **own types** reads "1 besides the built-in ones"; the list shows `projector` · from localhost:5180 · placed once; **Reload** and **×** |
| **×** on `projector` | refused: "an object uses "projector": projector. Delete them, or give them another type, first" |
| Delete the projector object, **×** again | the type goes; `scene.json` has no `prefabs` key any more; `⌘Z` brings it back |
| **+ Add a type from the web…**, paste `http://localhost:5180/scenes/loft/prefabs/catalog.json`, **Look up** | "Catalog “Roomkit samples”: 2 types", rows **Floor lamp** (`lamp`, ⚲) and **Projector** (`projector`, ◬), both ticked |
| Change `lamp` to `door`, **Check** | that row turns red: `"door" is a built-in type`; **Add** stays disabled |
| Change it to `lamp2`, **Check**, **Add 2 types** | both are written in one step (one `⌘Z` removes both); the palette lists them under **From the web** with the catalog's glyphs |
| **Look up** a URL that is not a module (`http://localhost:5180/scenes/index.json` is a catalog without `roomkit`; `…/scenes/loft/scene.json`) | "roomkit must be 1…"; a `.js` that does not exist: **Check** reports `could not load … file not found` or `Failed to fetch` |
| Serve the repository from a second port (`npx serve public -l 5181 --cors`), **Look up** `http://localhost:5181/scenes/loft/prefabs/lamp.js`, **Check** | red: `blocked: http://localhost:5181 is not an allowed prefab origin…`; the note says where to allow it |
| Add `"prefabOrigins": ["http://localhost:5181"]` to `public/scenes/index.json`, reload the editor page, repeat | green; after **Add**, the lamp renders from the other port; the viewer (`/?scene=…` after an export) loads it too |
| **Export…** with a type from the web | the file list has a line `http://… · stays on its host`; neither zip holds the module |

## Editor: export a site

Open `/edit.html?scene=cinema` on the dev server.

| Try | Expect |
| --- | --- |
| **Export…** | a section unfolds: *Allow free flight* ticked, *opens at* showing the `welcome` stop (the scene's `camera.start`), eight files listed (`data/…`, `media/…`, `prefabs/…`) |
| Untick *Allow free flight*, then `W` and a middle-drag in the preview | nothing moves; the bottom hint has no `W A S D` part; `scene.json` now has `"freeFly": false` |
| Tick it again, fly somewhere with `W` and a middle-drag, click **Use current view** | *opens at* switches to *fixed view*; the position and target appear under it, rounded to centimetres; `scene.json › camera.start` holds them |
| **Whole site .zip** | "Building the viewer…" (a few seconds the first time), then `cinema-site.zip` downloads; the note says how many files it holds, nothing in red |
| **Scene folder .zip** | `cinema.zip` downloads at once; inside, `cinema/` holds the 13 text files and the 8 listed files, no viewer |
| **Import…**, pick that `cinema.zip` | the status line says "8 files in memory"; the list shows every file "· in memory"; the room still shows the posters, the intro video and the seats; no console error. Change the folder name, export again: the zip carries the memory files without fetching |
| `/edit.html` (no `?scene=`), **Import…**, pick `cinema-site.zip` | the folder name turns `cinema`, the files appear, the room renders with its media; **Import…** a picture from disk, write `"image": "media/<its name>"` on a frame | the picture shows; the next export lists it "· in memory" |
| **Import…** a zip without `scene.json` | "Import failed: … holds no scene.json"; the editor is unchanged |
| Unzip into an empty folder and serve it (`python3 -m http.server`), open it | the loader, then the intro flight lands on the fixed view with no panel; `→` goes to stop 01; `0` goes to the whole-room view; `#booth` in the address opens at the booth; the intro video, the posters, the showtimes feed and the seats and projector all work; no 404 in the network tab apart from fonts when offline |
| In that site, `W`, a middle-drag | nothing happens (free flight was off at export) |
| `/edit.html` (no `?scene=`), **Export…** | the file list is empty; after a whole-site export the note counts the viewer and the template's files only |
| `/edit.html?scene=neo-room`, export, inspect the zip | `scenes/neo-room/media/floorplan.svg` and `data/nodes.json` are inside; `scenes/index.json` names `neo-room` as default |

## Production

| Try | Expect |
| --- | --- |
| `make serve`, then a deep link | same behaviour as the dev server |
| `dist/viewer.json` | lists `index.html` and every `assets/*` file except `edit-*.js`; `edit.html` and `scenes/` are not in it |
| Serve `dist/` under a sub-path, with and without a trailing slash | works with the slash; without it, assets 404 (known, documented in the operator guide) |

## Shared events

Needs `make server` running next to `make dev`. Open the same event in two browsers (two profiles, or Chrome and Brave): `http://localhost:5180/?scene=cinema&event=test`.

1. The header shows **2 online** in both. Options → Online lists both names; change yours and the other browser's list follows.
2. Fly between stops in one browser: the other sees an avatar (head, body, name tag) glide along the same arc and settle where that camera is. Zoom into a screen and back: the avatar moves to the screen and returns.
3. Free flight (WASD) in one browser: the avatar follows at about 150 ms behind, without stutter. Stop moving: no traffic (the `net` line of the performance overlay shows ↑ near 0).
4. In the booth, click the lever on the control desk: the console lights go out in both browsers. Reload one: still out.
5. On the big screen, pause the film and seek: the other browser's film pauses at the same second; play again: both run in step (within a second).
6. Stop the server for 10 seconds and start it again: the badge turns amber (*reconnecting*), then green; the avatars come back; the state is kept when the server was started with `STATE_DIR`.
7. `make bots BOTS=100` against the server while a browser is in event `load`: 100 avatars circle the room, the frame rate holds, the overlay's ↓ shows about 13 kB/s.
