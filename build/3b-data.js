
/* ═══════════════ MUTATIONS ═══════════════ */
async function createNote(body, opts = {}){
  const t = now();
  const n = {
    id: uid(),
    body: body.trim(),
    title: derivedTitle(body),
    tags: extractHashtags(body),
    starred: false,
    archived: false,
    deleted_at: null,
    created_at: opts.created_at || t,
    updated_at: t,
    device: S.deviceName,
    ai: null,
    _dirty: true,
    _aiTitle: false,
  };
  A.notes.unshift(n);
  await Store.put(n);
  render();
  queueSync();
  if (S.ai.enabled && S.ai.autoEnrich && S.ai.key) enrich(n, { quiet:true });
  return n;
}
async function patch(id, changes, opts = {}){
  const n = byId(id); if (!n) return;
  Object.assign(n, changes);
  if (!opts.silent) n.updated_at = now();
  n._dirty = true;
  await Store.put(n);
  if (!opts.noRender) render();
  queueSync();
  return n;
}
async function hardDelete(id){
  A.notes = A.notes.filter(n => n.id !== id);
  await Store.del(id);
  render();
}

/* ═══════════════ SUPABASE SYNC ═══════════════ */
const SYNC_COLS = ['id','body','title','tags','starred','archived','deleted_at','created_at','updated_at','device','ai'];
const wire = n => Object.fromEntries(SYNC_COLS.map(k => [k, n[k] ?? null]));

function sbReady(){ return S.sb.enabled && /^https?:\/\//.test(S.sb.url) && S.sb.key.length > 10; }
function sbUrl(path){ return S.sb.url.replace(/\/+$/,'') + '/rest/v1' + path; }
function sbHeaders(extra = {}){
  return { apikey:S.sb.key, Authorization:'Bearer ' + S.sb.key,
           'Content-Type':'application/json', ...extra };
}
async function sbFetch(path, init = {}){
  const res = await fetch(sbUrl(path), { ...init, headers: sbHeaders(init.headers) });
  if (!res.ok) throw new Error((await res.text()).slice(0, 300) || res.status);
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const queueSync = debounce(() => sync(), 1400);
let syncTimer = null;

async function sync(opts = {}){
  if (!sbReady() || A.syncing) return;
  A.syncing = true; A.syncErr = ''; paintSyncDot();
  try {
    /* push local changes */
    const dirty = A.notes.filter(n => n._dirty);
    if (dirty.length){
      for (let i = 0; i < dirty.length; i += 40){
        const batch = dirty.slice(i, i+40).map(wire);
        await sbFetch('/notes', {
          method:'POST',
          headers:{ Prefer:'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(batch),
        });
      }
      dirty.forEach(n => n._dirty = false);
      await Store.putMany(dirty);
    }
    /* pull remote changes */
    const since = S.sb.lastPull || '1970-01-01T00:00:00Z';
    const remote = await sbFetch(
      `/notes?select=*&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=2000`) || [];
    let changed = 0, newest = since;
    const toStore = [];
    for (const r of remote){
      if (r.updated_at > newest) newest = r.updated_at;
      const local = byId(r.id);
      if (!local){
        const n = { ...r, tags: r.tags || [], _dirty:false };
        A.notes.push(n); toStore.push(n); changed++;
      } else if (r.updated_at > local.updated_at){
        Object.assign(local, r, { tags: r.tags || [], _dirty:false });
        toStore.push(local); changed++;
      }
    }
    if (toStore.length) await Store.putMany(toStore);
    S.sb.lastPull = newest; saveSettings();
    if (changed){ resort(); render(); }
    if (opts.loud) toast(
      dirty.length || changed
        ? `Synced · ${dirty.length} up, ${changed} down`
        : 'Everything up to date', 'ok');
  } catch (e){
    A.syncErr = String(e.message || e);
    if (opts.loud) toast('Sync failed — ' + A.syncErr.slice(0,90), 'err');
  } finally {
    A.syncing = false; paintSyncDot();
  }
}
function startSyncLoop(){
  clearInterval(syncTimer);
  if (sbReady()) syncTimer = setInterval(() => sync(), 60000);
}
function paintSyncDot(){
  const d = $('#syncDot'); if (!d) return;
  d.className = 'status-dot ' + (!sbReady() ? '' : A.syncErr ? 'bad' : A.syncing ? 'warn' : 'ok');
  d.title = !sbReady() ? 'Sync off — notes stay on this device'
          : A.syncErr ? 'Sync error: ' + A.syncErr
          : A.syncing ? 'Syncing…' : 'Synced with your server';
}

/* ═══════════════ CLAUDE ═══════════════ */
const AI_URL = 'https://api.anthropic.com/v1/messages';
function aiReady(){ return S.ai.enabled && S.ai.key.trim().length > 10; }

async function claude({ system, messages, max_tokens = 1024, temperature = 1, stream = false, onDelta, prefill }){
  if (!aiReady()) throw new Error('No API key set. Open Settings → Intelligence.');
  const msgs = [...messages];
  if (prefill) msgs.push({ role:'assistant', content: prefill });
  const res = await fetch(AI_URL, {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': S.ai.key.trim(),
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true',
    },
    body: JSON.stringify({ model:S.ai.model || 'claude-sonnet-5', max_tokens, temperature, system, messages: msgs, stream }),
  });
  if (!res.ok){
    let m = await res.text();
    try { m = JSON.parse(m).error?.message || m; } catch {}
    if (res.status === 401) m = 'API key rejected. Check it in Settings.';
    if (res.status === 429) m = 'Rate limited by Anthropic — try again in a moment.';
    if (res.status === 404) m = `Model "${S.ai.model}" not found. Change it in Settings → Intelligence.`;
    throw new Error(m.slice(0, 220));
  }
  if (!stream){
    const j = await res.json();
    return (prefill || '') + (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  /* streamed */
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', out = prefill || '';
  if (prefill && onDelta) onDelta(prefill, out);
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream:true });
    const parts = buf.split('\n\n'); buf = parts.pop();
    for (const p of parts){
      const line = p.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;
      try {
        const ev = JSON.parse(line.slice(6));
        if (ev.type === 'content_block_delta' && ev.delta?.text){
          out += ev.delta.text;
          onDelta && onDelta(ev.delta.text, out);
        }
      } catch {}
    }
  }
  return out;
}
function grabJSON(txt){
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a === -1 || b === -1) throw new Error('Bad AI response');
  return JSON.parse(txt.slice(a, b+1));
}

/* ── auto-enrich a note: title, tags, one-line gist ── */
async function enrich(note, { quiet } = {}){
  if (!aiReady()) { if (!quiet) toast('Add your API key in Settings first', 'err'); return; }
  const clear = quiet ? null : toast('Analysing…', 'busy');
  try {
    const vocab = [...new Set(A.notes.flatMap(n => n.tags || []))].slice(0, 60);
    const out = await claude({
      max_tokens: 500, temperature: 0.3,
      system:
`You label a person's private captured thoughts. Be precise and plain — never inflate a scrappy note into something grand.
Return ONLY JSON: {"title": string, "tags": string[], "gist": string, "kind": string}
- title: max 8 words, plain, the note's actual subject. No colons-and-subtitles, no title case, no invented specificity.
- tags: 1-4 lowercase single words or hyphenated pairs. Reuse from the existing vocabulary when a good fit; invent only when needed.
- gist: one sentence, max 22 words, stating what this note is really about or what it's asking for. If the note is trivially short, just restate it.
- kind: one of idea, task, question, observation, reminder, feeling, reference, decision.
Existing tag vocabulary: ${vocab.join(', ') || '(none yet)'}`,
      messages:[{ role:'user', content: note.body.slice(0, 6000) }],
      prefill: '{"title":',
    });
    const j = grabJSON(out);
    const tags = [...new Set([
      ...extractHashtags(note.body),
      ...(j.tags || []).map(t => String(t).toLowerCase().replace(/^#/, '').trim()).filter(Boolean),
    ])].slice(0, 6);
    await patch(note.id, {
      title: (j.title || note.title).trim(),
      tags,
      ai: { gist: j.gist || '', kind: j.kind || '', at: now() },
      _aiTitle: true,
    }, { silent: quiet });
    clear && clear();
    if (!quiet) toast('Analysed', 'ok');
  } catch (e){
    clear && clear();
    if (!quiet) toast(String(e.message || e), 'err');
    else console.warn('[trace] enrich failed:', e);
  }
}

/* ── build context for questions ── */
function contextFor(question, budget = 90000){
  const live = A.notes.filter(n => !n.deleted_at && !n.archived);
  const q = tokens(question);
  const scored = live.map(n => {
    const t = tokens((n.title||'') + ' ' + n.body + ' ' + (n.tags||[]).join(' '));
    const set = new Set(t);
    let overlap = 0; q.forEach(w => { if (set.has(w)) overlap++; });
    const recency = 1 / (1 + (Date.now() - new Date(n.created_at)) / (DAY * 45));
    return { n, s: overlap * 2 + recency };
  }).sort((a,b) => b.s - a.s);

  const picked = []; let size = 0;
  for (const { n } of scored){
    const blob = `[${n.id.slice(0,8)}] ${new Date(n.created_at).toLocaleString()} `
      + `${(n.tags||[]).map(t=>'#'+t).join(' ')}\n${n.body}\n`;
    if (size + blob.length > budget) break;
    picked.push({ n, blob }); size += blob.length;
  }
  picked.sort((a,b) => a.n.created_at < b.n.created_at ? -1 : 1);
  return { text: picked.map(p => p.blob).join('\n---\n'), notes: picked.map(p => p.n) };
}
