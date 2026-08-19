
/* ═══════════════ COMMAND PALETTE ═══════════════ */
function commands(){
  return [
    { icon:'i-plus',    label:'New note',        hint:MOD+'N',  run:() => { A.view='all'; render(); focusCapture(); } },
    { icon:'i-ask',     label:'Ask Trace',       hint:MOD+'J',  run:openAsk },
    { icon:'i-digest',  label:'Digest — last 7 days',           run:() => runDigest(7) },
    { icon:'i-digest',  label:'Digest — last 30 days',          run:() => runDigest(30) },
    { icon:'i-shuffle', label:'Resurface a note',               run:resurface },
    { icon:'i-inbox',   label:'Go to All Notes',                run:() => { A.view='all'; A.tag=null; render(); } },
    { icon:'i-today',   label:'Go to Today',                    run:() => { A.view='today'; render(); } },
    { icon:'i-star',    label:'Go to Starred',                  run:() => { A.view='starred'; render(); } },
    { icon:'i-archive', label:'Go to Archive',                  run:() => { A.view='archive'; render(); } },
    { icon:'i-trash',   label:'Go to Trash',                    run:() => { A.view='trash'; render(); } },
    { icon:'i-cloud',   label:'Sync now',                       run:() => sync({ loud:true }) },
    { icon:'i-share',   label:'Export everything',              run:exportAll },
    { icon:'i-lock',    label:'Lock Trace',      hint:MOD+'L',  run:lockNow },
    { icon:'i-gear',    label:'Settings',        hint:MOD+',',  run:openSettings },
  ];
}
function palRender(){
  const q = $('#palInput').value.trim();
  const list = $('#palList'); list.innerHTML = '';
  A.palItems = [];

  const cmds = commands().filter(c => !q || c.label.toLowerCase().includes(q.toLowerCase()));
  if (cmds.length){
    list.appendChild(el('div','pal-sec', q ? 'Commands' : 'Actions'));
    cmds.slice(0, q ? 6 : 13).forEach(c => A.palItems.push({ ...c, kind:'cmd' }));
  }
  if (q){
    const hits = A.notes.filter(n => !n.deleted_at && matches(n, q)).slice(0, 12);
    if (hits.length){
      A.palItems.push({ kind:'sec', label:'Notes' });
      hits.forEach(n => A.palItems.push({
        kind:'note', icon:'i-inbox', label:n.title || derivedTitle(n.body),
        sub:`${dayLabel(n.created_at)} · ${n.body.replace(/\s+/g,' ').slice(0,70)}`,
        run:() => selectNote(n.id),
      }));
    }
    const t = q.replace(/^#/,'').toLowerCase();
    const allTags = [...new Set(A.notes.flatMap(n => n.tags||[]))].filter(x => x.includes(t)).slice(0,5);
    if (allTags.length){
      A.palItems.push({ kind:'sec', label:'Tags' });
      allTags.forEach(tag => A.palItems.push({
        kind:'tag', icon:'i-tag', label:'#'+tag,
        run:() => { A.view='tag'; A.tag=tag; render(); },
      }));
    }
    if (!hits.length && A.palItems.filter(i=>i.kind!=='sec').length === cmds.length){
      A.palItems.push({ kind:'sec', label:'Capture' });
      A.palItems.push({ icon:'i-plus', kind:'cmd', label:`Save “${q}” as a new note`,
        run:async () => { await createNote(q); toast('Saved','ok'); } });
    }
  }
  A.palIdx = Math.min(A.palIdx, Math.max(0, A.palItems.filter(i=>i.kind!=='sec').length - 1));
  let n = 0;
  A.palItems.forEach(it => {
    if (it.kind === 'sec'){ list.appendChild(el('div','pal-sec', it.label)); return; }
    const idx = n++;
    const b = el('button','pal-item' + (idx === A.palIdx ? ' on' : ''));
    b.innerHTML = `<svg class="ico"><use href="#${it.icon}"/></svg>`;
    const m = el('div','m'); m.appendChild(el('b','',it.label));
    if (it.sub) m.appendChild(el('span','',it.sub));
    b.appendChild(m);
    if (it.hint) b.appendChild(el('span','kbd', it.hint));
    b.onmouseenter = () => { A.palIdx = idx; $$('.pal-item', list).forEach((x,i)=>x.classList.toggle('on', i===idx)); };
    b.onclick = () => { closePal(); setTimeout(it.run, 60); };
    list.appendChild(b);
  });
  const on = $('.pal-item.on');
  if (on) on.scrollIntoView({ block:'nearest' });
}
function openPal(seed = ''){
  A.palOpen = true; A.palIdx = 0;
  $('#palette').classList.add('on'); $('#scrim').classList.add('on');
  const i = $('#palInput'); i.value = seed; palRender();
  setTimeout(() => { i.focus(); i.select(); }, 30);
}
function closePal(){
  A.palOpen = false;
  $('#palette').classList.remove('on');
  if (!$('#settings').classList.contains('on')) $('#scrim').classList.remove('on');
}
function palMove(d){
  const flat = A.palItems.filter(i => i.kind !== 'sec');
  if (!flat.length) return;
  A.palIdx = (A.palIdx + d + flat.length) % flat.length;
  palRender();
}
function palRun(){
  const flat = A.palItems.filter(i => i.kind !== 'sec');
  const it = flat[A.palIdx]; if (!it) return;
  closePal(); setTimeout(it.run, 60);
}

/* ═══════════════ SETTINGS ═══════════════ */
function rowSwitch(title, sub, get, set){
  const r = el('div','row');
  const l = el('div','lbl'); l.appendChild(el('b','',title)); if (sub) l.appendChild(el('span','',sub));
  r.appendChild(l);
  const sw = el('button','switch' + (get() ? ' on' : ''));
  sw.onclick = () => { set(!get()); sw.classList.toggle('on', get()); saveSettings(); };
  r.appendChild(sw); return r;
}
function rowInput(title, sub, val, onChange, opts = {}){
  const r = el('div','row');
  const l = el('div','lbl'); l.appendChild(el('b','',title)); if (sub) l.appendChild(el('span','',sub));
  r.appendChild(l);
  const i = document.createElement('input');
  i.type = opts.password ? 'password' : 'text';
  i.value = val; i.placeholder = opts.placeholder || '';
  i.spellcheck = false; i.autocapitalize = 'off'; i.autocomplete = 'off';
  i.onchange = () => { onChange(i.value.trim()); saveSettings(); };
  r.appendChild(i); return r;
}
function rowTap(title, sub, onClick, danger){
  const r = el('div','row tap' + (danger ? ' danger' : ''));
  const l = el('div','lbl'); l.appendChild(el('b','',title)); if (sub) l.appendChild(el('span','',sub));
  r.appendChild(l);
  r.onclick = onClick; return r;
}
function group(title, ...rows){
  const g = el('div','grp');
  if (title) g.appendChild(el('h3','',title));
  const c = el('div','card');
  rows.filter(r => r && r.tagName).forEach(r => c.appendChild(r));
  g.appendChild(c);
  rows.filter(r => typeof r === 'string').forEach(s => {
    const p = el('div','note-txt'); p.innerHTML = s; g.appendChild(p);
  });
  return g;
}
const MODELS = [
  ['claude-haiku-4-5',  'Fast',     'Haiku 4.5 — cheapest, good for auto-tagging'],
  ['claude-sonnet-5',   'Balanced', 'Sonnet 5 — the everyday choice'],
  ['claude-opus-5',     'Deep',     'Opus 5 — best reasoning, slowest, priciest'],
];
function modelRow(){
  const r = el('div','row');
  const l = el('div','lbl');
  l.appendChild(el('b','','Model'));
  const sub = el('span','', (MODELS.find(m => m[0] === S.ai.model) || [,, S.ai.model])[2]);
  l.appendChild(sub);
  r.appendChild(l);
  const seg = el('div','seg');
  MODELS.forEach(([id, label, desc]) => {
    const btn = el('button', S.ai.model === id ? 'on' : '', label);
    btn.onclick = () => {
      S.ai.model = id; saveSettings();
      $$('button', seg).forEach(b => b.classList.toggle('on', b === btn));
      sub.textContent = desc;
    };
    seg.appendChild(btn);
  });
  r.appendChild(seg);
  return r;
}
function paintSettings(){
  const b = $('#setBody'); b.innerHTML = '';

  /* appearance */
  const themeRow = el('div','row');
  const tl = el('div','lbl'); tl.appendChild(el('b','','Appearance'));
  themeRow.appendChild(tl);
  const seg = el('div','seg');
  [['system','Auto'],['light','Light'],['dark','Dark']].forEach(([v,lbl]) => {
    const btn = el('button', S.theme === v ? 'on' : '', lbl);
    btn.onclick = () => { S.theme = v; saveSettings(); applyTheme(); paintSettings(); };
    seg.appendChild(btn);
  });
  themeRow.appendChild(seg);
  b.appendChild(group('General', themeRow,
    rowSwitch('Return key saves', 'Off: Return makes a new line, ' + MOD + '↵ saves.',
      () => S.enterSaves, v => S.enterSaves = v),
    rowInput('This device', 'Shown on notes captured here.', S.deviceName, v => S.deviceName = v || 'Browser')
  ));

  /* intelligence */
  const keyRow = rowInput('Anthropic API key', 'Stored only in this browser. Never sent anywhere but Anthropic.',
    S.ai.key, v => { S.ai.key = v; render(); paintSettings(); }, { password:true, placeholder:'sk-ant-…' });
  b.appendChild(group('Intelligence',
    rowSwitch('Enable AI', 'Ask, digest, auto-titles and tags.', () => S.ai.enabled, v => { S.ai.enabled = v; render(); }),
    keyRow,
    modelRow(),
    rowSwitch('Auto-analyse on save', 'Quietly titles and tags each note as you capture it.',
      () => S.ai.autoEnrich, v => S.ai.autoEnrich = v),
    rowTap('Test connection', 'Send one tiny request to Anthropic.', async () => {
      const clear = toast('Testing…','busy');
      try { await claude({ max_tokens:12, messages:[{role:'user',content:'Reply with the word: ok'}] });
        clear(); toast('Connection works','ok'); }
      catch(e){ clear(); toast(String(e.message||e),'err'); }
    }),
    `Get a key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. It lives in this browser's local storage on this device only — it is never written to your notes or your database.<br><br>Auto-analyse runs one small request per note. Ask and Digest send the notes they need as context, so a big vault costs more per question — Fast is a sensible model for day-to-day, Deep for the weekly read-back.`
  ));

  /* privacy */
  const graceRow = el('div','row');
  const gl = el('div','lbl'); gl.appendChild(el('b','','Require passcode'));
  const gs = el('span','', graceLabel()); gl.appendChild(gs);
  graceRow.appendChild(gl);
  const gseg = el('div','seg');
  GRACE.forEach(([v, lbl]) => {
    const btn = el('button', (S.lock?.grace ?? 0) === v ? 'on' : '', lbl);
    btn.onclick = () => {
      S.lock.grace = v; saveSettings();
      $$('button', gseg).forEach(x => x.classList.toggle('on', x === btn));
      gs.textContent = graceLabel();
    };
    gseg.appendChild(btn);
  });
  graceRow.appendChild(gseg);
  const on = lockOn();
  b.appendChild(group('Privacy',
    rowSwitch('Passcode', on ? `${S.lock.len} digits.` : 'Off — anyone who opens this sees your notes.',
      () => lockOn(), v => togglePasscode(v)),
    on ? rowTap('Change passcode', 'You’ll enter the current one first.', changePasscode) : null,
    on ? graceRow : null,
    on ? rowTap('Lock now', 'Same as ' + MOD + 'L.', () => { closeSettings(); setTimeout(lockNow, 220); }) : null,
    `The passcode is stored as a salted PBKDF2 hash, never in plain text, and it hides your notes the moment you leave the app. Be clear-eyed about what it is though: a lock screen, not encryption. It stops someone picking up your unlocked phone — it will not stop someone with this device and the developer tools open.`
  ));

  /* sync */
  b.appendChild(group('Sync',
    rowSwitch('Sync to my server', 'Notes mirror to your own Supabase.', () => S.sb.enabled,
      v => { S.sb.enabled = v; startSyncLoop(); paintSyncDot(); if (v) sync({loud:true}); }),
    rowInput('Supabase URL', 'e.g. https://supabase.ry-server.com', S.sb.url,
      v => { S.sb.url = v; startSyncLoop(); }, { placeholder:'https://…' }),
    rowInput('Anon key', 'The public anon key for that project.', S.sb.key,
      v => { S.sb.key = v; startSyncLoop(); }, { password:true, placeholder:'eyJ…' }),
    rowTap('Sync now', A.syncErr ? '⚠︎ ' + A.syncErr.slice(0,70)
      : sbReady() ? 'Last pulled ' + (S.sb.lastPull ? ago(S.sb.lastPull) : 'never')
      : 'Turn on sync and add your URL and key.', () => sync({ loud:true })),
    rowTap('Re-pull everything', 'Forget the sync watermark and read the whole table again.', () => {
      S.sb.lastPull = ''; saveSettings(); sync({ loud:true });
    }),
    `Run <b>schema.sql</b> from the repo in your Supabase SQL editor once to create the <code>notes</code> table. Until sync is on, everything stays on this device — nothing is lost either way.`
  ));

  /* data */
  const count = A.notes.length;
  b.appendChild(group('Your data',
    rowTap('Export as JSON', `${count} note${count===1?'':'s'} · a complete, restorable backup.`, () => exportAll('json')),
    rowTap('Export as Markdown', 'One readable file, newest first.', () => exportAll('md')),
    rowTap('Import from JSON', 'Merge a previous export back in.', importJSON),
    rowTap('Empty trash', `${A.notes.filter(n=>n.deleted_at).length} note(s) waiting.`, async () => {
      const dead = A.notes.filter(n => n.deleted_at);
      if (!dead.length) return toast('Trash is already empty');
      if (!confirm(`Permanently delete ${dead.length} note(s)?`)) return;
      for (const n of dead) await hardDelete(n.id);
      toast('Trash emptied','ok'); paintSettings();
    }, true)
  ));

  const v = el('div','note-txt');
  v.style.textAlign = 'center'; v.style.marginTop = '26px'; v.style.opacity = '.7';
  v.innerHTML = `Trace · built for Ryan · ${count} note${count===1?'':'s'} kept`;
  b.appendChild(v);
}
function openSettings(){
  paintSettings();
  $('#settings').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSettings(){
  $('#settings').classList.remove('on');
  if (!A.palOpen) $('#scrim').classList.remove('on');
  render(); startSyncLoop();
}

/* ═══════════════ EXPORT / IMPORT ═══════════════ */
function download(name, text, type){
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportAll(fmt = 'json'){
  const stamp = new Date().toISOString().slice(0,10);
  if (fmt === 'md'){
    const md = A.notes.filter(n => !n.deleted_at).map(n =>
      `## ${n.title || derivedTitle(n.body)}\n*${fullStamp(n.created_at)}*`
      + ((n.tags||[]).length ? `  \n${n.tags.map(t=>'#'+t).join(' ')}` : '')
      + `\n\n${n.body}\n`).join('\n---\n\n');
    download(`trace-${stamp}.md`, `# Trace — ${A.notes.length} notes\n\n${md}`, 'text/markdown');
  } else {
    const clean = A.notes.map(n => { const c = { ...n }; delete c._dirty; delete c._aiTitle; return c; });
    download(`trace-${stamp}.json`, JSON.stringify({ app:'trace', version:1, exported_at:now(), notes:clean }, null, 2), 'application/json');
  }
  toast('Exported','ok');
}
function importJSON(){
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.json,application/json';
  i.onchange = async () => {
    const f = i.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = Array.isArray(data) ? data : data.notes || [];
      let added = 0, updated = 0;
      const store = [];
      for (const r of incoming){
        if (!r.id || typeof r.body !== 'string') continue;
        const local = byId(r.id);
        const rec = { tags:[], starred:false, archived:false, deleted_at:null, ai:null,
                      created_at:r.created_at || now(), updated_at:r.updated_at || now(),
                      title:r.title || derivedTitle(r.body), device:r.device || 'import',
                      ...r, _dirty:true };
        if (!local){ A.notes.push(rec); store.push(rec); added++; }
        else if ((rec.updated_at||'') > (local.updated_at||'')){ Object.assign(local, rec); store.push(local); updated++; }
      }
      await Store.putMany(store);
      resort(); render(); queueSync(); paintSettings();
      toast(`Imported — ${added} new, ${updated} updated`, 'ok');
    } catch(e){ toast('Could not read that file','err'); }
  };
  i.click();
}

/* ═══════════════ THEME ═══════════════ */
function applyTheme(){
  const r = document.documentElement;
  if (S.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', S.theme);
  const dark = S.theme === 'dark' || (S.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name=theme-color]').forEach(m => m.remove());
  const m = document.createElement('meta');
  m.name = 'theme-color'; m.content = dark ? '#000000' : '#ffffff';
  document.head.appendChild(m);
}
