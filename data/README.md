# Date — Upworthy Research Archive

Sursă: *The Upworthy Research Archive* — J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole.
https://osf.io/jd64p/ — licență **CC BY 4.0** (atribuirea trebuie afișată în joc).

## Rulare

```
pip install pandas numpy scipy
python data/prepare.py
```

CSV-ul se descarcă automat în `data/raw/` dacă lipsește. Opțiuni: `--sources exploratory confirmatory`, `--max-pairs 3000`, `--per-test 3`, `--seed 42`.

## Ce face

1. Curăță titlurile (taguri HTML, caractere invizibile, `*emfază*`).
2. Agregă variantele identice ca afișare (același test + imagine + excerpt + titlu).
3. Perechi în care diferă **doar titlul** (aceeași imagine, același excerpt) — altfel nu știi dacă a câștigat titlul sau poza.
4. Statistici per pereche: z-test 2 proporții, CI 95% al diferenței, lift, P(B>A) Bayesian (Beta, integrare exactă), afișări necesare (α=0.05, putere 80%).
5. Set echilibrat pentru joc: ~1/3 ușor (|z| ≥ 3.5), ~1/3 mediu (1.96 ≤ |z| < 3.5), ~1/3 zgomot (p ≥ 0.05); max 3 perechi/test.
6. Regresie WLS pe logit(CTR) cu efecte fixe pe test și SE clusterizate pe test: ce caracteristici ale titlului cresc CTR.

## Ieșiri

- `web/data/pairs.json` — perechile pentru joc (`verdict`: `A` / `B` / `noise`, `level`: `easy` / `medium` / `noise`)
- `web/data/insights.json` — efectul fiecărei caracteristici (lift %, CI 95%, p)

Notă: lift-ul din `insights.json` e efect pe odds; la CTR ~1% odds ≈ CTR, deci se citește ca efect relativ asupra CTR.
