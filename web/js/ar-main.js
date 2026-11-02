import { ARView } from './ar-view.js';
import { applyTestParams } from './ui.js';
import { ARScene } from './ar-scene.js';
import { loadData, showLoadError } from './data.js';

const root = document.getElementById('app');
const status = document.getElementById('cam-status');
const sceneEl = document.querySelector('a-scene');

window.addEventListener('camera-init', () => status.remove());
window.addEventListener('camera-error', (e) => {
  status.classList.add('error');
  const name = e.detail?.error?.name ?? '';
  status.innerHTML = `
    <b>Camera nu a pornit${name ? ` (${name})` : ''}.</b>
    ${name === 'NotAllowedError' ? 'Permite accesul la cameră din bara de adrese și reîncarcă pagina.' : 'Verifică dacă altă aplicație folosește camera.'}
    <a href="index.html">Joacă fără cameră</a>`;
});

const sceneReady = new Promise((resolve) => {
  if (sceneEl.hasLoaded) resolve();
  else sceneEl.addEventListener('loaded', resolve, { once: true });
});

try {
  const [data] = await Promise.all([loadData(), sceneReady]);
  const scene = new ARScene(document.getElementById('marker'));
  const ui = new ARView(root, data, scene);
  ui.showMenu();

  // Sursa imagine (ar-test.html) nu emite camera-init
  if (sceneEl.getAttribute('arjs')?.sourceType === 'image') status.remove();

  // controlul cu mana porneste cand camera e gata (video-ul AR.js)
  const attachHand = () => ui.hand.attach(document.getElementById('arjs-video'));
  if (document.getElementById('arjs-video')?.srcObject) attachHand();
  else window.addEventListener('camera-init', () => setTimeout(attachHand, 300), { once: true });

  applyTestParams(ui);
  if (new URLSearchParams(location.search).has('debug')) window.__mmm = { ui, scene };
} catch (err) {
  root.classList.add('solid');
  showLoadError(root, err);
}
