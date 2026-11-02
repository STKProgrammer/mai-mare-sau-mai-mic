// Urmarirea mainii cu MediaPipe Hand Landmarker (copiat local in vendor/mediapipe).
// Primeste acelasi <video> ca AR.js si raporteaza, de ~20 de ori pe secunda:
//   - varful degetului aratator (coordonate normalizate 0..1 in cadrul video)
//   - cat de "ciupit" e (distanta deget mare - aratator, relativ la marimea mainii)

const VENDOR = new URL('../vendor/mediapipe/', import.meta.url);
const MIN_INTERVAL_MS = 45;

// Repere MediaPipe: 0 = incheietura, 4 = varful degetului mare, 5 = baza aratatorului, 8 = varful aratatorului
const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class HandTracker {
  /**
   * @param onFrame   ({ x, y, pinch } | null) — null cand nu se vede nicio mana
   * @param onStatus  'loading' | 'ready' | 'error' (+ mesaj)
   */
  constructor({ onFrame, onStatus }) {
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.landmarker = null;
    this.running = false;
    this.lastRun = 0;
    this.lastTime = -1;
  }

  async load() {
    if (this.landmarker) return;
    this.onStatus('loading');
    const { FilesetResolver, HandLandmarker } = await import(new URL('vision_bundle.mjs', VENDOR).href);
    const fileset = await FilesetResolver.forVisionTasks(new URL('wasm', VENDOR).href);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: new URL('hand_landmarker.task', VENDOR).href, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.6,
      minHandPresenceConfidence: 0.6,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('GPU'));
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    }
  }

  async start(video) {
    try {
      await this.load();
    } catch (err) {
      this.onStatus('error', err?.message || String(err));
      return;
    }
    this.video = video;
    if (this.running) return;   // bucla ruleaza deja
    this.running = true;
    this.onStatus('ready');
    const loop = (now) => {
      if (!this.running) return;
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    this.onFrame(null);
  }

  tick(now) {
    const v = this.video;
    if (!v || v.readyState < 2 || now - this.lastRun < MIN_INTERVAL_MS || v.currentTime === this.lastTime) return;
    this.lastRun = now;
    this.lastTime = v.currentTime;
    let res;
    try {
      res = this.landmarker.detectForVideo(v, now);
    } catch {
      return;
    }
    const lm = res?.landmarks?.[0];
    if (!lm) {
      this.onFrame(null);
      return;
    }
    const size = dist(lm[WRIST], lm[INDEX_MCP]) || 1;
    this.onFrame({
      x: lm[INDEX_TIP].x,
      y: lm[INDEX_TIP].y,
      pinch: dist(lm[THUMB_TIP], lm[INDEX_TIP]) / size,
      landmarks: lm,
    });
  }
}
