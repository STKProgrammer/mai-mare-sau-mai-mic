"""
Pregateste datele pentru jocul "Mai mare sau mai mic" din Upworthy Research Archive.

Pasi:
  1. descarca CSV-ul (daca lipseste) si curata titlurile
  2. agrega variantele identice ca afisare (acelasi test + imagine + excerpt + titlu)
  3. formeaza perechi in care difera DOAR titlul (aceeasi imagine si excerpt)
  4. calculeaza statistica pentru fiecare pereche (z-test, CI, P(B>A), n necesar)
  5. alege un set echilibrat de perechi pentru joc -> web/data/pairs.json
  6. regresie cu efecte fixe pe test: ce caracteristici ale titlului cresc CTR -> web/data/insights.json

Rulare:
  python data/prepare.py
  python data/prepare.py --max-pairs 3000 --per-test 3 --seed 42

Sursa: The Upworthy Research Archive (Matias, Munger, Aubin Le Quere, Ebersole), https://osf.io/jd64p/
Licenta: CC BY 4.0
"""

import argparse
import html
import json
import re
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import beta, norm

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "web" / "data"

SOURCES = {
    "exploratory": "https://osf.io/download/3vqmp/",
    "confirmatory": "https://osf.io/download/vy8mj/",
}

ATTRIBUTION = {
    "dataset": "The Upworthy Research Archive",
    "authors": "J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole",
    "url": "https://osf.io/jd64p/",
    "license": "CC BY 4.0",
}

MIN_IMPRESSIONS = 500
ALPHA = 0.05
POWER = 0.80


# ---------------------------------------------------------------- incarcare

def download(name: str) -> Path:
    path = RAW_DIR / f"upworthy-{name}.csv"
    if not path.exists():
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Descarc {name} din {SOURCES[name]} ...")
        urllib.request.urlretrieve(SOURCES[name], path)
    return path


def clean_headline(s: str) -> str:
    s = html.unescape(s)
    s = re.sub(r"<[^>]+>", "", s)              # taguri HTML (<strong>, <span>)
    s = s.replace("​", "").replace("\xa0", " ").replace("\n", " ")
    s = s.replace("*", "")                      # emfaza markdown (*Really*)
    return re.sub(r"\s+", " ", s).strip()


def load(names: list[str]) -> pd.DataFrame:
    frames = [pd.read_csv(download(n), index_col=0) for n in names]
    df = pd.concat(frames, ignore_index=True)
    df = df.dropna(subset=["eyecatcher_id", "headline"])
    df["excerpt"] = df["excerpt"].fillna("")
    df["headline"] = df["headline"].map(clean_headline)
    df = df[df["headline"].str.len() > 0]

    # Variante care arata identic pentru cititor (difera doar lede/share_text)
    # sunt practic acelasi tratament -> le insumam.
    keys = ["clickability_test_id", "eyecatcher_id", "excerpt", "headline"]
    agg = (df.groupby(keys, as_index=False)
             .agg(impressions=("impressions", "sum"),
                  clicks=("clicks", "sum"),
                  created_at=("created_at", "min")))
    return agg[agg["impressions"] >= MIN_IMPRESSIONS].reset_index(drop=True)


# ---------------------------------------------------------------- statistica

def pair_stats(ca, na, cb, nb):
    """Statistici vectorizate pentru perechi (A, B). Toate argumentele sunt array-uri."""
    pa, pb = ca / na, cb / nb
    diff = pb - pa

    # z-test pentru doua proportii (varianta pooled sub H0)
    pp = (ca + cb) / (na + nb)
    se0 = np.sqrt(pp * (1 - pp) * (1 / na + 1 / nb))
    z = np.divide(diff, se0, out=np.zeros_like(diff), where=se0 > 0)
    p_value = 2 * norm.sf(np.abs(z))

    # CI 95% pentru diferenta (Wald, nepooled)
    se1 = np.sqrt(pa * (1 - pa) / na + pb * (1 - pb) / nb)
    zc = norm.ppf(1 - ALPHA / 2)
    ci_lo, ci_hi = diff - zc * se1, diff + zc * se1

    # Cate afisari/varianta ar fi fost necesare ca sa detectezi diferenta observata
    zb = norm.ppf(POWER)
    pbar = (pa + pb) / 2
    num = (zc * np.sqrt(2 * pbar * (1 - pbar)) + zb * np.sqrt(pa * (1 - pa) + pb * (1 - pb))) ** 2
    n_needed = np.divide(num, diff ** 2, out=np.full_like(diff, np.inf), where=diff != 0)

    lift = np.divide(diff, pa, out=np.full_like(diff, np.nan), where=pa > 0)

    return dict(ctr_a=pa, ctr_b=pb, diff=diff, lift=lift, z=z, p_value=p_value,
                ci_lo=ci_lo, ci_hi=ci_hi, n_needed=n_needed)


def prob_b_better(ca, na, cb, nb) -> float:
    """
    P(CTR_B > CTR_A) cu posterioare Beta(c+1, n-c+1) (prior uniform).
    Integrare exacta: P = integral f_B(x) * F_A(x) dx. Aproximarea normala
    greseste vizibil cand sunt putine click-uri (ex. 2 vs 7).
    """
    A, B = beta(ca + 1, na - ca + 1), beta(cb + 1, nb - cb + 1)
    lo = min(A.ppf(1e-9), B.ppf(1e-9))
    hi = max(A.ppf(1 - 1e-9), B.ppf(1 - 1e-9))
    x = np.linspace(lo, hi, 4001)
    return float(np.clip(np.trapezoid(B.pdf(x) * A.cdf(x), x), 0, 1))


def build_pairs(pk: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    pk = pk.reset_index(names="pid")
    m = pk.merge(pk, on=["clickability_test_id", "eyecatcher_id", "excerpt"], suffixes=("_a", "_b"))
    m = m[(m["pid_a"] < m["pid_b"]) & (m["headline_a"] != m["headline_b"])].reset_index(drop=True)

    # Ordinea A/B aleatoare, ca sa nu fie castigatorul mereu pe aceeasi pozitie
    swap = rng.random(len(m)) < 0.5
    for col in ["pid", "headline", "impressions", "clicks", "created_at"]:
        a, b = m[f"{col}_a"].copy(), m[f"{col}_b"].copy()
        m.loc[swap, f"{col}_a"], m.loc[swap, f"{col}_b"] = b[swap], a[swap]

    s = pair_stats(m["clicks_a"].to_numpy(float), m["impressions_a"].to_numpy(float),
                   m["clicks_b"].to_numpy(float), m["impressions_b"].to_numpy(float))
    for k, v in s.items():
        m[k] = v

    sig = m["p_value"] < ALPHA
    m["verdict"] = np.where(~sig, "noise", np.where(m["diff"] > 0, "B", "A"))
    absz = m["z"].abs()
    m["level"] = np.select([absz >= 3.5, absz >= norm.ppf(1 - ALPHA / 2)], ["easy", "medium"], "noise")
    return m


def select_pairs(m: pd.DataFrame, max_pairs: int, per_test: int, rng: np.random.Generator) -> pd.DataFrame:
    """Set echilibrat: o treime usor, o treime mediu, o treime zgomot, max `per_test` perechi/test."""
    m = m.sample(frac=1, random_state=int(rng.integers(1 << 31))).reset_index(drop=True)
    m = m.groupby("clickability_test_id", group_keys=False).head(per_test)
    quota = max_pairs // 3
    parts = [g.head(quota) for _, g in m.groupby("level")]
    return pd.concat(parts).sample(frac=1, random_state=int(rng.integers(1 << 31))).reset_index(drop=True)


# ---------------------------------------------------------------- caracteristici titlu

FEATURES = {
    "numar":          ("Contine un numar",              lambda s: bool(re.search(r"\d", s))),
    "intrebare":      ("Este o intrebare",              lambda s: "?" in s),
    "tu":             ("Se adreseaza cititorului (you)", lambda s: bool(re.search(r"\byou(r|'re|'ll)?\b", s, re.I))),
    "this_these":     ("Curiosity gap (this/these)",    lambda s: bool(re.search(r"\b(this|these)\b", s, re.I))),
    "persoana_1":     ("Persoana I (I/my/me)",          lambda s: bool(re.search(r"\b(I|I'm|I've|my|me)\b", s))),
    "citat":          ("Contine un citat",              lambda s: bool(re.search(r"[\"“”]|(^|\s)['‘]\S", s))),
    "exclamare":      ("Semnul exclamarii",             lambda s: "!" in s),
    "superlativ":     ("Superlativ (best/worst/ever...)", lambda s: bool(re.search(r"\b(best|worst|most|ever|never|greatest)\b", s, re.I))),
    "lungime_10cuv":  ("+10 cuvinte lungime",           lambda s: len(s.split()) / 10),
}


def feature_matrix(headlines: pd.Series) -> pd.DataFrame:
    return pd.DataFrame({k: headlines.map(f).astype(float) for k, (_, f) in FEATURES.items()})


def fixed_effects_regression(pk: pd.DataFrame) -> list[dict]:
    """
    WLS pe logit(CTR) cu efecte fixe pe test (demeaning in interiorul testului).
    Comparam doar titluri din acelasi test, deci subiectul articolului e controlat.
    Erori standard robuste, clusterizate pe test.
    """
    pk = pk[pk.groupby("clickability_test_id")["headline"].transform("nunique") > 1].copy()
    c, n = pk["clicks"].to_numpy(float), pk["impressions"].to_numpy(float)
    y = np.log((c + 0.5) / (n - c + 0.5))
    w = 1 / (1 / (c + 0.5) + 1 / (n - c + 0.5))
    X = feature_matrix(pk["headline"])
    g = pk["clickability_test_id"].to_numpy()

    # demeaning ponderat in interiorul fiecarui test
    dfw = X.assign(_y=y, _w=w, _g=g)
    def demean(col):
        wm = (dfw[col] * dfw["_w"]).groupby(dfw["_g"]).transform("sum") / dfw.groupby("_g")["_w"].transform("sum")
        return (dfw[col] - wm).to_numpy()
    Xd = np.column_stack([demean(k) for k in X.columns])
    yd = demean("_y")

    sw = np.sqrt(w)
    Xw, yw = Xd * sw[:, None], yd * sw
    XtX_inv = np.linalg.pinv(Xw.T @ Xw)
    beta = XtX_inv @ Xw.T @ yw
    resid = yw - Xw @ beta

    # sandwich clusterizat pe test
    k = Xd.shape[1]
    meat = np.zeros((k, k))
    for idx in pd.Series(np.arange(len(g))).groupby(g).indices.values():
        sg = Xw[idx].T @ resid[idx]
        meat += np.outer(sg, sg)
    G = len(set(g))
    meat *= G / (G - 1)
    se = np.sqrt(np.diag(XtX_inv @ meat @ XtX_inv))

    zc = norm.ppf(1 - ALPHA / 2)
    out = []
    for i, key in enumerate(X.columns):
        b, s = beta[i], se[i]
        out.append(dict(
            feature=key,
            label=FEATURES[key][0],
            share=round(float(X[key].gt(0).mean() if key != "lungime_10cuv" else 1.0), 3),
            lift=round(float(np.exp(b) - 1), 4),           # efect relativ aprox. asupra CTR (CTR mic => odds ~ CTR)
            ci_lo=round(float(np.exp(b - zc * s) - 1), 4),
            ci_hi=round(float(np.exp(b + zc * s) - 1), 4),
            p_value=float(2 * norm.sf(abs(b / s))),
        ))
    out.sort(key=lambda d: d["lift"], reverse=True)
    return out, dict(packages=int(len(pk)), tests=int(G))


# ---------------------------------------------------------------- export

def to_records(sel: pd.DataFrame) -> list[dict]:
    feats_a = feature_matrix(sel["headline_a"])
    feats_b = feature_matrix(sel["headline_b"])
    recs = []
    for i, r in sel.iterrows():
        recs.append(dict(
            id=f"{r['clickability_test_id'][-8:]}-{int(r['pid_a'])}-{int(r['pid_b'])}",
            date=str(r["created_at_a"])[:10],
            a=dict(headline=r["headline_a"], impressions=int(r["impressions_a"]), clicks=int(r["clicks_a"]),
                   tags=[k for k in FEATURES if k != "lungime_10cuv" and feats_a.at[i, k] > 0]),
            b=dict(headline=r["headline_b"], impressions=int(r["impressions_b"]), clicks=int(r["clicks_b"]),
                   tags=[k for k in FEATURES if k != "lungime_10cuv" and feats_b.at[i, k] > 0]),
            ctr_a=round(r["ctr_a"], 5), ctr_b=round(r["ctr_b"], 5),
            lift=None if np.isnan(r["lift"]) else round(r["lift"], 4),
            z=round(r["z"], 3), p_value=float(f"{r['p_value']:.3g}"),
            ci=[round(r["ci_lo"], 5), round(r["ci_hi"], 5)],
            p_b_better=round(prob_b_better(r["clicks_a"], r["impressions_a"], r["clicks_b"], r["impressions_b"]), 4),
            n_needed=None if not np.isfinite(r["n_needed"]) else int(np.ceil(r["n_needed"])),
            verdict=r["verdict"], level=r["level"],
        ))
    return recs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", nargs="+", default=["exploratory"], choices=list(SOURCES))
    ap.add_argument("--max-pairs", type=int, default=3000)
    ap.add_argument("--per-test", type=int, default=3)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    rng = np.random.default_rng(args.seed)

    pk = load(args.sources)
    pairs = build_pairs(pk, rng)
    sel = select_pairs(pairs, args.max_pairs, args.per_test, rng)
    insights, meta = fixed_effects_regression(pk)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "pairs.json", "w", encoding="utf-8") as f:
        json.dump(dict(attribution=ATTRIBUTION, alpha=ALPHA, pairs=to_records(sel)), f, ensure_ascii=False)
    with open(OUT_DIR / "insights.json", "w", encoding="utf-8") as f:
        json.dump(dict(attribution=ATTRIBUTION, method="WLS logit(CTR), efecte fixe pe test, SE clusterizate pe test",
                       **meta, features=insights), f, ensure_ascii=False, indent=2)

    # rezumat
    print(f"Variante (dupa agregare): {len(pk)}  |  teste: {pk['clickability_test_id'].nunique()}")
    print(f"Perechi doar-titlu: {len(pairs)}  |  semnificative (p<{ALPHA}): {(pairs['verdict'] != 'noise').mean():.1%}")
    print(f"Selectate pentru joc: {len(sel)}  ->  {sel['level'].value_counts().to_dict()}")
    print(f"Verdict in selectie: {sel['verdict'].value_counts().to_dict()}")
    print(f"\nCe creste CTR-ul (efecte fixe pe test, {meta['tests']} teste):")
    for d in insights:
        star = "*" if d["p_value"] < ALPHA else " "
        print(f"  {star} {d['label']:<34} {d['lift']:+7.1%}  [{d['ci_lo']:+.1%}, {d['ci_hi']:+.1%}]  p={d['p_value']:.3g}")
    print(f"\nScris: {OUT_DIR / 'pairs.json'}  ({(OUT_DIR / 'pairs.json').stat().st_size / 1e6:.2f} MB)")
    print(f"Scris: {OUT_DIR / 'insights.json'}")


if __name__ == "__main__":
    main()
