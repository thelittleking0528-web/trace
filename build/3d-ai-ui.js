
/* ═══════════════ ASK ═══════════════ */
function openAsk(){
  A.view = 'ask'; render();
  if (!A.thread.length) paintThread();
  setTimeout(() => { if (window.innerWidth > 900) $('#askInput').focus(); }, 60);
}

function msgNode(role, text, cites){
  const m = el('div', 'msg ' + (role === 'user' ? 'me' : 'ai'));
  const who = el('div','who');
  who.innerHTML = role === 'user'
    ? '<span>You</span>'
    : '<svg><use href="#i-spark"/></svg><span>Trace</span>';
  m.appendChild(who);
  const t = el('div','txt');
  if (role === 'user') t.textContent = text; else t.innerHTML = md(text || '');
  m.appendChild(t);
  if (cites?.length){
    const c = el('div','cites');
    cites.slice(0,6).forEach(n => {
      const b = el('button','cite', n.title || derivedTitle(n.body));
      b.title = fullStamp(n.created_at);
      b.onclick = () => selectNote(n.id);
      c.appendChild(b);
    });
    m.appendChild(c);
  }
  return m;
}
function askSuggestions(){
  const wrap = el('div','msg');
  const w = el('div','who'); w.innerHTML = '<svg><use href="#i-spark"/></svg><span>Trace</span>';
  wrap.appendChild(w);
  const t = el('div','txt');
  const n = A.notes.filter(x => !x.deleted_at).length;
  t.textContent = n
    ? `I've read all ${n} of your notes. Ask me anything about them — I'll answer only from what's actually in there.`
    : `Nothing captured yet. Once you've saved a few thoughts, I can search them, connect them, and tell you what you keep circling back to.`;
  wrap.appendChild(t);
  const sug = el('div','suggest');
  ['What have I been thinking about lately?',
   'What ideas have I written down but never acted on?',
   'Find contradictions in my notes',
   'What themes keep coming up?',
   'Summarise this week'].forEach(q => {
    const b = el('button', null, q);
    b.onclick = () => { $('#askInput').value = q; doAsk(); };
    sug.appendChild(b);
  });
  wrap.appendChild(sug);
  return wrap;
}
function paintThread(){
  const th = $('#askThread'); th.innerHTML = '';
  if (!A.thread.length){ th.appendChild(askSuggestions()); return; }
  A.thread.forEach(m => th.appendChild(msgNode(m.role, m.text, m.cites)));
}
function scrollAsk(){ const s = $('#askScroll'); s.scrollTop = s.scrollHeight; }

async function doAsk(preset){
  const input = $('#askInput');
  const q = (preset || input.value).trim();
  if (!q || A.busy) return;
  if (!aiReady()){ toast('Add your Anthropic API key in Settings first','err'); openSettings(); return; }
  input.value = ''; input.style.height = 'auto';
  A.thread.push({ role:'user', text:q });
  paintThread(); scrollAsk();

  const { text: ctx, notes: used } = contextFor(q);
  const node = msgNode('assistant', '');
  const txtEl = node.querySelector('.txt');
  txtEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#askThread').appendChild(node); scrollAsk();

  A.busy = true;
  let first = true;
  try {
    const answer = await claude({
      max_tokens: 2000, temperature: 0.6, stream: true,
      system:
`You are the intelligence inside Trace, a private note vault belonging to one person. You have been given their captured notes below.

Rules:
- Answer ONLY from the notes. If they don't contain the answer, say so plainly in one line and stop. Never invent a note.
- Quote their own words when it helps. Reference notes by their opening words, not by ID.
- Be direct and specific. No preamble, no "great question", no summarising the question back.
- Short answers when short is right. This person values their time.
- When you spot a pattern, a contradiction, or something they wrote and never returned to, say it — that's the whole point of you.
- Today is ${new Date().toDateString()}.

THEIR NOTES:
${ctx || '(no notes captured yet)'}`,
      messages: A.thread.slice(-8).map(m => ({ role:m.role, content:m.text })),
      onDelta: (_d, full) => {
        if (first){ first = false; }
        txtEl.innerHTML = md(full);
        scrollAsk();
      },
    });
    A.thread.push({ role:'assistant', text:answer, cites:used.slice(0,6) });
    paintThread(); scrollAsk();
  } catch (e){
    txtEl.innerHTML = `<span style="color:var(--red)">${esc(String(e.message||e))}</span>`;
    A.thread.push({ role:'assistant', text:'⚠︎ ' + String(e.message||e) });
  } finally { A.busy = false; }
}

/* ═══════════════ DIGEST ═══════════════ */
async function runDigest(days){
  if (!aiReady()){ toast('Add your Anthropic API key in Settings first','err'); openSettings(); return; }
  const since = new Date(Date.now() - days*DAY).toISOString();
  const set = A.notes.filter(n => !n.deleted_at && n.created_at >= since);
  if (!set.length){ toast(`Nothing captured in the last ${days} days`); return; }
  openAsk();
  A.thread.push({ role:'user', text:`Digest — the last ${days} days (${set.length} notes)` });
  paintThread();
  const node = msgNode('assistant','');
  const txtEl = node.querySelector('.txt');
  txtEl.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  $('#askThread').appendChild(node); scrollAsk();
  const blob = set.slice().reverse().map(n =>
    `${new Date(n.created_at).toLocaleString()} ${(n.tags||[]).map(t=>'#'+t).join(' ')}\n${n.body}`).join('\n---\n');
  try {
    const out = await claude({
      max_tokens: 1600, temperature: 0.7, stream: true,
      system:
`You write a private weekly read-back for one person, from their own captured notes. You are not a summariser — you are the friend who noticed things.

Structure it exactly like this, no other headings:
## The thread
Two or three sentences on what they were actually preoccupied with. Name it plainly.
## Worth pulling on
2-4 bullets. Specific notes that deserve a second look, and why. Quote their words.
## Left hanging
Anything they wrote as an intention or question and never came back to. If nothing, say "Nothing dangling."
## One thing
A single concrete suggestion for the coming week, drawn from what's actually here. Not generic advice.

Never flatter. Never pad. If the week was thin, say the week was thin.`,
      messages:[{ role:'user', content: blob.slice(0, 120000) }],
      onDelta: (_d, full) => { txtEl.innerHTML = md(full); scrollAsk(); },
    });
    A.thread.push({ role:'assistant', text:out, cites:set.slice(0,6) });
    paintThread(); scrollAsk();
  } catch (e){
    txtEl.innerHTML = `<span style="color:var(--red)">${esc(String(e.message||e))}</span>`;
  }
}

/* ═══════════════ RESURFACE ═══════════════ */
function resurface(){
  const pool = A.notes.filter(n => !n.deleted_at && Date.now() - new Date(n.created_at) > DAY*3);
  const src = pool.length ? pool : A.notes.filter(n => !n.deleted_at);
  if (!src.length){ toast('Nothing to resurface yet'); return; }
  const pick = src[Math.floor(Math.random() * src.length)];
  A.view = 'all'; A.query = ''; $('#searchInput').value = '';
  selectNote(pick.id);
  toast('From ' + dayLabel(pick.created_at).toLowerCase());
}

/* ═══════════════ EXPAND ═══════════════ */
async function expandNote(n){
  if (!aiReady()){ toast('Add your API key in Settings first','err'); return; }
  const clear = toast('Thinking…','busy');
  try {
    const out = await claude({
      max_tokens: 900, temperature: 0.8,
      system:`The person wrote a quick note to themselves. Develop it — don't just restate it.
Give: what they were probably reaching for, 2-3 concrete next moves, and one honest risk or objection.
Under 180 words. Plain sentences. No headings, no flattery, no bullet-point soup.`,
      messages:[{ role:'user', content:n.body }],
    });
    clear();
    openAsk();
    A.thread.push({ role:'user', text:`Expand: ${n.title || derivedTitle(n.body)}` });
    A.thread.push({ role:'assistant', text:out, cites:[n] });
    paintThread(); scrollAsk();
  } catch (e){ clear(); toast(String(e.message||e),'err'); }
}
