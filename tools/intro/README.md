# The cinema intro film

`public/scenes/cinema/media/intro.mp4` (46 s, 720p, H.264, silent) is what the big screen of the default
scene plays. It is rendered from the app itself, so re-render it after a change to the cinema scene or the look:

```bash
brew install ffmpeg                 # once
npx playwright install chromium     # once (playwright is a dev dependency)
make dev PORT=5180                  # in another terminal
make intro-video                    # or INTRO_URL=http://localhost:5173/ make intro-video
```

Two steps, both in this folder:

1. `footage.mjs` opens the cinema scene in a headed Chromium (so the GPU draws it), records a scripted tour
   with Playwright's video recorder into `out/footage.webm` and prints when each stop starts.
2. `render.mjs` opens `intro.html`, a canvas film drawn as a pure function of time (title, what it is, the
   footage with captions, the feature cards, the end card), steps through it frame by frame, and encodes the
   frames with ffmpeg. `--preview 2,7,20` writes PNG stills at those seconds into `out/preview/` instead.

Open `tools/intro/intro.html?play` on the dev server to watch the film in real time while editing it. The
captions in `intro.html` (`timeline()`) are placed from the stop times `footage.mjs` writes to `out/marks.json`,
so a slower or faster recording keeps them in step. `out/` is ignored by git.

A third script, `shots.mjs`, screenshots the stops of the scene (`node tools/intro/shots.mjs <dir> welcome,booth,…`) for a quick layout check without the GPU.
