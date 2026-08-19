<script>
/* ═══════════════════════════════════════════════════════════════
   Trace — a place for thoughts you don't want to lose.
   Local-first. Syncs to your own Supabase. Private AI on top.
   ═══════════════════════════════════════════════════════════════ */
(() => {
'use strict';

/* ─────────────── tiny helpers ─────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16); }));
const now = () => new Date().toISOString();
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const modKey = e => IS_MAC ? e.metaKey : e.ctrlKey;

/* ─────────────── time formatting ─────────────── */
const DAY = 864e5;
function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function timeOf(iso){
  return new Date(iso).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
}
function dayLabel(iso){
  const d = startOfDay(iso), t = startOfDay(new Date());
  const diff = Math.round((t - d) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return new Date(iso).toLocaleDateString([], { weekday:'long' });
  if (d.getFullYear() === t.getFullYear())
    return new Date(iso).toLocaleDateString([], { weekday:'short', month:'long', day:'numeric' });
  return new Date(iso).toLocaleDateString([], { month:'long', day:'numeric', year:'numeric' });
}
function fullStamp(iso){
  return new Date(iso).toLocaleString([], {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
    hour:'numeric', minute:'2-digit' });
}
function ago(iso){
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  if (s < 86400*30) return Math.floor(s/86400) + 'd ago';
  if (s < 86400*365) return Math.floor(s/(86400*30)) + 'mo ago';
  return Math.floor(s/(86400*365)) + 'y ago';
}

/* ─────────────── settings ─────────────── */
const SET_KEY = 'trace.settings.v1';
const DEFAULTS = {
  theme: 'system',
  ai:   { key:'', model:'claude-sonnet-5', enabled:true, autoEnrich:true },
  sb:   { url:'', key:'', enabled:false, lastPull:'' },
  enterSaves: false,
  deviceName: '',
};
let S = load();
function load(){
  try {
    const raw = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
    return { ...DEFAULTS, ...raw,
      ai:{ ...DEFAULTS.ai, ...(raw.ai||{}) },
      sb:{ ...DEFAULTS.sb, ...(raw.sb||{}) } };
  } catch { return structuredClone(DEFAULTS); }
}
function saveSettings(){ localStorage.setItem(SET_KEY, JSON.stringify(S)); }
if (!S.deviceName){
  S.deviceName = /iPhone/.test(navigator.userAgent) ? 'iPhone'
    : /iPad/.test(navigator.userAgent) ? 'iPad'
    : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Browser';
  saveSettings();
}

/* ─────────────── IndexedDB store ─────────────── */
const DB_NAME = 'trace', DB_VER = 1, STORE = 'notes';
let _db = null;
function db(){
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains(STORE)){
        const s = d.createObjectStore(STORE, { keyPath:'id' });
        s.createIndex('created_at', 'created_at');
        s.createIndex('updated_at', 'updated_at');
      }
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}
async function tx(mode, fn){
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let out;
    try { out = fn(s); } catch(e){ rej(e); return; }
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
const Store = {
  all(){ return tx('readonly', s => s.getAll()).then(r => r || []); },
  put(n){ return tx('readwrite', s => s.put(n)); },
  putMany(list){ return tx('readwrite', s => { list.forEach(n => s.put(n)); }); },
  del(id){ return tx('readwrite', s => s.delete(id)); },
};

/* ─────────────── app state ─────────────── */
const A = {
  notes: [],           // in-memory mirror, newest first
  view: 'all',         // all | today | starred | archive | trash | ask | tag
  tag: null,
  query: '',
  selected: null,      // note id
  thread: [],          // ask conversation
  busy: false,
  syncing: false,
  syncErr: '',
  palOpen: false,
  palIdx: 0,
  palItems: [],
};
const byId = id => A.notes.find(n => n.id === id);
function resort(){ A.notes.sort((a,b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0)); }

/* ─────────────── toasts ─────────────── */
function toast(msg, kind = ''){
  const t = el('div', 'toast ' + kind);
  if (kind === 'ok')  t.innerHTML = '<svg><use href="#i-check"/></svg>';
  if (kind === 'busy') t.innerHTML = '<span class="spin"></span>';
  t.appendChild(el('span', null, msg));
  $('#toasts').appendChild(t);
  const kill = () => { t.classList.add('out'); setTimeout(() => t.remove(), 320); };
  const timer = setTimeout(kill, kind === 'err' ? 5200 : 2400);
  return () => { clearTimeout(timer); kill(); };
}

/* ─────────────── text utilities ─────────────── */
const STOP = new Set(('a an and are as at be but by for from has have he her his i if in is it its me my of on or she so that the their them then there these they this to was we were what when which who will with you your'.split(' ')));
function tokens(str){
  return (str || '').toLowerCase().replace(/[^\p{L}\p{N}\s#]/gu, ' ')
    .split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}
function derivedTitle(body){
  const line = (body || '').trim().split('\n').find(l => l.trim()) || '';
  const clean = line.replace(/^#+\s*/, '').trim();
  /* no ellipsis baked in — the list clamps visually, the detail view wraps */
  return (clean.length > 160 ? clean.slice(0, 158).trimEnd() + '…' : clean) || 'Untitled';
}
function extractHashtags(body){
  return [...new Set((body.match(/(?:^|\s)#([\p{L}\p{N}_-]{2,24})/gu) || [])
    .map(t => t.trim().slice(1).toLowerCase()))];
}
/* similarity for "related notes" — no API needed */
function vec(n){
  const m = new Map();
  tokens((n.title || '') + ' ' + n.body + ' ' + (n.tags || []).join(' ')).forEach(w => m.set(w, (m.get(w)||0)+1));
  return m;
}
function cosine(a, b){
  let dot = 0, na = 0, nb = 0;
  a.forEach(v => na += v*v);
  b.forEach(v => nb += v*v);
  a.forEach((v, k) => { const o = b.get(k); if (o) dot += v*o; });
  return (na && nb) ? dot / Math.sqrt(na*nb) : 0;
}
function related(note, limit = 4){
  const v = vec(note);
  return A.notes
    .filter(n => n.id !== note.id && !n.deleted_at)
    .map(n => ({ n, s: cosine(v, vec(n)) }))
    .filter(x => x.s > 0.15)
    .sort((a,b) => b.s - a.s).slice(0, limit);
}
/* search scoring + highlight */
function matches(n, q){
  if (!q) return true;
  const hay = ((n.title||'') + ' ' + n.body + ' ' + (n.tags||[]).join(' ')).toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}
function hl(text, q){
  const s = esc(text);
  if (!q) return s;
  const terms = q.split(/\s+/).filter(t => t.length > 1).map(t => t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if (!terms.length) return s;
  return s.replace(new RegExp('(' + terms.join('|') + ')', 'gi'), '<mark>$1</mark>');
}
