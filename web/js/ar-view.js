// Interfata AR: aceeasi logica si aceleasi ecrane de meniu / final ca UI,
// dar intrebarea si rezultatul apar pe marker, in 3D. Overlay-ul HTML pastreaza
// HUD-ul, butoanele si explicatia statistica.

import { UI, explain, ctrChart, diffChart, outcomeTitle, answerNote, calibControls } from './ui.js';
import { HandPointer } from './hand-pointer.js';
import { VirtualKeyboard } from './vkeyboard.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SCALE_KEY = 'mmm.ar.scale';
const COLLAPSE_KEY = 'mmm.ar.collapsed';
const MIRROR_KEY = 'mmm.ar.mirror';

// Gestul "inclina markerul si tine"
const TILT_PICK = 22;      // grade: peste atat, alegi partea spre care e inclinat
const TILT_NEUTRAL = 10;   // grade: sub atat, markerul e considerat drept
const HOLD_MS = 800;       // cat trebuie tinut inclinat ca sa alegi
const CALIB_MAX = 40;      // Calibrare: inclinarea care inseamna 100% sigur
const CALIB_HOLD_MS = 1500;
const CALIB_STEADY = 5;    // grade de tremur permise cat tii nemiscat
const SCALES = [0.5, 0.6, 0.7, 0.85, 1, 1.2];

function loadScale() {
  try { const v = Number(localStorage.getItem(SCALE_KEY)); return SCALES.includes(v) ? v : 0.6; } catch { return 0.6; }
}

function saveScale(v) {
  try { localStorage.setItem(SCALE_KEY, String(v)); } catch { /* storage blocat */ }
}

export class ARView extends UI {
  constructor(root, data, scene) {
    super(root, data);
    this.scene = scene;
    this.markerVisible = false;
    this.scene.setScale(loadScale());
    this.scene.onMarkerChange = (visible) => {
      this.markerVisible = visible;
      this.root.classList.toggle('marker-lost', !visible);
    };
    this.root.classList.add('marker-lost');
    try { this.collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { this.collapsed = false; }

    let mirror = true;
    try { mirror = localStorage.getItem(MIRROR_KEY) !== '0'; } catch { /* implicit in oglinda */ }
    this.setMirror(mirror);

    // click / tap direct pe obiectele 3D din imaginea camerei
    const canvas = scene.marker.sceneEl.canvas;
    canvas.addEventListener('click', (e) => this.onScenePick(scene.pick(e.clientX, e.clientY)));
    canvas.addEventListener('pointermove', (e) => {
      canvas.style.cursor = this.game && scene.pick(e.clientX, e.clientY) ? 'pointer' : '';
    });

    // mana ca mouse + tastatura pe ecran pentru campurile de text
    this.hand = new HandPointer(this);
    this.vk = new VirtualKeyboard(() => this.hand.enabled);

    this.hold = null;
    this.needNeutral = true;
    const loop = (now) => {
      this.gestureTick(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setMirror(mirror) {
    this.mirror = mirror;
    document.body.classList.toggle('mirror', mirror);
    this.scene.setMirror(mirror);
    try { localStorage.setItem(MIRROR_KEY, mirror ? '1' : '0'); } catch { /* storage blocat */ }
    const btn = this.root.querySelector('[data-action="toggle-mirror"]');
    if (btn) btn.textContent = `Oglindă: ${mirror ? 'pornită' : 'oprită'}`;
  }

  // ------------------------------------------------------------ mana ca mouse

  // Ce se afla sub cursorul mainii: element din overlay, tasta 3D sau panou 3D
  pointerTarget(x, y) {
    const el = document.elementFromPoint(x, y);
    const dom = el?.closest?.('[data-vk], button:not([disabled]), a[href], input:not([disabled]), [data-action], [data-hm]');
    if (dom && !dom.disabled) {
      const kind = dom.tagName === 'INPUT' && dom.type === 'range' ? 'range' : 'dom';
      return { kind, key: dom, el: dom };
    }
    if (this.game) {
      const target = this.scene.pick(x, y);
      if (target) return { kind: 'scene', key: `scene:${target}`, target };
    }
    return null;
  }

  activatePointer(t) {
    if (t.kind === 'dom') {
      if (t.el.tagName === 'INPUT') t.el.focus();
      else t.el.click();
    } else if (t.kind === 'scene') {
      this.onScenePick(t.target);
    }
  }

  setRangeFromX(el, x) {
    const r = el.getBoundingClientRect();
    const v = Math.round(Math.min(1, Math.max(0, (x - r.left) / r.width)) * 20) * 5;
    if (Number(el.value) !== v) {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  // Ecranele lungi (final, clasament) se deruleaza tinand degetul langa marginea de sus / jos
  edgeScroll(y) {
    const box = this.root;
    if (!box.classList.contains('solid') || box.scrollHeight <= box.clientHeight) return;
    if (y > innerHeight * 0.9) box.scrollTop += 14;
    else if (y < innerHeight * 0.1) box.scrollTop -= 14;
  }

  onScenePick(target) {
    const g = this.game;
    if (!g || !target) return;
    if (g.state === 'question' && (target === 'A' || target === 'B' || target === 'N')) this.choose(target);
    else if (g.state === 'reveal' && !g.mode.seconds) this.next();
  }

  // ------------------------------------------------------------ gest: inclina si tine

  gestureTick(now) {
    const g = this.game;
    const tilt = g && (g.state === 'question' || g.state === 'reveal') ? this.scene.getTilt() : null;
    if (tilt == null) {
      this.hold = null;
      this.scene.setProgress(null);
      this.setHoldBar(0);
      return;
    }
    // dupa fiecare alegere, markerul trebuie adus drept inainte de urmatorul gest
    if (this.needNeutral) {
      if (Math.abs(tilt) < TILT_NEUTRAL) this.needNeutral = false;
      this.hold = null;
      this.scene.setProgress(null);
      this.setHoldBar(0);
      return;
    }

    if (g.state === 'question' && g.mode.calibration) {
      this.calibTick(now, tilt);
      return;
    }
    if (g.state === 'reveal' && g.mode.seconds) return;   // contra timp trece singur mai departe

    const side = tilt <= -TILT_PICK ? 'A' : tilt >= TILT_PICK ? 'B' : null;
    if (!side) {
      this.hold = null;
      this.scene.setProgress(null);
      return;
    }
    if (this.hold?.side !== side) this.hold = { side, t0: now };
    const p = (now - this.hold.t0) / HOLD_MS;
    this.scene.setProgress(g.state === 'question' ? side : 'next', p);
    if (p >= 1) {
      this.hold = null;
      this.needNeutral = true;
      if (g.state === 'question') this.choose(side);
      else this.next();
    }
  }

  // Calibrare: unghiul muta sliderul; tinut nemiscat (si nu pe 50/50) trimite raspunsul
  calibTick(now, tilt) {
    const el = this.root.querySelector('#conf');
    if (!el) return;
    const pB = Math.min(1, Math.max(0, 0.5 + tilt / (2 * CALIB_MAX)));
    const v = Math.round(pB * 20) * 5;
    if (Number(el.value) !== v) {
      el.value = String(v);
      this.updateConf();
    }
    if (!this.hold || Math.abs(tilt - this.hold.tilt) > CALIB_STEADY) this.hold = { tilt, t0: now };
    const p = Math.abs(v - 50) >= 10 ? (now - this.hold.t0) / CALIB_HOLD_MS : 0;
    this.setHoldBar(p);
    if (p >= 1) {
      this.hold = null;
      this.needNeutral = true;
      this.submitProb();
    }
  }

  setHoldBar(p) {
    const bar = this.root.querySelector('#hold-bar');
    if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  }

  setSolid(solid) {
    this.root.classList.toggle('solid', solid);
    this.scene.setVisible(!solid);
  }

  act(action, arg) {
    if (action === 'toggle-explain') this.toggleExplain();
    else if (action === 'toggle-mirror') this.setMirror(!this.mirror);
    else super.act(action, arg);
  }

  // Panoul cu explicatia poate acoperi scena 3D — se poate restrange
  toggleExplain() {
    this.collapsed = !this.collapsed;
    try { localStorage.setItem(COLLAPSE_KEY, this.collapsed ? '1' : '0'); } catch { /* storage blocat */ }
    const aside = this.root.querySelector('.ar-explain');
    if (aside) {
      aside.classList.toggle('collapsed', this.collapsed);
      aside.querySelector('[data-action="toggle-explain"]').textContent = this.collapsed ? 'Detalii' : 'Ascunde';
    }
  }

  onKey(e) {
    super.onKey(e);
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target?.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key.toLowerCase() === 'm') this.setMirror(!this.mirror);
    if (e.key.toLowerCase() === 'h') this.hand.toggle();
    if (e.key.toLowerCase() === 'd' && this.game?.state === 'reveal') this.toggleExplain();
    if (e.key === '+' || e.key === '=' || e.key === '-') {
      const i = SCALES.indexOf(this.scene.scale);
      const next = SCALES[Math.min(SCALES.length - 1, Math.max(0, i + (e.key === '-' ? -1 : 1)))];
      this.scene.setScale(next);
      saveScale(next);
    }
  }

  // ------------------------------------------------------------ ecrane complete (reutilizate)

  showMenu() {
    super.showMenu();
    this.setSolid(true);
  }

  renderGameOver() {
    super.renderGameOver();
    this.setSolid(true);
  }

  showLeaderboard() {
    super.showLeaderboard();
    this.setSolid(true);
  }

  showStudio() {
    this.setSolid(false);
    this.scene.setVisible(false);
    super.showStudio();
  }

  menuFooter() {
    return `
      <div class="ar-help">
        <p><b>Cum joci în AR:</b> afișează markerul Hiro pe telefon (luminozitate maximă) sau printează-l
          (min. 8 cm) și ține-l în fața camerei laptopului. Titlurile apar lângă marker.</p>
        <p><b>Controlezi cu mâna:</b> arată cu degetul arătător spre un buton, un titlu 3D sau o literă și
          ține-l acolo o secundă (sau ciupește: degetul mare atinge arătătorul). Pentru paginile lungi, ține degetul
          la marginea de jos sau de sus a ecranului. Tastatura și mouse-ul merg în continuare.</p>
        <p><b>Sau cu markerul:</b> înclină-l spre titlul ales și ține-l așa o clipă. La Calibrare, cât de tare îl înclini = cât de sigur ești.</p>
        <p><a href="markers/hiro.png" target="_blank" rel="noopener">Deschide markerul Hiro</a>
          · <button class="linklike" data-action="studio">🎨 Desenează în 3D (3 min)</button>
          · <button class="linklike" data-action="toggle-mirror">Oglindă: ${this.mirror ? 'pornită' : 'oprită'}</button> <kbd>M</kbd>
          · control cu mâna <kbd>H</kbd>
          · <kbd>+</kbd>/<kbd>−</kbd> mărește / micșorează scena
          · <button class="linklike" data-action="leaderboard">Clasament</button>
          · <a href="index.html">Versiunea fără cameră</a></p>
      </div>`;
  }

  // ------------------------------------------------------------ joc

  fallbackCards(pair, res) {
    // Vizibile doar cand markerul nu e detectat, ca jocul sa poata continua
    const card = (side, entry) => `
      <div class="ar-fb-card side-${side.toLowerCase()}">
        <span class="side">${side}</span>
        <p>${esc(entry.headline)}</p>
      </div>`;
    return `
      <div class="ar-fallback">
        ${card('A', pair.a)}${card('B', pair.b)}
        ${res ? `<figure class="ar-fb-chart">${ctrChart(pair)}</figure>` : ''}
      </div>`;
  }

  renderQuestion() {
    const g = this.game;
    const p = g.current;
    this.setSolid(false);
    const banner = g.mode.calibration ? 'Cât de sigur ești?' : g.mode.noiseAnswer ? 'A, B sau zgomot?' : 'Care titlu a avut CTR mai mare?';
    this.scene.showQuestion(p, banner, { noise: g.mode.noiseAnswer });
    this.hold = null;
    this.needNeutral = true;

    const pick = (side) => side === 'A'
      ? `<button class="ar-pick side-a" data-action="choose" data-arg="A"><span class="side">A</span> <kbd>←</kbd></button>`
      : `<button class="ar-pick side-b" data-action="choose" data-arg="B"><kbd>→</kbd> <span class="side">B</span></button>`;
    let controls;
    if (g.mode.calibration) {
      controls = `
        <div class="ar-calib">
          ${calibControls()}
          <p class="ar-gesture muted small">Înclină markerul: stânga = A sigur, dreapta = B sigur. Ține nemișcat ca să trimiți.</p>
          <div class="hold"><i id="hold-bar"></i></div>
        </div>`;
    } else if (g.mode.noiseAnswer) {
      controls = `
        <div class="ar-controls">
          ${pick('A')}
          <button class="noise-btn" data-action="choose" data-arg="N"><b>Zgomot</b> <kbd>↓</kbd></button>
          ${pick('B')}
        </div>`;
    } else {
      controls = `
        <div class="ar-controls">
          ${pick('A')}
          <span class="ar-q">Înclină markerul spre titlul ales și ține — sau click pe el</span>
          ${pick('B')}
        </div>`;
    }

    this.root.innerHTML = `
      <section class="ar-play">
        ${this.hud()}
        <p class="ar-marker-hint">Arată markerul Hiro la cameră <span class="muted">— sau citește titlurile de mai jos</span></p>
        ${this.fallbackCards(p)}
        ${controls}
      </section>`;
  }

  renderReveal(res) {
    const g = this.game;
    const { pair, outcome } = res;
    const title = outcomeTitle(res);
    this.scene.showReveal(res, { title: title.text });
    this.hold = null;
    this.needNeutral = true;
    this.root.innerHTML = `
      <section class="ar-play">
        ${this.hud()}
        ${this.fallbackCards(pair, res)}
        <aside class="ar-explain ${this.collapsed ? 'collapsed' : ''}">
          <div class="ar-explain-head">
            <p class="flash ${outcome}">${title.html}</p>
            <button class="ar-toggle" data-action="toggle-explain" title="Tasta D">${this.collapsed ? 'Detalii' : 'Ascunde'}</button>
          </div>
          <figure>
            <figcaption>Diferența B − A (puncte procentuale)</figcaption>
            ${diffChart(pair)}
          </figure>
          <div class="verdict">${answerNote(res)}${explain(pair)}</div>
          <p class="ar-gesture muted small">Următorul: înclină markerul și ține, sau click pe banner.</p>
          <button class="btn primary" data-action="next">${g.over ? 'Vezi rezultatul' : 'Următorul'} <kbd>Enter</kbd></button>
        </aside>
      </section>`;
    this.root.querySelector('[data-action="next"]').focus({ preventScroll: true });
  }

  renderFlash(res) {
    const g = this.game;
    const title = outcomeTitle(res);
    this.scene.showReveal(res, { title: title.text, fast: true });
    this.root.innerHTML = `
      <section class="ar-play">
        ${this.hud()}
        ${this.fallbackCards(res.pair, res)}
        <p class="ar-flash flash ${res.outcome}">${title.html}</p>
      </section>`;
    this.autoTimer = setTimeout(() => {
      if (this.game === g && g.state === 'reveal') this.next();
    }, res.outcome === 'correct' ? 1100 : 1800);
  }
}
