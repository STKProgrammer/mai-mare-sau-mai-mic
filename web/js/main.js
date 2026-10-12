import { UI, applyTestParams } from './ui.js';
import { loadData, showLoadError } from './data.js';

const root = document.getElementById('app');

try {
  const ui = new UI(root, await loadData());
  ui.showMenu();
  applyTestParams(ui);
} catch (err) {
  showLoadError(root, err);
}
