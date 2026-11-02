// Mana ca mouse: varful aratatorului muta un cursor pe ecran.
// Selectezi tinand degetul ~1 s pe o tinta (cercul se umple) sau ciupind (deget mare + aratator).
// Tinte: butoane / campuri din overlay, panourile 3D A/B/Zgomot.

import { HandTracker } from './hand.js';
import { GestureController } from './gesture-detector.js';

const DWELL_MS = 1000;
const PINCH_ON = 0.33;     // distanta deget mare - aratator / marimea mainii
const PINCH_OFF = 0.48;
const PINCH_GAP_MS = 400;
const SMOOTH = 0.45;       // netezire cursor (0 = fix, 1 = fara netezire)
const EDGE = 0.1;          // zonele de sus/jos care deruleaza ecranele lungi
const STORE_KEY = 'mmm.ar.hand';

const TEXTS = {
  off: 'Control cu mâna: oprit',
  loading: 'Se încarcă urmărirea mâinii…',
  ready: 'Arată mâna la cameră (arată cu degetul sau fă 👍/👎)',
  tracking: 'Mână detectată · gest deget mare 👍/👎 sau arată',
  nocam: 'Control cu mâna: doar cu camera web',
  error: 'Urmărirea mâinii nu merge — folosește tastatura',
};

export class HandPointer {
  constructor(view) {
    this.view = view;
    try { this.enabled = localStorage.getItem(STORE_KEY) !== '0'; } catch { this.enabled = true; }
    this.status = this.enabled ? 'nocam' : 'off';
    this.video = null;
    this.pos = null;
    this.target = null;
    this.targetKey = null;
    this.since = 0;
    this.lock = null;          // tinta tocmai activata: nu se reactiveaza pana nu pleci de pe ea
    this.pinched = false;
    this.lastPinch = 0;

    this.cursor = document.createElement('div');
    this.cursor.id = 'hand-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.badge = document.createElement('button');
    this.badge.id = 'hand-badge';
    this.badge.type = 'button';
    this.badge.addEventListener('click', () => this.toggle());
    document.body.append(this.cursor, this.badge);

    this.gestures = new GestureController(view);

    this.tracker = new HandTracker({
      onFrame: (f) => this.onFrame(f),
      onStatus: (s, msg) => this.setStatus(s, msg),
    });
    this.render();
  }

  attach(video) {
    if (!(video instanceof HTMLVideoElement)) return;   // ar-test.html foloseste o imagine
    this.video = video;
    if (this.enabled) this.startTracker();
    else this.setStatus('off');
  }

  startTracker() {
    if (!this.video) return this.setStatus('nocam');
    this.tracker.start(this.video);   // modelul se incarca o singura data
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0'); } catch { /* storage blocat */ }
    if (this.enabled) this.startTracker();
    else {
      this.tracker.stop();
      this.setStatus('off');
    }
  }

  setStatus(status, msg = '') {
    this.status = status;
    this.errorMsg = msg;
    this.render();
  }

  render() {
    document.body.classList.toggle('hand-on', this.enabled);
    this.badge.className = `hand-${this.status}`;
    this.badge.textContent = `✋ ${TEXTS[this.status] ?? ''}`;
    this.badge.title = this.status === 'error' ? this.errorMsg : 'Pornește / oprește controlul cu mâna (tasta H)';
  }

  // coordonate normalizate din cadrul video -> pixeli pe ecran (tinand cont de oglinda si de crop)
  toScreen(nx, ny) {
    const r = this.video.getBoundingClientRect();
    return {
      x: this.view.mirror ? r.right - nx * r.width : r.left + nx * r.width,
      y: r.top + ny * r.height,
    };
  }

  onFrame(f) {
    if (!f || !this.enabled) {
      this.hide();
      this.gestures.processFrame(null);
      if (this.view.studio) this.view.studio.processFrame(null);
      if (this.enabled && this.status === 'tracking') this.setStatus('ready');
      return;
    }
    if (this.status !== 'tracking') this.setStatus('tracking');

    // Procesare gesturi deget mare (👍, 👎, 👈, 👉) si clipit
    this.gestures.processFrame(f, this.video);

    // Atelier 3D: sculptură și desen direct în aer cu mâna
    if (this.view.studio) {
      this.view.studio.processFrame(f, this.view.mirror);
    }

    const p = this.toScreen(f.x, f.y);
    this.pos = this.pos ? { x: this.pos.x + (p.x - this.pos.x) * SMOOTH, y: this.pos.y + (p.y - this.pos.y) * SMOOTH } : p;
    const { x, y } = this.pos;
    this.cursor.style.display = 'block';
    this.cursor.style.transform = `translate(${x}px, ${y}px)`;

    const now = performance.now();
    const t = this.view.pointerTarget(x, y);
    const key = t?.key ?? null;
    if (key !== this.targetKey) {
      this.setHover(t);
      this.targetKey = key;
      this.target = t;
      this.since = now;
      if (key !== this.lock) this.lock = null;
    }

    // sliderul (Calibrare) urmareste degetul continuu
    if (t?.kind === 'range') this.view.setRangeFromX(t.el, x);

    // ciupit = click imediat
    const pinch = this.pinched ? f.pinch < PINCH_OFF : f.pinch < PINCH_ON;
    if (pinch && !this.pinched && t && t.kind !== 'range' && now - this.lastPinch > PINCH_GAP_MS) {
      this.lastPinch = now;
      this.fire(t);
    }
    this.pinched = pinch;
    this.cursor.classList.toggle('pinch', pinch);

    // tinut pe loc = click dupa DWELL_MS
    let progress = 0;
    if (t && t.kind !== 'range' && key !== this.lock) {
      progress = (now - this.since) / DWELL_MS;
      if (progress >= 1) {
        this.fire(t);
        progress = 0;
      }
    }
    this.cursor.style.setProperty('--p', String(Math.min(1, progress)));

    if (!t) this.view.edgeScroll(y);
  }

  fire(t) {
    this.lock = t.key;
    this.cursor.classList.remove('fired');
    void this.cursor.offsetWidth;   // reporneste animatia
    this.cursor.classList.add('fired');
    this.view.activatePointer(t);
    // dupa activare interfata se poate redesena: reevaluam tinta la urmatorul cadru
    this.targetKey = undefined;
  }

  setHover(t) {
    document.querySelectorAll('.hand-hover').forEach((el) => el.classList.remove('hand-hover'));
    if (t?.kind === 'dom') t.el.classList.add('hand-hover');
    this.view.hm3d?.setHover(t?.kind === 'hm' ? t.letter : null);
  }

  hide() {
    this.cursor.style.display = 'none';
    this.pos = null;
    if (this.targetKey) this.setHover(null);
    this.targetKey = null;
    this.target = null;
    this.pinched = false;
  }
}
