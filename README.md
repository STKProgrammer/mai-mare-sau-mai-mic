# Mai mare sau mai mic

Joc AR (AR.js) despre testare A/B: două titluri reale de articole, aceeași imagine — ghicești care a avut CTR mai mare, apoi vezi dacă diferența era reală sau doar zgomot statistic.

Urmărirea mâinii: [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) 1.1.0 (Apache-2.0), copiat în `web/vendor/mediapipe/`.

Date: **The Upworthy Research Archive** — J. Nathan Matias, Kevin Munger, Marianne Aubin Le Quere, Charles Ebersole, https://osf.io/jd64p/ (CC BY 4.0).

## Rulare locală

```
python data/prepare.py                                   # o singură dată: descarcă datele, generează web/data/*.json
python serve.py                                          # server local fără cache: http://localhost:8000
```

- http://localhost:8000 — versiunea fără cameră
- http://localhost:8000/ar.html — versiunea AR (camera laptopului; pe `localhost` merge fără HTTPS)
- http://localhost:8000/ar-test.html — AR pe o imagine statică, fără cameră (rezervă pentru demo)

Markerul: [web/markers/hiro.png](web/markers/hiro.png) — pe ecranul telefonului (luminozitate maximă) sau printat, min. 8 cm.

În joc controlezi totul prin **Super AR Tool** (gesturi mână, schelet holografic, clipit din ochi, voce și modul OpenCV):
- 👍 **Thumbs Up** / 👈 **Deget mare stânga** / 😉 **Clipit ochi stâng** -> Alege **Titlul A**
- 👎 **Thumbs Down** / 👉 **Deget mare dreapta** / 😉 **Clipit ochi drept** -> Alege **Titlul B**
- 👀 **Clipire ambii ochi** sau orice gest la reveal -> Trece la următoarea întrebare
- 🎙️ **Comenzi vocale în limba română (Web Speech API)**: control hands-free complet! Spune `„A”`, `„B”`, `„Următoarea”`, `„Statistici”`, sau comenzi de studio `„Undo”`, `„Culoare”`, `„Simetrie”`, `„Ghidaj”`, `„Mută”`, `„Gata”`.
- ✌️ **Peace Sign (2 degete)** -> Comută graficul 3D AR
- 🤏 **Ciupit (Pinch)** -> Scalează dinamic scena 3D în spațiul AR
- 🖐️ **Schelet 3D AR holografic** desenat în timp real peste mână (tasta `S` sau butonul din stânga-jos)
- **Efecte AR interactive în scenă**:
  - 🎊 **Explozie de Confetti 3D**: la afișarea răspunsului, din cardul câștigător țâșnește o jerbă de 48 de particule 3D sclipitoare.
  - ⚡ **Scanline Laser Holografic**: la selecția unui titlu, o rază laser animată scanează cardurile AR.
  - 🔊 **Audio Spațial 3D (Web Audio API)**: sunete sintetizate procedural cu stereo panning (stânga-dreapta) și modulație de pitch pe axa verticală.
- **Levitare 3D**: panourile din AR se ridică în spațiu pe axa Z când gestul este inițiat
- Panourile 3D și cardurile 2D afișează degetul mare direct în antet (`👍 A`, `👎 B`) alături de indiciile de gest

### 🎨 Desenează în 3D (Joc 3 Minute Pictionary doar cu Mâinile)
Zonă de joc creativă: primești o provocare aleatorie și ai 3 minute să o sculptezi în aer cu mâinile:
- 📷 **Față / Cameră în dreapta-jos (PiP)**: camera web este încadrată discret în colțul din dreapta-jos cu chenar neon, lăsând fundalul principal curat, întunecat și cu contrast cyberpunk maxim pentru liniile 3D.
- 🎯 **Provocări aleatorii**: 23 de provocări 3D (rachetă spațială, pisică, coroană, mașină, pizza, brad, sabie laser, chitară etc.) + buton `🎲 Alt cuvânt`.
- ⏱️ **Cronometru 3 minute (180s)**: bară de progres luminoasă, buton de `⏸️ Pauză / ▶️ Reia`, ticăit în ultimele 10 secunde și fanfară la finalizare.
- 🖌️ **Grosime creion**: selector rapid `🖊️ Fin` (detalii), `🖌️ Mediu`, `🖍️ Gros` (marker neon).
- 🖐️ **Mută 3D (`🖐️ Mută 3D`)**: comută în modul de manipulare spațială — ciupitul prinde și repoziționează întreaga sculptură oriunde în cameră!
- ✨ **Particule neon / Sparkles**: jerbe de scântei strălucitoare care se desprind din vârful degetului în timpul desenării.
- 🪞 **Simetrie 3D în oglindă**: buton `🪞 Simetrie` pentru desenarea instantanee a aripilor, corpurilor și fețelor simetrice pe axa X.
- 💡 **Ghidaj holografic 3D**: buton `💡 Ghidaj` care afișează un șablon geometric wireframe în aer adaptat provocării.
- 🤏 **Ciupit (Pinch deget mare + arătător)** -> Desenează direct în aer la vârful arătătorului.
- ✌️ **Peace Sign (2 degete)** -> Schimbă instant culoarea neon (Cyan, Magenta, Aur, Smarald, Violet).
- ✊ **Pumn strâns (Fist)** -> Undo pentru ultima linie trasată (cu feedback HUD și sunet pop).
- ✋ **Palma deschisă (Open Palm)** -> Șterge toate liniile desenate cu ultima culoare folosită (cu sunet whoosh)!
- 🔄 **Rotație 3D**: buton `🔄 Rotește` pentru inspecție rotativă 360° a sculpturii.
- 🎉 **Ecran de final**: rotație automată 360° ca o statuie de muzeu, statistici (timp, linii, culori) și buton `📸 Salvează Poză (PNG)`.

### Modul OpenCV Python (USV AI/AR)
Include detecție de deget mare + Haar Cascades pentru ochi și clipit:
```
python opencv_gestures.py
```
Rulează analiza pe camera web via `cv2`, afișează fereastră cu mască binară, contururi și boxuri ochi, transmițând deciziile live în joc prin WebSocket (`ws://localhost:8765`).

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
serve.py               server local fără cache, cu ?v= în link-urile spre module
tools/cache_bust.py    același ?v= la publicarea pe GitHub Pages
```

Parametri de test în URL: `?auto=pro`, `&answer=A|B|N`, `&prob=80&submit=1`, `&finish=1`.
