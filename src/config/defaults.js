/** Defaults merged under every scene.json. Anything here can be overridden per scene. */
export const SCENE_DEFAULTS = {
  title: 'Scene Rooms',
  brand: 'Scene/Rooms',
  lang: 'en',
  room: {
    width: 30,
    height: 9,
    depth: 30,
    grid: { floor: 1.5, ceiling: 3 },
    wallPanels: 3,
    skirting: [0.35, 8.5],
    pillars: [],
    lights: [[0, 8.4, 0]],
  },
  theme: {
    accent: '#00ff66',
    accentInk: '#001a0a',
    highlight: '#b8ffcc',
    background: '#000000',
    text: '#bff7cf',
    textDim: '#5fa877',
    surface: 'rgba(0,16,7,.74)',
    fog: [14, 46],
    fontsUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600&family=VT323&display=swap',
    fonts: {
      display: '"VT323", "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
      body: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
    },
    hatch: { density: 4.5, fineDensity: 8, roomDensity: 2.6, roomStrength: 0.75 },
    scanlines: true,
    vignette: true,
    glyphs: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓ0123456789<>/=+*#',
  },
  camera: {
    fov: 55,
    fovPortrait: 68,
    intro: { position: [0, 6.5, 27], target: [0, 3, 0], duration: 3200 },
  },
  effects: { ease: 'quint', parallax: 0.8, warp: 12, particles: 520, panelOffset: 0.16, markers: true },
  ui: {
    loading: 'Initializing room',
    loadError: 'Could not load the scene',
    unsupported: 'This browser cannot show the room',
    unsupportedHint: 'The room is drawn with WebGL 2, which this browser does not support or has turned off. Open the page in a current Chrome, Edge, Firefox or Safari, with hardware acceleration enabled.',
    kicker: '{n} of {total}',
    hint: '[←][→] or mouse wheel — move, [1]–[{keys}] areas, [0] whole room, click a marker in the room',
    goTo: 'Go to {label}',
    home: 'view the whole room (0)',
    navLabel: 'Areas of the room',
    hidePanel: 'Hide content panel (H)',
    showPanel: 'Show content panel (H)',
    hideMarkers: 'Hide floating markers (M)',
    showMarkers: 'Show floating markers (M)',
    settings: 'Camera settings',
    easeLabel: 'Transition curve',
    ease: {
      quint: 'Quint in-out (smooth start and stop)',
      expo: 'Expo in-out (sharp middle)',
      back: 'Back in-out (pull back and overshoot)',
      sine: 'Sine in-out (gentle)',
      linear: 'Linear (for comparison)',
    },
    parallax: 'Parallax',
    warp: 'Warp effect (FOV change in flight)',
    formPrototype: 'This is a prototype — the message was not sent.',
    formSent: 'Message sent. Thank you!',
    formFailed: 'Sending failed — please try again.',
    canvasLabel: '3D room with {total} areas',
    zoomHint: '[Esc] back to the room — click another screen to switch',
    zoomBack: 'Back',
    zoomScreen: 'Screen',
    termHelp: 'commands: {commands}',
    termUnknown: 'command not found: {cmd}',
    termNoArea: 'no such area: {arg} (try a number or an id)',
    filterAll: 'All',
    filterSearch: 'Filter…',
    filterCount: '{n} of {total}',
  },
  decor: [],
  poi: [],
};

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge for plain objects; arrays and scalars from `over` replace `base`. */
export function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
  return out;
}
