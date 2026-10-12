// Incarcarea datelor, comuna pentru versiunea simpla si cea AR.

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadData() {
  const [pairsData, insights] = await Promise.all([
    loadJSON('data/pairs.json'),
    loadJSON('data/insights.json'),
  ]);
  return { pairs: pairsData.pairs, insights };
}

export function showLoadError(root, err) {
  root.innerHTML = `
    <section class="screen error">
      <h2>Nu am putut încărca datele</h2>
      <p>${String(err.message).replace(/[<>&]/g, '')}</p>
      <p class="muted">Pornește un server local din folderul <code>web</code> (<code>python -m http.server 8000</code>)
        și rulează întâi <code>python data/prepare.py</code>.</p>
    </section>`;
  console.error(err);
}
