// Statistica si formatare pentru joc. Fara dependente.

export const Z95 = 1.959963984540054;

// Interval Wilson pentru o proportie (bun si la CTR mic / putine click-uri)
export function wilson(c, n, z = Z95) {
  if (!n) return [0, 1];
  const p = c / n, z2 = z * z, d = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / d;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / d;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

// P(X >= k), X ~ Binomial(n, p) — "esti mai bun decat o moneda?"
export function binomTailGE(k, n, p = 0.5) {
  if (k <= 0) return 1;
  let logC = 0, sum = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    if (i >= k) sum += Math.exp(logC + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, sum);
}

// Raportul CTR castigator / CTR invins - 1 (efect relativ)
export function relLift(win, lose) {
  return lose > 0 ? win / lose - 1 : Infinity;
}

const nf = (min, max) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: min, maximumFractionDigits: max });

export const pct = (x, d = 1) => Number.isFinite(x) ? nf(d, d).format(x * 100) + '%' : '∞';
export const signedPct = (x, d = 0) => (x > 0 ? '+' : x < 0 ? '−' : '') + pct(Math.abs(x), d);
export const int = (n) => nf(0, 0).format(Math.round(n));
export const dec = (x, d = 2) => nf(d, d).format(x);
export const num = (n) => (n < 0 ? '−' : '') + nf(0, 0).format(Math.abs(n));
export const pp = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + nf(d, d).format(Math.abs(x) * 100) + ' pp';

export function fmtP(p) {
  if (p < 0.001) return 'p < 0,001';
  return 'p = ' + nf(0, 3).format(p);
}

const words = (s) => s.trim().split(/\s+/).length;

/**
 * Diagrama de calibrare: raspunsurile grupate dupa increderea declarata
 * (max(pB, 1−pB)) vs cat de des a fost corecta partea aleasa.
 */
export function calibrationBins(history, edges = [0.5, 0.65, 0.8, 0.95, 1.0001]) {
  const rows = history.filter((h) => h.pB != null && h.choice);   // fara raspunsurile 50/50
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const inBin = rows.filter((h) => {
      const c = Math.max(h.pB, 1 - h.pB);
      return c >= lo && c < hi;
    });
    const n = inBin.length;
    return {
      lo, hi: Math.min(1, hi), n,
      conf: n ? inBin.reduce((s, h) => s + Math.max(h.pB, 1 - h.pB), 0) / n : null,
      acc: n ? inBin.filter((h) => h.outcome === 'correct').length / n : null,
    };
  });
}

// Matrice de confuzie adevar x raspuns pentru modul Pro
export function confusion(history) {
  const keys = ['A', 'B', 'N'];
  const m = Object.fromEntries(keys.map((t) => [t, Object.fromEntries(keys.map((a) => [a, 0]))]));
  for (const h of history) {
    const truth = h.pair.verdict === 'noise' ? 'N' : h.pair.verdict;
    if (h.choice in m[truth]) m[truth][h.choice]++;
  }
  const realDiff = m.A.A + m.A.B + m.A.N + m.B.A + m.B.B + m.B.N;
  const noise = m.N.A + m.N.B + m.N.N;
  return {
    m,
    // fals pozitiv: ai declarat castigator cand era zgomot
    falsePositive: noise ? (m.N.A + m.N.B) / noise : null,
    // fals negativ: ai zis zgomot cand diferenta era reala
    falseNegative: realDiff ? (m.A.N + m.B.N) / realDiff : null,
    noise, realDiff,
  };
}

/**
 * Profilul jucatorului: pentru fiecare caracteristica, in perechile unde doar un
 * titlu o are, cat de des a ales jucatorul titlul cu ea vs cat de des a castigat.
 * bias > 0 = supraestimezi, bias < 0 = subestimezi.
 */
export function biasProfile(history, features, minN = 3) {
  const decided = history.filter((h) => h.pair.verdict !== 'noise' && (h.choice === 'A' || h.choice === 'B'));
  const rows = [];
  for (const f of [...features, 'mai_lung']) {
    let n = 0, picked = 0, won = 0;
    for (const h of decided) {
      const { a, b, verdict } = h.pair;
      let fa, fb;
      if (f === 'mai_lung') {
        const la = words(a.headline), lb = words(b.headline);
        if (la === lb) continue;
        fa = la > lb; fb = !fa;
      } else {
        fa = a.tags.includes(f); fb = b.tags.includes(f);
        if (fa === fb) continue;
      }
      const sideWith = fa ? 'A' : 'B';
      n++;
      if (h.choice === sideWith) picked++;
      if (verdict === sideWith) won++;
    }
    if (n >= minN) rows.push({ feature: f, n, pickRate: picked / n, winRate: won / n, bias: (picked - won) / n });
  }
  return rows.sort((x, y) => Math.abs(y.bias) - Math.abs(x.bias));
}
