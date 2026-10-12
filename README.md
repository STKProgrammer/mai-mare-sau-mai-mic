# Mai mare sau mai mic

Joc AR (AR.js) despre testare A/B: două titluri reale de articole, aceeași imagine — ghicești care a avut CTR mai mare, apoi vezi dacă diferența era reală sau doar zgomot statistic.

Date: **The Upworthy Research Archive** — J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole, https://osf.io/jd64p/ (CC BY 4.0).

## Rulare locală

```
python data/prepare.py                                   # o singură dată: descarcă datele, generează web/data/*.json
python -m http.server 8000 --directory web --bind 127.0.0.1
```

- http://localhost:8000 — versiunea fără cameră
- http://localhost:8000/ar.html — versiunea AR (camera laptopului; pe `localhost` merge fără HTTPS)
- http://localhost:8000/ar-test.html — AR pe o imagine statică, fără cameră (rezervă pentru demo)

Markerul: [web/markers/hiro.png](web/markers/hiro.png) — pe ecranul telefonului (luminozitate maximă) sau printat, min. 8 cm.

## Moduri de joc

| Mod | Ce testează |
|---|---|
| Clasic | intuiția de copywriting; perechile „zgomot” arată de ce un rezultat nu e concludent |
| Contra timp | 60 s, doar perechi cu diferență reală |
| Pro | A / B / Zgomot — matrice de confuzie, fals pozitiv (tip I) și fals negativ (tip II) |
| Calibrare | probabilitate în loc de alegere — scor Brier, diagramă de calibrare |

## Statistica

- per pereche: z-test pentru două proporții, CI 95% al diferenței, lift, P(B>A) Bayesian (Beta, integrare exactă), afișări necesare (α = 0,05, putere 80%) — `data/prepare.py`
- pe tot setul: regresie WLS pe logit(CTR) cu efecte fixe pe test și SE clusterizate — ce caracteristici ale titlului cresc CTR-ul
- în joc: interval Wilson, test binomial „ești mai bun decât norocul?”, profilul de bias al jucătorului, Brier, calibrare

## Clasament

Implicit local (în browser). Pentru clasament comun: proiect Supabase → rulează [supabase/schema.sql](supabase/schema.sql) → completează URL-ul și cheia `anon` în [web/js/config.js](web/js/config.js).

## Structură

```
data/prepare.py        date -> web/data/pairs.json, insights.json
web/index.html         joc fără cameră
web/ar.html            joc AR (A-Frame 1.6 + AR.js 3.4.8, în web/vendor/)
web/js/game.js         logica jocului (fără DOM)
web/js/ui.js           interfața, graficele, textele
web/js/ar-scene.js     scena 3D de pe marker
web/js/ar-view.js      interfața AR (extinde ui.js)
web/js/leaderboard.js  clasament local / Supabase
```

Parametri de test în URL: `?auto=pro`, `&answer=A|B|N`, `&prob=80&submit=1`, `&finish=1`.
