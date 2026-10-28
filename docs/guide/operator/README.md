# Operator guide

This guide is for developers who build, host or extend Scene Rooms. It assumes you know JavaScript, npm and the basics of React; it explains the three.js and React Three Fiber parts as it goes. Content authors who only write JSON and Markdown need the [Content guide](../user/README.md) instead.

Scene Rooms is a static single-page app (Vite, React 19, React Three Fiber 9, three.js 0.186). At start-up it fetches one scene folder from `public/scenes/`, validates it, and renders a room whose objects, camera stops and panel content all come from those files.

| Part | Read it when you need to… |
| --- | --- |
| [Part I: How it works](internals/README.md) | understand the data flow before changing anything |
| [Part II: Install and deploy](deploy/README.md) | run it locally or put a build on a web server |
| [Part III: Configuration reference](reference/README.md) | look up any key, default or prefab prop |
| [Part IV: Extending](extending/README.md) | add a new object type or panel block |
| [Part V: Operations](operations/README.md) | find a command, watch a deployment or fix a broken one |
| [Appendix](appendix/README.md) | look up a project-specific word |

## Conventions

- Commands are run from the repository root and shown in `bash` blocks.
- Paths starting with `src/` are source files; paths starting with `public/scenes/` are content.
- "Scene folder" means `public/scenes/<name>/`. Paths inside a scene's files are relative to it.
- Defaults are quoted from `src/config/defaults.js` and `src/prefabs/registry.js`. If this guide and those files disagree, the code wins. Please fix the page.

> **Looking for something else?** To write content, read the [Content guide](../user/README.md). To check a change before it ships, read the [Tester guide](../tester/README.md).
