import { describe, it, expect } from 'vitest';
import { fmtBytes, fmtMs, fmtCount, reportText } from '../src/lib/sysinfo.js';

describe('sysinfo formatting', () => {
  it('formats bytes, milliseconds and counts, with a dash for missing values', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(3 * 1024 ** 3)).toBe('3.0 GB');
    expect(fmtBytes(null)).toBe('—');
    expect(fmtMs(4.234)).toBe('4.23 ms');
    expect(fmtMs(16.66)).toBe('16.7 ms');
    expect(fmtMs(undefined)).toBe('—');
    expect(fmtCount(1234567)).toBe('1 234 567');
    expect(fmtCount(null)).toBe('—');
  });

  it('writes a plain-text report, section by section', () => {
    const text = reportText([{ title: 'Rendering', rows: [['Frame rate', '60 fps']] }, { title: 'Device', rows: [['CPU threads', 8]] }], ['scene: neo-room']);
    expect(text).toBe('## Rendering\nFrame rate: 60 fps\n\n## Device\nCPU threads: 8\n\nscene: neo-room\n');
  });
});
