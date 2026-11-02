// Viziune pe camera, cu MediaPipe (copiat local in vendor/mediapipe):
//   - Gesture Recognizer: 👍 / 👎 + cele 21 de puncte ale mainii (desenate ca schelet)
//   - Face Landmarker: punctele fetei, pentru efectele AR de pe cap (un cadru din doua)

const VENDOR = new URL('../vendor/mediapipe/', import.meta.url);
const MIN_INTERVAL_MS = 40;
const MIN_SCORE = 0.6;   // incredere minima ca sa luam gestul in seama

// Legaturile dintre cele 21 de puncte ale mainii (incheietura, degete)
const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

async function create(Task, fileset, model, extra) {
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: new URL(model, VENDOR).href, delegate },
    runningMode: 'VIDEO',
    ...extra,
  });
  try {
    return await Task.createFromOptions(fileset, options('GPU'));
  } catch {
    return await Task.createFromOptions(fileset, options('CPU'));
  }
}

export class ThumbsTracker {
  /**
   * @param video     <video> cu camera
   * @param canvas    <canvas> peste video, pentru schelet
   * @param onFrame   ({ gesture: 'up'|'down'|null, score, hand, landmarks, face }) la fiecare cadru analizat
   * @param onStatus  'loading' | 'ready' | 'error'
   */
  constructor({ video, canvas, onFrame, onStatus }) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.lastRun = 0;
    this.lastTime = -1;
    this.frameNo = 0;
    this.face = null;
  }

  async start() {
    this.onStatus('loading');
    try {
      const { FilesetResolver, GestureRecognizer, FaceLandmarker } = await import(new URL('vision_bundle.mjs', VENDOR).href);
      const fileset = await FilesetResolver.forVisionTasks(new URL('wasm', VENDOR).href);
      this.recognizer = await create(GestureRecognizer, fileset, 'gesture_recognizer.task', {
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      // fata e optionala: daca nu se incarca, jocul merge fara efectele de pe cap
      try {
        this.faceLandmarker = await create(FaceLandmarker, fileset, 'face_landmarker.task', { numFaces: 1 });
      } catch (err) {
        console.warn('Face Landmarker indisponibil:', err);
      }
    } catch (err) {
      this.onStatus('error', err?.message || String(err));
      return;
    }
    this.onStatus('ready');
    const loop = (now) => {
      this.tick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  tick(now) {
    const v = this.video;
    if (v.readyState < 2 || now - this.lastRun < MIN_INTERVAL_MS || v.currentTime === this.lastTime) return;
    this.lastRun = now;
    this.lastTime = v.currentTime;
    this.frameNo++;
    let res;
    try {
      res = this.recognizer.recognizeForVideo(v, now);
      // fata se misca mai incet decat mana: o analizam un cadru din doua
      if (this.faceLandmarker && this.frameNo % 2 === 0) {
        this.face = this.faceLandmarker.detectForVideo(v, now).faceLandmarks?.[0] ?? null;
      }
    } catch {
      return;
    }
    const landmarks = res.landmarks?.[0] ?? null;
    const top = res.gestures?.[0]?.[0];
    let gesture = null;
    if (top && top.score >= MIN_SCORE) {
      if (top.categoryName === 'Thumb_Up') gesture = 'up';
      else if (top.categoryName === 'Thumb_Down') gesture = 'down';
    }
    this.draw(landmarks, gesture);
    this.onFrame({ gesture, score: top?.score ?? 0, hand: Boolean(landmarks), landmarks, face: this.face });
  }

  // Punct normalizat din cadrul camerei -> pixeli pe ecran (video afisat cu object-fit: cover, in oglinda)
  toScreen(p, W = innerWidth, H = innerHeight) {
    const vw = this.video.videoWidth || 640, vh = this.video.videoHeight || 480;
    const scale = Math.max(W / vw, H / vh);
    const dw = vw * scale, dh = vh * scale;
    return { x: W - ((W - dw) / 2 + p.x * dw), y: (H - dh) / 2 + p.y * dh };
  }

  // Scheletul mainii
  draw(landmarks, gesture) {
    const { canvas, ctx } = this;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!landmarks) return;

    const pt = (p) => { const s = this.toScreen(p, W, H); return [s.x, s.y]; };
    const color = gesture === 'up' ? '#2fd27a' : gesture === 'down' ? '#ff5c6c' : '#eceef8';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      const [x1, y1] = pt(landmarks[a]);
      const [x2, y2] = pt(landmarks[b]);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    landmarks.forEach((p, i) => {
      const [x, y] = pt(p);
      ctx.beginPath();
      ctx.arc(x, y, i === 4 ? 9 : 5, 0, Math.PI * 2);   // varful degetului mare, mai mare
      ctx.fillStyle = i === 4 ? color : '#0e1120';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
  }
}
