# Day-two operations and troubleshooting

This page is the runbook: routine changes after go-live and the known ways the site breaks. Each entry says what you see and what to do.

## Routine operations

**Publish a content change.** Edit the files under `public/scenes/`, check them with `npm run dev`, then copy that scene folder to `dist/scenes/` on the server. No rebuild is needed (see [Build and deploy](../deploy/deploy.md)). Make sure the server's cache for `scenes/` is short, or purge it.

**Add or retire a scene.** Add or remove the folder. Change `default` in `scenes/index.json` if needed. Old links with `?scene=<removed>` will show "file not found", so keep a stub scene or redirect if they matter.

**Roll back.** The deploy is a folder of static files; redeploy the previous `dist/`. Content and code can be rolled back independently because `scenes/` is read at runtime.

**Upgrade dependencies.** Versions are pinned exactly. Upgrade one family at a time and walk every scene with the [exploratory checklist](../../tester/exploring/exploratory.md):

- React and React Three Fiber move together (R3F 9 needs React 19).
- After a three.js upgrade, check fat lines. `LineSegments2.onBeforeRender` sets the line resolution; if lines become hairlines or huge, set `material.resolution` on resize. Also check `THREE.ColorManagement` behaviour (see [Rendering](../internals/rendering.md)).
- After a zod upgrade, check the error texts on the loading screen; content authors rely on their wording in the [FAQ](../../user/faq.md).

## Troubleshooting

| You see | Likely cause | Do this |
| --- | --- | --- |
| **Could not load the scene** with `file not found` | file missing on the server, wrong path or case, or the server returns HTML for `.json`/`.md` | check the access log for that path; check the content type |
| Blank page, and the network tab shows 404s for `assets/…` | the bundle did not load, usually because the page is served without a trailing slash and `./assets/` resolves one level too high | serve the app as `…/path/` |
| **This browser cannot show the room** | no WebGL 2 on the device, WebGL turned off, or the GPU is blocklisted | nothing to fix server-side; the visitor needs a newer browser, GPU driver or hardware acceleration turned on |
| Colours much darker than the theme | colour management was re-enabled | see [Rendering](../internals/rendering.md) |
| A screen shows rain instead of an image or video | media 404, wrong type or CORS | console warning names the file; add `Access-Control-Allow-Origin` for other hosts |
| A panel block is red | JSON error or unknown block type in that block | fix the content; the red text says what |
| Labels drift away from the diamonds | changed view-offset or camera code without updating `src/ui/Labels.jsx` | labels project with `runtime.camera`, so they must run after `CameraRig` has updated it |
| Room freezes after editing `src/state/store.js` in dev | hot reload replaced the store under a mounted canvas | reload the page; this does not happen in production |
