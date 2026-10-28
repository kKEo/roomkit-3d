/**
 * Prefab metadata (no React here so the config schema can import it).
 * - props:     default props, overridden by `props` in the config
 * - media:     props holding a file path, resolved relative to the scene folder
 * - placement: local-space hints used to auto-place the camera and marker
 *              when a POI leaves them out. Prefabs face local +Z.
 */
export const PREFABS = {
  pedestal: {
    props: { shape: 'icosahedron', height: 3, size: 1.2, rings: true },
    placement: p => ({ focus: [0, p.height - 0.1, 0], cameraDistance: 12.5, cameraHeight: 3.4, markerOffset: [0, p.height + 1.9, 0] }),
  },
  pictureFrame: {
    props: { width: 2.9, height: 2.1, image: null, exhibit: null, caption: true },
    media: ['image'],
    placement: p => ({ focus: [0, 0, 1.3], cameraDistance: 7, cameraHeight: null, markerOffset: [0, p.height / 2 + 0.7, 0.6] }),
  },
  wardrobe: {
    props: { width: 2.4, height: 4.2, depth: 1.2, openOnFocus: true, openAngle: 105 },
    placement: p => ({ focus: [0, p.height * 0.5, 0], cameraDistance: Math.max(6, p.height * 1.9), cameraHeight: p.height * 0.58, markerOffset: [0, p.height + 0.7, 0] }),
  },
  cinemaScreen: {
    props: { width: 10, height: 5.6, elevation: 4.3, source: 'rain', src: null, stage: true, speakers: true },
    media: ['src'],
    placement: p => ({ focus: [0, p.elevation - 0.2, 0], cameraDistance: 12, cameraHeight: 3.4, markerOffset: [0, p.elevation + p.height / 2 + 0.65, 0.8] }),
  },
  desk: {
    props: { screen: 'rain', src: null, chair: true },
    media: ['src'],
    placement: () => ({ focus: [0, 1.6, 0], cameraDistance: 6, cameraHeight: 2.9, markerOffset: [0, 2.8, 0] }),
  },
  serverRack: {
    props: { count: 4, height: 5.2, cables: true, ceiling: null },
    placement: p => ({ focus: [0, 2.8, 0], cameraDistance: 9.2, cameraHeight: 3.1, markerOffset: [0, p.height + 0.7, 1.4] }),
  },
  door: {
    props: { width: 2.4, height: 4.2 },
    placement: p => ({ focus: [0, p.height / 2, 0], cameraDistance: 7, cameraHeight: 3, markerOffset: [0, p.height + 0.6, 0.3] }),
  },
  bench: {
    props: { width: 5.6, height: 0.7, depth: 0.9 },
    placement: p => ({ focus: [0, p.height, 0], cameraDistance: 5, cameraHeight: 2.5, markerOffset: [0, p.height + 1.2, 0] }),
  },
  primitive: {
    props: { shape: 'box', args: [1, 1, 1], size: null, fill: 'main', edge: 'thick', spin: 0, float: 0 },
    placement: () => ({ focus: [0, 0, 0], cameraDistance: 6, cameraHeight: null, markerOffset: [0, 1.4, 0] }),
  },
};

export const PREFAB_TYPES = Object.keys(PREFABS);
