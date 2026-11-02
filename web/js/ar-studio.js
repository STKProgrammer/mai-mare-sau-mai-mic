// Joc AR 3D Speed Draw (3 Minute Pictionary doar cu Mâinile).
//
// Comenzi gestuale în aer:
//   - 🤏 Ciupit (Pinch deget mare + arătător) -> Desenează cu creionul neon în spațiul 3D
//   - ✌️ Peace Sign (2 degete)               -> Schimbă culoarea neon
//   - ✊ Pumn strâns (Fist)                   -> Undo / Șterge ultima linie trasată
//   - ✋ Palma deschisă                       -> Șterge toate liniile cu ultima culoare folosită!
//
// Funcții speciale utile:
//   - Cameră PiP în dreapta-jos (nu pe fundal), cu fundal cyberpunk întunecat pentru contrast maxim
//   - Grosime reglabilă a creionului: Fin / Mediu / Gros
//   - Mod Simetrie 3D în Oglindă (🪞 Oglindire instantă pe axa X pentru rachete, inimi, avioane)
//   - Ghidaj holografic 3D (💡 Șablon ajutător în spațiu)
//   - Pauză / Reia cronometrul de 3 minute
//   - Rotație continuă 360° pentru inspecție spațială

const THREE = window.AFRAME?.THREE || window.THREE;

export const PALETTES = [
  { name: 'Cyan Neon', hex: '#38bdf8', three: 0x38bdf8 },
  { name: 'Magenta Cyber', hex: '#f43f5e', three: 0xf43f5e },
  { name: 'Aur Strălucitor', hex: '#fbbf24', three: 0xfbbf24 },
  { name: 'Verde Smarald', hex: '#2fd27a', three: 0x2fd27a },
  { name: 'Violet Galactic', hex: '#a855f7', three: 0xa855f7 },
];

export const PEN_SIZES = {
  thin: { radius: 0.012, label: 'Fin' },
  medium: { radius: 0.022, label: 'Mediu' },
  thick: { radius: 0.042, label: 'Gros' },
};

export const PROMPTS = [
  { icon: '🚀', name: 'O rachetă spațială', tip: 'Cilindru alungit, vârf ascuțit și 3 aripioare laterale', shape: 'rocket' },
  { icon: '🐱', name: 'O pisică', tip: 'Cap rotund, două urechi ascuțite și mustăți lungi', shape: 'cat' },
  { icon: '👑', name: 'O coroană regală', tip: 'Bază rotundă cu colți aurii ascuțiți', shape: 'crown' },
  { icon: '🕶️', name: 'Ochelari de soare', tip: 'Două rame mari conectate la mijloc', shape: 'glasses' },
  { icon: '🚗', name: 'O mașină', tip: 'Caroserie rotunjită și roți circulare', shape: 'car' },
  { icon: '⚡', name: 'Un fulger zig-zag', tip: 'Linii frânte rapide de sus în jos', shape: 'bolt' },
  { icon: '🍕', name: 'O felie de pizza', tip: 'Triunghi cu crustă groasă și cercuri de topping', shape: 'pizza' },
  { icon: '🏠', name: 'O căsuță', tip: 'Pătrat 3D, acoperiș triunghiular și ușă', shape: 'house' },
  { icon: '🌲', name: 'Un brad de Crăciun', tip: 'Trunchi drept și triunghiuri suprapuse', shape: 'tree' },
  { icon: '🎸', name: 'O chitară', tip: 'Corp ondulat în formă de 8 și gât lung', shape: 'guitar' },
  { icon: '🗡️', name: 'O sabie laser', tip: 'Mâner solid și o lamă lungă de lumină neon', shape: 'sword' },
  { icon: '☕', name: 'O cană de cafea', tip: 'Cilindru cu toartă și abur ondulat', shape: 'cup' },
  { icon: '✈️', name: 'Un avion', tip: 'Fuselaj lung, două aripi mari și coadă', shape: 'plane' },
  { icon: '⛵', name: 'O corabie pe valuri', tip: 'Corp arcuit, catarg și o velă triunghiulară', shape: 'boat' },
  { icon: '❤️', name: 'O inimă mare', tip: 'Două arce rotunde sus unite într-un vârf jos', shape: 'heart' },
  { icon: '⭐', name: 'O stea în 5 colțuri', tip: 'Desen continuu în 5 raze ascuțite', shape: 'star' },
  { icon: '🍦', name: 'O înghețată la cornet', tip: 'Triunghi cu con jos și cupe rotunde sus', shape: 'icecream' },
  { icon: '🪐', name: 'Planeta Saturn', tip: 'O sferă centrală înconjurată de un inel plat', shape: 'planet' },
  { icon: '💎', name: 'Un diamant uriaș', tip: 'Partea de sus plată și fațete triunghiulare', shape: 'diamond' },
  { icon: '🌸', name: 'O floare de primăvară', tip: 'Centru rotund și petale dispuse în cerc', shape: 'flower' },
  { icon: '🚁', name: 'Un elicopter', tip: 'Cabină ovală, patine de aterizare și elice mare', shape: 'heli' },
  { icon: '🎂', name: 'Un tort aniversar', tip: 'Cilindru etajat cu lumânări aprinse', shape: 'cake' },
  { icon: '🦋', name: 'Un fluture', tip: 'Corp subțire și două perechi de aripi simetrice', shape: 'butterfly' },
];

class AudioSynthesizer {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  play(kind, pan = 0, pitchMod = 0) {
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      if (this.ctx.createStereoPanner) {
        const panner = this.ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), t);
        gain.connect(panner);
        panner.connect(this.ctx.destination);
      } else {
        gain.connect(this.ctx.destination);
      }
      osc.connect(gain);

      if (kind === 'draw') {
        osc.type = 'sine';
        const baseFreq = 480 + pitchMod;
        osc.frequency.setValueAtTime(baseFreq, t);
        osc.frequency.exponentialRampToValueAtTime(baseFreq + 100, t + 0.05);
        gain.gain.setValueAtTime(0.025, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else if (kind === 'undo') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(340, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
      } else if (kind === 'whoosh') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(460, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.24);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.24);
        osc.start(t);
        osc.stop(t + 0.24);
      } else if (kind === 'color') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(659.25, t + 0.08);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.16);
        osc.start(t);
        osc.stop(t + 0.16);
      } else if (kind === 'tick') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.linearRampToValueAtTime(0, t + 0.04);
        osc.start(t);
        osc.stop(t + 0.04);
      } else if (kind === 'fanfare') {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.connect(g);
          g.connect(this.ctx.destination);
          o.frequency.setValueAtTime(freq, t + idx * 0.12);
          g.gain.setValueAtTime(0.15, t + idx * 0.12);
          g.gain.linearRampToValueAtTime(0, t + idx * 0.12 + 0.35);
          o.start(t + idx * 0.12);
          o.stop(t + idx * 0.12 + 0.35);
        });
      }
    } catch { /* audio blocat */ }
  }
}

const sound = new AudioSynthesizer();

export class ARStudio {
  /**
   * @param {HTMLElement} root Containerul DOM pentru UI
   * @param {object} options Opțiuni
   */
  constructor(root, { marker = null, onExit = null } = {}) {
    this.root = root;
    this.marker = marker;
    this.onExit = onExit;

    document.body.classList.add('studio-active');

    this.TOTAL_TIME = 180; // 3 minute (180s)
    this.timeLeft = this.TOTAL_TIME;
    this.timerInterval = null;
    this.isPaused = false;
    this.isFinished = false;

    this.penSize = 'medium';
    this.symmetry = false;
    this.autoRotate = false;
    this.showGuide = false;
    this.toolMode = 'draw'; // 'draw' | 'move'
    this.grabStart = null;
    this.sparkles = [];

    this.colorIdx = 0;
    this.history = []; // segmente trasate
    this.isDrawing = false;
    this.lastPoint = null;
    this.lastPointSym = null;
    this.lastColorChange = 0;
    this.lastUndoTime = 0;
    this.lastColorEraseTime = 0;
    this.colorsUsed = new Set([0]);

    this.prompt = this.pickPrompt();
    this.init3DScene();
    this.renderUI();
    this.startTimer();

    this.onVoiceCmd = (e) => {
      const cmd = e.detail?.cmd;
      if (!cmd) return;
      if (cmd === 'undo') this.undo();
      else if (cmd === 'color') this.cycleColor();
      else if (cmd === 'clear') this.clear();
      else if (cmd === 'symmetry') this.toggleSymmetry();
      else if (cmd === 'guide') this.toggleGuide();
      else if (cmd === 'move') this.toggleMoveMode();
      else if (cmd === 'rotate') this.toggleAutoRotate();
      else if (cmd === 'finish') this.finishDrawing(false);
      else if (cmd === 'pause') this.togglePause();
      else if (cmd === 'new') this.newPrompt();
    };
    window.addEventListener('ar-studio-cmd', this.onVoiceCmd);
  }

  pickPrompt() {
    const idx = Math.floor(Math.random() * PROMPTS.length);
    return PROMPTS[idx];
  }

  newPrompt() {
    this.clear();
    this.prompt = this.pickPrompt();
    this.timeLeft = this.TOTAL_TIME;
    this.isFinished = false;
    this.isPaused = false;
    this.colorsUsed.clear();
    this.colorsUsed.add(this.colorIdx);

    const titleEl = this.uiEl.querySelector('#prompt-title');
    if (titleEl) titleEl.innerHTML = `<span class="prompt-icon">${this.prompt.icon}</span> ${this.prompt.name}`;
    const tipEl = this.uiEl.querySelector('#prompt-tip');
    if (tipEl) tipEl.textContent = this.prompt.tip;

    this.updateGuideMesh();
    this.removeFinishOverlay();
    this.startTimer();
    this.updateTimerUI();
  }

  get currentColor() {
    return PALETTES[this.colorIdx];
  }

  get currentPenRadius() {
    return PEN_SIZES[this.penSize].radius;
  }

  init3DScene() {
    this.studioGroup = new THREE.Group();
    this.studioGroup.name = 'studio-creatie';

    // Grup particule scântei neon (Sparkles)
    this.sparkleGroup = new THREE.Group();
    this.sparkleGroup.name = 'sparkles';
    this.studioGroup.add(this.sparkleGroup);

    // Grup pentru ghidaj 3D
    this.guideGroup = new THREE.Group();
    this.guideGroup.name = 'ghidaj-holografic';
    this.guideGroup.visible = this.showGuide;
    this.studioGroup.add(this.guideGroup);
    this.updateGuideMesh();

    // Cursor 3D plutitor pe degetul arătător
    const cursorGeo = new THREE.SphereGeometry(this.currentPenRadius * 2.2, 16, 16);
    this.cursorMat = new THREE.MeshBasicMaterial({
      color: this.currentColor.three,
      transparent: true,
      opacity: 0.9,
    });
    this.cursorMesh = new THREE.Mesh(cursorGeo, this.cursorMat);
    this.studioGroup.add(this.cursorMesh);

    // Cursor simetric (când simetria e activată)
    const cursorSymGeo = new THREE.SphereGeometry(this.currentPenRadius * 2.2, 16, 16);
    this.cursorSymMat = new THREE.MeshBasicMaterial({
      color: this.currentColor.three,
      transparent: true,
      opacity: 0.6,
      wireframe: true,
    });
    this.cursorSymMesh = new THREE.Mesh(cursorSymGeo, this.cursorSymMat);
    this.cursorSymMesh.visible = false;
    this.studioGroup.add(this.cursorSymMesh);

    // Bază holografică discretă (grid AR)
    const gridHelper = new THREE.GridHelper(2.6, 14, 0x38bdf8, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -0.05;
    this.studioGroup.add(gridHelper);

    // Canvas WebGL dedicat
    this.canvas3D = document.createElement('canvas');
    this.canvas3D.id = 'studio-webgl-canvas';
    this.canvas3D.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;z-index:40;pointer-events:none;';
    document.body.appendChild(this.canvas3D);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 3.2);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.75);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(2, 4, 3);
    this.scene.add(ambLight, dirLight, this.studioGroup);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas3D,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.loop = () => {
      if (!this.studioGroup) return;

      // Rotație automată dacă utilizatorul a activat-o sau dacă runda s-a terminat
      if (this.isFinished || this.autoRotate) {
        this.studioGroup.rotation.y += 0.012;
      }

      // Animație particule neon / scântei
      if (this.sparkles && this.sparkles.length > 0) {
        for (let i = this.sparkles.length - 1; i >= 0; i--) {
          const s = this.sparkles[i];
          s.life -= 0.04;
          s.mesh.position.add(s.vel);
          s.mesh.scale.multiplyScalar(0.93);
          s.mesh.material.opacity = Math.max(0, s.life);
          if (s.life <= 0) {
            this.sparkleGroup.remove(s.mesh);
            s.mesh.geometry?.dispose?.();
            s.mesh.material?.dispose?.();
            this.sparkles.splice(i, 1);
          }
        }
      }

      this.renderer.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(this.loop);
    };
    this.loop();

    this.onResize = () => {
      if (!this.renderer || !this.camera) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResize);
  }

  updateGuideMesh() {
    if (!this.guideGroup) return;
    while (this.guideGroup.children.length > 0) {
      const c = this.guideGroup.children[0];
      this.guideGroup.remove(c);
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }

    const mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });

    const shape = this.prompt?.shape;
    let mesh = null;

    if (shape === 'rocket') {
      const geo = new THREE.ConeGeometry(0.35, 1.1, 8);
      mesh = new THREE.Mesh(geo, mat);
    } else if (shape === 'heart' || shape === 'cat') {
      const geo = new THREE.TorusGeometry(0.45, 0.15, 8, 16);
      mesh = new THREE.Mesh(geo, mat);
    } else if (shape === 'star') {
      const geo = new THREE.OctahedronGeometry(0.55, 0);
      mesh = new THREE.Mesh(geo, mat);
    } else if (shape === 'planet' || shape === 'pizza' || shape === 'crown') {
      const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 12);
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
      mesh = new THREE.Mesh(geo, mat);
    }

    if (mesh) this.guideGroup.add(mesh);
  }

  toggleGuide() {
    this.showGuide = !this.showGuide;
    this.guideGroup.visible = this.showGuide;
    const btn = this.uiEl.querySelector('[data-act="toggle-guide"]');
    if (btn) btn.classList.toggle('active', this.showGuide);
    this.showGestureHud('💡', this.showGuide ? 'Ghidaj 3D Activat' : 'Ghidaj 3D Ascuns');
  }

  toggleSymmetry() {
    this.symmetry = !this.symmetry;
    this.cursorSymMesh.visible = this.symmetry && !this.isFinished;
    const btn = this.uiEl.querySelector('[data-act="toggle-sym"]');
    if (btn) btn.classList.toggle('active', this.symmetry);
    this.showGestureHud('🪞', this.symmetry ? 'Simetrie 3D Pornită' : 'Simetrie Oprită');
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    const btn = this.uiEl.querySelector('[data-act="toggle-rotate"]');
    if (btn) btn.classList.toggle('active', this.autoRotate);
    this.showGestureHud('🔄', this.autoRotate ? 'Rotație 3D Pornită' : 'Rotație Oprită');
  }

  toggleMoveMode() {
    this.toolMode = this.toolMode === 'move' ? 'draw' : 'move';
    const isMove = this.toolMode === 'move';
    const btn = this.uiEl.querySelector('[data-act="toggle-move"]');
    if (btn) btn.classList.toggle('active', isMove);
    this.showGestureHud('🖐️', isMove ? 'Mod Mutare 3D (Ciupit mută)' : 'Mod Desenare');
  }

  spawnSparkle(pos) {
    if (!this.sparkleGroup || this.sparkles.length > 60) return;
    const geo = new THREE.OctahedronGeometry(0.018 + Math.random() * 0.012, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: this.currentColor.three,
      transparent: true,
      opacity: 0.95,
      wireframe: Math.random() > 0.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.x += (Math.random() - 0.5) * 0.04;
    mesh.position.y += (Math.random() - 0.5) * 0.04;
    mesh.position.z += (Math.random() - 0.5) * 0.04;

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 0.014,
      (Math.random() - 0.5) * 0.014 + 0.007,
      (Math.random() - 0.5) * 0.014
    );

    this.sparkleGroup.add(mesh);
    this.sparkles.push({ mesh, vel, life: 1.0 });
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const btn = this.uiEl.querySelector('[data-act="toggle-pause"]');
    if (btn) btn.innerHTML = this.isPaused ? '▶️ Reia' : '⏸️ Pauză';
    this.showGestureHud(this.isPaused ? '⏸️' : '▶️', this.isPaused ? 'Timp Pus pe Pauză' : 'Timp Reluat');
  }

  setPenSize(size) {
    if (!PEN_SIZES[size]) return;
    this.penSize = size;
    const rad = this.currentPenRadius;
    this.cursorMesh.scale.set(rad / 0.022, rad / 0.022, rad / 0.022);
    this.cursorSymMesh.scale.set(rad / 0.022, rad / 0.022, rad / 0.022);
    this.uiEl.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === size));
    this.showGestureHud('🖊️', `Grosime: ${PEN_SIZES[size].label}`);
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      if (this.timeLeft > 0 && !this.isFinished && !this.isPaused) {
        this.timeLeft--;
        this.updateTimerUI();
        if (this.timeLeft <= 10 && this.timeLeft > 0) {
          sound.play('tick');
        }
        if (this.timeLeft === 0) {
          this.finishDrawing(true);
        }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  updateTimerUI() {
    const timerText = this.uiEl?.querySelector('#studio-timer-text');
    const timerBar = this.uiEl?.querySelector('#studio-timer-bar');
    if (timerText) timerText.textContent = this.formatTime(this.timeLeft);
    if (timerBar) {
      const pct = (this.timeLeft / this.TOTAL_TIME) * 100;
      timerBar.style.width = `${pct}%`;
      if (pct < 20) timerBar.style.backgroundColor = '#ef4444';
      else if (pct < 50) timerBar.style.backgroundColor = '#f59e0b';
      else timerBar.style.backgroundColor = '#38bdf8';
    }
  }

  renderUI() {
    this.uiEl = document.createElement('div');
    this.uiEl.id = 'studio-overlay';
    this.uiEl.innerHTML = `
      <header class="studio-header">
        <div class="studio-prompt-card">
          <span class="studio-badge">🎯 Provocare 3D</span>
          <div class="prompt-info">
            <h2 id="prompt-title"><span class="prompt-icon">${this.prompt.icon}</span> ${this.prompt.name}</h2>
            <p class="prompt-tip" id="prompt-tip">${this.prompt.tip}</p>
          </div>
          <button class="btn btn-sm btn-subtle" data-act="new-prompt" title="Schimbă provocarea">🎲 Alt cuvânt</button>
        </div>

        <div class="studio-timer-card">
          <div class="timer-display">
            <span class="timer-icon">⏱️</span>
            <span id="studio-timer-text">${this.formatTime(this.timeLeft)}</span>
            <button class="btn-timer-ctrl" data-act="toggle-pause" title="Pauză / Reia timpul">⏸️ Pauză</button>
          </div>
          <div class="timer-bar-track">
            <div id="studio-timer-bar" class="timer-bar-fill"></div>
          </div>
        </div>

        <div class="studio-actions">
          <button class="btn btn-sm" data-act="undo" title="Șterge ultima linie (sau fă pumn ✊)">↺ Undo</button>
          <button class="btn btn-sm" data-act="erase-color" title="Șterge toate liniile cu ultima culoare folosită (sau deschide palma ✋)">✋ Șterge Culoarea</button>
          <button class="btn btn-sm" data-act="clear" title="Șterge tot desenul">🗑️ Curăță</button>
          <button class="btn btn-sm btn-finish" data-act="finish" title="Finalizează desenul">✅ Am terminat!</button>
          <button class="btn btn-sm btn-close" data-act="exit">✕ Înapoi</button>
        </div>
      </header>

      <!-- Feedback HUD plutitor pentru gesturi -->
      <div id="studio-gesture-hud" class="studio-hud" style="display:none;"></div>

      <div class="studio-toolbar">
        <div class="tool-group">
          <span class="tool-label">Grosime:</span>
          <div class="size-selector">
            <button class="size-btn" data-size="thin" title="Subțire">🖊️ Fin</button>
            <button class="size-btn active" data-size="medium" title="Mediu">🖌️ Mediu</button>
            <button class="size-btn" data-size="thick" title="Gros">🖍️ Gros</button>
          </div>
        </div>

        <div class="tool-group">
          <span class="tool-label">Unelte:</span>
          <div class="util-selector">
            <button class="util-btn" data-act="toggle-move" title="Ciupit mută toată sculptura în spațiu">🖐️ Mută 3D</button>
            <button class="util-btn" data-act="toggle-sym" title="Desenează simetric în ambele părți">🪞 Simetrie</button>
            <button class="util-btn" data-act="toggle-guide" title="Afișează șablon 3D ajutător">💡 Ghidaj</button>
            <button class="util-btn" data-act="toggle-rotate" title="Rotește desenul continuu 360°">🔄 Rotește</button>
          </div>
        </div>

        <div class="tool-group">
          <span class="tool-label">Culoare:</span>
          <div class="palette-selector">
            ${PALETTES.map(
              (p, i) => `
              <button class="color-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" style="--c:${p.hex}" title="${p.name}"></button>
            `
            ).join('')}
          </div>
        </div>
      </div>

      <div class="studio-hints">
        <span>🤏 <b>Ciupit:</b> Desenează în aer</span> · 
        <span>✌️ <b>Peace:</b> Schimbă culoare</span> · 
        <span>✊ <b>Pumn:</b> Undo</span> · 
        <span>✋ <b>Palma:</b> Șterge culoarea</span> · 
        <span>🎙️ <b>Voce:</b> Comenzi vocale active</span>
      </div>
    `;

    this.root.appendChild(this.uiEl);
    this.updateTimerUI();

    // Event listeners
    this.uiEl.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const size = e.target.closest('[data-size]')?.dataset.size;
      const color = e.target.closest('[data-idx]')?.dataset.idx;

      if (act === 'exit') this.destroy();
      else if (act === 'undo') this.undo();
      else if (act === 'erase-color') this.eraseLastColor();
      else if (act === 'clear') this.clear();
      else if (act === 'new-prompt') this.newPrompt();
      else if (act === 'toggle-pause') this.togglePause();
      else if (act === 'toggle-move') this.toggleMoveMode();
      else if (act === 'toggle-sym') this.toggleSymmetry();
      else if (act === 'toggle-guide') this.toggleGuide();
      else if (act === 'toggle-rotate') this.toggleAutoRotate();
      else if (act === 'finish') this.finishDrawing(false);
      else if (size) this.setPenSize(size);
      else if (color != null) this.setColor(Number(color));
    });
  }

  showGestureHud(icon, text) {
    const hud = this.uiEl?.querySelector('#studio-gesture-hud');
    if (!hud) return;
    hud.innerHTML = `<span>${icon}</span> <b>${text}</b>`;
    hud.style.display = 'flex';
    clearTimeout(this.hudTimeout);
    this.hudTimeout = setTimeout(() => {
      hud.style.display = 'none';
    }, 900);
  }

  setColor(idx) {
    this.colorIdx = idx % PALETTES.length;
    this.colorsUsed.add(this.colorIdx);
    this.cursorMat.color.setHex(this.currentColor.three);
    this.cursorSymMat.color.setHex(this.currentColor.three);
    this.uiEl.querySelectorAll('.color-dot').forEach((d, i) => d.classList.toggle('active', i === this.colorIdx));
  }

  cycleColor() {
    this.setColor(this.colorIdx + 1);
    sound.play('color');
    this.showGestureHud('✌️', `Culoare: ${this.currentColor.name}`);
  }

  /**
   * Procesare cadru MediaPipe pentru desen 3D și gesturi.
   */
  processFrame(frame, mirror = true) {
    if (!frame || !frame.landmarks || frame.landmarks.length < 21) {
      this.cursorMesh.visible = false;
      this.cursorSymMesh.visible = false;
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
      return;
    }

    const lm = frame.landmarks;
    const now = performance.now();

    const wrist = lm[0];
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const palmMiddle = lm[9]; // MCP mijlociu

    // Mapare coordonate normalizate -> spațiu 3D AR
    let x = (indexTip.x - 0.5) * 2.8;
    if (mirror) x = -x;
    const y = (0.5 - indexTip.y) * 2.2;
    const z = -((indexTip.z || 0) * 1.5);

    this.cursorMesh.visible = !this.isFinished;
    this.cursorMesh.position.set(x, y, z);

    if (this.symmetry) {
      this.cursorSymMesh.visible = !this.isFinished;
      this.cursorSymMesh.position.set(-x, y, z);
    } else {
      this.cursorSymMesh.visible = false;
    }

    if (this.isFinished) return;

    // Distanțe anatomice de referință
    const palmSize = Math.hypot(wrist.x - palmMiddle.x, wrist.y - palmMiddle.y) || 0.12;
    const dWrist = (idx) => Math.hypot(lm[idx].x - wrist.x, lm[idx].y - wrist.y);

    const isFolded = (tip, pip) => dWrist(tip) < dWrist(pip) * 1.12 || Math.hypot(lm[tip].x - palmMiddle.x, lm[tip].y - palmMiddle.y) < palmSize * 0.72;

    const indexFolded = isFolded(8, 6);
    const middleFolded = isFolded(12, 10);
    const ringFolded = isFolded(16, 14);
    const pinkyFolded = isFolded(20, 18);

    const foldedFingersCount = (indexFolded ? 1 : 0) + (middleFolded ? 1 : 0) + (ringFolded ? 1 : 0) + (pinkyFolded ? 1 : 0);

    const thumbFolded = Math.hypot(thumbTip.x - palmMiddle.x, thumbTip.y - palmMiddle.y) < palmSize * 0.85 ||
                        Math.hypot(thumbTip.x - lm[10].x, thumbTip.y - lm[10].y) < palmSize * 0.65;

    // 1. Detecție PUMN (Fist ✊) pentru Undo
    if (foldedFingersCount >= 3 && thumbFolded) {
      if (now - this.lastUndoTime > 800) {
        this.lastUndoTime = now;
        this.undo();
        this.showGestureHud('✊', 'Undo! Linie ștearsă');
      }
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
      return;
    }

    // 2. Detecție PALMA DESCHISĂ (✋) -> Șterge toate liniile cu ultima culoare folosită
    const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
    if (foldedFingersCount === 0 && !thumbFolded && pinchDist > 0.22) {
      if (now - this.lastColorEraseTime > 1200) {
        this.lastColorEraseTime = now;
        this.eraseLastColor();
      }
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
      return;
    }

    // 3. Schimbare culoare cu Peace Sign (✌️)
    if (!indexFolded && !middleFolded && ringFolded && pinkyFolded) {
      if (now - this.lastColorChange > 700) {
        this.lastColorChange = now;
        this.cycleColor();
      }
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
      return;
    }

    // 4. Mod Mutare 3D: Ciupitul (Pinch) mută întreaga sculptură în spațiu
    const isPinching = pinchDist < 0.09;
    if (this.toolMode === 'move') {
      if (isPinching) {
        const handPos = new THREE.Vector3(x, y, z);
        if (!this.grabStart) {
          this.grabStart = {
            hand: handPos.clone(),
            groupPos: this.studioGroup.position.clone(),
          };
          this.showGestureHud('✊', 'Sculptură Agățată!');
        } else {
          const delta = new THREE.Vector3().subVectors(handPos, this.grabStart.hand);
          this.studioGroup.position.addVectors(this.grabStart.groupPos, delta);
        }
      } else {
        this.grabStart = null;
      }
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
      return;
    }

    // 5. Desenare continuă când degetul mare ciupește arătătorul (Pinch 🤏)
    if (isPinching) {
      const pos = new THREE.Vector3(x, y, z);
      this.spawnLine(pos);
    } else {
      this.isDrawing = false;
      this.lastPoint = null;
      this.lastPointSym = null;
    }
  }

  spawnLine(pos) {
    if (this.lastPoint && this.lastPoint.distanceTo(pos) < 0.035) {
      return; // evită puncte duplicate
    }

    const color = this.currentColor.three;
    const rad = this.currentPenRadius;
    const colorIdx = this.colorIdx;

    if (this.lastPoint) {
      const dist = this.lastPoint.distanceTo(pos);
      const geom = new THREE.CylinderGeometry(rad, rad, dist, 8);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
      });
      const segment = new THREE.Mesh(geom, mat);
      segment.userData = { colorIdx, sym: false };

      const mid = new THREE.Vector3().addVectors(this.lastPoint, pos).multiplyScalar(0.5);
      segment.position.copy(mid);
      segment.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(pos, this.lastPoint).normalize()
      );

      this.studioGroup.add(segment);
      this.history.push(segment);

      // Desen simetric în oglindă
      if (this.symmetry && this.lastPointSym) {
        const posSym = new THREE.Vector3(-pos.x, pos.y, pos.z);
        const geomSym = new THREE.CylinderGeometry(rad, rad, dist, 8);
        const matSym = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.9,
        });
        const segSym = new THREE.Mesh(geomSym, matSym);
        segSym.userData = { colorIdx, sym: true };

        const midSym = new THREE.Vector3().addVectors(this.lastPointSym, posSym).multiplyScalar(0.5);
        segSym.position.copy(midSym);
        segSym.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3().subVectors(posSym, this.lastPointSym).normalize()
        );

        this.studioGroup.add(segSym);
        this.history.push(segSym);
      }

      this.spawnSparkle(pos);
      if (this.symmetry) {
        this.spawnSparkle(new THREE.Vector3(-pos.x, pos.y, pos.z));
      }

      const pan = Math.max(-1, Math.min(1, pos.x / 1.3));
      const pitchMod = pos.y * 100;
      sound.play('draw', pan, pitchMod);
    }

    this.lastPoint = pos.clone();
    this.lastPointSym = new THREE.Vector3(-pos.x, pos.y, pos.z);
  }

  undo() {
    const item = this.history.pop();
    if (item) {
      this.studioGroup.remove(item);
      item.geometry?.dispose?.();
      item.material?.dispose?.();

      // Dacă a fost simetric, mai ștergem și perechea sa
      if (item.userData?.sym && this.history.length > 0) {
        const pair = this.history.pop();
        this.studioGroup.remove(pair);
        pair.geometry?.dispose?.();
        pair.material?.dispose?.();
      }
      sound.play('undo');
    }
  }

  eraseLastColor() {
    if (this.history.length === 0) return;

    // Culoarea ultimului segment trasat sau culoarea selectată curent
    const lastSeg = this.history[this.history.length - 1];
    const targetColorIdx = lastSeg?.userData?.colorIdx ?? this.colorIdx;
    const colorObj = PALETTES[targetColorIdx];

    const toRemove = this.history.filter((seg) => seg.userData?.colorIdx === targetColorIdx);
    if (toRemove.length === 0) return;

    for (const seg of toRemove) {
      this.studioGroup.remove(seg);
      seg.geometry?.dispose?.();
      seg.material?.dispose?.();
    }

    this.history = this.history.filter((seg) => seg.userData?.colorIdx !== targetColorIdx);
    sound.play('whoosh');
    this.showGestureHud('✋', `Șters tot cu ${colorObj.name} (${toRemove.length} linii)!`);
  }

  clear() {
    while (this.history.length > 0) {
      const item = this.history.pop();
      this.studioGroup.remove(item);
      item.geometry?.dispose?.();
      item.material?.dispose?.();
    }
    this.studioGroup.rotation.set(0, 0, 0);
  }

  finishDrawing(isTimeout = false) {
    if (this.isFinished) return;
    this.isFinished = true;
    this.stopTimer();
    sound.play('fanfare');

    const elapsed = this.TOTAL_TIME - this.timeLeft;
    const timeUsedStr = `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

    const finishEl = document.createElement('div');
    finishEl.id = 'studio-finish-modal';
    finishEl.innerHTML = `
      <div class="finish-dialog">
        <div class="finish-badge">${isTimeout ? '⌛ Timpul a expirat!' : '🎉 Provocare Reușită!'}</div>
        <h2>Ai sculptat în 3D:</h2>
        <div class="finish-prompt-display">
          <span class="finish-icon">${this.prompt.icon}</span>
          <span class="finish-name">${this.prompt.name}</span>
        </div>
        <div class="finish-stats">
          <div class="stat-pill">⏱️ Timp: <b>${timeUsedStr}</b></div>
          <div class="stat-pill">🖌️ Linii: <b>${this.history.length}</b></div>
          <div class="stat-pill">🎨 Culori: <b>${this.colorsUsed.size}</b></div>
        </div>
        <p class="finish-rotation-hint">✨ Sculptura se rotește 360° automat în aer! Admir-o din toate unghiurile.</p>
        <div class="finish-actions">
          <button class="btn btn-primary" id="btn-download-shot">📸 Salvează Poză</button>
          <button class="btn btn-outline" id="btn-next-prompt">🎲 Următoarea Provocare (3 min)</button>
          <button class="btn btn-subtle" id="btn-close-studio">✕ Înapoi la Joc</button>
        </div>
      </div>
    `;

    this.uiEl.appendChild(finishEl);

    finishEl.querySelector('#btn-download-shot')?.addEventListener('click', () => this.downloadSnapshot());
    finishEl.querySelector('#btn-next-prompt')?.addEventListener('click', () => this.newPrompt());
    finishEl.querySelector('#btn-close-studio')?.addEventListener('click', () => this.destroy());
  }

  removeFinishOverlay() {
    const modal = this.uiEl.querySelector('#studio-finish-modal');
    modal?.remove();
  }

  downloadSnapshot() {
    if (!this.canvas3D) return;
    const dataURL = this.canvas3D.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `sculptura-3d-${this.prompt.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  }

  destroy() {
    document.body.classList.remove('studio-active');
    this.stopTimer();
    if (this.onVoiceCmd) window.removeEventListener('ar-studio-cmd', this.onVoiceCmd);
    if (this.animId) cancelAnimationFrame(this.animId);
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.clear();

    if (this.marker) {
      this.marker.removeObject3D('studio');
    }

    if (this.canvas3D) {
      this.renderer?.dispose();
      this.canvas3D.remove();
    }

    this.uiEl?.remove();
    this.studioGroup = null;

    if (this.onExit) this.onExit();
  }
}
