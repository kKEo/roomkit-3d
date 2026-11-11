import { describe, it, expect } from 'vitest';
import { sendGuarded } from '../server/send.js';

const sock = (bufferedAmount = 0, readyState = 1) => ({ OPEN: 1, readyState, bufferedAmount, sent: [], terminated: false, send(d) { this.sent.push(d); }, terminate() { this.terminated = true; } });
const POSE = new ArrayBuffer(16);
const HARD = 1000;

describe('sendGuarded', () => {
  it('sends everything while the client keeps up', () => {
    const w = sock(0);
    expect(sendGuarded(w, 'text', HARD)).toBe('sent');
    expect(sendGuarded(w, POSE, HARD)).toBe('sent');
    expect(w.sent).toHaveLength(2);
  });

  it('drops pose frames but still sends messages once a quarter of the limit is queued', () => {
    const w = sock(300);
    expect(sendGuarded(w, POSE, HARD)).toBe('dropped');
    expect(sendGuarded(w, 'state', HARD)).toBe('sent');
    expect(w.sent).toEqual(['state']);
    expect(w.terminated).toBe(false);
  });

  it('terminates a client that is further behind than the limit, and sends it nothing more', () => {
    const w = sock(1001);
    expect(sendGuarded(w, 'state', HARD)).toBe('terminated');
    expect(w.terminated).toBe(true);
    expect(w.sent).toHaveLength(0);
  });

  it('sends at exactly the limits (they are exceeded, not reached)', () => {
    expect(sendGuarded(sock(250), POSE, HARD)).toBe('sent');
    expect(sendGuarded(sock(1000), 'x', HARD)).toBe('sent');
  });

  it('does nothing for a socket that is not open', () => {
    const w = sock(5000, 3);
    expect(sendGuarded(w, 'x', HARD)).toBe('dropped');
    expect(w.terminated).toBe(false);
    expect(w.sent).toHaveLength(0);
  });
});
