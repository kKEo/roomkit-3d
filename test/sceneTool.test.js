import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { join } from 'node:path';

/** The scene tool as an author or an agent runs it: output and exit codes. */
const tool = join(import.meta.dirname, '..', 'tools', 'scene.js');
const run = (...args) => new Promise(resolve => {
  execFile(process.execPath, [tool, ...args], (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});

describe('tools/scene.js', () => {
  it('check prints one summary line per clean scene and exits 0', async () => {
    const r = await run('check', 'loft');
    expect(r).toEqual({ code: 0, stdout: 'loft: ok\n', stderr: '' });
    expect(JSON.parse((await run('check', 'loft', '--json')).stdout)).toEqual([]);
  });

  it('describe, plan and prefabs print the scene', async () => {
    expect((await run('describe', 'loft')).stdout).toMatch(/^loft: "Cyan Loft/);
    expect((await run('plan', 'loft')).stdout).toMatch(/north is up, east is right/);
    expect((await run('prefabs', 'loft')).stdout).toMatch(/^lamp: /m);
    expect((await run('prefabs')).stdout).not.toMatch(/^lamp: /m);
  });

  it('wrong usage exits 2 and says what is known', async () => {
    expect((await run()).code).toBe(2);
    expect((await run('frobnicate')).stderr).toMatch(/unknown command "frobnicate"/);
    const r = await run('check', 'nowhere');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/no scene folder "nowhere" in public\/scenes \(there are: cinema, gallery, loft, neo-room\)/);
    expect((await run('new', 'Bad/Name')).stderr).toMatch(/is not a scene name/);
    expect((await run('new', 'loft')).stderr).toMatch(/already exists/);
  });
});
