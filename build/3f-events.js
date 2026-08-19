
/* ═══════════════ CAPTURE ═══════════════ */
const cap = $('#capInput');
function autoGrow(t){ t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, window.innerHeight*0.44) + 'px'; }
function focusCapture(){
  if (A.view === 'ask'){ A.view = 'all'; render(); }
  cap.focus();
  cap.scrollIntoView({ block:'nearest' });
}
async function commitCapture(){
  const v = cap.value.trim();
  if (!v) return;
  cap.value = ''; autoGrow(cap);
  $('#capture').classList.remove('dirty');
  $('#saveBtn').disabled = true;
  const n = await createNote(v);
  toast('Saved · ' + timeOf(n.created_at), 'ok');
  if (A.view !== 'all' && A.view !== 'today'){ A.view = 'all'; A.tag = null; render(); }
  $('#listScroll').scrollTop = 0;
  cap.focus();
}
cap.addEventListener('input', () => {
  autoGrow(cap);
  const has = !!cap.value.trim();
  $('#capture').classList.toggle('dirty', has);
  $('#saveBtn').disabled = !has;
});
cap.addEventListener('focus', () => $('#capture').classList.add('focused'));
cap.addEventListener('blur',  () => $('#capture').classList.remove('focused'));
cap.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (modKey(e) || (S.enterSaves && !e.shiftKey))){
    e.preventDefault(); commitCapture();
  } else if (e.key === 'Escape'){ cap.value = ''; autoGrow(cap); cap.blur(); $('#saveBtn').disabled = true; }
});
$('#saveBtn').onclick = commitCapture;
$('#fab').onclick = focusCapture;

/* ═══════════════ VOICE ═══════════════ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, recBase = '';
function toggleMic(){
  if (!SR){ toast('Dictation needs Safari or Chrome','err'); return; }
  if (rec){ rec.stop(); return; }
  rec = new SR();
  rec.continuous = true; rec.interimResults = true; rec.lang = navigator.language || 'en-US';
  recBase = cap.value ? cap.value.replace(/\s+$/,'') + ' ' : '';
  rec.onstart = () => {
    $('#micBtn').classList.add('rec'); $('#micLbl').textContent = 'Listening';
    $('#capture').classList.add('focused');
  };
  rec.onresult = ev => {
    let fin = '', interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++){
      const r = ev.results[i];
      if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
    }
    if (fin) recBase += fin.replace(/^\s+/,'') + ' ';
    cap.value = recBase + interim;
    autoGrow(cap);
    $('#capture').classList.add('dirty'); $('#saveBtn').disabled = !cap.value.trim();
  };
  rec.onerror = ev => {
    if (ev.error === 'not-allowed') toast('Microphone permission denied','err');
    else if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast('Dictation: ' + ev.error,'err');
  };
  rec.onend = () => {
    rec = null;
    $('#micBtn').classList.remove('rec'); $('#micLbl').textContent = 'Speak';
    cap.value = cap.value.replace(/\s+$/,'');
    autoGrow(cap); cap.focus();
  };
  try { rec.start(); } catch { rec = null; }
}
$('#micBtn').onclick = toggleMic;

/* ═══════════════ SEARCH ═══════════════ */
const searchInput = $('#searchInput');
searchInput.addEventListener('input', debounce(() => { A.query = searchInput.value; render(); }, 90));
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ searchInput.value=''; A.query=''; render(); searchInput.blur(); }
  if (e.key === 'Enter'){
    const first = visible()[0]; if (first) selectNote(first.id);
  }
});

/* ═══════════════ ASK BAR ═══════════════ */
const askIn = $('#askInput');
askIn.addEventListener('input', () => { askIn.style.height='auto'; askIn.style.height = Math.min(askIn.scrollHeight,180)+'px'; });
askIn.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doAsk(); }
});
$('#askSend').onclick = () => doAsk();

/* ═══════════════ DETAIL BUTTONS ═══════════════ */
$('#dClose').onclick   = closeDetail;
$('#dStar').onclick    = () => { const n = byId(A.selected); if (n) patch(n.id, { starred: !n.starred }); };
$('#dEnrich').onclick  = () => { const n = byId(A.selected); if (n) enrich(n); };
$('#dArchive').onclick = () => {
  const n = byId(A.selected); if (!n) return;
  patch(n.id, { archived: !n.archived });
  toast(n.archived ? 'Archived' : 'Unarchived', 'ok');
};
$('#dTrash').onclick = () => {
  const n = byId(A.selected); if (!n) return;
  if (n.deleted_at){ patch(n.id, { deleted_at:null }); toast('Restored','ok'); return; }
  patch(n.id, { deleted_at: now() });
  const undo = toast('Moved to trash','ok');
  closeDetail();
};

/* ═══════════════ SIDEBAR / SHEETS ═══════════════ */
function closeSidebar(){ $('#sidebar').classList.remove('open'); }
$('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
$('#settingsBtn').onclick = () => { closeSidebar(); openSettings(); };
$('#lockBtn').onclick = () => { closeSidebar(); lockNow(); };
$('#setClose').onclick = closeSettings;
$('#paletteBtn').onclick = () => openPal();
$('#scrim').onclick = () => { closePal(); closeSettings(); closeSidebar(); };
document.addEventListener('click', e => {
  const sb = $('#sidebar');
  if (sb.classList.contains('open') && !sb.contains(e.target) && e.target.closest('#menuBtn') === null)
    closeSidebar();
}, true);

/* ═══════════════ PALETTE INPUT ═══════════════ */
$('#palInput').addEventListener('input', () => { A.palIdx = 0; palRender(); });
$('#palInput').addEventListener('keydown', e => {
  if (e.key === 'ArrowDown'){ e.preventDefault(); palMove(1); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); palMove(-1); }
  else if (e.key === 'Enter'){ e.preventDefault(); palRun(); }
  else if (e.key === 'Escape'){ e.preventDefault(); closePal(); }
});

/* ═══════════════ GLOBAL KEYS ═══════════════ */
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;

  if (modKey(e) && e.key === 'k'){ e.preventDefault(); A.palOpen ? closePal() : openPal(); return; }
  if (modKey(e) && e.key === 'j'){ e.preventDefault(); openAsk(); return; }
  if (modKey(e) && e.key === 'f'){ e.preventDefault(); searchInput.focus(); searchInput.select(); return; }
  if (modKey(e) && e.key === ','){ e.preventDefault(); openSettings(); return; }
  if (modKey(e) && (e.key === 'n' || (e.shiftKey && e.key === 'N'))){ e.preventDefault(); focusCapture(); return; }
  if (modKey(e) && e.key === 's'){ e.preventDefault(); sync({ loud:true }); return; }
  if (modKey(e) && e.key === 'l'){ e.preventDefault(); lockNow(); return; }

  if (e.key === 'Escape'){
    if (A.palOpen){ closePal(); return; }
    if ($('#settings').classList.contains('on')){ closeSettings(); return; }
    if ($('#sidebar').classList.contains('open')){ closeSidebar(); return; }
    if (A.selected && !typing){ closeDetail(); return; }
    return;
  }
  if (typing || A.palOpen) return;

  /* single-key shortcuts when not typing */
  if (e.key === '/'){ e.preventDefault(); searchInput.focus(); return; }
  if (e.key === 'n'){ e.preventDefault(); focusCapture(); return; }
  if (e.key === 'a'){ e.preventDefault(); openAsk(); return; }

  const list = visible();
  if ((e.key === 'ArrowDown' || e.key === 'j') && list.length){
    e.preventDefault();
    const i = list.findIndex(n => n.id === A.selected);
    selectNote(list[Math.min(i + 1, list.length - 1)]?.id ?? list[0].id);
    $(`.note[data-id="${A.selected}"]`)?.scrollIntoView({ block:'nearest' });
  }
  if ((e.key === 'ArrowUp' || e.key === 'k') && list.length){
    e.preventDefault();
    const i = list.findIndex(n => n.id === A.selected);
    selectNote(list[Math.max(i - 1, 0)]?.id ?? list[0].id);
    $(`.note[data-id="${A.selected}"]`)?.scrollIntoView({ block:'nearest' });
  }
  if (A.selected){
    if (e.key === 's'){ e.preventDefault(); $('#dStar').click(); }
    if (e.key === 'e'){ e.preventDefault(); $('#dArchive').click(); }
    if (e.key === 'Backspace'){ e.preventDefault(); $('#dTrash').click(); }
  }
});

/* ═══════════════ LIFECYCLE ═══════════════ */
window.addEventListener('focus', () => sync());
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
window.addEventListener('online', () => sync());
window.addEventListener('resize', () => autoGrow(cap));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ═══════════════ BOOT ═══════════════ */
let notesReady = null;

async function loadNotes(){
  try {
    A.notes = (await Store.all()) || [];
    A.notes.forEach(n => { n.tags = n.tags || []; });
    resort();
  } catch(e){ console.error('[trace] store load failed', e); }
}

/* Everything that puts a note on screen lives here, so nothing is
   painted into the DOM until the passcode has been accepted. */
async function afterUnlock(){
  await notesReady;
  render();
  paintThread();
  startSyncLoop();
  if (sbReady()) sync();

  /* home-screen shortcuts: ?new=1 / ?ask=1 */
  const params = new URLSearchParams(location.search);
  if (params.get('ask')) { openAsk(); }
  else if (params.get('new')) { setTimeout(() => focusCapture(), 150); }
  else if (window.innerWidth > 900) setTimeout(() => cap.focus(), 200);
  if (location.search) history.replaceState(null, '', location.pathname);
}

async function boot(){
  applyTheme();
  $('#searchKbd').textContent = IS_MAC ? '⌘F' : '^F';
  $('#lockKbd').textContent   = IS_MAC ? '⌘L' : '^L';
  $('#capHint').innerHTML = `<b>${MOD}↵</b> to save`;

  /* first run: a passcode is on by default */
  if (!S.lock || !S.lock.hash){
    S.lock = { ...LOCK_DEFAULTS };
    await setPin('0528');
  }

  notesReady = loadNotes();

  if (lockOn()){
    showLock({ title:'Enter Passcode' });
  } else {
    document.documentElement.removeAttribute('data-locked');
    L.booted = true;
    afterUnlock();
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:'){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();

/* expose a tiny console API — handy, and harmless */
window.trace = { get notes(){ return A.notes; }, sync, createNote, exportAll, settings: () => S };

})();
</script>
</body>
</html>
