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
| Click a screen of another stop (e.g. the cinema screen from stop 01) | the camera flies to that stop; a second click zooms in |
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

## Production

| Try | Expect |
| --- | --- |
| `make serve`, then a deep link | same behaviour as the dev server |
| Serve `dist/` under a sub-path, with and without a trailing slash | works with the slash; without it, assets 404 (known, documented in the operator guide) |
