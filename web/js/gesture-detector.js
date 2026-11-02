// Super AR Tool: Detecție Avansată Gesturi (Deget mare, Schelet AR 3D Mână, Clipit din Ochi, Ciupit/Pinch, Web Audio).
//
// Suportă:
//   - 👍 Thumbs Up / 👈 Thumb Left   -> Alege Titlul A (sau „Mai mare”)
//   - 👎 Thumbs Down / 👉 Thumb Right -> Alege Titlul B (sau „Mai mic”)
//   - 😉 Clipit ochi stâng (Left Wink) -> Alege Titlul A
//   - 😉 Clipit ochi drept (Right Wink) -> Alege Titlul B
//   - 👀 Clipire amândoi ochii / Orice gest la reveal -> Următoarea întrebare
//   - ✌️ Peace Sign (2 degete)         -> Comută graficul 3D AR
//   - 🤏 Ciupit (Pinch)               -> Scalare dinamică a scenei 3D în spațiul AR
//   - Schelet AR Holografic desenat live peste mână (21 articulații + linii cibernetice)
//   - Feedback audio sintetic (Web Audio API) fără fișiere externe
//   - Punte WebSocket bidirecțională cu modulul Python OpenCV (port 8765)

const GESTURE_HOLD_MS = 360;
const NEUTRAL_GAP_MS = 250;

// Sinteză audio Web Audio API
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  play(kind) {
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (kind === 'progress') {
        osc.frequency.setValueAtTime(480, t);
        osc.frequency.exponentialRampToValueAtTime(640, t + 0.08);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
      } else if (kind === 'confirm') {
        osc.frequency.setValueAtTime(523.25, t); // C5
        osc.frequency.setValueAtTime(659.25, t + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, t + 0.16); // G5
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.28);
        osc.start(t);
        osc.stop(t + 0.28);
      } else if (kind === 'wink') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1174, t + 0.14);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.14);
        osc.start(t);
        osc.stop(t + 0.14);
      }
    } catch { /* audio blocat */ }
  }
}

const sfx = new SoundFX();

/**
 * Conexiunile anatomice ale mâinii (MediaPipe Hand Landmark connections).
 */
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // Degetul mare
  [0, 5], [5, 6], [6, 7], [7, 8],          // Arătător
  [5, 9], [9, 10], [10, 11], [11, 12],     // Mijlociu
  [9, 13], [13, 14], [14, 15], [15, 16],   // Inelar
  [13, 17], [17, 18], [18, 19], [19, 20],  // Degetul mic
  [0, 17],                                 // Baza palmei
];

export function classifyHandGestures(lm, isMirror = true) {
  if (!lm || lm.length < 21) return null;

  const handScale = Math.hypot(lm[0].x - lm[5].x, lm[0].y - lm[5].y) || 0.1;
  const dWrist = (idx) => Math.hypot(lm[idx].x - lm[0].x, lm[idx].y - lm[0].y);

  // Verificare degete flexate
  const indexFolded = dWrist(8) < dWrist(6) * 1.15;
  const middleFolded = dWrist(12) < dWrist(10) * 1.15;
  const ringFolded = dWrist(16) < dWrist(14) * 1.15;
  const pinkyFolded = dWrist(20) < dWrist(18) * 1.15;

  const foldedCount = (indexFolded ? 1 : 0) + (middleFolded ? 1 : 0) + (ringFolded ? 1 : 0) + (pinkyFolded ? 1 : 0);

  // 1. Peace Sign (✌️): arătător + mijlociu extinse, inelar + mic strânse
  if (!indexFolded && !middleFolded && ringFolded && pinkyFolded) {
    return { type: 'peace', action: 'toggle_chart', icon: '✌️', label: 'Mod Statistică 3D' };
  }

  // 2. Palma deschisă (✋): toate cele 4 degete extinse
  if (foldedCount === 0) {
    return { type: 'open_palm', action: 'pause', icon: '✋', label: 'Palma deschisă (Pauză)' };
  }

  // 3. Gesturi deget mare (Pumn strâns cu degetul mare eliberat)
  if (foldedCount >= 3) {
    const thumbExt = Math.hypot(lm[4].x - lm[2].x, lm[4].y - lm[2].y);
    if (thumbExt >= handScale * 0.4) {
      let dx = lm[4].x - lm[2].x;
      let dy = lm[4].y - lm[2].y;
      if (isMirror) dx = -dx;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // Dominant vertical
      if (absY > absX * 0.85) {
        if (dy < -handScale * 0.28) {
          return { type: 'thumbs_up', choice: 'A', icon: '👍', label: 'Titlul A (Mai mare)' };
        }
        if (dy > handScale * 0.28) {
          return { type: 'thumbs_down', choice: 'B', icon: '👎', label: 'Titlul B (Mai mic)' };
        }
      }

      // Dominant orizontal
      if (absX > absY * 0.8) {
        if (dx < -handScale * 0.28) {
          return { type: 'thumb_left', choice: 'A', icon: '👈', label: 'Titlul A (Stânga)' };
        }
        if (dx > handScale * 0.28) {
          return { type: 'thumb_right', choice: 'B', icon: '👉', label: 'Titlul B (Dreapta)' };
        }
      }
    }
  }

  return null;
}

export class GestureController {
  constructor(view) {
    this.view = view;
    this.currentGesture = null;
    this.holdStart = 0;
    this.needNeutral = false;
    this.lastTrigger = 0;
    this.showSkeleton = true;

    // Detectare clipit local (browser eye-blink tracker)
    this.lastBlinkCheck = 0;
    this.eyeTrackerCanvas = document.createElement('canvas');
    this.eyeTrackerCanvas.width = 64;
    this.eyeTrackerCanvas.height = 36;
    this.eyeCtx = this.eyeTrackerCanvas.getContext('2d', { willReadFrequently: true });
    this.baselineLumLeft = 0;
    this.baselineLumRight = 0;

    this.createHud();
    this.createSkeletonCanvas();
    this.initWebSocket();
    this.initVoiceControl();
  }

  createHud() {
    this.hud = document.createElement('div');
    this.hud.id = 'gesture-hud';
    this.hud.setAttribute('aria-live', 'polite');
    this.hud.innerHTML = `
      <div class="gh-content">
        <span class="gh-icon">👍</span>
        <span class="gh-label">Titlul A</span>
      </div>
      <div class="gh-bar"><div class="gh-fill"></div></div>
    `;
    document.body.appendChild(this.hud);
    this.iconEl = this.hud.querySelector('.gh-icon');
    this.labelEl = this.hud.querySelector('.gh-label');
    this.fillEl = this.hud.querySelector('.gh-fill');

    // Indicator super AR tool
    this.arBadge = document.createElement('button');
    this.arBadge.id = 'super-ar-badge';
    this.arBadge.type = 'button';
    this.arBadge.title = 'Apasă pentru a comuta vizualizarea Scheletului AR (tasta S)';
    this.arBadge.textContent = '✨ AR Super Tool activ';
    this.arBadge.addEventListener('click', () => {
      this.showSkeleton = !this.showSkeleton;
      this.arBadge.textContent = this.showSkeleton ? '✨ AR Schelet Mână: Pornit' : '✨ AR Schelet Mână: Oprit';
    });
    document.body.appendChild(this.arBadge);

    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 's' && !e.target.matches('input')) {
        this.showSkeleton = !this.showSkeleton;
        this.arBadge.textContent = this.showSkeleton ? '✨ AR Schelet Mână: Pornit' : '✨ AR Schelet Mână: Oprit';
      }
    });
  }

  createSkeletonCanvas() {
    this.skCanvas = document.createElement('canvas');
    this.skCanvas.id = 'ar-skeleton-canvas';
    this.skCtx = this.skCanvas.getContext('2d');
    document.body.appendChild(this.skCanvas);

    const resize = () => {
      this.skCanvas.width = window.innerWidth;
      this.skCanvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  /**
   * Desenează scheletul AR 3D direct peste mâna detectată.
   */
  drawHandSkeleton(lm, isMirror) {
    const ctx = this.skCtx;
    const W = this.skCanvas.width;
    const H = this.skCanvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!this.showSkeleton || !lm || lm.length < 21) return;

    // Coordonate pe ecran
    const pts = lm.map((pt) => ({
      x: isMirror ? (1 - pt.x) * W : pt.x * W,
      y: pt.y * H,
    }));

    // 1. Oase cibernetice (linii neon)
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)'; // neon cyan
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;

    for (const [i, j] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[j].x, pts[j].y);
      ctx.stroke();
    }

    // 2. Articulații (sfere strălucitoare)
    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i];
      const isThumbTip = i === 4;
      const isIndexTip = i === 8;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isThumbTip ? 8 : isIndexTip ? 7 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isThumbTip ? '#2fd27a' : isIndexTip ? '#f5c542' : '#eceef8';
      ctx.shadowColor = isThumbTip ? '#2fd27a' : '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.fill();

      // Puls pe degetul mare
      if (isThumbTip) {
        const pulse = 14 + Math.sin(performance.now() * 0.01) * 4;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(47, 210, 122, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 3. Etichetă AR plutitoare deasupra mâinii
    if (this.currentGesture) {
      const wrist = pts[0];
      const text = `${this.currentGesture.icon} ${this.currentGesture.label}`;
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillStyle = '#eceef8';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      ctx.fillText(text, wrist.x, Math.max(40, pts[4].y - 30));
    }
  }

  /**
   * Monitorizează clipitul din ochi din cadrul video (stânga / dreapta).
   */
  checkBlink(video) {
    if (!video || video.readyState < 2) return;
    const now = performance.now();
    if (now - this.lastBlinkCheck < 100) return; // la fiecare ~100ms
    this.lastBlinkCheck = now;

    try {
      this.eyeCtx.drawImage(video, 0, 0, 64, 36);
      // Analizăm jumătatea superioară a feței (ochi stâng vs drept)
      const leftEyeData = this.eyeCtx.getImageData(10, 8, 18, 12).data;
      const rightEyeData = this.eyeCtx.getImageData(36, 8, 18, 12).data;

      const calcLum = (d) => {
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        return sum / (d.length / 4);
      };

      const lumL = calcLum(leftEyeData);
      const lumR = calcLum(rightEyeData);

      if (this.baselineLumLeft === 0) {
        this.baselineLumLeft = lumL;
        this.baselineLumRight = lumR;
        return;
      }

      // Ochiul închis reduce reflexia / luminozitatea pupilei
      const diffL = this.baselineLumLeft - lumL;
      const diffR = this.baselineLumRight - lumR;

      if (diffL > 22 && diffR < 8) {
        this.onWinkDetected('left');
      } else if (diffR > 22 && diffL < 8) {
        this.onWinkDetected('right');
      } else if (diffL > 20 && diffR > 20) {
        this.onDoubleBlink();
      }

      // Adaptare baseline
      this.baselineLumLeft = this.baselineLumLeft * 0.9 + lumL * 0.1;
      this.baselineLumRight = this.baselineLumRight * 0.9 + lumR * 0.1;
    } catch { /* securitate canvas cross-origin */ }
  }

  onWinkDetected(eye) {
    const now = performance.now();
    if (this.needNeutral || now - this.lastTrigger < 1000) return;
    const choice = eye === 'left' ? 'A' : 'B';
    const icon = '😉';
    const label = `Clipit ochi ${eye === 'left' ? 'stâng' : 'drept'} -> Titlul ${choice}`;
    sfx.play('wink');
    this.showHud(icon, label, 1);
    this.lastTrigger = now;
    this.needNeutral = true;
    setTimeout(() => {
      this.view.choose(choice);
      this.hideHud();
    }, 280);
  }

  onDoubleBlink() {
    const g = this.view.game;
    const now = performance.now();
    if (!g || g.state !== 'reveal' || g.mode.seconds || now - this.lastTrigger < 1000) return;
    sfx.play('wink');
    this.showHud('👀', 'Clipire detectată -> Următoarea', 1);
    this.lastTrigger = now;
    setTimeout(() => {
      this.view.next();
      this.hideHud();
    }, 280);
  }

  /**
   * Procesează fiecare cadru detectat de MediaPipe.
   */
  processFrame(frame, video = null) {
    const now = performance.now();
    const g = this.view.game;

    if (video) this.checkBlink(video);

    if (!frame || !frame.landmarks) {
      this.currentGesture = null;
      this.hideHud();
      this.drawHandSkeleton(null);
      this.needNeutral = false;
      this.view.scene?.setProgress(null);
      return;
    }

    const mirror = this.view.mirror ?? true;
    this.drawHandSkeleton(frame.landmarks, mirror);

    if (!g || g.over) {
      this.hideHud();
      return;
    }

    const detected = classifyHandGestures(frame.landmarks, mirror);

    // Gest ciupit pentru scalare AR (Pinch to Zoom)
    if (frame.pinch != null && this.view.scene && frame.pinch < 0.28) {
      const curScale = this.view.scene.scale || 0.6;
      const targetScale = Math.min(1.3, Math.max(0.4, curScale + (0.28 - frame.pinch) * 0.05));
      this.view.scene.setScale(targetScale);
    }

    if (this.needNeutral) {
      if (!detected) {
        if (now - this.lastTrigger > NEUTRAL_GAP_MS) {
          this.needNeutral = false;
        }
      }
      this.hideHud();
      this.view.scene?.setProgress(null);
      return;
    }

    if (!detected) {
      this.currentGesture = null;
      this.hideHud();
      this.view.scene?.setProgress(null);
      return;
    }

    if (detected.type === 'open_palm') {
      this.showHud(detected.icon, detected.label, 0);
      return;
    }

    if (detected.type === 'peace') {
      if (now - this.lastTrigger > 1200) {
        this.lastTrigger = now;
        sfx.play('confirm');
        this.showHud('✌️', 'Statistică 3D AR activată', 1);
        if (this.view.scene?.chart) {
          this.view.scene.chart.visible = !this.view.scene.chart.visible;
        }
        setTimeout(() => this.hideHud(), 600);
      }
      return;
    }

    // Gest activ
    if (this.currentGesture?.type !== detected.type) {
      this.currentGesture = detected;
      this.holdStart = now;
      sfx.play('progress');
    }

    const elapsed = now - this.holdStart;
    const progress = Math.min(1, Math.max(0, elapsed / GESTURE_HOLD_MS));

    let displayIcon = detected.icon;
    let displayLabel = detected.label;

    if (g.state === 'reveal' && !g.mode.seconds) {
      displayIcon = '⏭️';
      displayLabel = 'Următoarea întrebare';
      this.view.scene?.setProgress('next', progress);
    } else if (detected.choice) {
      this.view.scene?.setProgress(detected.choice, progress);
    }

    this.showHud(displayIcon, displayLabel, progress);

    if (progress >= 1) {
      this.fireGestureAction(detected);
    }
  }

  fireGestureAction(detected) {
    const g = this.view.game;
    if (!g) return;

    this.needNeutral = true;
    this.lastTrigger = performance.now();
    sfx.play('confirm');

    this.hud.classList.add('fired');
    setTimeout(() => this.hud.classList.remove('fired'), 350);

    if (g.state === 'question') {
      if (g.mode.calibration) {
        if (detected.choice === 'A') this.view.nudgeConf(-10);
        else if (detected.choice === 'B') this.view.nudgeConf(10);
      } else {
        this.view.choose(detected.choice);
      }
    } else if (g.state === 'reveal' && !g.mode.seconds) {
      this.view.next();
    } else if (g.state === 'over') {
      if (this.view.last) this.view.startGame(this.view.last);
    }
  }

  showHud(icon, label, progress) {
    this.hud.classList.add('visible');
    this.iconEl.textContent = icon;
    this.labelEl.textContent = label;
    this.fillEl.style.width = `${Math.round(progress * 100)}%`;
  }

  hideHud() {
    this.hud.classList.remove('visible');
    this.fillEl.style.width = '0%';
  }

  // ------------------------------------------------------------ WebSocket OpenCV
  initWebSocket() {
    const connect = () => {
      try {
        const ws = new WebSocket('ws://localhost:8765');
        ws.onopen = () => {
          this.setOpenCvBadge(true);
        };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.action === 'choose') {
              this.onExternalChoice(data.choice, data.gesture || '👍');
            } else if (data.action === 'next') {
              this.onExternalNext();
            } else if (data.action === 'wink') {
              this.onWinkDetected(data.eye);
            }
          } catch { /* ignora json invalid */ }
        };
        ws.onclose = () => {
          this.setOpenCvBadge(false);
          setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          ws.close();
        };
      } catch {
        setTimeout(connect, 4000);
      }
    };
    connect();
  }

  setOpenCvBadge(active) {
    let badge = document.getElementById('opencv-badge');
    if (!badge && active) {
      badge = document.createElement('div');
      badge.id = 'opencv-badge';
      badge.textContent = '🐍 OpenCV Python conectat (Gesturi + Clipit)';
      document.body.appendChild(badge);
    }
    if (badge) {
      badge.style.display = active ? 'block' : 'none';
    }
  }

  onExternalChoice(choice, icon = '👍') {
    const g = this.view.game;
    if (!g || g.state !== 'question') return;
    sfx.play('confirm');
    this.showHud(icon, `OpenCV: Titlul ${choice}`, 1);
    setTimeout(() => this.hideHud(), 400);
    this.view.choose(choice);
  }

  onExternalNext() {
    const g = this.view.game;
    if (!g || g.state !== 'reveal' || g.mode.seconds) return;
    sfx.play('confirm');
    this.showHud('⏭️', 'OpenCV: Următoarea', 1);
    setTimeout(() => this.hideHud(), 400);
    this.view.next();
  }

  initVoiceControl() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    this.voiceBadge = document.createElement('div');
    this.voiceBadge.id = 'voice-badge';
    this.voiceBadge.title = 'Comenzi vocale în română: spune „A”, „B”, „Următoarea”, „Undo”, „Culoare”, etc.';
    this.voiceBadge.innerHTML = '🎙️ Voce: Pornită';
    document.body.appendChild(this.voiceBadge);

    try {
      this.recognition = new SpeechRec();
      this.recognition.lang = 'ro-RO';
      this.recognition.continuous = true;
      this.recognition.interimResults = false;

      this.recognition.onstart = () => {
        if (this.voiceBadge) {
          this.voiceBadge.classList.add('listening');
          this.voiceBadge.innerHTML = '🎙️ Voce activă (spune „A” / „B”)';
        }
      };

      this.recognition.onresult = (event) => {
        if (!event.results || event.results.length === 0) return;
        const last = event.results[event.results.length - 1];
        if (!last || !last[0]) return;
        const text = last[0].transcript.trim().toLowerCase();
        this.handleVoiceCommand(text);
      };

      this.recognition.onerror = () => {
        // Ignoră erori temporare de recunoaștere
      };

      this.recognition.onend = () => {
        if (this.voiceBadge) {
          this.voiceBadge.classList.remove('listening');
          this.voiceBadge.innerHTML = '🎙️ Voce în pauză';
        }
        // Auto-restart pentru hands-free continuu
        setTimeout(() => {
          try {
            if (this.recognition) this.recognition.start();
          } catch { /* deja pornit */ }
        }, 1200);
      };

      this.recognition.start();
    } catch {
      // Browser sau permisiune microfon blocată
    }
  }

  handleVoiceCommand(text) {
    if (!text) return;
    const isStudio = document.body.classList.contains('studio-active');

    // 1. Comenzi specifice Mod Studio 3D
    if (isStudio) {
      if (text.includes('undo') || text.includes('înapoi') || text.includes('inapoi') || text.includes('linie')) {
        this.showHud('🎙️', 'Voce: Undo!', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'undo' } }));
        sfx.play('confirm');
      } else if (text.includes('culoare') || text.includes('schimbă') || text.includes('schimba')) {
        this.showHud('🎙️', 'Voce: Schimbă culoare', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'color' } }));
        sfx.play('confirm');
      } else if (text.includes('curăță') || text.includes('curata') || text.includes('șterge tot') || text.includes('sterge')) {
        this.showHud('🎙️', 'Voce: Curăță tot!', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'clear' } }));
        sfx.play('confirm');
      } else if (text.includes('simetrie') || text.includes('oglindă') || text.includes('oglinda')) {
        this.showHud('🎙️', 'Voce: Simetrie', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'symmetry' } }));
        sfx.play('confirm');
      } else if (text.includes('ghidaj') || text.includes('șablon') || text.includes('sablon')) {
        this.showHud('🎙️', 'Voce: Ghidaj 3D', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'guide' } }));
        sfx.play('confirm');
      } else if (text.includes('mută') || text.includes('muta') || text.includes('deplasează')) {
        this.showHud('🎙️', 'Voce: Mod Mutare 3D', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'move' } }));
        sfx.play('confirm');
      } else if (text.includes('rotește') || text.includes('roteste') || text.includes('rotire')) {
        this.showHud('🎙️', 'Voce: Rotație 360°', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'rotate' } }));
        sfx.play('confirm');
      } else if (text.includes('gata') || text.includes('terminat') || text.includes('final')) {
        this.showHud('🎙️', 'Voce: Finalizează!', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'finish' } }));
        sfx.play('confirm');
      } else if (text.includes('pauză') || text.includes('pauza') || text.includes('reia')) {
        this.showHud('🎙️', 'Voce: Pauză / Reia', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'pause' } }));
        sfx.play('confirm');
      } else if (text.includes('cuvânt') || text.includes('cuvant') || text.includes('nou')) {
        this.showHud('🎙️', 'Voce: Alt cuvânt', 1);
        window.dispatchEvent(new CustomEvent('ar-studio-cmd', { detail: { cmd: 'new' } }));
        sfx.play('confirm');
      }
      return;
    }

    // 2. Comenzi Mod Quiz / Joc
    const g = this.view.game;
    if (g && g.state === 'question') {
      const words = text.split(/\s+/);
      const isA = words.some((w) => ['a', 'prima', 'primul', 'stânga', 'stanga', 'sus', 'mare'].includes(w));
      const isB = words.some((w) => ['b', 'doua', 'doilea', 'dreapta', 'jos', 'mic'].includes(w));

      if (isA && !isB) {
        this.onExternalChoice('A', '🎙️');
      } else if (isB && !isA) {
        this.onExternalChoice('B', '🎙️');
      }
    } else if (g && g.state === 'reveal') {
      if (text.includes('următoarea') || text.includes('urmatoarea') || text.includes('next') || text.includes('continuă') || text.includes('continua') || text.includes('gata')) {
        this.onExternalNext();
      }
    }

    if (text.includes('grafic') || text.includes('statistic') || text.includes('peace')) {
      if (this.view.scene?.chart) {
        this.view.scene.chart.visible = !this.view.scene.chart.visible;
      }
    }
  }
}
