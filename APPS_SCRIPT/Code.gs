/**
 * The Fox Collective careers form: the Google side.
 *
 * What it does
 *   The careers page on foxcollective.org posts here.
 *   1. action "start":  checks the answers, then opens a Google Drive resumable upload
 *      session for the video inside the applications folder and returns that session
 *      address. The applicant's browser sends the video straight to Drive in pieces, so a
 *      50 to 300 MB phone video never passes through Apps Script (which cannot take it).
 *   2. action "finish": checks the video really landed in the folder, renames it to the
 *      applicant's name and appends one row to the responses Sheet with the Drive link.
 *
 * Nothing about the Google account is ever sent to the browser: the page only receives
 * a one-file upload address that works for that single video.
 *
 * Set up: see DEPLOY.md (run setup() once, then Deploy > New deployment > Web app).
 */

var SITE_ORIGINS = ['https://foxcollective.org', 'https://www.foxcollective.org'];
var MAX_BYTES = 300 * 1024 * 1024;          // 300 MB
var MAX_STARTS_PER_DAY = 300;               // a ceiling, so nobody can open endless upload sessions
var PENDING_SECONDS = 21600;                // 6 hours: the longest the cache keeps a started application
var SLOTS = ['Mornings', 'Afternoons', 'Evenings', 'Late nights'];
var HEADERS = ['Submitted', 'Referred by', 'Availability', 'Can commute to Jefferson Park', '18 or older',
               'Full name', 'Phone', 'Email', 'Video', 'Video size (MB)', 'Video file name', 'Sent from'];

/** Run this once from the editor (Run > setup). It makes the folder and the Sheet. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('FOLDER_ID');
  var sheetId = props.getProperty('SHEET_ID');
  if (!folderId) {
    folderId = DriveApp.createFolder('Fox Collective applications: videos').getId();
    props.setProperty('FOLDER_ID', folderId);
  }
  if (!sheetId) {
    var ss = SpreadsheetApp.create('Fox Collective applications: responses');
    var sh = ss.getSheets()[0];
    sh.setName('Responses');
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sheetId = ss.getId();
    props.setProperty('SHEET_ID', sheetId);
  }
  // Touch UrlFetchApp so Google asks for that permission now and not on the first applicant.
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  Logger.log('Videos folder: https://drive.google.com/drive/folders/' + folderId);
  Logger.log('Responses sheet: https://docs.google.com/spreadsheets/d/' + sheetId);
}

/** Opening the web app address in a browser shows this, so you can tell it is alive. */
function doGet() {
  return json_({ ok: true, service: 'fox-careers', ready: !!PropertiesService.getScriptProperties().getProperty('SHEET_ID') });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'start') return json_(start_(body));
    if (body.action === 'finish') return json_(finish_(body));
    return json_({ ok: false, error: 'Unknown request.' });
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: 'Something went wrong on our side. Please try again.' });
  }
}

/* ---------- start ---------- */

function start_(body) {
  var f = body.fields || {};
  var file = body.file || {};
  // Honeypot: a real person never sees this box, so anything typed in it is a bot. Store nothing.
  if (clean_(f.website, 200)) return { ok: false, error: 'Please try again.' };

  var d = {
    referrer: clean_(f.referrer, 80),
    availability: (Array.isArray(f.availability) ? f.availability : []).filter(function (s) { return SLOTS.indexOf(s) >= 0; }),
    commute: f.commute === 'Yes' ? 'Yes' : (f.commute === 'No' ? 'No' : ''),
    adult: f.adult === 'Yes' ? 'Yes' : (f.adult === 'No' ? 'No' : ''),
    name: clean_(f.name, 80),
    phone: clean_(f.phone, 24),
    email: clean_(f.email, 120),
    page: clean_(body.page, 200)
  };
  var bad = {};
  if (d.referrer !== 'No one' && d.referrer.split(' ').length < 2) bad.referrer = 'Enter their first and last name, or tick No one referred me.';
  if (!d.availability.length) bad.availability = 'Pick at least one time slot.';
  if (d.commute !== 'Yes') bad.commute = d.commute === 'No' ? 'This job is in person at our studio in Jefferson Park.' : 'Choose Yes or No.';
  if (d.adult !== 'Yes') bad.adult = d.adult === 'No' ? 'You need to be 18 or older for this job.' : 'Choose Yes or No.';
  if (d.name.split(' ').length < 2) bad.name = 'Enter your first and last name.';
  if (d.phone.replace(/\D/g, '').length < 10) bad.phone = 'Enter a phone number with area code.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) bad.email = 'Enter a valid email address.';

  var fileName = clean_(file.name, 120) || 'video.mp4';
  var mime = clean_(file.type, 60).toLowerCase();
  var size = Number(file.size) || 0;
  var ext = (fileName.match(/\.([A-Za-z0-9]{2,5})$/) || ['', 'mp4'])[1].toLowerCase();
  var videoExt = ['mp4', 'mov', 'm4v', 'webm', '3gp', '3g2', 'avi', 'mkv', 'mpg', 'mpeg', 'wmv', 'hevc'].indexOf(ext) >= 0;
  if (!(mime.indexOf('video/') === 0 || (!mime && videoExt))) bad.video = 'That file is not a video. Choose an MP4 or MOV.';
  else if (size < 1) bad.video = 'That file is empty. Choose your video again.';
  else if (size > MAX_BYTES) bad.video = 'That video is over the 300 MB limit. Try a shorter take.';
  if (Object.keys(bad).length) return { ok: false, error: 'Some answers need fixing.', fields: bad };

  if (!underDailyLimit_()) return { ok: false, error: 'We are getting a lot of applications right now. Please try again in a little while.' };

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('FOLDER_ID');
  if (!folderId || !props.getProperty('SHEET_ID')) throw new Error('setup() has not been run');

  var token = Utilities.getUuid();
  var pendingName = 'UPLOADING ' + token + '.' + ext;
  if (!mime) mime = 'video/' + (ext === 'mov' ? 'quicktime' : ext);

  // Open the resumable session. Sending the site's Origin here is what lets the browser
  // talk to the session address afterwards (Drive answers with matching CORS headers).
  var origin = SITE_ORIGINS.indexOf(clean_(body.origin, 80)) >= 0 ? clean_(body.origin, 80) : originOf_(d.page);
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      Origin: origin,
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': String(size)
    },
    payload: JSON.stringify({ name: pendingName, parents: [folderId], mimeType: mime,
                              description: 'Careers form video, waiting for the applicant to finish.' }),
    muteHttpExceptions: true
  });
  var headers = res.getHeaders();
  var uploadUrl = headers['Location'] || headers['location'];
  if (res.getResponseCode() !== 200 || !uploadUrl) throw new Error('Drive session failed: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 300));

  CacheService.getScriptCache().put('p_' + token, JSON.stringify({ d: d, size: size, ext: ext, pendingName: pendingName, fileName: fileName }), PENDING_SECONDS);
  return { ok: true, token: token, uploadUrl: uploadUrl };
}

/* ---------- finish ---------- */

function finish_(body) {
  var token = clean_(body.token, 60);
  var cache = CacheService.getScriptCache();
  var raw = token && cache.get('p_' + token);
  if (!raw) {
    if (token && cache.get('done_' + token)) return { ok: true };       // a repeat click after success
    return { ok: false, error: 'That upload took too long and timed out. Please send it again.' };
  }
  var p = JSON.parse(raw);
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('FOLDER_ID');

  var file = findUpload_(clean_(body.fileId, 80), p.pendingName, folderId);
  if (!file) return { ok: false, error: 'We could not find your video. Please send it again.' };
  var size = file.getSize();
  if (size > MAX_BYTES || size < 1 || (p.size && Math.abs(size - p.size) > 1024)) {
    file.setTrashed(true);
    return { ok: false, error: 'The video did not arrive whole. Please send it again.' };
  }

  var stamp = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd HH.mm');
  file.setName(safe_(p.d.name) + ' - ' + stamp + '.' + p.ext);
  file.setDescription('Careers form video from ' + p.d.name + ', ' + p.d.email);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheets()[0];
    sheet.appendRow([new Date(), text_(p.d.referrer), p.d.availability.join(', '), p.d.commute, p.d.adult,
                     text_(p.d.name), text_(p.d.phone), text_(p.d.email), file.getUrl(),
                     Math.round(size / 1048576 * 10) / 10, text_(p.fileName), text_(p.d.page)]);
  } finally {
    lock.releaseLock();
  }
  cache.remove('p_' + token);
  cache.put('done_' + token, '1', 3600);
  return { ok: true };
}

/** The uploaded file, but only if it is ours: right name, inside the applications folder. */
function findUpload_(fileId, pendingName, folderId) {
  if (fileId) {
    try {
      var f = DriveApp.getFileById(fileId);
      var parents = f.getParents();
      if (f.getName() === pendingName && parents.hasNext() && parents.next().getId() === folderId) return f;
    } catch (err) { /* fall through to the search by name */ }
  }
  for (var i = 0; i < 4; i++) {          // Drive search can lag a few seconds behind an upload
    var it = DriveApp.getFolderById(folderId).getFilesByName(pendingName);
    if (it.hasNext()) return it.next();
    Utilities.sleep(2500);
  }
  return null;
}

/* ---------- helpers ---------- */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clean_(v, max) {
  return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** A leading = + - or @ would make Sheets treat an answer as a formula. Keep it as text. */
function text_(v) {
  v = String(v || '');
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function safe_(name) {
  return clean_(name, 60).replace(/[^A-Za-z0-9 .'\-]/g, '').trim() || 'Applicant';
}
function originOf_(page) {
  var m = /^(https?:\/\/[^\/]+)/.exec(page || '');
  return m && SITE_ORIGINS.indexOf(m[1]) >= 0 ? m[1] : SITE_ORIGINS[0];
}
function underDailyLimit_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var key = 'starts_' + Utilities.formatDate(new Date(), 'America/Chicago', 'yyyyMMdd');
    var n = Number(cache.get(key) || 0);
    if (n >= MAX_STARTS_PER_DAY) return false;
    cache.put(key, String(n + 1), 21600);
    return true;
  } finally {
    lock.releaseLock();
  }
}
