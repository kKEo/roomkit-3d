import { describe, it, expect } from 'vitest';
import { closest, distance, unknownKeys } from '../src/config/keyHelp.js';

describe('unknown keys', () => {
  it('measures how far two names are apart', () => {
    expect([distance('height', 'height'), distance('hight', 'height'), distance('widht', 'width'), distance('', 'abc')]).toEqual([0, 1, 2, 3]);
  });

  it('finds the key that was meant: two slips at most, one in a very short name, whatever the case', () => {
    expect(closest('hight', ['width', 'height', 'depth'])).toBe('height');
    expect(closest('Center', ['wall', 'corner', 'centre'])).toBe('centre');
    expect(closest('fov2', ['fov', 'fovPortrait'])).toBe('fov');
    expect(closest('colour', ['title', 'brand', 'room'])).toBe(null);
    expect(closest('fo', ['fog', 'fov'])).toBe('fog');
    expect(closest('ab', ['xyz'])).toBe(null);
  });

  it('words the error: the keys, what was meant, what there is', () => {
    expect(unknownKeys(['hight'], ['wall', 'height'])).toBe('unknown key "hight": did you mean "height"? (known: wall, height)');
    expect(unknownKeys(['a', 'bb'], ['wall', 'height'])).toBe('unknown keys "a", "bb" (known: wall, height)');
    const many = Array.from({ length: 30 }, (_, i) => `key${i}`);
    expect(unknownKeys(['kee7'], many)).toBe('unknown key "kee7": did you mean "key7"?'); // a long list would bury the hint
  });
});
