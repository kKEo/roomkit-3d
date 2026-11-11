/**
 * What the server does with a frame for one socket, given how much it has already queued for it
 * (`ws.bufferedAmount`: bytes accepted by `send` that the network has not taken yet).
 *
 * A client that stops reading but still answers pings would otherwise make the server queue every
 * broadcast for it without limit: about 13 kB/s each in a busy room, so a few hundred such clients
 * exhaust the memory of a small container.
 * - up to `hard / 4` queued: send as usual;
 * - beyond that, binary frames (poses: only the latest matters, and the next one replaces it) are dropped;
 * - beyond `hard`: the client is too far behind to catch up with the ordered JSON messages, which cannot
 *   be skipped without it showing a different state than everyone else. Terminate the connection: the
 *   client reconnects and resumes with a fresh `welcome`.
 * Returns what happened: 'sent', 'dropped' or 'terminated'.
 */
export function sendGuarded(ws, data, hard) {
  if (ws.readyState !== ws.OPEN) return 'dropped';
  const queued = ws.bufferedAmount;
  if (queued > hard) { ws.terminate(); return 'terminated'; }
  if (typeof data !== 'string' && queued > hard / 4) return 'dropped';
  ws.send(data);
  return 'sent';
}
