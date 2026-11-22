# Navigation and the camera

This page describes what happens between a visitor pressing `→` and the next panel appearing. The code is `src/scene/CameraRig.jsx` and `src/ui/useInput.js`; the numbers are the current constants.

## The flight

When `nav` changes, `CameraRig` builds a transit from the camera's current base position `p0` to the POI's `camera.position` `p1`. `nav.id` is the POI's id; `null` is the whole-room view: it uses `scene.camera.overview` (computed from the footprint's bounds when the scene leaves it out, in `overviewCamera()` in `src/lib/autoCamera.js`), opens no panel, and clears the address hash. A `nav.view` (from `openAt()`, used when `camera.start` is a pose) replaces that view for one flight; everything else is as for the overview:

- **Path.** A centripetal Catmull-Rom curve through `p0`, a mid-point and `p1`. The mid-point is the halfway point raised by `1.2 + 0.07 × distance` (capped at `room.height − 0.6`) and pulled 30 % towards the vertical axis through the footprint's centroid, so flights arc through the middle of the room. A distance under 1 cm skips the curve. In a room with interior walls (`room.walls`) the arc is not pulled to the centre, which may be behind a wall, and a flight between two points inside the room that a tall wall separates goes through the doorways instead: `route()` in `src/lib/walls.js` finds the shortest way over a graph of the two ends and a point 1.4 m either side of each opening at least 0.8 m wide, joined where the straight line between them clears every tall wall by 0.4 m, and the curve passes before, in and after each doorway, 0.7 m under its top. Such a curve is marked `userData.routed`; its duration comes from its length rather than the straight distance, and the gaze looks 8 % ahead along it (eased in over the first 20 % of the flight) and turns to the stop's target over the last 30 %. Avatars of other visitors replay the same curve.
- **Duration.** `clamp(1300 + 55 × distance, 1500, 2800)` ms; 450 ms with reduced motion; or the explicit duration (the intro uses `camera.intro.duration`).
- **Easing.** `settings.ease` (default from `effects.ease`) on the position. Overshooting curves (`back`) extrapolate along the curve's end tangent.
- **Gaze.** The look target eases with a cubic curve that finishes at 77 % of the flight (`t × 1.3`), so the camera turns before it lands.
- **Warp.** The FOV gets `sin(π t) × settings.warp` extra degrees, and the camera rolls by up to 0.045 rad towards the turn direction (no roll when warp is 0).
- **Panel.** At `t > 0.8`, `showPanel(i)` opens the panel. That is also when prefabs receive `active = true`, which is why the wardrobe doors start opening as the panel slides in.

## Zooming into a screen

Clicking a screen (of any POI, from anywhere) calls `zoomTo(rec)` in the store. `rec` holds the screen's world centre, normal, up vector and size, read from the mesh's `matrixWorld`, plus its config. `CameraRig` watches `nav` and `zoom` together, `zoom` first:

| Change | Flight |
| --- | --- |
| `zoom` set | straight line from wherever the camera is to `center + normal × d`, looking at `center`; `d = max(h/2 ÷ tan(fov/2), w/2 ÷ (tan(fov/2) × aspect)) ÷ 0.82`, so the screen fills about 82 % of the view. 900 ms (300 ms with reduced motion), no warp, no roll, no panel. The first screen of a zoom saves the camera's pose as `returnPose` |
| `nav` changed | the POI flight above (`goTo` also clears `zoom` and the return point) |
| `zoom` cleared | the zoom flight played backwards: the same straight line back to `returnPose` in 900 ms (300 ms), with the position ease and the gaze curve mirrored in time, so the camera keeps facing the screen while it backs off and turns to its old direction only in the last 77 %; on arrival `freeFly()` if the visitor was flying before |

When the zoom flight ends, `runtime.zoomReady` turns true. While zoomed, parallax, the idle bob and the panel view offset ease to zero (at `6 × dt`), so the camera holds still and the DOM overlay stays pinned. `exitZoom()` comes from `Esc`, the overlay's Back button, a click on empty space (`onPointerMissed` on the canvas) or the terminal's `exit`. It flies the camera straight back to the pose it had when the first screen of the zoom was entered (`returnPose` in `CameraRig`, captured from `base` so a mid-flight or free-flight pose counts), while the store restores `current` / `shown` from `zoomReturn`; if the visitor was flying freely, `afterZoom` makes the rig call `freeFly()` on arrival. A `goTo` while zoomed (top bar, terminal `goto`) is a normal POI flight instead and drops the return point.

## Free fly

`freeFly()` in the store sets `free`, and clears `current`, `shown`, `nav` and the hash, so the panel closes and every POI, including the one just left, is a new destination. Any `goTo` clears `free` again, and the flight starts from wherever the camera is. While `free` is set, `CameraRig` drops any running transit and calls `steer()` every frame on the base pose:

- **Look.** The pending middle-drag (`runtime.fly.look`, in pixels) turns the gaze by 0.004 rad per pixel: yaw around world up, pitch clamped to ±1.45 rad. The look target stays at its previous distance from the camera (at least 1 m).
- **Move.** The held keys (`runtime.fly.keys`, as `KeyboardEvent.code`) add up to a direction: `W`/`S` along the gaze, `A`/`D` along its right vector, `Q`/`E` along world up. Speed is `max(6, max(width, depth) ÷ 2)` m/s, a third of that with `Shift`; the velocity eases towards it at `8 × dt`, so starting and stopping are smooth.
- **Wheel.** The pending wheel delta (`runtime.fly.dolly`) slides the camera along the gaze by 5 mm per unit, consumed at `10 × dt`; a sideways delta (`runtime.fly.slide`, which only a touchpad or a tilting wheel sends) slides it along its right vector the same way. A touchpad pinch is a wheel event with `ctrlKey` in Chrome, Firefox and Edge, and a `gesturechange` with a scale in Safari; `src/lib/wheel.js` turns both into the same delta, ten times a wheel's (`PINCH_GAIN`), so fingers spread to twice the distance move about 3.5 m.
- **Fingers and the dragging mouse.** What the touch pointers, or the mouse with its main button held, did since the last frame (`runtime.fly.touch`, in pixels, from the gesture tracker in `src/lib/touch.js`) takes hold of the picture rather than of the camera. One pixel covers `fov ÷ view height` radians, so a one-finger drag (`look`) turns the gaze by exactly as much as the finger moved, the other way from the middle button: drag right and the view turns left. A two-finger drag (`pan`) slides the camera against the fingers along its right vector and world up, and a pinch (`pinch`, positive when the fingers part) moves it along the gaze, both at the scale of a point 5 m away (twice that for the pinch). They are applied at once, with no easing: the room stays under the fingers.
- **Floor.** The camera stays at least 20 cm above the floor.
- **Walls.** With `camera.collide` (the default) the move is then handed to `collide()` in `src/lib/collide.js`, with the obstacles `roomColliders()` built once per scene: the footprint's edges and the sides of each pillar's 1.5 m base, as vertical strips. The camera is a ball of 0.3 m (`CAMERA_RADIUS`): the move is cut into steps of at most half that, so a fast camera cannot skip a wall, and after each step the ball is pushed out of every strip it overlaps, which leaves the part of the move along the wall, so the camera slides. It is also kept 0.3 m under the ceiling and over the floor, and a step that would end outside the floor plan (squeezed past a sharp corner) is undone. A camera that starts the frame outside the room (over the ceiling or past a wall, as the intro and overview poses are) moves freely, so it can fly in; once inside it stays in. Strips have a thickness (`pad`) and a height range (`y0`–`y1`), so they can also stand for interior walls and the part over a doorway.

Parallax and the idle bob ease to zero exactly as when zoomed, so the camera only moves when the visitor moves it. `freeFly()` is ignored while zoomed, and always when the scene sets `camera.freeFly: false` (the store is the single gate; `useInput` then also leaves the fly keys, the middle button and the pinch alone and gives a drag its swipe back, and `Hint` shows `ui.hintNoFly`).

Every frame the rig also copies the base pose into `runtime.pose` (`position` and `target` arrays, without parallax or bob). The editor's **Use current view** reads it.

## Every frame

- **Parallax.** The smoothed mouse (`runtime.ms`, eased at `3 × dt`) offsets the camera along its right and up vectors by `1.1 × P` and `0.6 × P`, and the look target by `0.12 × P`, where `P = settings.parallax`. While the visitor's last press was a finger (`runtime.touch`) a slow sine drift replaces the mouse. The panel moves the opposite way by up to 7 × 5 px.
- **Idle bob.** ±5 cm vertical sine, unless reduced motion is on.
- **FOV.** `camera.fov`, or `camera.fovPortrait` when the viewport is taller than wide.
- **Fog.** Outside the room (intro, overview) the fog's near and far distances grow by the camera's distance beyond the room's half size, measured from the room's centre, so the far wall doesn't fade out. Inside the room the fog is exactly `theme.fog`.
- **Ceiling.** While the camera is above the ceiling, `Room` hides the ceiling grid and the light fixtures so they don't cover the view.
- **View offset.** While the panel is open, `setViewOffset` shifts the frame left by `effects.panelOffset × width` on wide screens. Under 760 px it shifts the frame up by 20 % of the height instead (bottom-sheet panel). The offset eases in and out.

## Still mode

`?still` turns the rig into a camera on a tripod, for `node tools/scene.js shots` and any other script that wants a picture (`src/lib/still.js` reads the address and works out the poses, `src/ui/stillRig.js` installs `window.__roomkit`). `App` drops the dust, the frame-rate cap, parallax and warp, keeps the page out of a shared event, and `Viewer` skips the fly-in, the overlays and the input handlers. `__roomkit.view(name)` calls `openAt(pose, 1)`: a one-millisecond flight, so the ordinary path through `startTransit` is used and nothing in the rig is special-cased. The rig hands the navigation's `nonce` back in `runtime.arrived` when a flight lands, which is how the script knows the camera is there; it then waits for three.js's loading manager to go quiet and for three more frames. The idle bob is off while `runtime.still` is set, whatever the motion preference.

The `top` view stands above the middle of the room's bounds, as far above the ceiling as it takes for the tops of the walls to fit, a hundredth of a metre south of straight down so that north stays at the top.

## Input

| Input | Action | Notes |
| --- | --- | --- |
| `→` `↓` `PageDown` / `←` `↑` `PageUp` | next / previous (wraps) | ignored while focus is in an input, textarea or select, or with Cmd/Ctrl/Alt held |
| `1`–`9` | `goTo(n − 1)` | only up to the number of POIs |
| `0`, click on the logo | `home()` = `goTo(null)` | the whole-room view; from there `→` goes to POI 1 and `←` to the last |
| `H` / `M` | toggle panel / toggle markers | |
| `W` `A` `S` `D` `Q` `E` (by `code`), `Shift` | `freeFly()`, then fly | held keys are tracked until `keyup`; a window `blur` releases them all; ignored with `camera.freeFly: false` |
| middle-button drag on the canvas | `freeFly()`, then look | the press is `preventDefault`ed (no autoscroll or paste) and the pointer is captured, so the drag continues off the canvas; ignored with `camera.freeFly: false` |
| wheel | next / previous; while flying, forward / back, and left / right by `deltaX` | after 60 px of accumulated delta, then locked for 900 ms; ignored over the panel and Options. A mouse wheel and a touchpad scroll cannot be told apart |
| touchpad pinch (wheel with `ctrlKey`; `gesturechange` in Safari) | `freeFly()`, then forward / back | `preventDefault`ed, so the page does not zoom (the wheel listener is not passive for this); `Ctrl` + mouse wheel is the same event; ignored over the panel and Options, while zoomed, and with `camera.freeFly: false` or in the editor, where the browser zooms as usual. Safari's gesture events are left alone after a finger press, since a touchscreen's pinch already arrives as pointers |
| horizontal swipe on the canvas | next / previous | more than 50 px and more horizontal than vertical; the primary mouse button or a finger, only where a drag does not fly (`camera.freeFly: false`, and in the editor) |
| one-finger drag, or a drag with the primary mouse button, on the canvas | `freeFly()`, then look | a tap or click until the pointer has moved 10 px (`TAP_SLOP`, above the 8 px a click allows), so a tap never starts free fly; the mouse pointer is captured once the drag starts, so it continues off the canvas; ignored while zoomed, with `camera.freeFly: false` and in the editor |
| two fingers on the canvas | `freeFly()`, then slide (drag) and move along the gaze (pinch) | deltas are taken between successive moves, so lifting or adding a finger does not jump; a third finger is ignored; a window `blur` forgets the fingers |
| any `pointerdown` | `setTouch(pointerType === 'touch')` | the viewer only: sets `touch` in the store and the `touch` class on `<html>`, which pick the `…Touch` hints and show the touch controls. Starts as `(pointer: coarse)` |
| click on a diamond | `goTo(i)` | R3F click with drag under 8 px |
| click on a label, nav button or pager | `goTo(i)` | DOM buttons |
| `hashchange` | `goTo(id)` | `goTo` itself uses `history.replaceState`, so it does not loop |
| `Esc` | `exitZoom()`, else close Options | handled before the input check, so it also works while typing in an overlay |
| `Space` | `zoomIn()` | once the camera has arrived at a POI (`shown === current`): zooms into the POI's top-left zoomable screen (top row first, then left to right as seen from the POI camera; `firstScreen` in `src/lib/screenOrder.js`); ignored on the overview, while flying or over a button |
| `←` `→` `↑` `↓` while zoomed | `zoomMove(dir)` | the nearest zoomable screen of the same POI in that direction on the wall (`moveScreen`: `←` `→` stay in the row, `↑` `↓` in the column, rows and columns being screens whose centres differ by less than half a screen; the edge of the wall stops the move, no wrapping). Where the screen takes the arrows itself (a video seeks with `←` `→`; an input or textarea keeps every arrow for its caret, the terminal `↑` `↓` for its history), `Ctrl`/`⌘` + arrow moves to the neighbouring screen regardless; `PageUp` / `PageDown` also stand in for `←` / `→` outside a textarea. `Alt` + arrow is left to the browser |
| click on a screen | `zoomTo(rec)` | from anywhere: the screen's POI becomes current while zoomed, and `zoomReturn` remembers where the visitor was. R3F click with drag under 8 px; hover shows a pointer and brightens the screen |

On a touchscreen the overlay shows an arrow button for each direction `moveScreen` finds a screen in, next to Back; they call `zoomMove(dir)` too, and on arrival Back takes the focus instead of the first field, so the keyboard does not slide over the screen.

While zoomed, every other key is ignored, and so are the wheel, swipes and finger gestures. The nav buttons, labels and the hash still work and leave the zoom. The screens a POI offers come from the registry in `src/scene/screenState.js` (`screensOf(poi)`): every mounted `ScreenSurface` registers its zoom-record builder, and screens with `zoom: false` are skipped.
