/**
 * 持股同步後端（Google Apps Script，綁定在「投資儀表板 持股 Portfolio」試算表）
 *
 * 網站（GitHub Pages）的「持股」分頁透過這支程式讀寫 Holdings 工作表，讓手機與桌機看到同一份資料。
 *   login：同步密碼 → token（有效 60 天）
 *   get  ：token → 持股、提醒設定、版本號
 *   save ：token＋版本號＋持股 → 寫回試算表（版本不符時回傳雲端最新資料，避免覆蓋其他裝置的修改）
 * 同步密碼只以「加鹽雜湊」存在指令碼屬性中；變更密碼會讓所有裝置重新登入。
 *
 * 部署：擴充功能 › Apps Script › 貼上本檔 › 部署 › 新增部署作業 › 網頁應用程式（執行身分：我｜存取權：所有人）
 * 接著在試算表選單「持股同步 › 設定同步密碼」設定密碼。
 */

var CFG = { SHEET_ID: '13Xn7eawFGJwcy5z2Ux1qJLl2kMeRPOA_ZUCXPybE-Wg', ITER: 500, TOKEN_DAYS: 60, MAX_FAILS: 10, LOCK_MINUTES: 15, MAX_ROWS: 500 };
var HEAD = ['代號', '名稱', '市場', '類型', '股數', '平均成本', '首次買入日期', '備註', '最後更新', 'ID（系統用）'];
var TYPES = ['長期', '短期', 'ETF'];

/* ---------------- Web App ---------------- */
function doPost(e) {
  var b = {};
  try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  return json_(route_(b));
}
function doGet() { return json_({ ok: true, app: 'portfolio-sync', configured: !!props_().getProperty('PW_HASH') }); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route_(b) {
  try {
    if (b.action === 'ping') return { ok: true, configured: !!props_().getProperty('PW_HASH') };
    if (b.action === 'login') return login_(String(b.password || ''));
    if (!verify_(String(b.token || ''))) return { ok: false, auth: false, error: '同步已過期，請重新輸入同步密碼' };
    if (b.action === 'get') return read_();
    if (b.action === 'save') return save_(b);
    return { ok: false, error: 'unknown action' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: '伺服器暫時無法處理，請稍後再試' };
  }
}

/* ---------------- 登入 ---------------- */
function login_(pw) {
  var p = props_();
  if (!p.getProperty('PW_HASH')) return { ok: false, error: '尚未設定同步密碼：請在試算表選單「持股同步 › 設定同步密碼」設定' };
  var cache = CacheService.getScriptCache(), fails = +(cache.get('fail') || 0);
  if (fails >= CFG.MAX_FAILS) return { ok: false, error: '嘗試次數過多，請 ' + CFG.LOCK_MINUTES + ' 分鐘後再試' };
  if (!pw || !safeEq_(hashPw_(p.getProperty('PW_SALT'), pw), p.getProperty('PW_HASH'))) {
    cache.put('fail', String(fails + 1), CFG.LOCK_MINUTES * 60);
    return { ok: false, error: '同步密碼錯誤' };
  }
  cache.remove('fail');
  var exp = Date.now() + CFG.TOKEN_DAYS * 864e5;
  return { ok: true, token: sign_('pf|' + exp), exp: exp };
}

/* ---------------- 讀取 ---------------- */
function read_() {
  var ss = book_(), tz = ss.getSpreadsheetTimeZone(), sh = ss.getSheetByName('Holdings');
  var n = Math.max(0, sh.getLastRow() - 1), rows = n ? sh.getRange(2, 1, n, 10).getValues() : [];
  var out = [], fix = [];
  rows.forEach(function (r, i) {
    var code = String(r[0] == null ? '' : r[0]).trim().toUpperCase();
    if (!code) return;
    var id = String(r[9] || '').trim();
    if (!id) { id = Utilities.getUuid().slice(0, 12); fix.push([i + 2, id]); }
    var mk = String(r[2] || '').trim();
    out.push({
      id: id, code: code, name: String(r[1] || '').trim(),
      market: /美|^us$/i.test(mk) ? 'US' : (mk ? 'TW' : (/^[0-9]{4,6}[A-Z]?$/.test(code) ? 'TW' : 'US')),
      type: TYPES.indexOf(String(r[3]).trim()) >= 0 ? String(r[3]).trim() : '長期',
      shares: +r[4] || 0, cost: +r[5] || 0,
      date: isDate_(r[6]) ? Utilities.formatDate(r[6], tz, 'yyyy-MM-dd') : String(r[6] || '').trim(),
      note: String(r[7] || ''), updated: isDate_(r[8]) ? Utilities.formatDate(r[8], tz, 'yyyy-MM-dd HH:mm') : String(r[8] || '')
    });
  });
  if (fix.length) fix.forEach(function (f) { sh.getRange(f[0], 10).setValue(f[1]); });
  return { ok: true, rev: rev_(), holdings: out, settings: readSettings_(), serverTime: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm') };
}
function readSettings_() {
  var sh = book_().getSheetByName('Settings'), s = { conc: 25, tp: 20, sl: -10 };
  if (!sh || sh.getLastRow() < 2) return s;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) { var k = String(r[0]).trim(); if (k in s && r[1] !== '' && !isNaN(+r[1])) s[k] = +r[1]; });
  return s;
}

/* ---------------- 寫入 ---------------- */
function save_(b) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: '伺服器忙碌，請稍後再試' };
  try {
    var cur = rev_();
    if (!b.force && +b.rev !== cur) { var d = read_(); d.ok = false; d.conflict = true; return d; }
    var list = Array.isArray(b.holdings) ? b.holdings.slice(0, CFG.MAX_ROWS) : [];
    var ss = book_(), sh = ss.getSheetByName('Holdings');
    var old = {}, n = Math.max(0, sh.getLastRow() - 1);
    if (n) sh.getRange(2, 1, n, 10).getValues().forEach(function (r) { if (r[9]) old[String(r[9])] = r; });
    var now = new Date(), clip = function (s, k) { return String(s == null ? '' : s).slice(0, k); };
    var rows = list.map(function (h) {
      var id = clip(h.id, 40) || Utilities.getUuid().slice(0, 12);
      var row = [clip(h.code, 12).toUpperCase(), clip(h.name, 60), h.market === 'US' ? '美股' : '台股', TYPES.indexOf(h.type) >= 0 ? h.type : '長期',
        +h.shares || 0, +h.cost || 0, /^\d{4}-\d{2}-\d{2}$/.test(h.date) ? new Date(h.date + 'T00:00:00') : '', clip(h.note, 200), now, id];
      var o = old[id];
      if (o && same_(o, row)) row[8] = o[8] || now;
      return row;
    });
    if (n) sh.getRange(2, 1, n, 10).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, 10).setValues(rows);
    if (b.settings) writeSettings_(b.settings);
    var r = cur + 1; props_().setProperty('REV', String(r));
    return { ok: true, rev: r };
  } finally { lock.releaseLock(); }
}
function same_(o, row) {
  for (var i = 0; i < 8; i++) {
    var a = o[i], c = row[i];
    if (isDate_(a) || isDate_(c)) { if ((isDate_(a) ? a.getTime() : a) !== (isDate_(c) ? c.getTime() : c)) return false; }
    else if (String(a) !== String(c)) return false;
  }
  return true;
}
function writeSettings_(s) {
  var sh = book_().getSheetByName('Settings'); if (!sh) return;
  var map = { conc: 2, tp: 3, sl: 4 };
  Object.keys(map).forEach(function (k) { if (s[k] != null && !isNaN(+s[k])) sh.getRange(map[k], 2).setValue(+s[k]); });
}

/* ---------------- 工具 ---------------- */
function props_() { return PropertiesService.getScriptProperties(); }
function rev_() { return +(props_().getProperty('REV') || 1); }
function book_() { try { var a = SpreadsheetApp.getActiveSpreadsheet(); if (a) return a; } catch (e) {} return SpreadsheetApp.openById(CFG.SHEET_ID); }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(salt, pw) { var h = sha_(salt + pw); for (var i = 1; i < CFG.ITER; i++) h = sha_(salt + h); return h; }
function safeEq_(a, b) { a = String(a); b = String(b); if (a.length !== b.length) return false; var x = 0; for (var i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }
function secret_() { var p = props_(), s = p.getProperty('TOKEN_SECRET'); if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); } return s; }
function sign_(payload) {
  var sig = Utilities.computeHmacSha256Signature(payload, secret_(), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + Utilities.base64EncodeWebSafe(sig);
}
function verify_(token) {
  var parts = token.split('.'); if (parts.length !== 2) return false;
  var payload; try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'); } catch (e) { return false; }
  if (!safeEq_(sign_(payload), token)) return false;
  return +payload.split('|')[1] > Date.now();
}

/* ---------------- 試算表選單 ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('持股同步').addItem('設定同步密碼', 'menuSetPassword').addItem('查看同步狀態', 'menuStatus').addToUi();
}
function menuSetPassword() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('設定同步密碼', '輸入新的同步密碼（至少 8 碼）。設定後所有裝置需重新輸入。', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var pw = a.getResponseText();
  if (pw.length < 8) { ui.alert('密碼至少 8 碼'); return; }
  var b = ui.prompt('設定同步密碼', '再輸入一次確認：', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  if (b.getResponseText() !== pw) { ui.alert('兩次輸入不一致，請重新設定'); return; }
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16), p = props_();
  p.setProperties({ PW_SALT: salt, PW_HASH: hashPw_(salt, pw), TOKEN_SECRET: Utilities.getUuid() + Utilities.getUuid() });
  ui.alert('✅ 同步密碼已設定。請在手機與電腦的「持股」分頁輸入這組密碼。');
}
function menuStatus() {
  var p = props_();
  SpreadsheetApp.getUi().alert('同步密碼：' + (p.getProperty('PW_HASH') ? '已設定' : '尚未設定') + '\n雲端版本：' + rev_() + '\n持股筆數：' + read_().holdings.length);
}
/* 直接在試算表修改持股時，更新版本號與「最後更新」，網站下次讀取就會拿到最新資料 */
function onEdit(e) {
  var r = e && e.range; if (!r) return;
  var name = r.getSheet().getName();
  if (name !== 'Holdings' && name !== 'Settings') return;
  if (name === 'Holdings' && r.getRow() > 1 && r.getColumn() <= 8) r.getSheet().getRange(r.getRow(), 9, r.getNumRows(), 1).setValue(new Date());
  props_().setProperty('REV', String(rev_() + 1));
}
