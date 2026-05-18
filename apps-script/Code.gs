// Apps Script Web App - Personal Secretary Cloud Panel
// Architecture: Bypasses NetFree using Time-based Triggers that run on Google's servers.
//
// FLOW:
// 1. Home PC pushes state.json + drafts.json to GitHub repo (NetFree allows git).
// 2. Time-Trigger syncFromGitHub() runs every 5 min, fetches JSON from raw.githubusercontent.com,
//    updates Sheet. (Runs on Google's servers, NOT through NetFree.)
// 3. Panel (browser) reads from this Apps Script (via GET) - works from phone or any device.
// 4. Approve/Reject in panel → POST to Apps Script → writes approval to GitHub via API.
// 5. Home PC git pulls approvals/ folder → sender.py sends.

const SHEET_ID = '1x5ul3XtUFpNWrdoK-vPaYWq56nSuim-DEvFMmLm3i8w';
const GITHUB_OWNER = 'maale-amos';
const GITHUB_REPO = 'secretary-panel';

// ===== Setup: Yosef runs this ONCE in the Apps Script editor =====
// File menu → Project Settings → Script Properties → Add GITHUB_PAT.
// Or run setGitHubPAT('gho_...') from editor once and delete the call.

function setGitHubPAT(pat) {
  PropertiesService.getScriptProperties().setProperty('GITHUB_PAT', pat);
  return 'PAT saved (length: ' + (pat || '').length + ')';
}

function _pat() {
  return PropertiesService.getScriptProperties().getProperty('GITHUB_PAT') || '';
}

// ===== Time-based trigger: pull JSON from GitHub to Sheet =====

function syncFromGitHub() {
  const base = 'https://raw.githubusercontent.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/main/data/';
  ['meta', 'drafts', 'inbox'].forEach(function (kind) {
    try {
      const resp = UrlFetchApp.fetch(base + kind + '.json', { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return;
      const data = JSON.parse(resp.getContentText());
      _writeSheet(kind, data);
    } catch (e) {
      Logger.log('syncFromGitHub ' + kind + ' failed: ' + e);
    }
  });
}

function _writeSheet(kind, data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(kind);
  if (!sh) sh = ss.insertSheet(kind);
  sh.clear();
  if (kind === 'meta') {
    const keys = Object.keys(data);
    sh.appendRow(keys);
    sh.appendRow(keys.map(function (k) { return data[k]; }));
  } else {
    const rows = data.rows || data;
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    sh.appendRow(headers);
    rows.forEach(function (r) {
      sh.appendRow(headers.map(function (h) { return r[h] != null ? r[h] : ''; }));
    });
  }
}

// ===== Web App endpoints =====

function doGet(e) { return _handle(e.parameter, null); }
function doPost(e) {
  let body = null;
  try { body = JSON.parse(e.postData.contents); } catch (_) { body = {}; }
  return _handle(e.parameter, body);
}

function _handle(params, body) {
  const action = (body && body.action) || params.action || 'ping';
  let result;
  try {
    if (action === 'ping') {
      result = { ok: true, ts: new Date().toISOString() };
    } else if (action === 'get') {
      result = _doGet(params.kind || 'summary', params);
    } else if (action === 'approve') {
      result = _writeApproval(body.draft_id, 'approved', {
        body_text: body.body_text, subject: body.subject,
      });
    } else if (action === 'reject') {
      result = _writeApproval(body.draft_id, 'rejected', { reason: body.reason });
    } else if (action === 'sync_now') {
      syncFromGitHub();
      result = { ok: true, action: 'sync_now done' };
    } else {
      result = { error: 'unknown action: ' + action };
    }
  } catch (err) {
    result = { error: String(err), stack: err.stack };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function _readSheet(kind) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(kind);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues();
  const headers = v[0];
  return v.slice(1).map(function (row) {
    const o = {};
    headers.forEach(function (h, i) { o[h] = row[i]; });
    return o;
  });
}

function _doGet(kind, params) {
  if (kind === 'summary') {
    const meta = _readSheet('meta')[0] || {};
    const drafts = _readSheet('drafts').filter(function (d) { return d.status === 'awaiting_approval'; });
    return {
      new_count: parseInt(meta.new_count) || 0,
      urgent: parseInt(meta.urgent) || 0,
      awaiting: drafts.length,
      sent_today: parseInt(meta.sent_today) || 0,
      last_sync: meta.last_sync || null,
    };
  }
  if (kind === 'drafts') {
    return _readSheet('drafts').filter(function (d) { return d.status === 'awaiting_approval'; });
  }
  if (kind === 'inbox') {
    return _readSheet('inbox').slice(0, 100);
  }
  if (kind === 'profile') {
    const meta = _readSheet('meta')[0] || {};
    return { content: meta.profile || '(לא זמין)' };
  }
  return { error: 'unknown kind' };
}

function _writeApproval(draft_id, status, extra) {
  if (!draft_id) return { error: 'missing draft_id' };
  const pat = _pat();
  if (!pat) return { error: 'GITHUB_PAT not configured in Script Properties' };
  const ts = Date.now();
  const path = 'approvals/' + draft_id + '_' + ts + '.json';
  const payload = {
    draft_id: parseInt(draft_id),
    status: status,
    timestamp: new Date().toISOString(),
    extra: extra || {},
  };
  const content = Utilities.base64Encode(
    Utilities.newBlob(JSON.stringify(payload, null, 2)).getBytes()
  );
  const url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path;
  const resp = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    headers: {
      Authorization: 'token ' + pat,
      Accept: 'application/vnd.github+json',
    },
    payload: JSON.stringify({
      message: 'approval: draft #' + draft_id + ' → ' + status,
      content: content,
    }),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  // Also update Sheet locally so panel reflects immediately
  if (code === 201) {
    try {
      const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('drafts');
      const data = sh.getDataRange().getValues();
      const idCol = data[0].indexOf('id');
      const statusCol = data[0].indexOf('status');
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(draft_id)) {
          sh.getRange(i + 1, statusCol + 1).setValue(status);
          break;
        }
      }
    } catch (_) {}
  }
  return { ok: code === 201, http: code };
}

// ===== Trigger setup (Yosef runs once) =====

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncFromGitHub') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncFromGitHub').timeBased().everyMinutes(5).create();
  return 'trigger installed (every 5 min)';
}
