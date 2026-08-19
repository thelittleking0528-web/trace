
/* ═══════════════ light markdown ═══════════════ */
function md(t){
  let s = esc(t);
  s = s.replace(/`([^`\n]+)`/g, '<code style="font-family:var(--font-mono);font-size:.9em;background:var(--fill);padding:1px 5px;border-radius:5px">$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="font-weight:600">$1</strong>');
  s = s.replace(/^###\s+(.+)$/gm, '<div style="font-weight:600;margin:16px 0 4px;letter-spacing:-.015em">$1</div>');
  s = s.replace(/^##\s+(.+)$/gm, '<div style="font-weight:640;font-size:1.06em;margin:18px 0 5px;letter-spacing:-.02em">$1</div>');
  s = s.replace(/^\s*[-*•]\s+(.+)$/gm, '<div style="display:flex;gap:9px;margin:3px 0"><span style="color:var(--text-3)">•</span><span>$1</span></div>');
  s = s.replace(/^\s*(\d+)\.\s+(.+)$/gm, '<div style="display:flex;gap:9px;margin:3px 0"><span style="color:var(--text-3);font-variant-numeric:tabular-nums">$1.</span><span>$2</span></div>');
  return s;
}

/* ═══════════════ filtering ═══════════════ */
function visible(){
  const q = A.query.trim();
  let list = A.notes;
  switch (A.view){
    case 'trash':   list = list.filter(n => n.deleted_at); break;
    case 'archive': list = list.filter(n => n.archived && !n.deleted_at); break;
    case 'today': {
      const t = startOfDay(new Date()).toISOString();
      list = list.filter(n => !n.deleted_at && !n.archived && n.created_at >= t); break;
    }
    case 'starred': list = list.filter(n => n.starred && !n.deleted_at); break;
    case 'tag':     list = list.filter(n => !n.deleted_at && (n.tags||[]).includes(A.tag)); break;
    default:        list = list.filter(n => !n.deleted_at && !n.archived);
  }
  return q ? list.filter(n => matches(n, q)) : list;
}

const VIEWS = {
  all:     { title:'All Notes',  icon:'i-inbox'   },
  today:   { title:'Today',      icon:'i-today'   },
  starred: { title:'Starred',    icon:'i-star'    },
  archive: { title:'Archive',    icon:'i-archive' },
  trash:   { title:'Trash',      icon:'i-trash'   },
  ask:     { title:'Ask Trace',  icon:'i-ask'     },
};

/* ═══════════════ sidebar ═══════════════ */
function navBtn({ icon, label, count, active, onClick, dot }){
  const b = el('button', 'nav-item' + (active ? ' active' : ''));
  b.innerHTML = `<svg class="ico"><use href="#${icon}"/></svg>`;
  b.appendChild(el('span', 'lbl', label));
  if (dot){ const d = el('span','dot'); d.style.background = dot; b.appendChild(d); }
  if (count != null && count > 0) b.appendChild(el('span', 'cnt', String(count)));
  b.onclick = onClick;
  return b;
}
function paintNav(){
  const live = A.notes.filter(n => !n.deleted_at && !n.archived);
  const t0 = startOfDay(new Date()).toISOString();
  const main = $('#navMain'); main.innerHTML = '';
  const go = v => () => { A.view = v; A.tag = null; A.query = ''; $('#searchInput').value=''; closeSidebar(); render(); };
  main.appendChild(navBtn({ icon:'i-inbox',   label:'All Notes', count:live.length, active:A.view==='all',     onClick:go('all') }));
  main.appendChild(navBtn({ icon:'i-today',   label:'Today',     count:live.filter(n=>n.created_at>=t0).length, active:A.view==='today', onClick:go('today') }));
  main.appendChild(navBtn({ icon:'i-star',    label:'Starred',   count:A.notes.filter(n=>n.starred&&!n.deleted_at).length, active:A.view==='starred', onClick:go('starred') }));
  main.appendChild(navBtn({ icon:'i-archive', label:'Archive',   count:A.notes.filter(n=>n.archived&&!n.deleted_at).length, active:A.view==='archive', onClick:go('archive') }));
  main.appendChild(navBtn({ icon:'i-trash',   label:'Trash',     count:A.notes.filter(n=>n.deleted_at).length, active:A.view==='trash', onClick:go('trash') }));

  const ai = $('#navAI'); ai.innerHTML = '';
  ai.appendChild(el('div','nav-label','Intelligence'));
  ai.appendChild(navBtn({ icon:'i-ask',     label:'Ask Trace', active:A.view==='ask', onClick:() => { openAsk(); closeSidebar(); } }));
  ai.appendChild(navBtn({ icon:'i-digest',  label:'Digest',    onClick:() => { closeSidebar(); runDigest(7); } }));
  ai.appendChild(navBtn({ icon:'i-shuffle', label:'Resurface', onClick:() => { closeSidebar(); resurface(); } }));

  const counts = new Map();
  live.forEach(n => (n.tags||[]).forEach(t => counts.set(t, (counts.get(t)||0)+1)));
  const tags = [...counts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0, 24);
  const tg = $('#navTags'); tg.innerHTML = '';
  if (tags.length){
    tg.appendChild(el('div','nav-label','Tags'));
    tags.forEach(([t, c]) => tg.appendChild(navBtn({
      icon:'i-tag', label:t, count:c, active:A.view==='tag' && A.tag===t,
      onClick:() => { A.view='tag'; A.tag=t; closeSidebar(); render(); }
    })));
  }
}

/* ═══════════════ note list ═══════════════ */
function noteCard(n){
  const b = el('button', 'note' + (A.selected === n.id ? ' sel' : ''));
  b.dataset.id = n.id;
  const top = el('div', 'note-top');
  const ttl = el('div', 'note-title');
  ttl.innerHTML = hl(n.title || derivedTitle(n.body), A.query);
  top.appendChild(ttl);
  if (n.starred){ const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('class','star'); s.innerHTML = '<use href="#i-star-f"/>'; top.appendChild(s); }
  const tm = el('div', 'note-time', timeOf(n.created_at)); top.appendChild(tm);
  b.appendChild(top);

  const rest = n.body.trim();
  const firstLine = rest.split('\n')[0] || '';
  /* if the title was derived from the opening line, don't repeat that line below it */
  const derived = !n._aiTitle && derivedTitle(n.body) === (n.title || '');
  const preview = derived ? rest.slice(firstLine.length).trim() : rest;
  if (preview){
    const bd = el('div', 'note-body');
    bd.innerHTML = hl(preview.slice(0, 260), A.query);
    b.appendChild(bd);
  }
  const tags = n.tags || [];
  if (tags.length){
    const m = el('div', 'note-meta');
    tags.slice(0,5).forEach(t => m.appendChild(el('span','tag','#'+t)));
    b.appendChild(m);
  }
  b.onclick = () => selectNote(n.id);
  return b;
}
function renderList(){
  const wrap = $('#list'); wrap.innerHTML = '';
  const list = visible();
  $('#viewTitle').textContent = A.view === 'tag' ? '#' + A.tag : VIEWS[A.view].title;
  $('#viewSub').textContent = A.query
    ? `${list.length} result${list.length===1?'':'s'}`
    : list.length ? `${list.length} note${list.length===1?'':'s'}` : '';

  if (!list.length){
    const e = el('div','empty');
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.innerHTML = `<use href="#${A.query ? 'i-search' : VIEWS[A.view]?.icon || 'i-inbox'}"/>`;
    svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor');
    e.appendChild(svg);
    if (A.query){
      e.appendChild(el('h4','','No matches'));
      e.appendChild(el('p','',`Nothing in ${A.view === 'all' ? 'your notes' : VIEWS[A.view]?.title || 'this view'} contains “${A.query}”.`));
    } else if (A.view === 'all'){
      e.appendChild(el('h4','','Nothing here yet'));
      e.appendChild(el('p','','Type the thought above and press ' + MOD + '↵. It gets a timestamp and stays forever.'));
    } else if (A.view === 'trash'){
      e.appendChild(el('h4','','Trash is empty'));
      e.appendChild(el('p','','Deleted notes stay here until you empty the trash. Nothing disappears on its own.'));
    } else {
      e.appendChild(el('h4','','Nothing in ' + (A.view==='tag' ? '#'+A.tag : VIEWS[A.view].title)));
      e.appendChild(el('p','','It fills up as you capture.'));
    }
    wrap.appendChild(e);
    return;
  }
  let day = '';
  list.forEach((n, i) => {
    const d = dayLabel(n.created_at);
    if (d !== day){
      day = d;
      const h = el('div','day-head');
      h.appendChild(el('h3','',d));
      h.appendChild(el('span','', new Date(n.created_at).toLocaleDateString([], { month:'short', day:'numeric' })));
      wrap.appendChild(h);
    }
    const c = noteCard(n);
    c.style.animationDelay = Math.min(i, 12) * 14 + 'ms';
    wrap.appendChild(c);
  });
}

/* ═══════════════ detail pane ═══════════════ */
function selectNote(id){
  A.selected = id;
  $('#detail').hidden = false;
  $('#detail').classList.add('open');
  render();
  $('#dScroll').scrollTop = 0;
}
function closeDetail(){
  A.selected = null;
  $('#detail').classList.remove('open');
  $('#detail').hidden = true;
  render();
}
function sec(label, icon){
  const s = el('div','d-sec');
  const h = el('div','d-sec-h');
  h.innerHTML = `<svg><use href="#${icon}"/></svg>`;
  h.appendChild(el('span','',label));
  h.appendChild(el('span','grow'));
  s.appendChild(h);
  return s;
}
function paintDetail(){
  const d = $('#detail');
  const n = A.selected ? byId(A.selected) : null;
  if (!n){ d.hidden = true; d.classList.remove('open'); return; }
  d.hidden = false;

  $('#dStar').classList.toggle('on', !!n.starred);
  $('#dStar').firstElementChild.innerHTML = `<use href="#${n.starred ? 'i-star-f' : 'i-star'}"/>`;
  $('#dArchive').classList.toggle('on', !!n.archived);
  $('#dEnrich').classList.toggle('hide', !aiReady());

  const s = $('#dScroll'); s.innerHTML = '';

  const t = el('h2','d-title', n.title || derivedTitle(n.body));
  t.contentEditable = 'plaintext-only'; t.spellcheck = false;
  t.onblur = () => { const v = t.textContent.trim(); if (v && v !== n.title) patch(n.id, { title:v, _aiTitle:false }); };
  t.onkeydown = ev => { if (ev.key === 'Enter'){ ev.preventDefault(); t.blur(); } };
  s.appendChild(t);

  const st = el('div','d-stamp');
  st.innerHTML = `${esc(fullStamp(n.created_at))} · <span title="${esc(fullStamp(n.updated_at))}">${esc(ago(n.created_at))}</span>`
    + (n.device ? ` · ${esc(n.device)}` : '');
  s.appendChild(st);

  const body = el('textarea','d-body');
  body.value = n.body; body.rows = 1;
  const grow = () => { body.style.height='auto'; body.style.height = body.scrollHeight + 'px'; };
  body.oninput = grow;
  body.onblur = () => {
    const v = body.value;
    if (v !== n.body) patch(n.id, { body:v, tags:[...new Set([...(n.tags||[]), ...extractHashtags(v)])] });
  };
  s.appendChild(body);
  requestAnimationFrame(grow);

  if (n.ai?.gist){
    const g = sec('What this is', 'i-spark');
    const c = el('div','ai-card');
    c.innerHTML = (n.ai.kind ? `<strong>${esc(n.ai.kind[0].toUpperCase()+n.ai.kind.slice(1))}.</strong> ` : '') + esc(n.ai.gist);
    g.appendChild(c); s.appendChild(g);
  }

  const tg = sec('Tags', 'i-tag');
  const chips = el('div','chips');
  (n.tags||[]).forEach(tag => {
    const c = el('button','chip','#'+tag);
    c.title = 'Filter by #' + tag + ' · shift-click to remove';
    c.onclick = ev => {
      if (ev.shiftKey){ patch(n.id, { tags:(n.tags||[]).filter(x=>x!==tag) }); return; }
      A.view='tag'; A.tag=tag; render();
    };
    chips.appendChild(c);
  });
  const add = el('button','chip add','+ tag');
  add.onclick = () => {
    const v = prompt('Add a tag'); if (!v) return;
    patch(n.id, { tags:[...new Set([...(n.tags||[]), v.toLowerCase().replace(/^#/,'').trim()])] });
  };
  chips.appendChild(add); tg.appendChild(chips); s.appendChild(tg);

  const rel = related(n);
  if (rel.length){
    const r = sec('Related', 'i-link');
    rel.forEach(({ n:o, s:score }) => {
      const b = el('button','link-note');
      b.appendChild(el('span','t', o.title || derivedTitle(o.body)));
      b.appendChild(el('span','s', `${dayLabel(o.created_at)} · ${Math.round(score*100)}% similar`));
      b.onclick = () => selectNote(o.id);
      r.appendChild(b);
    });
    s.appendChild(r);
  }

  const act = sec('Actions', 'i-spark');
  const row = el('div','chips');
  if (aiReady()){
    const ask = el('button','btn sm','Ask about this');
    ask.onclick = () => { openAsk(); $('#askInput').value = `About my note "${n.title}": `; $('#askInput').focus(); };
    row.appendChild(ask);
    const exp = el('button','btn sm','Expand it');
    exp.onclick = () => expandNote(n);
    row.appendChild(exp);
  }
  const cp = el('button','btn sm','Copy');
  cp.onclick = async () => { await navigator.clipboard.writeText(n.body); toast('Copied','ok'); };
  row.appendChild(cp);
  if (n.deleted_at){
    const rs = el('button','btn sm','Restore');
    rs.onclick = () => { patch(n.id, { deleted_at:null }); toast('Restored','ok'); };
    row.appendChild(rs);
    const fd = el('button','btn sm','Delete forever');
    fd.onclick = () => { if (confirm('Permanently delete this note? This cannot be undone.')) { hardDelete(n.id); closeDetail(); } };
    row.appendChild(fd);
  }
  act.appendChild(row); s.appendChild(act);
}

/* ═══════════════ master render ═══════════════ */
function render(){
  paintNav();
  const asking = A.view === 'ask';
  $('#askView').hidden = !asking;
  $('#capture').classList.toggle('hide', asking);
  $('#listScroll').classList.toggle('hide', asking);
  $('#searchWrap').classList.toggle('hide', asking);
  if (asking){
    $('#viewTitle').textContent = 'Ask Trace';
    const live = A.notes.filter(n => !n.deleted_at).length;
    $('#viewSub').textContent = `across ${live} note${live===1?'':'s'}`;
  } else {
    renderList();
  }
  paintDetail();
  paintSyncDot();
}
