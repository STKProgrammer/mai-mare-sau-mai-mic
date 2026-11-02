// Scena 3D de pe marker: doua panouri cu titluri, banner si coloanele CTR cu intervale de incredere.
//
// Totul sta intr-un container rotit -90° pe X, deci "intins" in planul markerului:
//  - marker tinut vertical in fata camerei laptopului -> continutul sta in fata utilizatorului
//  - marker pe masa, telefon deasupra                  -> continutul sta pe masa
// In container: X = dreapta, Y = sus (spre marginea de sus a markerului), Z = spre camera.
// 1 unitate = latura markerului.

import * as S from './stats.js';

const THREE = window.AFRAME.THREE;

export const C = {
  a: '#5b8cff', b: '#ff9f43', win: '#2fd27a', lose: '#ff5c6c', noise: '#f5c542',
  panel: 'rgba(23, 27, 46, 0.93)', line: '#2c3254', text: '#eceef8', muted: '#9198b5', ink: '#0e1120',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CHART_H = 1.5;   // inaltimea maxima a coloanelor (unitati marker)

// ------------------------------------------------------------ canvas -> textura

export class CanvasPlane {
  constructor(width, height, px = 1024) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.round((px * height) / width);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    if (THREE.SRGBColorSpace) this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false }),
    );
  }

  draw(fn) {
    const { ctx, canvas } = this;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fn(ctx, canvas.width, canvas.height);
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

function wrapLines(ctx, text, maxW) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Cel mai mare font la care textul incape in cutie
export function fitText(ctx, text, maxW, maxH, { max = 64, min = 26, weight = 650, lh = 1.22 } = {}) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrapLines(ctx, text, maxW);
    if (lines.length * size * lh <= maxH) return { size, lines, lh };
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return { size: min, lines: wrapLines(ctx, text, maxW), lh };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawPanel(ctx, W, H, o) {
  const sideColor = o.side === 'A' ? C.a : C.b;
  const border = { question: sideColor, win: C.win, lose: C.line, neutral: C.noise }[o.state];
  if (o.state === 'lose') ctx.globalAlpha = 0.6;

  roundRect(ctx, 6, 6, W - 12, H - 12, 40);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.lineWidth = 12;
  ctx.strokeStyle = border;
  ctx.stroke();

  const thumbIcon = o.side === 'A' ? '👍' : '👎';
  const gestureHint = o.side === 'A' ? '👍 sus / 👈 stânga / 😉 ochi stâng' : '👎 jos / 👉 dreapta / 😉 ochi drept';

  // Badge cu degetul mare si litera
  roundRect(ctx, 44, 34, 150, 84, 20);
  ctx.fillStyle = sideColor;
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `800 48px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${thumbIcon} ${o.side}`, 119, 76);

  // Indiciu gest AR
  ctx.textAlign = 'left';
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(gestureHint, 214, 76);

  if (o.chosen) {
    ctx.textAlign = 'right';
    ctx.font = `700 28px ${FONT}`;
    ctx.fillStyle = C.win;
    ctx.fillText('✓ ALEGEREA TA', W - 50, 76);
  }

  const reveal = o.ctr != null;
  const top = 150, bottom = reveal ? H - 140 : H - 50;
  const { size, lines, lh } = fitText(ctx, o.headline, W - 100, bottom - top);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C.text;
  lines.forEach((ln, i) => ctx.fillText(ln, 50, top + i * size * lh));

  if (reveal) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = `800 80px ${FONT}`;
    ctx.fillStyle = o.state === 'win' ? C.win : C.text;
    const ctrText = S.pct(o.ctr, 2);
    ctx.fillText(ctrText, 50, H - 50);
    const w = ctx.measureText(ctrText).width;
    ctx.font = `400 30px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText(`${S.int(o.clicks)} click-uri / ${S.int(o.impressions)} afișări`, 50 + w + 24, H - 56);
  }
}

export function drawBanner(ctx, W, H, text, color) {
  roundRect(ctx, 4, 4, W - 8, H - 8, (H - 8) / 2);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color;
  ctx.stroke();
  const { size } = fitText(ctx, text, W - 80, H - 30, { max: 70, min: 30, weight: 800 });
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 2);
}

function drawLabel(ctx, W, H, text, color) {
  ctx.font = `800 ${Math.round(H * 0.62)}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 12;
  ctx.fillText(text, W / 2, H / 2);
}

// Bara care creste de la stanga la dreapta (scale.x = latimea curenta)
function makeBar(color, width, x, y) {
  const geo = new THREE.PlaneGeometry(1, 0.07);
  geo.translate(0.5, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }));
  mesh.position.set(x, y, 0.02);
  mesh.scale.x = 0.0001;
  mesh.visible = false;
  return { mesh, width };
}

// Primul obiect lovit de raza care pleaca din camera prin punctul (clientX, clientY) de pe ecran
const raycaster = new THREE.Raycaster();
export function raycastAt(sceneEl, mirror, clientX, clientY, meshes) {
  const { canvas, camera } = sceneEl;
  const r = canvas.getBoundingClientRect();
  let x = ((clientX - r.left) / r.width) * 2 - 1;
  const y = -((clientY - r.top) / r.height) * 2 + 1;
  if (mirror) x = -x;   // canvasul e intors din CSS
  // AR.js scrie direct projectionMatrix, fara sa actualizeze inversa folosita de Raycaster
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  raycaster.setFromCamera({ x, y }, camera);
  return raycaster.intersectObjects(meshes, false)[0] ?? null;
}

// ------------------------------------------------------------ animatie

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ------------------------------------------------------------ scena

export class ARScene {
  constructor(markerEl) {
    this.marker = markerEl;
    this.tweenId = 0;

    this.root = new THREE.Group();
    this.root.rotation.x = -Math.PI / 2;

    // panouri cu titluri, stanga / dreapta markerului
    this.panels = {
      A: new CanvasPlane(2.3, 1.35),
      B: new CanvasPlane(2.3, 1.35),
    };
    this.panels.A.mesh.position.set(-1.75, 0.3, 0);
    this.panels.B.mesh.position.set(1.75, 0.3, 0);

    // banner sub marker
    this.banner = new CanvasPlane(3.0, 0.44, 1024);
    this.banner.mesh.position.set(0, -1.05, 0);

    // buton 3D "Zgomot" (doar in modul Pro), sub banner
    this.noiseBtn = new CanvasPlane(1.5, 0.34, 512);
    this.noiseBtn.mesh.position.set(0, -1.52, 0);
    this.noiseBtn.draw((ctx, W, H) => drawBanner(ctx, W, H, 'ZGOMOT', C.noise));
    this.noiseBtn.mesh.visible = false;

    // bare de progres pentru gestul "inclina si tine": sub panouri si sub banner
    this.bars = {
      A: makeBar(C.a, 2.3, -1.75 - 1.15, 0.3 - 0.75),
      B: makeBar(C.b, 2.3, 1.75 - 1.15, 0.3 - 0.75),
      next: makeBar(C.text, 3.0, -1.5, -1.32),
    };

    // Grup particule pentru explozii de confetti 3D la victorie
    this.particleGroup = new THREE.Group();
    this.particleGroup.name = 'ar-particles';

    // Rază holografică de scanare (Laser Scanline)
    const scanGeo = new THREE.PlaneGeometry(5.2, 0.04);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    this.scanline = new THREE.Mesh(scanGeo, scanMat);
    this.scanline.position.set(0, 0, 0.08);
    this.scanline.visible = false;

    this.root.add(
      this.panels.A.mesh, this.panels.B.mesh, this.banner.mesh, this.noiseBtn.mesh,
      this.particleGroup, this.scanline,
      ...Object.values(this.bars).map((b) => b.mesh),
      this.buildChart(),
    );

    // A-Frame: atasam grupul three.js la entitatea markerului
    markerEl.setObject3D('game', this.root);
    this.mirror = false;
    this.setScale(1);

    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();

    markerEl.addEventListener('markerFound', () => this.onMarkerChange?.(true));
    markerEl.addEventListener('markerLost', () => this.onMarkerChange?.(false));
  }

  buildChart() {
    const chart = new THREE.Group();
    chart.position.set(0, -0.62, 0);

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: C.line }));
    base.position.y = -0.02;
    chart.add(base);

    this.cols = {};
    for (const side of ['A', 'B']) {
      const x = side === 'A' ? -0.32 : 0.32;

      // geometria are baza la y=0, deci scalarea pe Y "creste" coloana din placa
      const geo = new THREE.BoxGeometry(0.42, 1, 0.42);
      geo.translate(0, 0.5, 0);
      const col = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: side === 'A' ? C.a : C.b, roughness: 0.45 }));
      col.position.x = x;

      // interval de incredere: bara verticala + doua capete, in fata coloanei
      const ciMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
      const whisker = new THREE.Group();
      const stemGeo = new THREE.BoxGeometry(0.03, 1, 0.03);
      stemGeo.translate(0, 0.5, 0);
      const stem = new THREE.Mesh(stemGeo, ciMat);
      const capLo = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.03), ciMat);
      const capHi = capLo.clone();
      whisker.add(stem, capLo, capHi);
      whisker.position.set(x, 0, 0.24);

      const label = new CanvasPlane(0.6, 0.2, 512);
      label.mesh.position.set(x, 0, 0.3);

      chart.add(col, whisker, label.mesh);
      this.cols[side] = { col, whisker, stem, capLo, capHi, label };
    }
    this.chart = chart;
    return chart;
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  setScale(s) {
    this.scale = s;
    // in oglinda: video-ul si canvasul sunt intoarse din CSS, deci intoarcem si continutul
    // (dubla oglindire = text lizibil, A ramane in stanga utilizatorului)
    this.root.scale.set(this.mirror ? -s : s, s, s);
  }

  setMirror(mirror) {
    this.mirror = mirror;
    this.setScale(this.scale);
  }

  markerVisible() {
    return this.root.visible && this.marker.object3D.visible;
  }

  // Ce obiect 3D e sub cursor: 'A' | 'B' | 'N' | 'banner' | null
  pick(clientX, clientY) {
    if (!this.markerVisible()) return null;
    const targets = [
      [this.panels.A.mesh, 'A'], [this.panels.B.mesh, 'B'],
      [this.noiseBtn.mesh, 'N'], [this.banner.mesh, 'banner'],
    ].filter(([m]) => m.visible);
    const hit = raycastAt(this.marker.sceneEl, this.mirror, clientX, clientY, targets.map(([m]) => m));
    return hit ? targets.find(([m]) => m === hit.object)[1] : null;
  }

  // Inclinarea markerului pe ecran, in grade, asa cum o vede utilizatorul:
  // 0 = drept, > 0 = varful markerului inclinat spre dreapta. null daca markerul nu se vede.
  getTilt() {
    if (!this.markerVisible()) return null;
    const { canvas, camera } = this.marker.sceneEl;
    const obj = this.marker.object3D;
    obj.updateMatrixWorld();
    const o = obj.localToWorld(this.v1.set(0, 0, 0)).project(camera);
    const up = obj.localToWorld(this.v2.set(0, 0, -1)).project(camera);   // -Z = marginea de sus a markerului
    let dx = (up.x - o.x) * canvas.width;
    const dy = (up.y - o.y) * canvas.height;
    if (this.mirror) dx = -dx;
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }

  // target: 'A' | 'B' | 'next' | null, p in [0, 1]
  setProgress(target, p = 0) {
    for (const [key, bar] of Object.entries(this.bars)) {
      const v = key === target ? Math.min(1, p) : 0;
      bar.mesh.visible = v > 0.01;
      bar.mesh.scale.x = Math.max(0.0001, v * bar.width);
    }
    this.setCardHover(target, p);
  }

  setCardHover(target, p = 0) {
    const val = Math.max(0, Math.min(1, p));
    if (this.panels.A?.mesh) {
      this.panels.A.mesh.position.z = target === 'A' ? 0.3 * val : 0;
      this.panels.A.mesh.scale.setScalar(target === 'A' ? 1 + 0.05 * val : 1);
    }
    if (this.panels.B?.mesh) {
      this.panels.B.mesh.position.z = target === 'B' ? 0.3 * val : 0;
      this.panels.B.mesh.scale.setScalar(target === 'B' ? 1 + 0.05 * val : 1);
    }
  }

  triggerScanline() {
    if (!this.scanline) return;
    this.scanline.visible = true;
    const t0 = performance.now();
    const duration = 750;
    const animateScan = (now) => {
      const p = (now - t0) / duration;
      if (p <= 1) {
        this.scanline.position.y = 1.0 - p * 2.2;
        this.scanline.material.opacity = Math.sin(p * Math.PI) * 0.85;
        requestAnimationFrame(animateScan);
      } else {
        this.scanline.visible = false;
      }
    };
    requestAnimationFrame(animateScan);
  }

  burstConfetti(side) {
    if (!this.particleGroup) return;
    const originX = side === 'A' ? -1.75 : side === 'B' ? 1.75 : 0;
    const colors = [0x2fd27a, 0xfbbf24, 0x38bdf8, 0xf43f5e, 0xffffff];

    const particles = [];
    for (let i = 0; i < 48; i++) {
      const geo = Math.random() > 0.5
        ? new THREE.BoxGeometry(0.06, 0.06, 0.06)
        : new THREE.OctahedronGeometry(0.05, 0);
      const color = colors[Math.floor(Math.random() * colors.length)];
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(originX + (Math.random() - 0.5) * 0.8, 0.3 + (Math.random() - 0.5) * 0.4, 0.2);

      const vx = (Math.random() - 0.5) * 2.2;
      const vy = (Math.random() * 1.8) + 1.2;
      const vz = (Math.random() * 1.6) + 0.5;
      const rx = (Math.random() - 0.5) * 12;
      const ry = (Math.random() - 0.5) * 12;

      this.particleGroup.add(p);
      particles.push({ mesh: p, vx, vy, vz, rx, ry, life: 1.0 });
    }

    const t0 = performance.now();
    const duration = 1800;
    const animateParticles = (now) => {
      let alive = false;
      for (const p of particles) {
        p.life -= 0.016;
        if (p.life > 0) {
          alive = true;
          p.mesh.position.x += p.vx * 0.02;
          p.mesh.position.y += p.vy * 0.02 - 0.014;
          p.mesh.position.z += p.vz * 0.02;
          p.mesh.rotation.x += p.rx * 0.03;
          p.mesh.rotation.y += p.ry * 0.03;
          p.mesh.material.opacity = p.life;
        } else {
          p.mesh.visible = false;
        }
      }
      if (alive && (now - t0 < duration)) {
        requestAnimationFrame(animateParticles);
      } else {
        for (const p of particles) {
          this.particleGroup.remove(p.mesh);
          p.mesh.geometry?.dispose?.();
          p.mesh.material?.dispose?.();
        }
      }
    };
    requestAnimationFrame(animateParticles);
  }

  showQuestion(pair, question = 'Care titlu a avut CTR mai mare?', { noise = false } = {}) {
    this.tweenId++;
    this.noiseBtn.mesh.visible = noise;
    this.setProgress(null);
    for (const side of ['A', 'B']) {
      const entry = side === 'A' ? pair.a : pair.b;
      this.panels[side].draw((ctx, W, H) => drawPanel(ctx, W, H, { side, headline: entry.headline, state: 'question' }));
    }
    this.banner.draw((ctx, W, H) => drawBanner(ctx, W, H, question, C.text));
    this.chart.visible = false;
    this.setVisible(true);
    this.triggerScanline();
  }

  showReveal({ pair, choice, outcome }, { title, fast = false } = {}) {
    this.noiseBtn.mesh.visible = false;
    this.setProgress(null);
    for (const side of ['A', 'B']) {
      const entry = side === 'A' ? pair.a : pair.b;
      const state = pair.verdict === 'noise' ? 'neutral' : pair.verdict === side ? 'win' : 'lose';
      this.panels[side].draw((ctx, W, H) => drawPanel(ctx, W, H, {
        side, headline: entry.headline, state, chosen: choice === side,
        ctr: side === 'A' ? pair.ctr_a : pair.ctr_b, clicks: entry.clicks, impressions: entry.impressions,
      }));
    }
    const color = { correct: C.win, wrong: C.lose, noise: C.noise, neutral: C.muted }[outcome];
    this.banner.draw((ctx, W, H) => drawBanner(ctx, W, H, title, color));
    this.animateChart(pair, fast ? 450 : 1000);

    // Explozie confetti 3D AR peste panoul câștigător
    if (pair.verdict === 'A' || pair.verdict === 'B') {
      this.burstConfetti(pair.verdict);
      if (this.panels[pair.verdict]?.mesh) {
        this.panels[pair.verdict].mesh.scale.setScalar(1.06);
      }
    }
  }

  animateChart(pair, duration) {
    const rows = {
      A: { c: pair.a.clicks, n: pair.a.impressions, ctr: pair.ctr_a },
      B: { c: pair.b.clicks, n: pair.b.impressions, ctr: pair.ctr_b },
    };
    for (const r of Object.values(rows)) r.ci = S.wilson(r.c, r.n);
    const max = Math.max(rows.A.ci[1], rows.B.ci[1]) || 0.01;
    const y = (v) => Math.max(0.001, (v / max) * CHART_H);

    for (const side of ['A', 'B']) {
      const { col, whisker, stem, capLo, capHi, label } = this.cols[side];
      const r = rows[side];
      const [lo, hi] = r.ci.map(y);
      stem.position.y = lo;
      stem.scale.y = Math.max(0.001, hi - lo);
      capLo.position.y = lo;
      capHi.position.y = hi;
      whisker.visible = false;
      col.scale.y = 0.001;
      label.mesh.position.y = hi + 0.2;
      label.mesh.visible = false;
      const winner = pair.verdict === side;
      label.draw((ctx, W, H) => drawLabel(ctx, W, H, S.pct(r.ctr, 2), winner ? C.win : C.text));
    }
    this.chart.visible = true;

    const id = ++this.tweenId;
    const t0 = performance.now();
    const step = (now) => {
      if (id !== this.tweenId) return;
      // timestamp-ul rAF poate fi putin inaintea lui t0 -> fara clamp, easeOut(t<0) da coloane negative
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      for (const side of ['A', 'B']) this.cols[side].col.scale.y = y(rows[side].ctr) * easeOut(t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        for (const side of ['A', 'B']) {
          this.cols[side].whisker.visible = true;
          this.cols[side].label.mesh.visible = true;
        }
      }
    };
    requestAnimationFrame(step);
  }
}
