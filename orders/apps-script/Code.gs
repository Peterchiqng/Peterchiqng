/**
 * 訂單查詢後端（Google Apps Script，綁定在「訂單管理後台 Order Tracker」試算表）
 *
 * 前台（GitHub Pages）只會呼叫兩個動作：
 *   login：帳號＋密碼 → 簽章 token（有效 12 小時）
 *   data ：token → 只回傳該帳號自己的訂單與付款摘要
 * 試算表本身維持私人；密碼只存「加鹽雜湊」，前台永遠拿不到雜湊、鹽或其他人的資料。
 *
 * 部署：擴充功能 › Apps Script › 貼上本檔 › 部署 › 新增部署作業 › 網頁應用程式
 *       執行身分：我　｜　存取權：所有人
 */

var CFG = {
  SHEET_ID: '132x_oJt1LP7t2KVh1jGwI6B6hhrosxaSXf6JMX1r0O4',
  ITER: 500,            // 雜湊重複次數（與現有密碼相容，勿任意更改）
  TOKEN_HOURS: 12,
  MAX_FAILS: 5,         // 連續錯誤次數上限
  LOCK_MINUTES: 15
};
var SHIP_STEPS = ['Order placed', 'Shipped', 'Arrived in TW', 'Out for delivery', 'Delivered'];
var REFUND = '已退款';

/* ---------------- Web App ---------------- */
function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: '請求格式錯誤' }); }
  return json_(route_(body));
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action) return json_(route_(p));
  return json_({ ok: true, app: 'order-tracker', time: new Date().toISOString() });
}

function route_(b) {
  try {
    if (b.action === 'login') return login_(String(b.account || ''), String(b.password || ''));
    if (b.action === 'data') return data_(String(b.token || ''));
    if (b.action === 'ping') return { ok: true };
    return { ok: false, error: '未知的動作' };
  } catch (err) {
    console.error(err);
    return { ok: false, error: '伺服器暫時無法處理，請稍後再試' };
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- 登入 ---------------- */
function login_(account, password) {
  account = account.trim().toLowerCase();
  if (!account || !password) return { ok: false, error: '請輸入帳號與密碼' };
  var cache = CacheService.getScriptCache(), key = 'fail:' + account;
  var fails = +(cache.get(key) || 0);
  if (fails >= CFG.MAX_FAILS) return { ok: false, error: '嘗試次數過多，請 ' + CFG.LOCK_MINUTES + ' 分鐘後再試' };

  var u = findUser_(account);
  var good = u && u.status !== '停用' && u.hash && safeEq_(hashPw_(u.salt, password), u.hash);
  if (!good) {
    cache.put(key, String(fails + 1), CFG.LOCK_MINUTES * 60);
    return { ok: false, error: '帳號或密碼錯誤' };
  }
  cache.remove(key);
  var exp = Date.now() + CFG.TOKEN_HOURS * 3600 * 1000;
  return { ok: true, token: sign_(u.account + '|' + exp), name: u.name, exp: exp };
}

/* ---------------- 查詢本人資料 ---------------- */
function data_(token) {
  var account = verify_(token);
  if (!account) return { ok: false, error: '登入已過期，請重新登入', auth: false };
  var u = findUser_(account);
  if (!u || u.status === '停用') return { ok: false, error: '帳號已停用', auth: false };

  var ss = book_(), tz = ss.getSpreadsheetTimeZone();
  var sh = ss.getSheetByName('Orders');
  var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 15).getValues() : [];
  var d = function (v, f) { return isDate_(v) ? Utilities.formatDate(v, tz, f || 'yyyy-MM-dd') : (v ? String(v) : ''); };
  var orders = [];
  rows.forEach(function (r) {
    if (!r[0] || String(r[1]).trim().toLowerCase() !== account) return;
    var amount = +r[4] || 0, paid = +r[5] || 0, ship = String(r[7] || 'Order placed');
    orders.push({
      id: String(r[0]), item: String(r[2] || ''), qty: +r[3] || 0,
      amount: amount, paid: paid, unpaid: r[6] === REFUND ? 0 : Math.max(0, amount - paid),
      payStatus: String(r[6] || '未付款'), shipStatus: ship, step: Math.max(0, SHIP_STEPS.indexOf(ship)),
      orderDate: d(r[8]), shipDate: d(r[9]), days: r[10] === '' ? null : +r[10], eta: d(r[11]),
      tracking: String(r[12] || ''), note: String(r[13] || ''), updated: d(r[14], 'yyyy-MM-dd HH:mm')
    });
  });
  orders.sort(function (a, b) { return (b.orderDate || '').localeCompare(a.orderDate || ''); });

  var live = orders.filter(function (o) { return o.payStatus !== REFUND; });
  var sum = function (k) { return live.reduce(function (s, o) { return s + o[k]; }, 0); };
  var open = live.filter(function (o) { return o.shipStatus !== 'Delivered'; });
  var etas = open.map(function (o) { return o.eta; }).filter(String).sort();
  var counts = {}; SHIP_STEPS.forEach(function (s) { counts[s] = 0; });
  live.forEach(function (o) { counts[o.shipStatus] = (counts[o.shipStatus] || 0) + 1; });

  return {
    ok: true,
    user: { account: u.account, name: u.name },
    summary: {
      orders: live.length, total: sum('amount'), paid: sum('paid'), unpaid: sum('unpaid'),
      payStatus: !live.length ? '—' : sum('unpaid') <= 0 ? '已付清' : sum('paid') > 0 ? '部分付款' : '未付款',
      inTransit: open.length, nextEta: etas[0] || '', counts: counts
    },
    steps: SHIP_STEPS,
    orders: orders,
    serverTime: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm')
  };
}

/* ---------------- 工具 ---------------- */
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v); }

function book_() {
  try { var a = SpreadsheetApp.getActiveSpreadsheet(); if (a) return a; } catch (e) {}
  return SpreadsheetApp.openById(CFG.SHEET_ID);
}

function findUser_(account) {
  var sh = book_().getSheetByName('Users');
  if (sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).trim().toLowerCase() === account) {
      return { row: i + 2, account: String(r[0]).trim().toLowerCase(), name: String(r[1] || ''), status: String(r[4] || '啟用'), hash: String(r[6] || ''), salt: String(r[7] || '') };
    }
  }
  return null;
}

function hex_(bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); }
function sha_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hashPw_(salt, pw) { var h = sha_(salt + pw); for (var i = 1; i < CFG.ITER; i++) h = sha_(salt + h); return h; }
function safeEq_(a, b) { if (a.length !== b.length) return false; var x = 0; for (var i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; }

function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}
function sign_(payload) {
  var sig = Utilities.computeHmacSha256Signature(payload, secret_(), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + Utilities.base64EncodeWebSafe(sig);
}
function verify_(token) {
  var parts = String(token).split('.');
  if (parts.length !== 2) return null;
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'); } catch (e) { return null; }
  if (!safeEq_(sign_(payload), token)) return null;
  var p = payload.split('|');
  if (+p[1] < Date.now()) return null;
  return p[0];
}

/* ---------------- 試算表選單（後台操作） ---------------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('訂單後台')
    .addItem('新增使用者', 'menuAddUser')
    .addItem('設定／重設使用者密碼', 'menuSetPassword')
    .addSeparator()
    .addItem('測試雜湊（檢查是否與前台相容）', 'menuSelfTest')
    .addToUi();
}

function menuSetPassword() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('設定密碼', '輸入要設定密碼的帳號：', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var u = findUser_(a.getResponseText().trim().toLowerCase());
  if (!u) { ui.alert('找不到這個帳號，請先在 Users 工作表新增'); return; }
  setPassword_(u.row, ui);
}

function menuAddUser() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('新增使用者', '帳號（英數字，登入時使用）：', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var acct = a.getResponseText().trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(acct)) { ui.alert('帳號需為 3–30 個英數字（可含 . _ -）'); return; }
  if (findUser_(acct)) { ui.alert('帳號已存在'); return; }
  var n = ui.prompt('新增使用者', '姓名：', ui.ButtonSet.OK_CANCEL);
  if (n.getSelectedButton() !== ui.Button.OK) return;
  var sh = book_().getSheetByName('Users');
  sh.appendRow([acct, n.getResponseText().trim(), '', '', '啟用', new Date(), '', '']);
  setPassword_(sh.getLastRow(), ui);
}

function setPassword_(row, ui) {
  var p = ui.prompt('設定密碼', '輸入新密碼（至少 8 碼）；留空則自動產生：', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  var pw = p.getResponseText(), gen = false;
  if (!pw) { pw = Utilities.getUuid().replace(/-/g, '').slice(0, 10); gen = true; }
  if (pw.length < 8) { ui.alert('密碼至少 8 碼'); return; }
  var salt = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  book_().getSheetByName('Users').getRange(row, 7, 1, 2).setValues([[hashPw_(salt, pw), salt]]);
  ui.alert('已設定完成' + (gen ? '。\n\n自動產生的密碼：' + pw + '\n\n請立即提供給客戶；關閉此視窗後將無法再次查看。' : '。'));
}

function menuSelfTest() {
  var ok = hashPw_('abc', 'pw') === '2e08494e5f1d15ab76f0162c3f351a66f3dda6bf071daca13b84e4057f5c3bde';
  SpreadsheetApp.getUi().alert(ok ? '✅ 雜湊正確，與前台相容' : '❌ 雜湊結果不一致，請確認程式碼未被修改');
}

/* 後台修改付款／運送等欄位時，自動更新「最後更新」 */
function onEdit(e) {
  var r = e && e.range;
  if (!r || r.getSheet().getName() !== 'Orders' || r.getRow() < 2) return;
  var c0 = r.getColumn(), c1 = c0 + r.getNumColumns() - 1;
  if (c1 < 3 || c0 > 14) return;
  r.getSheet().getRange(r.getRow(), 15, r.getNumRows(), 1).setValue(new Date());
}
