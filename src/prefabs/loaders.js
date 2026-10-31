/**
 * How each built-in prefab's component is loaded: one chunk per module, fetched the first time a
 * scene uses the type (see ./preload.js and ./index.jsx). No React here, so the loader can import
 * this file in Node without pulling the components in. Each loader memoises its promise, so the
 * preload and `React.lazy` share one request.
 */
const once = f => { let p; return () => (p ??= f()); };

const simple = once(() => import('./simple.jsx'));

export const LOADERS = {
  pedestal: once(() => import('./Pedestal.jsx')),
  pictureFrame: once(() => import('./PictureFrame.jsx')),
  wardrobe: once(() => import('./Wardrobe.jsx')),
  cinemaScreen: once(() => import('./CinemaScreen.jsx')),
  desk: once(() => import('./Desk.jsx')),
  controlDesk: once(() => import('./ControlDesk.jsx')),
  serverRack: once(() => import('./ServerRack.jsx')),
  door: simple,
  bench: simple,
  primitive: simple,
};

/** The export of each module that is the prefab's component. */
export const EXPORT_NAMES = {
  pedestal: 'Pedestal',
  pictureFrame: 'PictureFrame',
  wardrobe: 'Wardrobe',
  cinemaScreen: 'CinemaScreen',
  desk: 'Desk',
  controlDesk: 'ControlDesk',
  serverRack: 'ServerRack',
  door: 'Door',
  bench: 'Bench',
  primitive: 'Primitive',
};

/** Resolves to a built-in prefab's component. */
export const loadComponent = type => LOADERS[type]().then(m => m[EXPORT_NAMES[type]]);
