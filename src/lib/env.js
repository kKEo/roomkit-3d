export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** three.js draws only with WebGL 2; false when the browser lacks it or has it turned off. */
export function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** The main pointer is a finger (a phone, a tablet): the viewer starts with its touch hints and controls. */
export const coarsePointer = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
