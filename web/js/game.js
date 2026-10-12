// Logica jocului, fara DOM — aceeasi clasa e folosita si de stratul AR.

export const MODES = {
  classic: {
    label: 'Clasic',
    description: '3 vieți. Joci până le pierzi. Unele perechi sunt zgomot — acolo nu pierzi nimic, dar afli de ce.',
    lives: 3,
    noiseRate: 0.2,
  },
  timed: {
    label: 'Contra timp',
    description: '60 de secunde, cât mai multe răspunsuri corecte. Doar perechi cu diferență reală.',
    seconds: 60,
    noiseRate: 0,
  },
  pro: {
    label: 'Pro',
    description: 'A, B sau Zgomot. O treime din perechi nu au diferență reală — recunoaște-le. 3 vieți.',
    lives: 3,
    noiseRate: 1 / 3,
    noiseAnswer: true,
  },
  calib: {
    label: 'Calibrare',
    description: '15 runde. Spui cât de sigur ești, nu doar ce alegi. Încrederea exagerată te costă puncte.',
    rounds: 15,
    noiseRate: 0,
    calibration: true,
  },
};

const LEVEL_POINTS = { easy: 1, medium: 2, noise: 2 };

// Brier pentru o prognoza p = P(B castiga), y = 1 daca B a castigat
export const brier = (p, y) => (p - y) ** 2;

// Punctaj din Brier: 100 = sigur si corect, 0 = 50/50, −300 = sigur si gresit
export const brierPoints = (b) => Math.round(100 - 400 * b);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Game {
  constructor(pairs, modeKey) {
    this.modeKey = modeKey;
    this.mode = MODES[modeKey];
    this.pools = { easy: [], medium: [], noise: [] };
    for (const p of pairs) this.pools[p.level].push(p);
    for (const k in this.pools) shuffle(this.pools[k]);

    this.score = 0;
    this.correct = 0;
    this.answered = 0;     // raspunsuri care se pot evalua (fara zgomot in Clasic, fara 50/50 in Calibrare)
    this.streak = 0;
    this.bestStreak = 0;
    this.lives = this.mode.lives ?? Infinity;
    this.round = 0;
    this.endsAt = null;
    this.history = [];
    this.current = null;
    this.state = 'idle';   // idle | question | reveal | over
    this.exhausted = false;
  }

  start(now = performance.now()) {
    if (this.mode.seconds) this.endsAt = now + this.mode.seconds * 1000;
    return this.next();
  }

  timeLeft(now = performance.now()) {
    return this.endsAt == null ? Infinity : Math.max(0, (this.endsAt - now) / 1000);
  }

  get over() {
    return this.state === 'over' || this.lives <= 0 || this.timeLeft() <= 0 || this.exhausted
      || (this.mode.rounds != null && this.round >= this.mode.rounds && this.state !== 'question');
  }

  get accuracy() {
    return this.answered ? this.correct / this.answered : null;
  }

  // Probabilitatea de a nimeri din noroc
  get chance() {
    return this.mode.noiseAnswer ? 1 / 3 : 0.5;
  }

  // Dificultatea creste odata cu raspunsurile corecte: de la perechi evidente la cele la limita
  pickLevel() {
    if (this.pools.noise.length && Math.random() < this.mode.noiseRate) return 'noise';
    const pEasy = Math.max(0.2, 1 - this.correct / 10);
    let level = Math.random() < pEasy ? 'easy' : 'medium';
    if (!this.pools[level].length) level = level === 'easy' ? 'medium' : 'easy';
    return level;
  }

  next() {
    if (this.over) return this.finish();
    const pair = this.pools[this.pickLevel()].pop();
    if (!pair) {
      this.exhausted = true;
      return this.finish();
    }
    this.current = pair;
    this.round++;
    this.state = 'question';
    return pair;
  }

  canAnswer() {
    return this.state === 'question' && this.timeLeft() > 0;
  }

  // choice: 'A' | 'B' | 'N' (zgomot, doar in Pro)
  answer(choice) {
    if (!this.canAnswer() || this.mode.calibration) return null;
    if (choice === 'N' && !this.mode.noiseAnswer) return null;
    const pair = this.current;
    const truth = pair.verdict === 'noise' ? 'N' : pair.verdict;
    let outcome, points = 0;

    if (truth === 'N' && !this.mode.noiseAnswer) {
      outcome = 'noise';
    } else if (choice === truth) {
      outcome = 'correct';
      points = LEVEL_POINTS[pair.level];
    } else {
      outcome = 'wrong';
    }
    return this.record({ pair, choice, outcome, points });
  }

  // Calibrare: pB = probabilitatea declarata ca B a avut CTR mai mare (0..1)
  answerProb(pB) {
    if (!this.canAnswer() || !this.mode.calibration) return null;
    const pair = this.current;
    const y = pair.verdict === 'B' ? 1 : 0;
    const b = brier(pB, y);
    const choice = pB > 0.5 ? 'B' : pB < 0.5 ? 'A' : null;
    const outcome = choice == null ? 'neutral' : choice === pair.verdict ? 'correct' : 'wrong';
    return this.record({ pair, choice, outcome, points: brierPoints(b), pB, brier: b });
  }

  record(result) {
    const { outcome, points } = result;
    this.score += points;
    if (outcome === 'correct') {
      this.correct++;
      this.streak++;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else if (outcome === 'wrong') {
      this.streak = 0;
      if (Number.isFinite(this.lives)) this.lives--;
    }
    if (outcome === 'correct' || outcome === 'wrong') this.answered++;

    this.history.push(result);
    this.state = 'reveal';
    return result;
  }

  finish() {
    this.state = 'over';
    this.current = null;
    return null;
  }
}
