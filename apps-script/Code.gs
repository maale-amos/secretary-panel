// Apps Script Web App for Personal Secretary Cloud Panel
// Deploys as: Web App, execute as ME, access ANYONE.
// The home computer's sync_to_sheet.py writes here; the cloud panel reads/writes here.

const SHEET_ID = '1x5ul3XtUFpNWrdoK-vPaYWq56nSuim-DEvFMmLm3i8w';  // Secretary State sheet

function _ss() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function _readSheetAsObjects(name) {
  const sh = _ss().getSheetByName(name);
  if (!sh) return [];
  const rng = sh.getDataRange();
  if (rng.getNumRows() < 2) return [];
  const values = rng.getValues();
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function _writeRow(name, row) {
  const sh = _ss().getSheetByName(name);
  sh.appendRow(row);
}

function doGet(e) {
  return _handle(e.parameter, null);
}

function doPost(e) {
  let body = null;
  try { body = JSON.parse(e.postData.contents); } catch (_) { body = {}; }
  return _handle(e.parameter, body);
}

function _handle(params, body) {
  const action = (body && body.action) || params.action || 'get';
  let result;
  try {
    if (action === 'get') {
      result = _doGet(params.kind || 'summary', params);
    } else if (action === 'approve') {
      result = _approve(body.draft_id, body.body_text, body.subject);
    } else if (action === 'reject') {
      result = _reject(body.draft_id, body.reason);
    } else if (action === 'push') {
      // Home computer pushing fresh data
      result = _pushFromHome(body);
    } else {
      result = { error: 'unknown action' };
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function _doGet(kind, params) {
  if (kind === 'summary') {
    const meta = _readSheetAsObjects('meta');
    const drafts = _readSheetAsObjects('drafts').filter(d => d.status === 'awaiting_approval');
    const m = meta[0] || {};
    return {
      new_count: parseInt(m.new_count) || 0,
      urgent: parseInt(m.urgent) || 0,
      awaiting: drafts.length,
      sent_today: parseInt(m.sent_today) || 0,
      last_sync: m.last_sync || null,
    };
  }
  if (kind === 'drafts') {
    return _readSheetAsObjects('drafts').filter(d => d.status === 'awaiting_approval');
  }
  if (kind === 'inbox') {
    const hours = parseInt(params.hours) || 48;
    return _readSheetAsObjects('inbox').slice(0, 100);
  }
  if (kind === 'profile') {
    const meta = _readSheetAsObjects('meta');
    return { content: (meta[0] && meta[0].profile) || '(לא זמין)' };
  }
  return { error: 'unknown kind' };
}

function _approve(draft_id, body_text, subject) {
  const sh = _ss().getSheetByName('drafts');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const bodyCol = headers.indexOf('body_text');
  const subjCol = headers.indexOf('subject');
  const approvedAtCol = headers.indexOf('approved_at');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(draft_id)) {
      sh.getRange(i + 1, statusCol + 1).setValue('approved');
      if (body_text) sh.getRange(i + 1, bodyCol + 1).setValue(body_text);
      if (subject) sh.getRange(i + 1, subjCol + 1).setValue(subject);
      sh.getRange(i + 1, approvedAtCol + 1).setValue(new Date().toISOString());
      _writeRow('audit', [new Date().toISOString(), 'yosef', 'approve', draft_id, 'cloud-panel']);
      return { ok: true };
    }
  }
  return { error: 'draft not found' };
}

function _reject(draft_id, reason) {
  const sh = _ss().getSheetByName('drafts');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const approvedAtCol = headers.indexOf('approved_at');
  const errCol = headers.indexOf('send_error');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(draft_id)) {
      sh.getRange(i + 1, statusCol + 1).setValue('rejected');
      sh.getRange(i + 1, approvedAtCol + 1).setValue(new Date().toISOString());
      if (reason) sh.getRange(i + 1, errCol + 1).setValue(reason);
      _writeRow('audit', [new Date().toISOString(), 'yosef', 'reject', draft_id, reason || '']);
      return { ok: true };
    }
  }
  return { error: 'draft not found' };
}

function _pushFromHome(body) {
  // body = { token, kind, rows: [...] } or { token, meta: {...} }
  const expected = PropertiesService.getScriptProperties().getProperty('PUSH_TOKEN') || 'CHANGE_ME';
  if (body.token !== expected) return { error: 'invalid token' };
  if (body.kind === 'meta') {
    const sh = _ss().getSheetByName('meta');
    sh.clear();
    const keys = Object.keys(body.meta);
    sh.appendRow(keys);
    sh.appendRow(keys.map(k => body.meta[k]));
    return { ok: true };
  }
  if (body.kind === 'drafts' || body.kind === 'inbox') {
    const sh = _ss().getSheetByName(body.kind);
    sh.clear();
    if (body.rows && body.rows.length) {
      const headers = Object.keys(body.rows[0]);
      sh.appendRow(headers);
      body.rows.forEach(r => sh.appendRow(headers.map(h => r[h] != null ? r[h] : '')));
    }
    return { ok: true, count: body.rows.length };
  }
  return { error: 'unknown push kind' };
}

function initSheets() {
  const ss = _ss();
  ['meta', 'drafts', 'inbox', 'audit'].forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  return 'sheets ready';
}
