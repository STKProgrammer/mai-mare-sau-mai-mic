// Efecte AR desenate peste camera, ancorate pe fata si pe mana:
//   pe cap:  inimile (vietile) pe orbita, coroana + confetti (corect), nor cu ploaie (gresit),
//            aura de foc (serie >= 3)
//   pe mana: inel de progres pe varful degetului mare cat tii gestul, explozie la final,
//            coloanele CTR (A vs B) care cresc din palma dupa raspuns

const COLORS = { a: '#5b8cff', b: '#ff9f43', win: '#2fd27a', lose: '#ff5c6c', gold: '#f5c542', text: '#eceef8' };
const CONFETTI = ['#5b8cff', '#ff9f43', '#2fd27a', '#f5c542', '#ff5c6c', '#c77dff'];
const MAX_LIVES = 3;

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

function heartPath(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.95, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 0.95, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  ctx.closePath();
}

export class ARFx {
  /**
   * @param canvas   <canvas> pe tot ecranul, peste camera
   * @param toScreen (punct normalizat din camera) -> { x, y } pe ecran
   */
  constructor(canvas, toScreen) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.toScreen = toScreen;
    this.head = null;          // geometria capului, netezita
    this.headSeen = 0;
    this.hand = null;          // punctele mainii pe ecran
    this.handSeen = 0;
    this.particles = [];
    this.events = [];          // { type: 'crown' | 'cloud', t0 }
    this.game = { phase: 'start', lives: MAX_LIVES, streak: 0, reveal: null };
    this.hold = { gesture: null, p: 0 };
    this.prevLives = MAX_LIVES;
    this.last = performance.now();
    const loop = (now) => {
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------ intrari

  update({ landmarks, face }) {
    const now = performance.now();
    if (landmarks) {
      this.hand = landmarks.map((p) => this.toScreen(p));
      this.handSeen = now;
    }
    if (face) {
      const top = this.toScreen(face[10]), chin = this.toScreen(face[152]);
      const L = this.toScreen(face[234]), R = this.toScreen(face[454]);
      const w = dist(L, R);
      const len = dist(top, chin) || 1;
      const up = { x: (top.x - chin.x) / len, y: (top.y - chin.y) / len };
      const target = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2, top, w, up, h: len };
      // netezire: fata e analizata ~12 ori/s, efectele se deseneaza la 60
      const h = this.head;
      this.head = h && now - this.headSeen < 500
        ? {
          x: lerp(h.x, target.x, 0.35), y: lerp(h.y, target.y, 0.35), w: lerp(h.w, w, 0.3), h: lerp(h.h, len, 0.3),
          top: { x: lerp(h.top.x, top.x, 0.35), y: lerp(h.top.y, top.y, 0.35) },
          up: { x: lerp(h.up.x, up.x, 0.3), y: lerp(h.up.y, up.y, 0.3) },
        }
        : target;
      this.headSeen = now;
    }
  }

  setGame({ phase, lives, streak, reveal = null }) {
    if (phase === 'question' || phase === 'reveal') {
      if (lives < this.prevLives) this.breakHeart(lives);
    }
    this.prevLives = lives;
    if (reveal && reveal !== this.game.reveal) reveal.t0 = performance.now();
    this.game = { phase, lives, streak, reveal };
  }

  setHold(gesture, p) {
    this.hold = { gesture, p };
  }

  event(type) {
    const now = performance.now();
    if (type === 'correct') {
      this.events.push({ type: 'crown', t0: now });
      this.burst(this.headAnchor(0.15), 90, CONFETTI, 'confetti');
    } else if (type === 'wrong') {
      this.events.push({ type: 'cloud', t0: now });
    } else if (type === 'fire') {
      const tip = this.hand?.[4];
      if (tip) this.burst(tip, 30, this.hold.gesture === 'down' ? [COLORS.b, COLORS.gold] : [COLORS.a, COLORS.gold], 'spark');
    }
  }

  // ------------------------------------------------------------ geometrie

  // Punct deasupra crestetului (k = cat de sus, in latimi de cap). Fara fata: sus, pe centru.
  headAnchor(k = 0) {
    const h = this.visibleHead();
    if (!h) return { x: innerWidth / 2, y: innerHeight * 0.32, w: Math.min(innerWidth, innerHeight) * 0.25, up: { x: 0, y: -1 } };
    return { x: h.top.x + h.up.x * h.w * k, y: h.top.y + h.up.y * h.w * k, w: h.w, up: h.up };
  }

  visibleHead() {
    return this.head && performance.now() - this.headSeen < 600 ? this.head : null;
  }

  visibleHand() {
    return this.hand && performance.now() - this.handSeen < 300 ? this.hand : null;
  }

  // ------------------------------------------------------------ particule

  burst(at, n, colors, kind) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'confetti' ? 250 + Math.random() * 450 : 120 + Math.random() * 260;
      this.particles.push({
        kind, x: at.x, y: at.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'confetti' ? 380 : 60),
        life: 0, max: kind === 'confetti' ? 1.6 + Math.random() * 0.6 : 0.5 + Math.random() * 0.3,
        size: kind === 'confetti' ? 6 + Math.random() * 6 : 3 + Math.random() * 3,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        color: colors[i % colors.length],
      });
    }
  }

  breakHeart(lostIndex) {
    const h = this.visibleHead();
    const at = h ? this.orbitPos(lostIndex, performance.now() / 1000).p : { x: innerWidth / 2, y: innerHeight * 0.3 };
    this.particles.push({ kind: 'heart', x: at.x, y: at.y, vx: (Math.random() - 0.5) * 80, vy: -120, life: 0, max: 1.4, size: 22, rot: 0, vr: (Math.random() - 0.5) * 3, color: COLORS.lose });
  }

  // ------------------------------------------------------------ desen

  frame(now) {
    // timpul nu are voie sa curga inapoi (altfel particulele cresc si se misca invers)
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = Math.max(this.last, now);
    const { canvas, ctx } = this;
    const W = innerWidth, H = innerHeight, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t = now / 1000;
    const inGame = this.game.phase === 'question' || this.game.phase === 'reveal';

    if (inGame && this.game.streak >= 3) this.fireAura(dt);
    if (inGame) this.hearts(t, 'back');
    this.drawEvents(now, dt);
    if (inGame) this.hearts(t, 'front');
    this.palmBars(now);
    this.thumbRing();
    this.drawParticles(dt);
  }

  // Inimile se rotesc in jurul capului; cele din spate sunt mai mici si mai estompate (adancime)
  orbitPos(i, t) {
    const h = this.visibleHead();
    const a = t * 1.3 + (i * Math.PI * 2) / MAX_LIVES;
    const c = { x: h.top.x - h.up.x * h.w * 0.15, y: h.top.y - h.up.y * h.w * 0.15 };
    const side = { x: -h.up.y, y: h.up.x };   // perpendicular pe "sus"
    const rx = h.w * 0.85, ry = h.w * 0.22;
    return {
      p: { x: c.x + side.x * Math.cos(a) * rx + h.up.x * Math.sin(a) * ry, y: c.y + side.y * Math.cos(a) * rx + h.up.y * Math.sin(a) * ry },
      depth: Math.sin(a),   // > 0 in fata
    };
  }

  hearts(t, layer) {
    const h = this.visibleHead();
    if (!h) return;
    const { ctx } = this;
    for (let i = 0; i < this.game.lives; i++) {
      const { p, depth } = this.orbitPos(i, t);
      if ((layer === 'front') !== (depth >= 0)) continue;
      const s = h.w * (0.11 + 0.04 * depth);
      ctx.globalAlpha = 0.55 + 0.45 * (depth + 1) / 2;
      heartPath(ctx, p.x, p.y, s);
      const g = ctx.createRadialGradient(p.x - s * 0.3, p.y - s * 0.4, s * 0.1, p.x, p.y, s);
      g.addColorStop(0, '#ff9aa6');
      g.addColorStop(1, '#e0263d');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawEvents(now, dt) {
    this.events = this.events.filter((e) => now - e.t0 < (e.type === 'crown' ? 2600 : 2800));
    for (const e of this.events) {
      const age = (now - e.t0) / 1000;
      const fade = Math.min(1, ((e.type === 'crown' ? 2.6 : 2.8) - age) / 0.4);
      if (e.type === 'crown') this.crown(age, fade);
      else this.cloud(age, fade, dt);
    }
  }

  crown(age, fade) {
    const a = this.headAnchor(0.05);
    const { ctx } = this;
    const pop = age < 0.3 ? easeOut(age / 0.3) * 1.15 : 1 + 0.15 * Math.max(0, 1 - (age - 0.3) / 0.2);
    const w = a.w * 0.75 * Math.min(pop, 1.15), h = w * 0.55;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(a.up.x, -a.up.y));
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h * 0.55);
    ctx.lineTo(-w / 4, -h * 0.2);
    ctx.lineTo(0, -h);
    ctx.lineTo(w / 4, -h * 0.2);
    ctx.lineTo(w / 2, -h * 0.55);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.5, COLORS.gold);
    g.addColorStop(1, '#b8860b');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(245, 197, 66, 0.9)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7a5a00';
    ctx.stroke();
    // pietre
    [[-w / 4, -h * 0.12, '#ff5c6c'], [0, -h * 0.18, '#5b8cff'], [w / 4, -h * 0.12, '#2fd27a']].forEach(([x, y, c]) => {
      ctx.beginPath();
      ctx.arc(x, y, w * 0.055, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });
    ctx.restore();
    if (Math.random() < 0.3) this.burst({ x: a.x + (Math.random() - 0.5) * w, y: a.y - Math.random() * h }, 1, ['#fff3b0', COLORS.gold], 'spark');
  }

  cloud(age, fade, dt) {
    const a = this.headAnchor(0.55);
    const { ctx } = this;
    const w = a.w * 1.1;
    const drift = Math.sin(age * 2) * w * 0.04;
    ctx.save();
    ctx.globalAlpha = fade * Math.min(1, age / 0.25);
    const cx = a.x + drift, cy = a.y;
    const blobs = [[-0.32, 0.05, 0.22], [-0.1, -0.08, 0.28], [0.17, -0.04, 0.25], [0.36, 0.06, 0.18], [0, 0.1, 0.25]];
    ctx.fillStyle = age < 0.15 ? '#ffffff' : '#7d8597';   // fulger scurt la inceput
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 12;
    for (const [dx, dy, r] of blobs) {
      ctx.beginPath();
      ctx.arc(cx + dx * w, cy + dy * w, r * w, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // ploaie
    if (age < 2.4) {
      const n = Math.round(60 * dt * 6);
      for (let i = 0; i < n; i++) {
        this.particles.push({ kind: 'rain', x: cx + (Math.random() - 0.5) * w * 0.8, y: cy + w * 0.2, vx: 0, vy: 520 + Math.random() * 200, life: 0, max: 0.6, size: 2, rot: 0, vr: 0, color: '#9fc3ff' });
      }
    }
  }

  // Aura de foc in jurul capului, mai intensa cu cat seria e mai lunga
  fireAura(dt) {
    const h = this.visibleHead();
    if (!h) return;
    const rate = 40 + 25 * Math.min(8, this.game.streak);
    const n = Math.round(rate * dt);
    const side = { x: -h.up.y, y: h.up.x };
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.05 + Math.random() * 0.9);   // jumatatea de sus a conturului
      const r = { x: Math.cos(a) * h.w * 0.62, y: Math.sin(a) * h.h * 0.62 };
      const x = h.x + side.x * r.x + h.up.x * r.y;
      const y = h.y + side.y * r.x + h.up.y * r.y;
      this.particles.push({ kind: 'flame', x, y, vx: h.up.x * 90 + (Math.random() - 0.5) * 30, vy: h.up.y * 90 + (Math.random() - 0.5) * 30, life: 0, max: 0.5 + Math.random() * 0.4, size: h.w * (0.05 + Math.random() * 0.05), rot: 0, vr: 0, color: '' });
    }
  }

  // Inel de progres pe varful degetului mare, cat tii gestul
  thumbRing() {
    const hand = this.visibleHand();
    if (!hand || !this.hold.gesture || this.hold.p <= 0.02) return;
    const tip = hand[4];
    const s = dist(hand[0], hand[9]) || 80;
    const r = Math.max(18, s * 0.35);
    const { ctx } = this;
    const color = this.hold.gesture === 'up' ? COLORS.a : COLORS.b;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.hold.p));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = `800 ${Math.round(r * 0.9)}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.hold.gesture === 'up' ? 'A' : 'B', tip.x, tip.y - r - r * 0.7);
  }

  // Dupa raspuns: doua coloane 3D (CTR A, CTR B) cresc din palma si urmaresc mana
  palmBars(now) {
    const rv = this.game.phase === 'reveal' ? this.game.reveal : null;
    const hand = this.visibleHand();
    if (!rv || !hand) return;
    const { ctx } = this;
    const ids = [0, 5, 9, 13, 17];
    const palm = { x: ids.reduce((s, i) => s + hand[i].x, 0) / 5, y: ids.reduce((s, i) => s + hand[i].y, 0) / 5 };
    const s = Math.max(50, dist(hand[0], hand[9]));
    const grow = easeOut((now - (rv.t0 ?? now)) / 900);
    const max = Math.max(rv.ctrA, rv.ctrB) || 1;
    const bw = s * 0.42, gap = s * 0.22, depth = bw * 0.45, maxH = s * 2.3;
    const base = { x: palm.x - bw - gap / 2, y: palm.y - s * 0.25 };
    [['A', rv.ctrA, COLORS.a], ['B', rv.ctrB, COLORS.b]].forEach(([side, ctr, color], i) => {
      const x = base.x + i * (bw + gap);
      const h = maxH * (ctr / max) * grow;
      const y = base.y - h;
      const win = rv.verdict === side;
      // fata, lateral (mai inchis), capac (mai deschis) -> efect 3D
      ctx.fillStyle = color;
      ctx.fillRect(x, y, bw, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + bw, y); ctx.lineTo(x + bw + depth, y - depth * 0.6); ctx.lineTo(x + bw + depth, base.y - depth * 0.6); ctx.lineTo(x + bw, base.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + depth, y - depth * 0.6); ctx.lineTo(x + bw + depth, y - depth * 0.6); ctx.lineTo(x + bw, y);
      ctx.closePath();
      ctx.fill();
      if (win) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.win;
        ctx.shadowColor = COLORS.win;
        ctx.shadowBlur = 16;
        ctx.strokeRect(x, y, bw, h);
        ctx.shadowBlur = 0;
      }
      ctx.font = `800 ${Math.round(s * 0.24)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = win ? COLORS.win : COLORS.text;
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(`${side} ${(ctr * 100).toFixed(2).replace('.', ',')}%`, x + bw / 2 + depth / 2, y - depth * 0.6 - 6);
      ctx.shadowBlur = 0;
    });
  }

  drawParticles(dt) {
    const { ctx } = this;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      if (p.kind === 'confetti' || p.kind === 'heart') p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'confetti') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'rain') {
        ctx.globalAlpha = 0.8 * k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + 14);
        ctx.stroke();
      } else if (p.kind === 'flame') {
        ctx.globalCompositeOperation = 'lighter';
        const r = p.size * (0.4 + k);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255, 240, 160, ${0.9 * k})`);
        g.addColorStop(0.4, `rgba(255, 140, 30, ${0.7 * k})`);
        g.addColorStop(1, 'rgba(255, 40, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'heart') {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        heartPath(ctx, 0, 0, p.size);
        ctx.fillStyle = p.color;
        ctx.fill();
        // inima "rupta": o linie in zigzag
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -p.size * 0.45); ctx.lineTo(-p.size * 0.12, -p.size * 0.15); ctx.lineTo(p.size * 0.1, 0); ctx.lineTo(0, p.size * 0.3);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
}
