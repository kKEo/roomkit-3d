/**
 * How the editor shows each prefab type: a glyph for the tree and a line for the Add palette. The built-ins
 * are listed here; a scene's own type gives its own `title`, `blurb` and `glyph` in its meta (kept on the
 * registry entry), and one that gives none gets a generic glyph and "this scene's own type".
 */
export const TYPE_INFO = {
  pedestal: ['▣', 'a plinth with an exhibit shape on top'],
  pictureFrame: ['▭', 'a framed picture, optionally with a shape in front'],
  wardrobe: ['▯', 'a cabinet whose doors open at its stop'],
  cinemaScreen: ['▬', 'a big screen on a stage, with speakers'],
  desk: ['⌸', 'a desk with a monitor, keyboard and chair'],
  controlDesk: ['◠', 'a curved desk with a wall of screens'],
  serverRack: ['▥', 'racks of servers behind folding doors'],
  door: ['⍐', 'a door in a wall'],
  bench: ['▁', 'a plain bench'],
  primitive: ['◆', 'a single shape: box, sphere, torus…'],
};

const own = (type, registry) => (registry && !TYPE_INFO[type] ? registry.get(type) : null);

export const glyphOf = (type, registry) => TYPE_INFO[type]?.[0] ?? own(type, registry)?.glyph?.trim() ?? '◇';
export const blurbOf = (type, registry) => TYPE_INFO[type]?.[1] ?? own(type, registry)?.blurb ?? "this scene's own type";
/** The name shown for a type: the meta's `title`, else the type itself. */
export const titleOf = (type, registry) => own(type, registry)?.title ?? type;
/** Whether a scene's own type comes from a URL rather than a file in the scene folder. */
export const isHosted = entry => typeof entry?.url === 'string' && /^https?:/i.test(entry.url);
