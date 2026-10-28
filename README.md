# Scene Rooms

A walkable 3D room built from configuration files. The camera flies between **points of interest**: each places predefined objects (a desk, a picture on the wall, a wardrobe, a cinema screen, …) and opens a content panel. Scenes, objects and content live in JSON and Markdown under `public/scenes/`, so you can ship new content without touching code.

Built with React 19, React Three Fiber 9 and three.js.

```bash
make dev           # install if needed, then http://localhost:5173  (try ?scene=gallery and #contact)
make serve         # production build in dist/, served at http://localhost:4173
make docs-site-serve   # the documentation site at http://localhost:8000
make               # every target
```

## Documentation

The guide in [`docs/guide/`](docs/guide/) has a landing page ([`docs/guide/index.html`](docs/guide/index.html)) and three books:

| Book | For | Start with |
| --- | --- | --- |
| [Content guide](docs/guide/user/README.md) | people who write scenes and panel content | [Quick start](docs/guide/user/quick-start.md) |
| [Operator guide](docs/guide/operator/README.md) | developers who build, host or extend the app | [Architecture overview](docs/guide/operator/internals/overview.md), [scene.json reference](docs/guide/operator/reference/scene-json.md) |
| [Tester guide](docs/guide/tester/README.md) | anyone checking a change before it ships | [Running the tests](docs/guide/tester/running/running-the-tests.md) |

See [`docs/README.md`](docs/README.md) for how the docs are organised and built.
