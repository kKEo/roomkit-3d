import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION } from '../src/net/protocol.js';

/** The real server process (server/index.js) on a free port, for what only the entry file does: URLs, rooms and their lifetime. */
let proc, base, port;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const freePort = () => new Promise(res => { const s = net.createServer().listen(0, () => { const { port: p } = s.address(); s.close(() => res(p)); }); });

beforeAll(async () => {
  port = await freePort();
  base = `127.0.0.1:${port}`;
  proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', EMPTY_TTL_MS: '1500' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res, rej) => {
    proc.stdout.on('data', d => { if (String(d).includes('listening')) res(); });
    proc.on('exit', code => rej(new Error(`server exited early (${code})`)));
    setTimeout(() => rej(new Error('server did not start')), 8000);
  });
});
afterAll(() => { proc?.kill(); });

const alive = async () => (await fetch(`http://${base}/healthz`)).status === 200;
const status = async () => (await fetch(`http://${base}/status`)).json();
const join = (scene, extra = {}) => JSON.stringify({ t: 'join', v: PROTOCOL_VERSION, scene, name: 'Ada', color: '#00ff66', ...extra });

/** Opens `/ws/<event>` and sends `text`; resolves with the socket and its parsed text messages so far. */
function connect(event, text) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws/${event}`);
    const msgs = [];
    ws.closedWith = null;
    ws.on('message', (d, bin) => { if (!bin) msgs.push(JSON.parse(d.toString())); });
    ws.on('close', code => { ws.closedWith = code; });
    ws.on('open', () => { ws.send(text); resolve({ ws, msgs }); });
    ws.on('error', reject);
  });
}

/** Status code of an upgrade request to `path`, without any WebSocket handshake after it. */
const upgradeStatus = path => new Promise(resolve => {
  const ws = new WebSocket(`ws://${base}${path}`);
  ws.on('unexpected-response', (_, res) => { resolve(res.statusCode); ws.terminate(); });
  ws.on('open', () => { resolve(101); ws.close(); });
  ws.on('error', () => {});
});

describe('the sync server process', () => {
  it('answers a malformed percent-escape in the event name with 404 and stays up', async () => {
    expect(await upgradeStatus('/ws/%E0%A4%A')).toBe(404);
    expect(await upgradeStatus('/ws/%')).toBe(404);
    expect(await alive()).toBe(true);
    expect(await upgradeStatus('/ws/fine-name')).toBe(101);
  });

  it('does not keep an event for the scene of a refused first join', async () => {
    const bad = await connect('pin', join('x', { v: 999 }));
    await sleep(300);
    expect(bad.msgs[0]).toMatchObject({ t: 'error' });
    expect(bad.ws.closedWith).toBe(4000);
    expect(await status()).toEqual({});
    // the same event name is free for another scene
    const good = await connect('pin', join('loft'));
    await sleep(300);
    expect(good.msgs[0]).toMatchObject({ t: 'welcome' });
    expect((await status()).pin.scene).toBe('loft');
    good.ws.close();
    await sleep(100);
  });

  it('keeps an event, and its state, when its only visitor leaves and comes back in time', async () => {
    const a = await connect('back', join('loft'));
    await sleep(200);
    a.ws.send(JSON.stringify({ t: 'op', key: 'k', value: 42 }));
    await sleep(200);
    a.ws.close();
    await sleep(600);
    const b = await connect('back', join('loft'));
    await sleep(300);
    expect(b.msgs[0]).toMatchObject({ t: 'welcome', state: { k: { value: 42 } } });
    await sleep(2200); // past the empty-event timeout (1.5 s) that the first leave started
    expect(b.ws.closedWith).toBe(null);
    expect((await status()).back.clients).toBe(1);
    b.ws.close();
    await sleep(2500);
    expect((await status()).back).toBeUndefined(); // empty for good: closed
  }, 15000);
});
