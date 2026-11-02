// Tastatura pe ecran pentru campurile de text (nume, cod camera, cuvant propriu),
// ca sa poti scrie si cu mana, fara tastatura fizica. Apare cand un camp primeste focus.

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM', 'ĂÂÎȘȚ'];

const isText = (el) => el?.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || !el.getAttribute('type'));

export class VirtualKeyboard {
  /** @param enabled  () => boolean — apare doar cand controlul cu mana e pornit */
  constructor(enabled) {
    this.enabled = enabled;
    this.input = null;
    this.el = document.createElement('div');
    this.el.id = 'vk';
    this.el.hidden = true;
    this.el.innerHTML = `
      <p class="vk-label"></p>
      ${ROWS.map((row) => `<div class="vk-row">${[...row].map((k) => `<button type="button" data-vk="${k}">${k}</button>`).join('')}</div>`).join('')}
      <div class="vk-row">
        <button type="button" data-vk="space" class="wide">Spațiu</button>
        <button type="button" data-vk="back" class="wide">⌫ Șterge</button>
        <button type="button" data-vk="ok" class="wide ok">OK</button>
      </div>`;
    // click-ul cu mouse-ul nu trebuie sa ia focusul de pe camp
    this.el.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vk]');
      if (b) this.press(b.dataset.vk);
    });
    document.addEventListener('focusin', (e) => {
      if (isText(e.target) && this.enabled()) this.open(e.target);
    });
    document.addEventListener('focusout', () => {
      setTimeout(() => { if (document.activeElement !== this.input) this.close(); }, 0);
    });
    document.body.appendChild(this.el);
  }

  open(input) {
    this.input = input;
    this.el.querySelector('.vk-label').textContent = input.getAttribute('aria-label') || input.placeholder || 'Scrie';
    this.el.hidden = false;
    document.body.classList.add('vk-open');
  }

  close() {
    this.input = null;
    this.el.hidden = true;
    document.body.classList.remove('vk-open');
  }

  press(key) {
    const input = this.input;
    if (!input?.isConnected) return this.close();
    if (key === 'ok') {
      const submit = !!input.form;
      input.blur();
      this.close();
      if (submit) input.form.requestSubmit();
      return;
    }
    let value = input.value;
    if (key === 'back') value = value.slice(0, -1);
    else if (key === 'space') value += ' ';
    else {
      const upper = input.name === 'hm-code' || value === '' || value.endsWith(' ');
      value += upper ? key : key.toLocaleLowerCase('ro-RO');
    }
    const max = input.maxLength > 0 ? input.maxLength : 200;
    input.value = value.slice(0, max);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
