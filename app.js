// personal-secretary cloud panel - reads from Apps Script API
// The Apps Script URL is set by deploy-time configuration

const API_URL = window.SECRETARY_API_URL || 'https://script.google.com/macros/s/REPLACE_WITH_DEPLOY_ID/exec';

// Reads come directly from GitHub Pages JSON (no Apps Script needed for reads).
// Writes (approve/reject) go to Apps Script which writes back to GitHub repo.
const STATIC_BASE = './data/';  // served by GitHub Pages

async function api(action, payload) {
  try {
    // Static reads from GitHub Pages
    if (action === 'get') {
      const kind = payload && payload.kind;
      if (kind === 'summary') {
        const meta = await (await fetch(STATIC_BASE + 'meta.json?ts=' + Date.now())).json();
        const draftsResp = await fetch(STATIC_BASE + 'drafts.json?ts=' + Date.now());
        const draftsData = await draftsResp.json();
        const awaiting = (draftsData.rows || draftsData).filter(d => d.status === 'awaiting_approval');
        return {
          new_count: meta.new_count || 0,
          urgent: meta.urgent || 0,
          awaiting: awaiting.length,
          sent_today: meta.sent_today || 0,
          last_sync: meta.last_sync,
        };
      }
      if (kind === 'drafts') {
        const d = await (await fetch(STATIC_BASE + 'drafts.json?ts=' + Date.now())).json();
        return (d.rows || d).filter(x => x.status === 'awaiting_approval');
      }
      if (kind === 'inbox') {
        const d = await (await fetch(STATIC_BASE + 'inbox.json?ts=' + Date.now())).json();
        return (d.rows || d).slice(0, 100);
      }
      if (kind === 'profile') {
        const meta = await (await fetch(STATIC_BASE + 'meta.json?ts=' + Date.now())).json();
        return { content: meta.profile || '(הפרופיל לא זמין עדיין)' };
      }
    }
    // Writes go to Apps Script
    const url = new URL(API_URL);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
    });
    return r.json();
  } catch (e) {
    setStatus('err', 'שגיאת חיבור');
    console.error(e);
    return {};
  }
}

function setStatus(cls, text) {
  const el = document.getElementById('conn-status');
  el.className = 'status ' + cls;
  el.textContent = text;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

function escHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

document.querySelectorAll('nav button').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    loadTab(btn.dataset.tab);
  };
});

async function loadTab(name) {
  if (name === 'dashboard') return loadDashboard();
  if (name === 'drafts') return loadDrafts();
  if (name === 'inbox') return loadInbox();
  if (name === 'profile') return loadProfile();
}

async function loadDashboard() {
  const data = await api('get', { kind: 'summary' });
  if (!data || data.error) { setStatus('err', 'שגיאה'); return; }
  setStatus('ok', 'מחובר');
  document.getElementById('s-new').textContent = data.new_count || 0;
  document.getElementById('s-urgent').textContent = data.urgent || 0;
  document.getElementById('s-await').textContent = data.awaiting || 0;
  document.getElementById('s-sent').textContent = data.sent_today || 0;
  document.getElementById('drafts-badge').textContent = data.awaiting > 0 ? data.awaiting : '';
  document.getElementById('last-sync').textContent = data.last_sync ? fmtTime(data.last_sync) : '—';
}

async function loadDrafts() {
  const rows = await api('get', { kind: 'drafts' });
  const el = document.getElementById('drafts-list');
  if (!rows || !rows.length) {
    el.innerHTML = '<p style="color:#7f8c8d">אין טיוטות בהמתנה.</p>';
    return;
  }
  el.innerHTML = rows.map(d => `
  <div class="draft-item" data-id="${d.id}">
    <div class="head">
      <strong>#${d.id}</strong>
      <span class="meta">${escHtml(d.from_account)} → ${escHtml(d.to_addrs)}</span>
    </div>
    <input type="text" class="draft-subject" value="${escHtml(d.subject || '')}" placeholder="נושא" style="width:100%;padding:0.5rem;margin-bottom:0.5rem;border-radius:6px;border:1px solid #bdc3c7">
    <textarea class="draft-body">${escHtml(d.body_text || '')}</textarea>
    ${d.reason_he ? `<div class="meta" style="margin-top:0.4rem">💡 ${escHtml(d.reason_he)}</div>` : ''}
    <div class="actions">
      <button class="btn-approve">✅ אשר ושלח</button>
      <button class="btn-reject">❌ דחה</button>
    </div>
  </div>`).join('');
  document.querySelectorAll('.draft-item').forEach(el => {
    const id = el.dataset.id;
    el.querySelector('.btn-approve').onclick = async () => {
      if (!confirm('לאשר ולשלוח?')) return;
      const body_text = el.querySelector('.draft-body').value;
      const subject = el.querySelector('.draft-subject').value;
      await api('approve', { draft_id: id, body_text, subject });
      el.remove();
    };
    el.querySelector('.btn-reject').onclick = async () => {
      const reason = prompt('סיבת דחייה (אופציונלי):') || '';
      await api('reject', { draft_id: id, reason });
      el.remove();
    };
  });
}

async function loadInbox() {
  const rows = await api('get', { kind: 'inbox' });
  const el = document.getElementById('inbox-list');
  if (!rows || !rows.length) { el.innerHTML = '<p>אין מיילים.</p>'; return; }
  el.innerHTML = rows.map(m => `
    <div class="mail-item ${m.category || ''}">
      <div class="meta">${fmtTime(m.received_at)} · ${escHtml(m.account_id)} · ${escHtml(m.from_name || m.from_addr || '')}</div>
      <div class="subject">${escHtml(m.subject || '')}</div>
      <div>${escHtml(m.summary_he || '')}</div>
    </div>
  `).join('');
}

async function loadProfile() {
  const data = await api('get', { kind: 'profile' });
  document.getElementById('profile-content').textContent = data.content || '(הפרופיל לא זמין)';
}

// Initial
loadDashboard();
setInterval(loadDashboard, 30000);
