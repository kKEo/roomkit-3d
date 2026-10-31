# Install and run locally

This page gets a development copy running. It takes about five minutes on a normal connection.

## Requirements

| Need | Version | Why |
| --- | --- | --- |
| Node.js | `^20.19.0` or `>=22.12.0` | Vite 8's `engines` field. Developed on Node 26. |
| npm | the one that comes with Node | dependencies are pinned to exact versions in `package.json` |
| A browser with WebGL 2 | any current Chrome, Edge, Firefox or Safari | three.js 0.186 renders with WebGL 2 only |
| mdBook (optional) | any recent 0.4 | only for building these docs |

## Install and start

```bash
make dev             # runs npm install when needed, then the Vite dev server at http://localhost:5173
```

Without `make`: `npm install`, then `npm run dev`. All targets are listed in [Commands](../operations/commands.md).

Open the printed address. The default scene, `cinema`, flies in and lands on its big screen. Try `?scene=neo-room`, `?scene=gallery` and `?scene=loft` for the other examples.

The dev server reloads the page when you change files in `public/scenes/`. Changes in `src/` hot-reload. A hot reload of `src/state/store.js` resets the store under a mounted canvas; reload the page if the room freezes after editing that file.

## Dependencies

| Package | Pinned | Role |
| --- | --- | --- |
| `react`, `react-dom` | 19.3.1 | UI |
| `three` | 0.186.1 | 3D engine; fat lines from `three/addons/lines/` |
| `@react-three/fiber` | 9.8.2 | React renderer for three.js (needs React 19) |
| `zustand` | 5.0.16 | store |
| `react-markdown`, `remark-gfm` | 10.1.0, 4.0.1 | panel Markdown with tables |
| `zod` | 4.6.7 | config validation |
| `vite`, `@vitejs/plugin-react` | 8.3.5, 6.1.2 | dev server and build (dev only) |

`@react-three/drei` is deliberately **not** used. Its `<Html>` labels logged React 19 root-unmount errors, and dropping it removed about 590 kB from the bundle. Labels are DOM elements projected in `src/ui/Labels.jsx`.
