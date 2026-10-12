// Scena 3D de pe marker: doua panouri cu titluri, banner si coloanele CTR cu intervale de incredere.
//
// Totul sta intr-un container rotit -90° pe X, deci "intins" in planul markerului:
//  - marker tinut vertical in fata camerei laptopului -> continutul sta in fata utilizatorului
//  - marker pe masa, telefon deasupra                  -> continutul sta pe masa
// In container: X = dreapta, Y = sus (spre marginea de sus a markerului), Z = spre camera.
// 1 unitate = latura markerului.

import * as S from './stats.js';

const THREE = window.AFRAME.THREE;

const C = {
  a: '#5b8cff', b: '#ff9f43', win: '#2fd27a', lose: '#ff5c6c', noise: '#f5c542',
  panel: 'rgba(23, 27, 46, 0.93)', line: '#2c3254', text: '#eceef8', muted: '#9198b5', ink: '#0e1120',
};
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const CHART_H = 1.5;   // inaltimea maxima a coloanelor (unitati marker)

// ------------------------------------------------------------ canvas -> textura

class CanvasPlane {
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
function fitText(ctx, text, maxW, maxH, { max = 64, min = 26, weight = 650, lh = 1.22 } = {}) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrapLines(ctx, text, maxW);
    if (lines.length * size * lh <= maxH) return { size, lines, lh };
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return { size: min, lines: wrapLines(ctx, text, maxW), lh };
}

function roundRect(ctx, x, y, w, h, r) {
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

  roundRect(ctx, 44, 40, 84, 84, 18);
  ctx.fillStyle = sideColor;
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `800 58px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.side, 86, 84);

  if (o.chosen) {
    ctx.textAlign = 'right';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = C.muted;
    ctx.fillText('ALEGEREA TA', W - 50, 84);
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

function drawBanner(ctx, W, H, text, color) {
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

    this.root.add(this.panels.A.mesh, this.panels.B.mesh, this.banner.mesh, this.buildChart());

    // A-Frame: atasam grupul three.js la entitatea markerului
    markerEl.setObject3D('game', this.root);
    this.setScale(1);

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
    this.root.scale.setScalar(s);
  }

  showQuestion(pair, question = 'Care titlu a avut CTR mai mare?') {
    this.tweenId++;
    for (const side of ['A', 'B']) {
      const entry = side === 'A' ? pair.a : pair.b;
      this.panels[side].draw((ctx, W, H) => drawPanel(ctx, W, H, { side, headline: entry.headline, state: 'question' }));
    }
    this.banner.draw((ctx, W, H) => drawBanner(ctx, W, H, question, C.text));
    this.chart.visible = false;
    this.setVisible(true);
  }

  showReveal({ pair, choice, outcome }, { title, fast = false } = {}) {
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
      const t = Math.min(1, (now - t0) / duration);
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
