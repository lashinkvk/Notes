(() => {
  'use strict';
  const KEY = 'notes.v1', TK = 'notes.theme';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const full = iso => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const short = iso => {
    const d = new Date(iso), t = new Date();
    return d.toDateString() === t.toDateString() ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };

  let notes = load(), cur = null, q = '', timer = null;

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(d) ? d.filter(n => n && n.id) : []; }
    catch { return []; }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(notes)); return true; }
    catch { toast('Could not save. Browser storage is full or blocked.'); return false; }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const byId = id => notes.find(n => n.id === id);
  const sorted = () => [...notes].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  const isEmpty = n => !n.title.trim() && !n.content.trim();

  let tt;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2000);
  }

  /* theme and mobile list */
  const setTheme = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem(TK, t); } catch { } };
  try { document.documentElement.dataset.theme = localStorage.getItem(TK) || 'dark'; } catch { }
  $('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  const side = open => { $('#side').classList.toggle('open', open); $('#bd').classList.toggle('open', open); $('#menuBtn').setAttribute('aria-expanded', open); };
  $('#menuBtn').onclick = () => side(!$('#side').classList.contains('open'));
  $('#bd').onclick = () => side(false);

  /* confirmation modal */
  function confirmDelete(onYes) {
    const o = document.createElement('div'), prev = document.activeElement;
    o.className = 'overlay';
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dt"><h2 id="dt">Delete note</h2><p class="muted">Are you sure you want to delete this note?</p>
    <div class="row"><button class="btn" id="no">Cancel</button><button class="btn danger" id="yes">Delete</button></div></div>`;
    document.body.appendChild(o);
    const close = () => { o.remove(); document.removeEventListener('keydown', key); prev && prev.focus(); };
    const key = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const f = [$('#no', o), $('#yes', o)];
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', key);
    o.onmousedown = e => { if (e.target === o) close(); };
    $('#no', o).onclick = close;
    $('#yes', o).onclick = () => { close(); onYes(); };
    requestAnimationFrame(() => { o.classList.add('in'); $('#no', o).focus(); });
  }

  /* list */
  function list() {
    const t = q.trim().toLowerCase();
    const rows = sorted().filter(n => !t || (n.title + '\n' + n.content).toLowerCase().includes(t));
    $('#list').innerHTML = rows.length ? rows.map(n => `<button class="item" data-id="${n.id}"${n.id === cur ? ' aria-current="true"' : ''}>
      <b>${esc(n.title.trim() || 'New note')}${n.pinned ? '<i class="pin" title="Pinned">★</i>' : ''}</b>
      <small><time>${short(n.updatedAt)}</time><span>${esc(n.content.trim().replace(/\s+/g, ' ').slice(0, 60) || 'No additional text')}</span></small></button>`).join('')
      : `<p class="empty-s">${notes.length ? `No notes match “${esc(q)}”.` : 'No notes yet.'}</p>`;
  }

  /* saving */
  function commit() {
    clearTimeout(timer); timer = null;
    const n = byId(cur); if (!n) return;
    if (persist()) { $('#state').textContent = 'Saved'; const m = $('#meta'); if (m) m.textContent = metaTxt(n); list(); }
  }
  function flush() { if (timer) commit(); }
  const metaTxt = n => `Last updated ${full(n.updatedAt)} · Created ${full(n.createdAt)}`;

  /* editor */
  function editor(focusTitle) {
    const n = byId(cur), el = $('#editor');
    $('#pinBtn').hidden = $('#delBtn').hidden = !n;
    $('#state').textContent = '';
    if (!n) {
      el.innerHTML = `<div class="empty"><h2>${notes.length ? 'Select a note' : 'Start your first note'}</h2><p>${notes.length ? 'Choose a note from the list, or create a new one.' : 'Write down ideas, plans and reminders. Everything saves as you type.'}</p><button class="btn gold" id="emptyNew">＋ New note</button></div>`;
      $('#emptyNew').onclick = newNote; return;
    }
    $('#pinBtn').textContent = n.pinned ? 'Unpin' : 'Pin';
    el.innerHTML = `<input class="etitle" id="eTitle" maxlength="120" placeholder="Title" aria-label="Note title" value="${esc(n.title)}">
    <div class="meta" id="meta">${metaTxt(n)}</div>
    <textarea id="eBody" placeholder="Start writing…" aria-label="Note content"></textarea>`;
    $('#eBody').value = n.content;
    const edit = () => {
      n.title = $('#eTitle').value; n.content = $('#eBody').value; n.updatedAt = new Date().toISOString();
      $('#state').textContent = 'Saving…'; clearTimeout(timer); timer = setTimeout(commit, 500);
    };
    $('#eTitle').oninput = edit; $('#eBody').oninput = edit;
    if (focusTitle) $('#eTitle').focus();
  }

  function select(id, focusTitle) {
    flush();
    const prev = byId(cur);
    if (prev && prev.id !== id && isEmpty(prev)) { notes = notes.filter(x => x !== prev); persist(); }
    cur = id; list(); editor(focusTitle); side(false);
  }

  function newNote() {
    flush();
    const prev = byId(cur);
    if (prev && isEmpty(prev)) { side(false); $('#eTitle').focus(); return; }
    const now = new Date().toISOString();
    const n = { id: uid(), title: '', content: '', pinned: false, createdAt: now, updatedAt: now };
    notes.push(n);
    if (!persist()) { notes.pop(); return; }
    q = ''; $('#q').value = '';
    select(n.id, true);
  }

  /* wiring */
  $('#newBtn').onclick = newNote;
  $('#list').onclick = e => { const b = e.target.closest('.item'); if (b) select(b.dataset.id); };
  $('#q').oninput = e => { q = e.target.value; list(); };
  $('#pinBtn').onclick = () => {
    const n = byId(cur); if (!n) return;
    n.pinned = !n.pinned; persist(); $('#pinBtn').textContent = n.pinned ? 'Unpin' : 'Pin'; list(); toast(n.pinned ? 'Note pinned' : 'Note unpinned');
  };
  $('#delBtn').onclick = () => confirmDelete(() => {
    clearTimeout(timer); timer = null;
    const id = cur, next = sorted().find(n => n.id !== id);
    notes = notes.filter(n => n.id !== id); persist(); toast('Note deleted');
    cur = null; select(next ? next.id : null);
  });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (cur) { commit(); toast('Saved'); } }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('.overlay')) { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'Escape') side(false);
  });
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  const first = sorted()[0];
  cur = first ? first.id : null; list(); editor();
})();
