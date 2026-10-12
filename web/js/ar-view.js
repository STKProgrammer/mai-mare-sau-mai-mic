// Interfata AR: aceeasi logica si aceleasi ecrane de meniu / final ca UI,
// dar intrebarea si rezultatul apar pe marker, in 3D. Overlay-ul HTML pastreaza
// HUD-ul, butoanele si explicatia statistica.

import { UI, explain, ctrChart, diffChart, outcomeTitle, answerNote, calibControls } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SCALE_KEY = 'mmm.ar.scale';
const COLLAPSE_KEY = 'mmm.ar.collapsed';
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
  }

  setSolid(solid) {
    this.root.classList.toggle('solid', solid);
    this.scene.setVisible(!solid);
  }

  act(action, arg) {
    if (action === 'toggle-explain') this.toggleExplain();
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

  menuFooter() {
    return `
      <div class="ar-help">
        <p><b>Cum joci în AR:</b> afișează markerul Hiro pe telefon (luminozitate maximă) sau printează-l
          (min. 8 cm) și ține-l în fața camerei laptopului. Titlurile apar lângă marker.</p>
        <p><a href="markers/hiro.png" target="_blank" rel="noopener">Deschide markerul Hiro</a>
          · <kbd>+</kbd>/<kbd>−</kbd> mărește / micșorează scena
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
    this.scene.showQuestion(p, banner);

    const pick = (side) => side === 'A'
      ? `<button class="ar-pick side-a" data-action="choose" data-arg="A"><span class="side">A</span> <kbd>←</kbd></button>`
      : `<button class="ar-pick side-b" data-action="choose" data-arg="B"><kbd>→</kbd> <span class="side">B</span></button>`;
    let controls;
    if (g.mode.calibration) {
      controls = `<div class="ar-calib">${calibControls()}</div>`;
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
          <span class="ar-q">Care titlu a avut CTR mai mare?</span>
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
