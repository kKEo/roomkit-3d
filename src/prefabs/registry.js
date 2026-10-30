/**
 * Prefab metadata, assembled from the `<Name>.meta.js` file next to each component.
 * No React here, so the config schema can import it. Each entry has:
 * - schema:    zod schema of the prefab's props; every key has a default, unknown keys are errors
 * - props:     the default props (`schema.parse({})`)
 * - media:     props holding a file path, resolved relative to the scene folder
 *              ("a.b" for a nested prop, "list[].prop" for a prop inside each item of an array prop)
 * - placement: local-space hints used to auto-place the camera and marker
 *              when a POI leaves them out. Prefabs face local +Z.
 * - hotspots:  names of the clickable parts a scene can bind `actions` to; a list, or a
 *              function of the props when the parts depend on them (screens of a controlDesk)
 */
import { pedestal } from './Pedestal.meta.js';
import { pictureFrame } from './PictureFrame.meta.js';
import { wardrobe } from './Wardrobe.meta.js';
import { cinemaScreen } from './CinemaScreen.meta.js';
import { desk } from './Desk.meta.js';
import { controlDesk } from './ControlDesk.meta.js';
import { serverRack } from './ServerRack.meta.js';
import { door, bench, primitive } from './simple.meta.js';

const META = { pedestal, pictureFrame, wardrobe, cinemaScreen, desk, controlDesk, serverRack, door, bench, primitive };

const asFn = v => (typeof v === 'function' ? v : () => v ?? []);

export const PREFABS = Object.fromEntries(
  Object.entries(META).map(([type, m]) => [type, { ...m, media: m.media ?? [], hotspots: asFn(m.hotspots), props: m.schema.parse({}) }]),
);

export const PREFAB_TYPES = Object.keys(PREFABS);
