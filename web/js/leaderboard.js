// Clasament: Supabase daca e configurat (config.js), altfel localStorage.
// Ambele au aceeasi interfata: list(mode, limit) si submit(entry).

import { SUPABASE } from './config.js';

const LIMIT = 10;
const NAME_MAX = 20;

export function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

const byScore = (a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at);

class LocalBoard {
  constructor() {
    this.online = false;
  }

  key(mode) {
    return `mmm.lb.${mode}`;
  }

  read(mode) {
    try { return JSON.parse(localStorage.getItem(this.key(mode))) ?? []; } catch { return []; }
  }

  async list(mode, limit = LIMIT) {
    return this.read(mode).sort(byScore).slice(0, limit);
  }

  async submit(entry) {
    const row = { ...entry, created_at: new Date().toISOString() };
    const rows = [...this.read(entry.mode), row].sort(byScore).slice(0, 50);
    try { localStorage.setItem(this.key(entry.mode), JSON.stringify(rows)); } catch { throw new Error('Browserul nu permite salvarea locală.'); }
    return row;
  }
}

class SupabaseBoard {
  constructor({ url, anonKey }) {
    this.online = true;
    this.base = `${url.replace(/\/$/, '')}/rest/v1/scores`;
    this.headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
  }

  async list(mode, limit = LIMIT) {
    const q = new URLSearchParams({
      select: 'name,score,answered,correct,created_at',
      mode: `eq.${mode}`,
      order: 'score.desc,created_at.asc',
      limit: String(limit),
    });
    const res = await fetch(`${this.base}?${q}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Clasamentul online nu răspunde (HTTP ${res.status}).`);
    return res.json();
  }

  async submit(entry) {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: { ...this.headers, Prefer: 'return=representation' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`Scorul nu a fost salvat (HTTP ${res.status}).`);
    const [row] = await res.json();
    return row;
  }
}

export const board = SUPABASE.url && SUPABASE.anonKey ? new SupabaseBoard(SUPABASE) : new LocalBoard();
export { NAME_MAX };
