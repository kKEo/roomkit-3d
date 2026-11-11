/** A WebSocket the test drives by hand (not a test file: no `.test.js`). */
export class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(d) { this.sent.push(d); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.({}); }
  receive(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  ops() { return this.sent.filter(d => typeof d === 'string').map(d => JSON.parse(d)).filter(m => m.t === 'op'); }
}
