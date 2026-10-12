// Interfata DOM (fara AR). Randeaza starea din Game si trimite inapoi alegerile.

import { Game, MODES, brierPoints } from './game.js';
import * as S from './stats.js';
import { board, cleanName, NAME_MAX } from './leaderboard.js';

const FEATURE_LABELS = {
  numar: 'Conține un număr',
  intrebare: 'Este o întrebare',
  tu: 'Se adresează cititorului („you”)',
  this_these: 'Curiosity gap („this/these”)',
  persoana_1: 'Persoana I („I/my/me”)',
  citat: 'Conține un citat',
  exclamare: 'Semnul exclamării',
  superlativ: 'Superlativ („best/worst/ever”)',
  lungime_10cuv: '+10 cuvinte lungime',
};

const FEATURE_TAGS = {
  numar: 'număr', intrebare: 'întrebare', tu: 'you', this_these: 'this/these',
  persoana_1: 'persoana I', citat: 'citat', exclamare: '!', superlativ: 'superlativ',
};

const FEATURE_PHRASES = {
  numar: 'titlurile cu număr',
  intrebare: 'titlurile-întrebare',
  tu: 'titlurile cu „you”',
  this_these: 'titlurile cu „this/these”',
  persoana_1: 'titlurile la persoana I',
  citat: 'titlurile cu citat',
  exclamare: 'titlurile cu semnul exclamării',
  superlativ: 'titlurile cu superlative',
  mai_lung: 'titlurile mai lungi',
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocat — ignoram */ }
  },
};

export class UI {
  constructor(root, data) {
    this.root = root;
    this.pairs = data.pairs;
    this.insights = data.insights;
    this.game = null;
    this.last = null;
    this.raf = null;
    this.autoTimer = null;

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el && !el.disabled) this.act(el.dataset.action, el.dataset.arg);
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'conf') this.updateConf();
    });
    root.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'lb-form') this.submitScore(e.target);
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  act(action, arg) {
    if (action === 'start') this.startGame(arg);
    else if (action === 'choose') this.choose(arg);
    else if (action === 'submit-prob') this.submitProb();
    else if (action === 'next') this.next();
    else if (action === 'menu') this.showMenu();
    else if (action === 'leaderboard') this.showLeaderboard();
  }

  onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    // cat timp scrii numele in clasament, tastele nu controleaza jocul
    if (e.target?.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.key === 'Escape' && this.root.querySelector('.leaderboard')) { this.showMenu(); return; }
    const g = this.game;
    const k = e.key.toLowerCase();
    if (g?.state === 'question' && g.mode.calibration) {
      if (k === 'enter') { e.preventDefault(); this.submitProb(); return; }
      // sliderul focusat se misca singur din sageti
      const onSlider = e.target?.id === 'conf';
      if (k === 'a' || (k === 'arrowleft' && !onSlider)) { e.preventDefault(); this.nudgeConf(-5); }
      if (k === 'b' || (k === 'arrowright' && !onSlider)) { e.preventDefault(); this.nudgeConf(5); }
    } else if (g?.state === 'question') {
      if (k === 'arrowleft' || k === 'a' || k === '1') { e.preventDefault(); this.choose('A'); }
      if (k === 'arrowright' || k === 'b' || k === '2') { e.preventDefault(); this.choose('B'); }
      if (g.mode.noiseAnswer && (k === 'arrowdown' || k === 'n' || k === 'z' || k === '3')) { e.preventDefault(); this.choose('N'); }
    } else if (g?.state === 'reveal' && !g.mode.seconds) {
      if (k === 'enter' || k === ' ' || k === 'arrowright') { e.preventDefault(); this.next(); }
    } else if (g?.state === 'over' || !g) {
      if (k === 'enter' && this.last) { e.preventDefault(); this.startGame(this.last); }
    }
  }

  // ------------------------------------------------------------ meniu

  showMenu() {
    this.stopClock();
    this.game = null;
    const modes = Object.entries(MODES).map(([key, m]) => {
      const best = store.get(`mmm.best.${key}`, 0);
      return `
        <button class="mode" data-action="start" data-arg="${key}">
          <span class="mode-name">${esc(m.label)}</span>
          <span class="mode-desc">${esc(m.description)}</span>
          <span class="mode-best">Record: <b>${S.num(best)}</b></span>
        </button>`;
    }).join('');

    this.root.innerHTML = `
      <section class="screen menu">
        <h1>Mai mare <span class="or">sau</span> mai mic</h1>
        <p class="lead">Două titluri, aceeași poveste, aceeași imagine. Unul a adus mai multe click-uri.
          <br>Ghicești care? <b>${S.int(this.pairs.length)}</b> de perechi de titluri din teste A/B reale, Upworthy 2013–2015.</p>
        <div class="modes">${modes}</div>
        <ul class="rules">
          <li><kbd>←</kbd>/<kbd>A</kbd> titlul A, <kbd>→</kbd>/<kbd>B</kbd> titlul B, <kbd>Enter</kbd> mai departe</li>
          <li>Pro: <kbd>↓</kbd>/<kbd>N</kbd> zgomot · Calibrare: <kbd>←</kbd>/<kbd>→</kbd> cât de sigur ești, <kbd>Enter</kbd> trimiți</li>
          <li>După fiecare răspuns vezi dacă diferența era reală sau doar noroc</li>
        </ul>
        ${this.menuFooter()}
      </section>`;
  }

  menuFooter() {
    return `
      <p class="switch">
        <button class="linklike" data-action="leaderboard">Clasament</button>
        · <a href="ar.html">Joacă în AR, cu camera →</a>
      </p>`;
  }

  // ------------------------------------------------------------ clasament

  showLeaderboard() {
    this.stopClock();
    this.game = null;
    const boards = Object.entries(MODES).map(([key, m]) => `
      <section class="lb-col">
        <h3>${esc(m.label)}</h3>
        <div class="lb" data-mode="${key}"><p class="muted">Se încarcă…</p></div>
      </section>`).join('');
    this.root.innerHTML = `
      <section class="screen leaderboard">
        <h2>Clasament <span class="muted">· ${board.online ? 'online' : 'pe acest dispozitiv'}</span></h2>
        <div class="lb-grid">${boards}</div>
        <div class="actions"><button class="btn" data-action="menu">Înapoi <kbd>Esc</kbd></button></div>
      </section>`;
    for (const key of Object.keys(MODES)) this.loadBoard(key);
  }

  async loadBoard(mode, highlight = null) {
    const el = this.root.querySelector(`.lb[data-mode="${mode}"]`);
    if (!el) return;
    try {
      const rows = await board.list(mode);
      if (el.isConnected) el.innerHTML = lbTable(rows, highlight);
    } catch (err) {
      if (el.isConnected) el.innerHTML = `<p class="bad small">${esc(err.message)}</p>`;
    }
  }

  async submitScore(form) {
    const g = this.game;
    if (!g || g.state !== 'over' || this.submitted === g) return;
    const name = cleanName(form.elements.name.value);
    const msg = form.querySelector('.lb-msg');
    if (!name) { msg.textContent = 'Scrie un nume.'; return; }
    this.submitted = g;
    store.set('mmm.name', name);
    form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
    msg.textContent = 'Se salvează…';
    try {
      const row = await board.submit({ mode: g.modeKey, name, score: g.score, answered: g.answered, correct: g.correct });
      form.innerHTML = `<p class="good">Scor salvat ca <b>${esc(name)}</b>.</p>`;
      this.loadBoard(g.modeKey, row);
    } catch (err) {
      this.submitted = null;
      form.querySelectorAll('input, button').forEach((el) => { el.disabled = false; });
      msg.textContent = err.message;
    }
  }

  // ------------------------------------------------------------ joc

  startGame(modeKey) {
    clearTimeout(this.autoTimer);
    this.last = modeKey;
    this.game = new Game(this.pairs, modeKey);
    this.game.start();
    this.renderQuestion();
    if (this.game.mode.seconds) this.startClock();
  }

  hud() {
    const g = this.game;
    let right;
    if (g.mode.seconds) {
      right = `<div class="timer"><span id="time">${Math.ceil(g.timeLeft())}</span>s<div class="timebar"><i id="timebar"></i></div></div>`;
    } else if (g.mode.rounds) {
      right = `<div><span class="hud-label">Runda</span> <b>${Math.min(g.round, g.mode.rounds)}/${g.mode.rounds}</b></div>`;
    } else {
      right = `<div class="lives" aria-label="${g.lives} vieți">${'♥'.repeat(Math.max(0, g.lives))}<span class="lost">${'♥'.repeat(Math.max(0, g.mode.lives - g.lives))}</span></div>`;
    }
    return `
      <header class="hud">
        <div><span class="hud-label">Scor</span> <b id="score">${S.num(g.score)}</b></div>
        <div><span class="hud-label">Serie</span> <b>${g.streak}</b></div>
        ${right}
      </header>`;
  }

  card(side, entry, reveal) {
    const cls = ['card', `side-${side.toLowerCase()}`];
    let extra = '';
    if (reveal) {
      const { pair, choice } = reveal;
      const ctr = side === 'A' ? pair.ctr_a : pair.ctr_b;
      if (pair.verdict === 'noise') cls.push('neutral');
      else cls.push(pair.verdict === side ? 'win' : 'lose');
      if (choice === side) cls.push('chosen');
      const tags = entry.tags.map((t) => `<span class="tag">${esc(FEATURE_TAGS[t] ?? t)}</span>`).join('');
      extra = `
        <div class="card-stats">
          <span class="ctr">${S.pct(ctr, 2)}</span>
          <span class="muted">${S.int(entry.clicks)} click-uri / ${S.int(entry.impressions)} afișări</span>
        </div>
        ${tags ? `<div class="tags">${tags}</div>` : ''}
        ${choice === side ? '<span class="picked">alegerea ta</span>' : ''}`;
    }
    return `
      <button class="${cls.join(' ')}" data-action="choose" data-arg="${side}" ${reveal ? 'disabled' : ''}>
        <span class="side">${side}</span>
        <p class="headline">${esc(entry.headline)}</p>
        ${extra}
      </button>`;
  }

  // Controale specifice modului, sub cele doua titluri
  controls() {
    const m = this.game.mode;
    if (m.noiseAnswer) {
      return `
        <div class="controls">
          <button class="noise-btn" data-action="choose" data-arg="N">
            <b>Zgomot</b> — nicio diferență reală <kbd>↓</kbd>/<kbd>N</kbd>
          </button>
        </div>`;
    }
    if (m.calibration) return calibControls();
    return '';
  }

  renderQuestion() {
    const g = this.game;
    const p = g.current;
    this.root.innerHTML = `
      <section class="screen play">
        ${this.hud()}
        <p class="question">${questionText(g.mode)}</p>
        <div class="duel">
          ${this.card('A', p.a)}
          <div class="vs">vs</div>
          ${this.card('B', p.b)}
        </div>
        ${this.controls()}
        <p class="hint">${p.date.slice(0, 4)} · aceeași imagine, același text de sub titlu</p>
      </section>`;
  }

  choose(side) {
    const g = this.game;
    if (!g || g.state !== 'question') return;
    if (g.mode.calibration) {
      // in Calibrare, click pe un titlu muta sliderul spre el
      this.nudgeConf(side === 'A' ? -10 : 10);
      return;
    }
    const res = g.answer(side);
    if (!res) return;
    if (g.mode.seconds) this.renderFlash(res);
    else this.renderReveal(res);
  }

  // ------------------------------------------------------------ calibrare

  updateConf() {
    const el = this.root.querySelector('#conf');
    const out = this.root.querySelector('#conf-read');
    if (!el || !out) return;
    out.innerHTML = confText(Number(el.value) / 100);
    el.style.setProperty('--v', `${el.value}%`);
  }

  nudgeConf(delta) {
    const el = this.root.querySelector('#conf');
    if (!el) return;
    el.value = String(Math.min(100, Math.max(0, Number(el.value) + delta)));
    this.updateConf();
  }

  submitProb() {
    const g = this.game;
    const el = this.root.querySelector('#conf');
    if (!g || g.state !== 'question' || !g.mode.calibration || !el) return;
    const res = g.answerProb(Number(el.value) / 100);
    if (res) this.renderReveal(res);
  }

  next() {
    const g = this.game;
    if (!g || g.state !== 'reveal') return;   // evita dublu-next (tasta + click pe buton focusat)
    clearTimeout(this.autoTimer);
    g.next();
    if (g.state === 'over') this.renderGameOver();
    else this.renderQuestion();
  }

  // Contra timp: feedback scurt, trece singur mai departe
  renderFlash(res) {
    const g = this.game;
    const { pair } = res;
    this.root.innerHTML = `
      <section class="screen play">
        ${this.hud()}
        <p class="question flash ${res.outcome}">${outcomeTitle(res).html}</p>
        <div class="duel">
          ${this.card('A', pair.a, res)}
          <div class="vs">vs</div>
          ${this.card('B', pair.b, res)}
        </div>
      </section>`;
    this.autoTimer = setTimeout(() => {
      if (this.game === g && g.state === 'reveal') this.next();
    }, res.outcome === 'correct' ? 900 : 1600);
  }

  renderReveal(res) {
    const g = this.game;
    const { pair, outcome } = res;
    this.root.innerHTML = `
      <section class="screen play">
        ${this.hud()}
        <p class="question flash ${outcome}">${outcomeTitle(res).html}</p>
        <div class="duel">
          ${this.card('A', pair.a, res)}
          <div class="vs">vs</div>
          ${this.card('B', pair.b, res)}
        </div>
        <div class="explain">
          <div class="charts">
            <figure>
              <figcaption>CTR cu interval de încredere 95%</figcaption>
              ${ctrChart(pair)}
            </figure>
            <figure>
              <figcaption>Diferența B − A (puncte procentuale)</figcaption>
              ${diffChart(pair)}
            </figure>
          </div>
          <div class="verdict">${answerNote(res)}${explain(pair)}</div>
        </div>
        <div class="actions">
          <button class="btn primary" data-action="next">${g.over ? 'Vezi rezultatul' : 'Următorul'} <kbd>Enter</kbd></button>
        </div>
      </section>`;
    this.root.querySelector('[data-action="next"]').focus({ preventScroll: true });
  }

  // ------------------------------------------------------------ timer (contra timp)

  startClock() {
    const g = this.game;
    const tick = () => {
      if (this.game !== g) return;
      const t = g.timeLeft();
      const timeEl = this.root.querySelector('#time');
      const bar = this.root.querySelector('#timebar');
      if (timeEl) timeEl.textContent = Math.ceil(t);
      if (bar) bar.style.transform = `scaleX(${t / g.mode.seconds})`;
      if (t <= 0) {
        clearTimeout(this.autoTimer);
        g.finish();
        this.renderGameOver();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stopClock() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.autoTimer);
  }

  // ------------------------------------------------------------ final

  renderGameOver() {
    this.stopClock();
    const g = this.game;
    const key = `mmm.best.${g.modeKey}`;
    const prevBest = store.get(key, 0);
    const isRecord = g.score > prevBest;
    if (isRecord) store.set(key, g.score);

    const n = g.answered, k = g.correct;
    const rival = g.chance === 0.5 ? 'o monedă aruncată' : 'ghicitul la întâmplare (1 din 3)';
    let coin = '';
    if (n >= 1) {
      const p = S.binomTailGE(k, n, g.chance);
      coin = p < 0.05
        ? `Ești mai bun decât ${rival}: ${S.fmtP(p)}. Intuiția ta chiar funcționează.`
        : `Ești mai bun decât ${rival}? ${S.fmtP(p)} — încă nu se poate spune. ${n < 20 ? 'Prea puține răspunsuri.' : 'Rezultatul tău poate fi și noroc.'}`;
    }

    const features = this.insights.features.map((f) => f.feature).filter((f) => f !== 'lungime_10cuv');
    const profile = S.biasProfile(g.history, features).filter((r) => Math.abs(r.bias) >= 0.25).slice(0, 3);
    const profileHtml = profile.length
      ? `<ul class="profile">${profile.map((r) => `
          <li><b>${r.bias > 0 ? 'Supraestimezi' : 'Subestimezi'}</b> ${FEATURE_PHRASES[r.feature]}:
            le-ai ales în ${S.pct(r.pickRate, 0)} din cazuri, au câștigat în ${S.pct(r.winRate, 0)} <span class="muted">(${r.n} perechi)</span></li>`).join('')}</ul>`
      : `<p class="muted">Nu se vede încă un tipar clar în alegerile tale. Joacă mai multe runde pentru un profil.</p>`;

    let modeSummary = '';
    if (g.mode.noiseAnswer) modeSummary = proSummary(g.history);
    if (g.mode.calibration) modeSummary = calibSummary(g.history);

    this.root.innerHTML = `
      <section class="screen over">
        <h2>${g.exhausted ? 'Ai terminat toate perechile!' : 'Joc terminat'} <span class="muted">· ${esc(g.mode.label)}</span></h2>
        <div class="final-score">
          <span class="big">${S.num(g.score)}</span>
          <span>${isRecord ? '<span class="record">Record nou!</span>' : `Record: ${S.num(Math.max(prevBest, g.score))}`}</span>
        </div>
        <div class="stat-row">
          <div><b>${k}/${n}</b><span>corecte</span></div>
          <div><b>${g.accuracy == null ? '–' : S.pct(g.accuracy, 0)}</b><span>acuratețe (${S.pct(g.chance, 0)} = noroc)</span></div>
          <div><b>${g.bestStreak}</b><span>cea mai lungă serie</span></div>
        </div>
        ${coin ? `<p class="coin">${coin}</p>` : ''}

        <h3>Clasament · ${esc(g.mode.label)} <span class="muted">${board.online ? 'online' : 'pe acest dispozitiv'}</span></h3>
        <div class="lb-wrap">
          ${g.answered || g.history.length ? `
            <form class="lb-form" id="lb-form">
              <input name="name" maxlength="${NAME_MAX}" placeholder="Numele tău" autocomplete="nickname"
                value="${esc(store.get('mmm.name', ''))}" aria-label="Numele pentru clasament" required>
              <button class="btn primary" type="submit">Salvează scorul</button>
              <span class="lb-msg muted small" role="status"></span>
            </form>` : ''}
          <div class="lb" data-mode="${g.modeKey}"><p class="muted">Se încarcă…</p></div>
        </div>

        ${modeSummary}

        <h3>Profilul tău</h3>
        ${profileHtml}

        <h3>Ce spun datele <span class="muted">(${S.int(this.insights.tests)} teste, titluri comparate în același test)</span></h3>
        ${insightsChart(this.insights.features)}

        <div class="actions">
          <button class="btn primary" data-action="start" data-arg="${g.modeKey}">Joacă din nou <kbd>Enter</kbd></button>
          <button class="btn" data-action="menu">Meniu</button>
        </div>
      </section>`;
    this.loadBoard(g.modeKey);
  }
}

// ------------------------------------------------------------ texte & grafice

export function explain(p) {
  const nMin = Math.min(p.a.impressions, p.b.impressions);
  if (p.verdict !== 'noise') {
    const w = p.verdict;
    const [cw, cl] = w === 'A' ? [p.ctr_a, p.ctr_b] : [p.ctr_b, p.ctr_a];
    const pw = w === 'B' ? p.p_b_better : 1 - p.p_b_better;
    return `
      <p>Titlul <b class="side-${w.toLowerCase()}">${w}</b> a avut CTR cu <b>${S.pct(S.relLift(cw, cl), 0)} mai mare</b> (${S.pct(cw, 2)} vs ${S.pct(cl, 2)}).</p>
      <p><b>${S.fmtP(p.p_value)}</b> — dacă titlurile ar fi fost la fel de bune, o diferență cel puțin atât de mare ar apărea din întâmplare ${p.p_value < 0.001 ? 'în mai puțin de 1 caz din 1.000' : `în ~${S.pct(p.p_value, 1)} din cazuri`}.</p>
      <p>Șansa (bayesiană) ca ${w} să fie cu adevărat mai bun: <b>${pw > 0.999 ? '> 99,9%' : S.pct(pw, 0)}</b>.</p>`;
  }
  const lead = p.ctr_b >= p.ctr_a ? 'B' : 'A';
  const [cw, cl] = lead === 'A' ? [p.ctr_a, p.ctr_b] : [p.ctr_b, p.ctr_a];
  const pw = lead === 'B' ? p.p_b_better : 1 - p.p_b_better;
  return `
    <p><b class="side-${lead.toLowerCase()}">${lead}</b> a avut CTR cu ${S.pct(S.relLift(cw, cl), 0)} mai mare, dar <b>${S.fmtP(p.p_value)}</b>: intervalul diferenței trece prin 0.</p>
    <p>Cu ~${S.int(nMin)} afișări pe variantă, asemenea diferențe apar des din pură întâmplare.
      ${p.n_needed ? `Ca s-o confirmi ar fi trebuit <b>~${S.int(p.n_needed)} afișări</b> pe variantă.` : ''}</p>
    <p>Șansa (bayesiană) ca ${lead} să fie mai bun: ${S.pct(pw, 0)}, dar diferența reală poate fi oriunde între
      <b>${S.pp(p.ci[0])}</b> și <b>${S.pp(p.ci[1])}</b> — inclusiv zero.</p>`;
}

export function ctrChart(p) {
  const rows = [
    { side: 'A', c: p.a.clicks, n: p.a.impressions, ctr: p.ctr_a },
    { side: 'B', c: p.b.clicks, n: p.b.impressions, ctr: p.ctr_b },
  ].map((r) => ({ ...r, ci: S.wilson(r.c, r.n) }));
  const max = Math.max(...rows.map((r) => r.ci[1])) * 1.12 || 0.01;
  const W = 300, x0 = 24, x = (v) => x0 + (v / max) * (W - x0 - 64);
  const bars = rows.map((r, i) => {
    const y = 12 + i * 34;
    return `
      <text x="4" y="${y + 13}" class="lbl side-${r.side.toLowerCase()}">${r.side}</text>
      <rect x="${x0}" y="${y}" width="${Math.max(1, x(r.ctr) - x0)}" height="18" rx="3" class="bar bar-${r.side.toLowerCase()}"/>
      <line x1="${x(r.ci[0])}" x2="${x(r.ci[1])}" y1="${y + 9}" y2="${y + 9}" class="whisker"/>
      <line x1="${x(r.ci[0])}" x2="${x(r.ci[0])}" y1="${y + 3}" y2="${y + 15}" class="whisker"/>
      <line x1="${x(r.ci[1])}" x2="${x(r.ci[1])}" y1="${y + 3}" y2="${y + 15}" class="whisker"/>
      <text x="${x(r.ci[1]) + 6}" y="${y + 13}" class="val">${S.pct(r.ctr, 2)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} 82" class="chart" role="img" aria-label="CTR A ${S.pct(p.ctr_a, 2)}, B ${S.pct(p.ctr_b, 2)}">${bars}</svg>`;
}

export function diffChart(p) {
  const [lo, hi] = p.ci;
  const d = p.ctr_b - p.ctr_a;
  const M = Math.max(Math.abs(lo), Math.abs(hi)) * 1.25 || 0.001;
  const W = 300, pad = 16, x = (v) => pad + ((v + M) / (2 * M)) * (W - 2 * pad);
  const cls = p.verdict === 'noise' ? 'ci-noise' : 'ci-sig';
  return `
    <svg viewBox="0 0 ${W} 72" class="chart" role="img" aria-label="Diferența B minus A: ${S.pp(d)}, interval ${S.pp(lo)} până la ${S.pp(hi)}">
      <line x1="${pad}" x2="${W - pad}" y1="30" y2="30" class="axis"/>
      <line x1="${x(0)}" x2="${x(0)}" y1="14" y2="46" class="zero"/>
      <text x="${x(0)}" y="10" class="tick" text-anchor="middle">0</text>
      <line x1="${x(lo)}" x2="${x(hi)}" y1="30" y2="30" class="${cls}"/>
      <circle cx="${x(d)}" cy="30" r="5" class="${cls}-dot"/>
      <text x="${x(d)}" y="58" class="val" text-anchor="middle">${S.pp(d)}</text>
      <text x="${pad}" y="70" class="tick">← A mai bun</text>
      <text x="${W - pad}" y="70" class="tick" text-anchor="end">B mai bun →</text>
    </svg>`;
}

function insightsChart(features) {
  const M = Math.max(...features.flatMap((f) => [Math.abs(f.ci_lo), Math.abs(f.ci_hi)])) * 1.1;
  const W = 260, x = (v) => (W / 2) + (v / M) * (W / 2 - 4);
  return `<div class="insights">${features.map((f) => {
    const sig = f.p_value < 0.05;
    return `
      <div class="ins-row ${sig ? '' : 'ns'}">
        <span class="ins-label">${esc(FEATURE_LABELS[f.feature] ?? f.label)}</span>
        <svg viewBox="0 0 ${W} 20" class="ins-bar" aria-hidden="true">
          <line x1="${W / 2}" x2="${W / 2}" y1="0" y2="20" class="zero"/>
          <rect x="${Math.min(x(0), x(f.lift))}" y="5" width="${Math.abs(x(f.lift) - x(0))}" height="10" rx="2" class="${f.lift >= 0 ? 'pos' : 'neg'}"/>
          <line x1="${x(f.ci_lo)}" x2="${x(f.ci_hi)}" y1="10" y2="10" class="whisker"/>
        </svg>
        <span class="ins-val">${S.signedPct(f.lift, 1)}${sig ? '' : ' <span class="muted">n.s.</span>'}</span>
      </div>`;
  }).join('')}
  <p class="muted small">Efect asupra CTR, cu interval de încredere 95%. n.s. = nesemnificativ statistic.</p></div>`;
}

// ------------------------------------------------------------ texte pe mod de joc

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const perechi = (n) => (n === 1 ? '1 pereche' : `${n} perechi`);

export function questionText(mode) {
  if (mode.calibration) return 'Cât de sigur ești care titlu a avut <b>CTR mai mare</b>?';
  if (mode.noiseAnswer) return 'Care titlu a avut <b>CTR mai mare</b> — sau e doar zgomot?';
  return 'Care titlu a avut <b>CTR mai mare</b>?';
}

// Titlul rezultatului, ca HTML (overlay) si text simplu (banner 3D)
export function outcomeTitle({ outcome, points, pB }) {
  const pts = signed(points);
  if (outcome === 'noise') return { text: 'Zgomot — diferența poate fi noroc', html: 'Zgomot — nu se punctează' };
  if (outcome === 'neutral') return { text: '50/50 — 0 puncte', html: '50/50 — <span class="plus">0 puncte</span>' };
  if (outcome === 'correct') return { text: `Corect! ${pts}`, html: `Corect! <span class="plus">${pts}</span>` };
  if (pB != null) return { text: `Greșit ${pts}`, html: `Greșit <span class="plus">${pts}</span>` };
  return { text: 'Greșit', html: 'Greșit' };
}

// Explicatia raspunsului dat (Pro: fals pozitiv / negativ, Calibrare: Brier)
export function answerNote({ pair, choice, outcome, pB, brier, points }) {
  if (pB != null) {
    const said = pB === 0.5 ? '50/50' : `${choice} mai bun, ${S.pct(Math.max(pB, 1 - pB), 0)} sigur`;
    return `<p class="note">Ai spus: <b>${said}</b>. Scor Brier <b>${S.dec(brier, 3)}</b>
      <span class="muted">(0 = perfect · 0,25 = 50/50 · 1 = sigur și greșit)</span> → <b>${signed(points)}</b> puncte.</p>`;
  }
  if (choice === 'N' && pair.verdict === 'noise') {
    return `<p class="note good">Corect: datele nu arată o diferență reală între titluri.</p>`;
  }
  if (choice === 'N') {
    return `<p class="note bad">Diferența era reală, dar ai zis „zgomot” — un <b>fals negativ</b> (eroare de tip II).</p>`;
  }
  if (pair.verdict === 'noise' && outcome === 'wrong') {
    return `<p class="note bad">Era zgomot: ai declarat un câștigător fără dovezi suficiente — un <b>fals pozitiv</b> (eroare de tip I).</p>`;
  }
  return '';
}

export function confText(pB) {
  if (pB === 0.5) return '50/50 — nu știu. Primești 0 puncte orice ar fi.';
  const side = pB > 0.5 ? 'B' : 'A';
  const c = Math.max(pB, 1 - pB);
  const win = brierPoints((1 - c) ** 2);
  const lose = brierPoints(c ** 2);
  return `<b class="side-${side.toLowerCase()}">${side}</b> mai bun, ${S.pct(c, 0)} sigur
    · dacă ai dreptate <b class="good">${signed(win)}</b>, dacă greșești <b class="bad">${signed(lose)}</b>`;
}

export function calibControls() {
  return `
    <div class="calib">
      <div class="calib-scale"><span class="side-a">← A sigur</span><span class="muted">50/50</span><span class="side-b">B sigur →</span></div>
      <input type="range" id="conf" min="0" max="100" step="5" value="50"
        aria-label="Cât de sigur ești că B a avut CTR mai mare (0 = sigur A, 100 = sigur B)">
      <p class="calib-read" id="conf-read">${confText(0.5)}</p>
      <button class="btn primary" data-action="submit-prob">Trimite <kbd>Enter</kbd></button>
    </div>`;
}

// ------------------------------------------------------------ rezumate de final

function proSummary(history) {
  const c = S.confusion(history);
  const label = { A: 'A', B: 'B', N: 'Zgomot' };
  const keys = ['A', 'B', 'N'];
  const cls = (t, a) => (t === a ? 'diag' : t === 'N' ? 'fp' : a === 'N' ? 'fn' : 'swap');
  const rows = keys.map((t) => `
    <tr><th>${label[t]}</th>${keys.map((a) => `<td class="${cls(t, a)}">${c.m[t][a]}</td>`).join('')}</tr>`).join('');
  const lines = [];
  if (c.falsePositive != null) {
    lines.push(`<li>Când era <b>zgomot</b>, ai declarat totuși un câștigător în <b>${S.pct(c.falsePositive, 0)}</b> din cazuri
      <span class="muted">(${perechi(c.noise)})</span> — <b>fals pozitiv</b>, eroare de tip I.
      În marketing: lansezi varianta „câștigătoare” care de fapt nu e mai bună.</li>`);
  }
  if (c.falseNegative != null) {
    lines.push(`<li>Când diferența era <b>reală</b>, ai zis „zgomot” în <b>${S.pct(c.falseNegative, 0)}</b> din cazuri
      <span class="muted">(${perechi(c.realDiff)})</span> — <b>fals negativ</b>, eroare de tip II: ratezi o îmbunătățire reală.</li>`);
  }
  return `
    <h3>Matricea de confuzie</h3>
    <div class="confusion-wrap">
      <table class="confusion">
        <thead><tr><th>Adevăr ↓ · Răspuns →</th>${keys.map((a) => `<th>${label[a]}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <ul class="profile">${lines.join('')}</ul>
    </div>`;
}

function calibSummary(history) {
  const rows = history.filter((h) => h.brier != null);
  if (!rows.length) return '';
  const meanBrier = avg(rows.map((h) => h.brier));
  const decided = rows.filter((h) => h.choice);
  let verdict = '';
  if (decided.length) {
    const conf = avg(decided.map((h) => Math.max(h.pB, 1 - h.pB)));
    const acc = decided.filter((h) => h.outcome === 'correct').length / decided.length;
    const gap = conf - acc;
    verdict = Math.abs(gap) < 0.07
      ? `Ești <b>bine calibrat</b>: încredere medie ${S.pct(conf, 0)}, acuratețe ${S.pct(acc, 0)}.`
      : gap > 0
        ? `Ești <b>prea sigur pe tine</b>: încredere medie ${S.pct(conf, 0)}, dar ai avut dreptate doar în ${S.pct(acc, 0)} din cazuri.`
        : `Ești <b>prea prudent</b>: încredere medie ${S.pct(conf, 0)}, deși ai avut dreptate în ${S.pct(acc, 0)} din cazuri.`;
  }
  return `
    <h3>Calibrare</h3>
    <div class="calib-sum">
      ${calibChart(S.calibrationBins(rows))}
      <div>
        <p>Scor Brier mediu: <b>${S.dec(meanBrier, 3)}</b> <span class="muted">(0 = perfect · 0,25 = mereu 50/50)</span>.
          ${meanBrier < 0.25 ? 'Mai bun decât să răspunzi mereu 50/50.' : 'Mai slab decât să răspunzi mereu 50/50 — încrederea te-a costat.'}</p>
        <p>${verdict}</p>
        <p class="muted small">Punctele de pe diagonală = calibrare perfectă: când spui 80%, ai dreptate în 80% din cazuri.</p>
      </div>
    </div>`;
}

function calibChart(bins) {
  const W = 260, H = 210, x0 = 48, y0 = 14, w = 196, h = 160;
  const x = (c) => x0 + ((c - 0.5) / 0.5) * w;
  const y = (a) => y0 + (1 - a) * h;
  const pts = bins.filter((b) => b.n);
  const path = pts.map((b, i) => `${i ? 'L' : 'M'}${x(b.conf)},${y(b.acc)}`).join(' ');
  return `
    <svg viewBox="0 0 ${W} ${H}" class="chart calib-chart" role="img" aria-label="Diagrama de calibrare">
      <rect x="${x0}" y="${y0}" width="${w}" height="${h}" class="plot"/>
      ${[0, 0.5, 1].map((a) => `<text x="${x0 - 6}" y="${y(a) + 4}" class="tick" text-anchor="end">${a * 100}%</text>`).join('')}
      ${[0.5, 0.75, 1].map((c) => `<text x="${x(c)}" y="${y0 + h + 16}" class="tick" text-anchor="middle">${c * 100}%</text>`).join('')}
      <line x1="${x(0.5)}" y1="${y(0.5)}" x2="${x(1)}" y2="${y(1)}" class="diag"/>
      ${path ? `<path d="${path}" class="calib-line"/>` : ''}
      ${pts.map((b) => `<circle cx="${x(b.conf)}" cy="${y(b.acc)}" r="${4 + Math.sqrt(b.n) * 1.5}" class="calib-dot"><title>${b.n} răspunsuri</title></circle>`).join('')}
      <text x="${x0 + w / 2}" y="${H - 2}" class="tick" text-anchor="middle">încrederea declarată</text>
      <text x="9" y="${y0 + h / 2}" class="tick" text-anchor="middle" transform="rotate(-90 9 ${y0 + h / 2})">acuratețe reală</text>
    </svg>`;
}

// ------------------------------------------------------------ clasament

function lbTable(rows, highlight) {
  if (!rows.length) return '<p class="muted small">Niciun scor încă. Fii primul!</p>';
  const isMine = (r) => highlight && r.name === highlight.name && r.created_at === highlight.created_at;
  return `
    <ol class="lb-list">${rows.map((r) => `
      <li class="${isMine(r) ? 'mine' : ''}">
        <span class="lb-name">${esc(r.name)}</span>
        <span class="lb-acc muted">${r.answered ? `${r.correct}/${r.answered}` : ''}</span>
        <b class="lb-score">${S.num(r.score)}</b>
      </li>`).join('')}
    </ol>`;
}

// ------------------------------------------------------------ parametri de test

/**
 * Pentru teste si demo, din URL:
 *   ?auto=pro                    porneste direct modul
 *   &answer=A|B|N                raspunde dupa `delay` ms (implicit 1500)
 *   &prob=80&submit=1            Calibrare: seteaza sliderul (si trimite)
 *   &finish=1                    joaca la intamplare pana la ecranul final
 */
export function applyTestParams(ui) {
  const q = new URLSearchParams(location.search);
  const mode = q.get('auto');
  if (!Object.hasOwn(MODES, mode ?? '')) return;
  ui.startGame(mode);
  const g = ui.game;

  if (q.get('finish') && !g.mode.seconds) {
    while (g.state === 'question') {
      if (g.mode.calibration) g.answerProb(Math.round(Math.random() * 20) / 20);
      else g.answer(['A', 'B', 'N'][Math.floor(Math.random() * (g.mode.noiseAnswer ? 3 : 2))]);
      g.next();
    }
    ui.renderGameOver();
    return;
  }

  setTimeout(() => {
    if (q.get('prob')) {
      const el = ui.root.querySelector('#conf');
      if (el) { el.value = q.get('prob'); ui.updateConf(); }
      if (q.get('submit')) ui.submitProb();
    }
    if (q.get('answer')) ui.choose(q.get('answer'));
  }, Number(q.get('delay')) || 1500);
}
