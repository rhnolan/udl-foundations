/**
 * UDL Foundations: learner analytics receiver (rows carry the learner name typed in the course).
 * Paste into Extensions > Apps Script of the Google Sheet that should hold the data,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 */
const SHEET_NAME = 'UDL Analytics';
const HEADERS = ['timestamp','session_id','module_number','module_name','event_type',
  'time_spent_seconds','first_attempt_correct','error_count','support_tier_classification','total_attempts','learner_name'];

/* Tier rules (applied to module_completed rows). Edit to taste. */
const ERROR_THRESHOLD = 2;                                   // >= this many wrong attempts in a module => Needs Scaffolding & Support
const STALL_SECONDS = {1:600, 2:600, 3:600, 4:600, 5:600, 6:900}; // active seconds above this (with few errors) => Comprehension/Engagement Stall
const MODULE_NAMES = ['Introduction','Engagement','Representation','Action & Expression','Plan, Try, Reflect','Final Assessment'];
const EVENTS = ['module_started','knowledge_check_submitted','module_completed'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse(e.postData.contents);

    const eventType = String(d.event_type || '');
    const moduleNumber = parseInt(d.module_number, 10);
    if (EVENTS.indexOf(eventType) < 0 || !(moduleNumber >= 1 && moduleNumber <= 6)) return reply_();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    } else if (sheet.getRange(1, HEADERS.length).getValue() !== HEADERS[HEADERS.length - 1]) {
      // older sheet without the learner_name column: add the header
      sheet.getRange(1, HEADERS.length).setValue(HEADERS[HEADERS.length - 1]).setFontWeight('bold');
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
      safe_(d.learner_name)
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
function reply_() { return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT); }
