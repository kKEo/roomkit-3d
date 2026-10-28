# Navigation and the camera

This page describes what happens between a visitor pressing `→` and the next panel appearing. The code is `src/scene/CameraRig.jsx` and `src/ui/useInput.js`; the numbers are the current constants.

## The flight

When `nav` changes, `CameraRig` builds a transit from the camera's current base position `p0` to the POI's `camera.position` `p1`:

- **Path.** A centripetal Catmull-Rom curve through `p0`, a mid-point and `p1`. The mid-point is the halfway point raised by `1.2 + 0.07 × distance` (capped at `room.height − 0.6`) and pulled 30 % towards the room's vertical axis, so flights arc through the middle of the room. A distance under 1 cm skips the curve.
- **Duration.** `clamp(1300 + 55 × distance, 1500, 2800)` ms; 450 ms with reduced motion; or the explicit duration (the intro uses `camera.intro.duration`).
- **Easing.** `settings.ease` (default from `effects.ease`) on the position. Overshooting curves (`back`) extrapolate along the curve's end tangent.
- **Gaze.** The look target eases with a cubic curve that finishes at 77 % of the flight (`t × 1.3`), so the camera turns before it lands.
- **Warp.** The FOV gets `sin(π t) × settings.warp` extra degrees, and the camera rolls by up to 0.045 rad towards the turn direction (no roll when warp is 0).
- **Panel.** At `t > 0.8`, `showPanel(i)` opens the panel. That is also when prefabs receive `active = true`, which is why the wardrobe doors start opening as the panel slides in.

## Every frame

- **Parallax.** The smoothed mouse (`runtime.ms`, eased at `3 × dt`) offsets the camera along its right and up vectors by `1.1 × P` and `0.6 × P`, and the look target by `0.12 × P`, where `P = settings.parallax`. On touch devices a slow sine drift replaces the mouse. The panel moves the opposite way by up to 7 × 5 px.
- **Idle bob.** ±5 cm vertical sine, unless reduced motion is on.
- **FOV.** `camera.fov`, or `camera.fovPortrait` when the viewport is taller than wide.
- **View offset.** While the panel is open, `setViewOffset` shifts the frame left by `effects.panelOffset × width` on wide screens. Under 760 px it shifts the frame up by 20 % of the height instead (bottom-sheet panel). The offset eases in and out.

## Input

| Input | Action | Notes |
| --- | --- | --- |
| `→` `↓` `PageDown` / `←` `↑` `PageUp` | next / previous (wraps) | ignored while focus is in an input, textarea or select, or with Cmd/Ctrl/Alt held |
| `1`–`9` | `goTo(n − 1)` | only up to the number of POIs |
| `H` / `M` | toggle panel / toggle markers | |
| wheel | next / previous | after 60 px of accumulated delta, then locked for 900 ms; ignored over the panel and settings |
| horizontal swipe on the canvas | next / previous | more than 50 px and more horizontal than vertical |
| click on a diamond | `goTo(i)` | R3F click with drag under 8 px |
| click on a label, nav button or pager | `goTo(i)` | DOM buttons |
| `hashchange` | `goTo(id)` | `goTo` itself uses `history.replaceState`, so it does not loop |
