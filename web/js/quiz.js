// Quiz-ul cu titluri, controlat doar cu 👍 (titlul A) si 👎 (titlul B).
// Gestul trebuie tinut HOLD_MS; dupa fiecare actiune, mana trebuie lasata jos o clipa.

import { Game } from './game.js';
import * as S from './stats.js';
import { loadData } from './data.js';
import { ThumbsTracker } from './thumbs.js';
import { ARFx } from './effects.js';

const HOLD_MS = 600;
const NEUTRAL_MS = 300;
const BEST_KEY = 'mmm.best.quiz';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocat */ } },
};

const STATUS = {
  camera: 'Pornesc camera… permite accesul când browserul întreabă',
  loading: 'Încarc recunoașterea gesturilor…',
  nohand: 'Arată mâna la cameră',
  hand: 'Mână detectată',
  error: 'Recunoașterea gesturilor nu merge',
  nocam: 'Camera nu a pornit',
};

class Quiz {
  constructor(root, pairs) {
    this.root = root;
    this.pairs = pairs;
    this.game = null;
    this.phase = 'start';      // start | question | reveal | over
    this.last = null;          // ultimul rezultat (pentru ecranul de raspuns)
    this.hold = null;
    this.needNeutral = false;
    this.neutralSince = null;
    this.statusEl = document.getElementById('status');

    document.addEventListener('keydown', (e) => {
      // rezerva pentru teste: sageti / Enter in loc de gesturi
      const map = { ArrowLeft: 'up', ArrowUp: 'up', Enter: 'up', ArrowRight: 'down', ArrowDown: 'down' };
      if (map[e.key]) {
        e.preventDefault();
        this.action(map[e.key]);
      }
    });
    this.render();
  }

  setStatus(key, extra = '') {
    this.statusEl.className = `status ${key}`;
    this.statusEl.textContent = `✋ ${STATUS[key]}${extra ? ` — ${extra}` : ''}`;
  }

  // ------------------------------------------------------------ gesturi

  onFrame(frame) {
    const { gesture, hand } = frame;
    this.fx?.update(frame);
    this.setStatus(hand ? 'hand' : 'nohand');
    const now = performance.now();

    // dupa o actiune, asteptam ca mana sa coboare (fara gest) inainte de urmatoarea
    if (this.needNeutral) {
      if (gesture) this.neutralSince = null;
      else if (this.neutralSince == null) this.neutralSince = now;
      else if (now - this.neutralSince >= NEUTRAL_MS) this.needNeutral = false;
      this.showProgress(null, 0);
      return;
    }
    if (!gesture) {
      this.hold = null;
      this.showProgress(null, 0);
      return;
    }
    if (this.hold?.gesture !== gesture) this.hold = { gesture, t0: now };
    const p = (now - this.hold.t0) / HOLD_MS;
    this.showProgress(gesture, p);
    if (p >= 1) {
      this.hold = null;
      this.needNeutral = true;
      this.neutralSince = null;
      this.fx?.event('fire');   // explozie de scantei pe degetul mare
      this.action(gesture);
    }
  }

  showProgress(gesture, p) {
    const v = Math.min(1, Math.max(0, p));
    for (const bar of this.root.querySelectorAll('[data-bar]')) {
      const on = bar.dataset.bar === gesture || (bar.dataset.bar === 'any' && gesture);
      bar.style.transform = `scaleX(${on ? v : 0})`;
    }
    this.fx?.setHold(gesture, v);
  }

  action(gesture) {
    if (this.phase === 'start' || this.phase === 'over') {
      if (gesture === 'up') this.startGame();
    } else if (this.phase === 'question') {
      const res = this.game.answer(gesture === 'up' ? 'A' : 'B');
      if (!res) return;
      this.last = res;
      this.phase = 'reveal';
      this.fx?.event(res.outcome === 'correct' ? 'correct' : 'wrong');
      this.render();
    } else if (this.phase === 'reveal') {
      this.game.next();
      if (this.game.state === 'over') this.finish();
      else this.phase = 'question';
      this.render();
    }
  }

  startGame() {
    this.game = new Game(this.pairs, 'quiz');
    this.game.start();
    this.phase = 'question';
    this.render();
  }

  finish() {
    this.phase = 'over';
    const best = store.get(BEST_KEY, 0);
    this.isRecord = this.game.score > best;
    if (this.isRecord) store.set(BEST_KEY, this.game.score);
  }

  // ------------------------------------------------------------ ecrane

  hud() {
    const g = this.game;
    return `
      <header class="hud">
        <div><span class="hud-label">Scor</span> <b>${g.score}</b></div>
        <div><span class="hud-label">Serie</span> <b>${g.streak}</b></div>
        <div class="lives">${'♥'.repeat(Math.max(0, g.lives))}<span class="lost">${'♥'.repeat(Math.max(0, g.mode.lives - g.lives))}</span></div>
      </header>`;
  }

  card(side, entry, res) {
    const icon = side === 'A' ? '👍' : '👎';
    let cls = `q-card side-${side.toLowerCase()}`;
    let extra = '';
    if (res) {
      const pair = res.pair;
      const ctr = side === 'A' ? pair.ctr_a : pair.ctr_b;
      cls += pair.verdict === side ? ' win' : ' lose';
      if (res.choice === side) cls += ' chosen';
      extra = `<p class="q-ctr">${S.pct(ctr, 2)} <span class="muted">CTR · ${S.int(entry.clicks)} click-uri / ${S.int(entry.impressions)} afișări</span></p>`;
    }
    return `
      <article class="${cls}">
        <div class="q-head"><span class="q-icon">${icon}</span><span class="q-side">${side}</span>${res?.choice === side ? '<span class="q-picked">alegerea ta</span>' : ''}</div>
        <p class="headline">${esc(entry.headline)}</p>
        ${extra}
        ${res ? '' : `<i class="bar" data-bar="${side === 'A' ? 'up' : 'down'}"></i>`}
      </article>`;
  }

  // starea jocului pentru efectele AR (vieti, serie, coloanele din palma)
  syncFx() {
    if (!this.fx) return;
    const g = this.game;
    const p = this.last?.pair;
    this.fx.setGame({
      phase: this.phase,
      lives: g?.lives ?? 3,
      streak: g?.streak ?? 0,
      reveal: this.phase === 'reveal' && p ? (this.revealFx?.pair === p ? this.revealFx : (this.revealFx = { pair: p, ctrA: p.ctr_a, ctrB: p.ctr_b, verdict: p.verdict })) : null,
    });
  }

  render() {
    this.syncFx();
    if (this.phase === 'start') {
      this.root.innerHTML = `
        <section class="panel start">
          <h1>Mai mare <span class="muted">sau</span> mai mic</h1>
          <p>Două titluri reale, testate A/B pe Upworthy. Ghicește care a adus mai multe click-uri.</p>
          <div class="legend"><span>👍 = titlul A</span><span>👎 = titlul B</span></div>
          <p class="muted">Ține gestul o clipă, până se umple bara. Apoi coboară mâna.</p>
          <div class="go">👍 Arată degetul mare în sus ca să începi<i class="bar" data-bar="up"></i></div>
          <p class="muted small">Record: ${store.get(BEST_KEY, 0)}</p>
        </section>`;
      return;
    }

    const g = this.game;
    if (this.phase === 'question') {
      const p = g.current;
      this.root.innerHTML = `
        ${this.hud()}
        <p class="q-title">Care titlu a avut <b>CTR mai mare</b>?</p>
        <div class="q-duel">${this.card('A', p.a)}${this.card('B', p.b)}</div>`;
      return;
    }

    if (this.phase === 'reveal') {
      const res = this.last;
      const p = res.pair;
      const w = p.verdict;
      const [cw, cl] = w === 'A' ? [p.ctr_a, p.ctr_b] : [p.ctr_b, p.ctr_a];
      this.root.innerHTML = `
        ${this.hud()}
        <p class="q-title result ${res.outcome}">${res.outcome === 'correct' ? `Corect! +${res.points}` : 'Greșit'}</p>
        <div class="q-duel">${this.card('A', p.a, res)}${this.card('B', p.b, res)}</div>
        <div class="panel explain">
          <p>Titlul <b class="side-${w.toLowerCase()}">${w}</b> a avut CTR cu <b>${S.pct(S.relLift(cw, cl), 0)} mai mare</b> (${S.pct(cw, 2)} vs ${S.pct(cl, 2)}).
            ${S.fmtP(p.p_value)} — diferența e reală, nu noroc.</p>
          <div class="go">👍 sau 👎 pentru ${g.over ? 'rezultat' : 'următoarea'}<i class="bar" data-bar="any"></i></div>
        </div>`;
      return;
    }

    // over
    this.root.innerHTML = `
      <section class="panel start">
        <h2>Joc terminat</h2>
        <p class="big">${g.score}</p>
        <p>${this.isRecord ? '<b class="record">Record nou!</b>' : `Record: ${store.get(BEST_KEY, 0)}`}</p>
        <p class="muted">${g.correct} corecte din ${g.answered} (${S.pct(g.accuracy ?? 0, 0)}) · cea mai lungă serie: ${g.bestStreak}</p>
        <div class="go">👍 Joacă din nou<i class="bar" data-bar="up"></i></div>
      </section>`;
  }
}

// ------------------------------------------------------------ pornire

const root = document.getElementById('app');
const video = document.getElementById('video');
const canvas = document.getElementById('skeleton');
const fxCanvas = document.getElementById('fx');

try {
  const { pairs } = await loadData();
  const quiz = new Quiz(root, pairs);
  if (new URLSearchParams(location.search).has('debug')) window.__quiz = quiz;
  quiz.setStatus('camera');
  try {
    // doar video, fara microfon
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    await video.play();
  } catch (err) {
    quiz.setStatus('nocam', `${err.name || err.message}. Permite camera din bara de adrese și reîncarcă pagina.`);
    throw null;
  }
  const tracker = new ThumbsTracker({
    video,
    canvas,
    onFrame: (f) => quiz.onFrame(f),
    onStatus: (s, msg) => { if (s === 'loading') quiz.setStatus('loading'); else if (s === 'error') quiz.setStatus('error', msg); },
  });
  quiz.fx = new ARFx(fxCanvas, (p) => tracker.toScreen(p));
  quiz.syncFx();
  if (window.__quiz) window.__tracker = tracker;
  await tracker.start();
} catch (err) {
  if (err) {
    root.innerHTML = `<section class="panel start"><h2>Nu am putut încărca jocul</h2><p>${esc(err.message || err)}</p></section>`;
    console.error(err);
  }
}
