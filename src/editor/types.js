/**
 * How the editor shows each built-in prefab type: a glyph for the tree and a line for the Add palette.
 * A scene's own types have neither and get a generic glyph and "this scene's own type".
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

export const glyphOf = type => TYPE_INFO[type]?.[0] ?? '◇';
export const blurbOf = type => TYPE_INFO[type]?.[1] ?? "this scene's own type";
