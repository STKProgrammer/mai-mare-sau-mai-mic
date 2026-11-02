import { UI, applyTestParams } from './ui.js';
import { loadData, showLoadError } from './data.js';
import { GestureController } from './gesture-detector.js';
import { HandTracker } from './hand.js';

const root = document.getElementById('app');

try {
  const ui = new UI(root, await loadData());
  const gestures = new GestureController(ui);
  ui.gestures = gestures;

  let tracker = null;
  ui.toggleCameraGestures = async () => {
    let video = document.getElementById('webcam-video');
    if (tracker) {
      tracker.stop();
      tracker = null;
      if (video) {
        video.srcObject?.getTracks().forEach((t) => t.stop());
        video.remove();
      }
      return;
    }
    if (!video) {
      video = document.createElement('video');
      video.id = 'webcam-video';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.cssText =
        'position:fixed;bottom:16px;right:16px;width:160px;height:120px;border-radius:12px;border:2px solid var(--win);z-index:90;object-fit:cover;transform:scaleX(-1);box-shadow:0 6px 24px rgba(0,0,0,0.6);';
      document.body.appendChild(video);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video.srcObject = stream;
      tracker = new HandTracker({
        onFrame: (f) => {
          gestures.processFrame(f, video);
          if (ui.studio) ui.studio.processFrame(f, true);
        },
        onStatus: (s) => console.log('Gestures status:', s),
      });
      tracker.start(video);
    } catch (e) {
      alert('Camera nu a putut fi pornită: ' + e.message);
      video.remove();
    }
  };

  ui.showMenu();
  applyTestParams(ui);
} catch (err) {
  showLoadError(root, err);
}
