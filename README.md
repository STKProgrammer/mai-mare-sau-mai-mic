# Mai mare sau mai mic

Quiz de realitate augmentată controlat prin gesturi. Două titluri reale de articole, testate A/B pe Upworthy: ghicești care a avut rata de click (CTR) mai mare, folosind doar mâna în fața camerei.

**Joacă online:** https://stkprogrammer.github.io/mai-mare-sau-mai-mic/

## Cum se joacă

- 👍 degetul mare în sus = titlul **A**
- 👎 degetul mare în jos = titlul **B**
- ții gestul ~0,6 s (se umple o bară), apoi cobori mâna; 👍 sau 👎 trece la întrebarea următoare
- 3 vieți; jocul se termină la a treia greșeală, recordul rămâne în browser

Peste imaginea camerei apar scheletul mâinii și efecte AR ancorate pe corp: inel de progres pe degetul mare, coloane CTR care cresc din palmă, inimi pe orbită în jurul capului (vieți), coroană la răspuns corect, nor cu ploaie la greșeală, aură de foc pentru serii.

Camera este analizată local, în browser. Nu se folosește microfonul și nu se trimite nimic pe un server.

## Rulare locală

```
python serve.py        # http://localhost:8000
```

Se deschide adresa în Chrome sau Edge și se permite accesul la cameră (pe `localhost` merge fără HTTPS).

Datele (`web/data/*.json`) sunt deja generate. Pentru a le regenera din arhiva originală: `pip install pandas numpy scipy`, apoi `python data/prepare.py`.

## Structură

```
web/index.html            pagina jocului
web/js/quiz.js            stările jocului, confirmarea gesturilor (ținere 0,6 s + revenire la neutru)
web/js/thumbs.js          MediaPipe: gesturi 👍/👎, punctele mâinii și ale feței, scheletul mâinii
web/js/effects.js         efectele AR (inimi, coroană, nor, aură, inel, coloane din palmă)
web/js/game.js            logica de joc: perechi, scor, vieți, dificultate
web/js/stats.js           formatare și calcule statistice
web/js/data.js            încărcarea datelor
web/data/                 perechile de titluri și statistica lor
web/vendor/mediapipe/     MediaPipe Tasks Vision 1.1.0 + modelele Gesture Recognizer și Face Landmarker
data/prepare.py           pregătirea datelor din Upworthy Research Archive
serve.py                  server local fără cache
tools/cache_bust.py       versiune în link-uri la publicare (GitHub Pages)
```

## Tehnologii

- JavaScript (module ES), HTML, CSS, fără framework-uri
- [MediaPipe Tasks Vision](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer) 1.1.0 (Google, Apache 2.0): Gesture Recognizer și Face Landmarker, rulate în browser prin WebAssembly / WebGL, copiate local
- Python (pandas, NumPy, SciPy) pentru pregătirea datelor
- GitHub Pages + GitHub Actions pentru publicare

## Date

*The Upworthy Research Archive* — J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole, https://osf.io/jd64p/ (CC BY 4.0). În quiz intră doar perechile în care diferă numai titlul și diferența de CTR este semnificativă statistic (p < 0,05).
