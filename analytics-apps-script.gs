/**
 * UDL Foundations: learner analytics receiver (rows carry the learner name typed in the course).
 * Paste into Extensions > Apps Script of the Google Sheet that should hold the data,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
const SHEET_NAME = 'UDL Analytics';
const HEADERS = ['timestamp','session_id','module_number','module_name','event_type',
  'time_spent_seconds','first_attempt_correct','error_count','support_tier_classification','total_attempts','learner_name',
  'relevance_check_status','relevance_notes','certificate_code','pd_credit'];

/* Tier rules (applied to module_completed rows). Edit to taste. */
const ERROR_THRESHOLD = 2;                                   // >= this many wrong attempts in a module => Needs Scaffolding & Support
const STALL_SECONDS = {1:600, 2:600, 3:600, 4:600, 5:600, 6:900}; // active seconds above this (with few errors) => Comprehension/Engagement Stall
const MODULE_NAMES = ['Introduction','Engagement','Representation','Action & Expression','Plan, Try, Reflect','Final Assessment','Review & Reflect'];
const EVENTS = ['module_started','knowledge_check_submitted','module_completed',
  'reflection_started','reflection_exited','reflection_completed','certificate_issued']; // module 7 = Review & Reflect

/* One row per learner, used to resume progress on any device and to see each person at a glance. */
const PROGRESS_SHEET = 'UDL Progress';
const PROGRESS_HEADERS = ['learner_key','learner_name','modules_completed','final_score','progress_json','updated_at'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(e.postData.contents);

    if (d.event_type === 'progress_snapshot') { upsertProgress_(d); return reply_(); }

    const eventType = String(d.event_type || '');
    const moduleNumber = parseInt(d.module_number, 10);
    if (EVENTS.indexOf(eventType) < 0 || !(moduleNumber >= 1 && moduleNumber <= 7)) return reply_();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    } else {
      // older sheet: append any header columns it is missing (keeps existing data in place)
      const have = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      HEADERS.forEach(function (h) {
        if (have.indexOf(h) < 0) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h).setFontWeight('bold');
      });
    }

    let ts = new Date(d.timestamp);
    if (isNaN(ts.getTime())) ts = new Date();
    const seconds = clamp_(d.time_spent_seconds, 86400);
    const errors = clamp_(d.error_count, 999);
    const attempts = clamp_(d.total_attempts, 9999);
    const first = (d.first_attempt_correct === true || d.first_attempt_correct === false) ? d.first_attempt_correct : '';
    const tier = eventType === 'module_completed' ? classify_(moduleNumber, errors, seconds) : '';

    sheet.appendRow([
      ts,
      safe_(d.session_id),
      moduleNumber,
      MODULE_NAMES[moduleNumber - 1],
      eventType,
      seconds,
      first,
      errors,
      tier,
      attempts,
      safe_(nameOf_(d.learner_name)),
      safe_(d.relevance_check_status),
      safeLong_(d.relevance_notes),
      safe_(d.certificate_code),
      safe_(d.pd_credit)
    ]);
  } catch (err) {
    // fail silently; the learner's browser never sees errors
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
  return reply_();
}

function classify_(moduleNumber, errors, seconds) {
  if (errors >= ERROR_THRESHOLD) return 'Needs Scaffolding & Support';
  if (seconds > (STALL_SECONDS[moduleNumber] || 600)) return 'Comprehension/Engagement Stall';
  return 'Independent Competency';
}
function clamp_(v, max) { const n = Math.round(Number(v)); return isNaN(n) ? 0 : Math.max(0, Math.min(max, n)); }
function safe_(v) { const s = String(v == null ? '' : v).slice(0, 64); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function safeLong_(v) { const s = String(v == null ? '' : v).slice(0, 500); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function reply_() { return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT); }

/* ---------- Resume lookup: GET ?action=resume&name=Full%20Name ---------- */
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (p.action === 'resume') {
      const key = keyOf_(p.name);
      const sh = progressSheet_(false);
      const row = key ? findRow_(sh, key) : 0;
      if (row) {
        const cur = sh.getRange(row, 1, 1, PROGRESS_HEADERS.length).getValues()[0];
        let prog = {};
        try { prog = JSON.parse(cur[4]); } catch (x) {}
        return json_({ ok: true, found: true, name: String(cur[1]), progress: cleanProgress_(prog) });
      }
      return json_({ ok: true, found: false });
    }
  } catch (err) {}
  return json_({ ok: true });
}

function upsertProgress_(d) {
  const name = nameOf_(d.learner_name);
  const key = keyOf_(name);
  if (!key) return;
  const inc = cleanProgress_(d.progress);
  const sh = progressSheet_(true);
  const row = findRow_(sh, key);
  let merged = inc, shown = name;
  if (row) {
    const cur = sh.getRange(row, 1, 1, PROGRESS_HEADERS.length).getValues()[0];
    shown = String(cur[1] || name);               // keep the spelling typed first
    if (d.reset !== true) {                        // merge devices; "Reset progress" replaces instead
      let old = {};
      try { old = JSON.parse(cur[4]); } catch (x) {}
      old = cleanProgress_(old);
      merged = {
        done: uniq_(old.done.concat(inc.done)),
        known: uniq_(old.known.concat(inc.known)),
        final: old.final === null ? inc.final : (inc.final === null ? old.final : Math.max(old.final, inc.final))
      };
    }
  }
  const modules = merged.done.filter(function (k) { return k !== 'final'; }).length;
  const vals = [key, shown, modules, merged.final === null ? '' : merged.final, JSON.stringify(merged), new Date()];
  if (row) sh.getRange(row, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
}

function cleanProgress_(g) {
  g = g || {};
  const done = (Array.isArray(g.done) ? g.done : []).map(String).filter(function (k) { return /^(m[0-4]|final)$/.test(k); });
  const known = (Array.isArray(g.known) ? g.known : []).map(function (k) { return parseInt(k, 10); })
    .filter(function (k) { return k >= 0 && k <= 49; });
  let fin = (g.final === null || g.final === undefined || g.final === '') ? null : parseInt(g.final, 10);
  if (fin !== null && !(fin >= 0 && fin <= 5)) fin = null;
  return { done: uniq_(done), known: uniq_(known), final: fin };
}
function uniq_(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
function nameOf_(n) { return String(n == null ? '' : n).replace(/\s+/g, ' ').replace(/^[=+\-@\s]+/, '').trim().slice(0, 60); }
function keyOf_(n) { return nameOf_(n).toLowerCase(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function progressSheet_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PROGRESS_SHEET);
  if (!sh && create) {
    sh = ss.insertSheet(PROGRESS_SHEET);
    sh.appendRow(PROGRESS_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PROGRESS_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}
function findRow_(sh, key) {
  if (!sh || sh.getLastRow() < 2) return 0;
  const f = sh.getRange(2, 1, sh.getLastRow() - 1, 1).createTextFinder(key).matchEntireCell(true).matchCase(true).findNext();
  return f ? f.getRow() : 0;
}
