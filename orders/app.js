/* Order Tracker website: sign-in, data loading, Home and Order status pages */
(function () {
  'use strict';
  var CFG = window.ORDER_CONFIG || {};
  var API = (CFG.API_URL || '').trim();
  var DEMO = !API;
  var PAGE = document.body.dataset.page;
  var STEPS = ['Order placed', 'Shipped', 'Arrived in TW', 'Out for delivery', 'Delivered'];
  var $ = function (s) { return document.querySelector(s); };

  /* Payment statuses are entered in Chinese in the Google Sheet; show them in English */
  var PAY_EN = { '未付款': 'Unpaid', '已付訂金': 'Deposit paid', '已付清': 'Paid in full', '部分付款': 'Partially paid', '已退款': 'Refunded', '—': '—' };
  var PAY_CLS = { '未付款': 'p-unpaid', '已付訂金': 'p-dep', '已付清': 'p-paid', '部分付款': 'p-dep', '已退款': 'p-ref' };
  var REFUND = '已退款';

  /* Backend messages are in Chinese; translate them for customers */
  function enMsg(m) {
    m = String(m || '');
    var map = [
      [/帳號或密碼錯誤/, 'Incorrect account or password.'],
      [/請輸入帳號與密碼/, 'Please enter your account and password.'],
      [/嘗試次數過多/, 'Too many failed attempts. Please try again in 15 minutes.'],
      [/登入已過期/, 'Your session has expired. Please sign in again.'],
      [/帳號已停用/, 'This account has been disabled. Please contact us.'],
      [/伺服器暫時無法處理/, 'The server is temporarily unavailable. Please try again later.'],
      [/請求格式錯誤|未知的動作/, 'Invalid request.']
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(m)) return map[i][1];
    return /[一-鿿]/.test(m) ? 'Something went wrong. Please try again.' : m;
  }

  /* ---------- Storage ---------- */
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function sstore(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function auth() { var a = store('ot-auth'); return a && a.exp > Date.now() ? a : null; }
  function logout() { store('ot-auth', null); sstore('ot-data', null); location.href = 'index.html'; }

  /* ---------- Helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return 'NT$' + Math.round(+n || 0).toLocaleString('en-US'); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function shipBadge(s) { var i = Math.max(0, STEPS.indexOf(s)); return '<span class="bd s' + i + '">' + esc(s) + '</span>'; }
  function payBadge(s) { return '<span class="bd ' + (PAY_CLS[s] || 'p-ref') + '">' + esc(PAY_EN[s] || s) + '</span>'; }
  function daysTo(d) { if (!d) return null; var t = new Date(d + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); }
  function etaText(o) {
    if (o.shipStatus === 'Delivered') return 'Delivered';
    var k = daysTo(o.eta); if (k == null) return '';
    return k > 0 ? 'in ' + plural(k, 'day') : k === 0 ? 'today' : plural(-k, 'day') + ' late';
  }

  /* ---------- API ---------- */
  function api(body) {
    if (DEMO) return demoApi(body);
    var timer, to = new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error('The request timed out. Please try again.')); }, 30000); });
    var req = fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Server responded with ' + r.status); return r.json(); });
    return Promise.race([req, to]).then(function (j) { clearTimeout(timer); return j; }, function (e) {
      clearTimeout(timer);
      throw (/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? new Error('Cannot reach the server. Please check your connection.') : e);
    });
  }
  function loadData() {
    var a = auth(); if (!a) return Promise.reject({ auth: false });
    return api({ action: 'data', token: a.token }).then(function (d) {
      if (!d.ok) { if (d.auth === false) { store('ot-auth', null); sstore('ot-data', null); } throw d; }
      sstore('ot-data', d); return d;
    });
  }

  /* ---------- Demo mode (when API_URL is empty) ---------- */
  function demoApi(b) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (b.action === 'login') return res(b.account && b.password ? { ok: true, token: 'demo', name: 'Demo Customer', exp: Date.now() + 36e5 } : { ok: false, error: '請輸入帳號與密碼' });
        var d0 = new Date(), f = function (k) { var d = new Date(d0); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
        var orders = [
          { id: 'ORD-DEMO-003', item: 'Lululemon leggings ×2', qty: 2, amount: 6400, paid: 0, unpaid: 6400, payStatus: '未付款', shipStatus: 'Shipped', step: 1, orderDate: f(-8), shipDate: f(-4), days: 8, eta: f(6), tracking: 'US9400111298', note: '', updated: f(-3) + ' 11:02' },
          { id: 'ORD-DEMO-002', item: 'Le Creuset Dutch oven 24cm', qty: 1, amount: 9800, paid: 3000, unpaid: 6800, payStatus: '已付訂金', shipStatus: 'Out for delivery', step: 3, orderDate: f(-18), shipDate: f(-14), days: 8, eta: f(0), tracking: 'TW8820417902', note: 'Deposit NT$3,000 received; balance due on delivery', updated: f(0) + ' 09:10' },
          { id: 'ORD-DEMO-001', item: "Arc'teryx Beta jacket", qty: 1, amount: 18900, paid: 18900, unpaid: 0, payStatus: '已付清', shipStatus: 'Delivered', step: 4, orderDate: f(-28), shipDate: f(-24), days: 7, eta: f(-15), tracking: 'TW8820415563', note: '', updated: f(-16) + ' 15:20' }
        ];
        res({ ok: true, user: { account: 'demo', name: 'Demo Customer' }, steps: STEPS, orders: orders, serverTime: f(0) + ' 12:00',
          summary: { orders: 3, total: 35100, paid: 21900, unpaid: 13200, payStatus: '部分付款', inTransit: 2, nextEta: f(0), counts: { 'Order placed': 0, 'Shipped': 1, 'Arrived in TW': 0, 'Out for delivery': 1, 'Delivered': 1 } } });
      }, 350);
    });
  }

  /* ---------- Shared layout ---------- */
  function header() {
    var a = auth();
    var brand = esc(CFG.BRAND || 'Order Tracker');
    $('#top').innerHTML = '<div class="in"><a class="brand" href="index.html"><i>✓</i><span>' + brand + '</span></a>' +
      (a ? '<nav class="tabs"><a href="index.html"' + (PAGE === 'home' ? ' class="on"' : '') + '>Home</a><a href="status.html"' + (PAGE === 'status' ? ' class="on"' : '') + '>Order status</a></nav>' +
        '<div class="who"><span class="nm">Hi, <b>' + esc(a.name) + '</b></span><button class="btn-ghost" id="logout">Sign out</button></div>' : '') + '</div>';
    var lo = $('#logout'); if (lo) lo.onclick = logout;
    document.title = (PAGE === 'status' ? 'Order status' : 'Home') + ' · ' + (CFG.BRAND || 'Order Tracker');
    if (CFG.CONTACT) $('#foot').textContent = 'Questions? Contact us: ' + CFG.CONTACT;
  }
  function demoNote() { return DEMO ? '<div class="demo">Demo mode: the Google Sheet backend is not connected yet (API_URL in config.js is empty), so the data below is sample data.</div>' : ''; }
  function fail(e) {
    if (e && e.auth === false) { location.href = 'index.html'; return; }
    $('#main').innerHTML = demoNote() + '<div class="pn empty">Could not load your orders: ' + esc(enMsg((e && (e.error || e.message)) || 'Unknown error')) + '<br><br><button class="btn-ghost" onclick="location.reload()">Reload</button></div>';
  }

  /* ---------- Sign in ---------- */
  function loginView() {
    $('#main').innerHTML = demoNote() + '<div class="login"><div class="pn"><h1>Track your orders</h1><p class="sub">Sign in to see payment and delivery status</p>' +
      '<form id="lf" autocomplete="on"><label for="acc">Account</label><input id="acc" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required>' +
      '<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required>' +
      '<button class="btn" id="lb" type="submit">Sign in</button><div class="err" id="le"></div></form>' +
      '<div class="hint">Forgot your account or password? Contact us to reset it' + (CFG.CONTACT ? ': ' + esc(CFG.CONTACT) : '.') + '</div></div></div>';
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = $('#lb'); b.disabled = true; b.textContent = 'Signing in…'; $('#le').textContent = '';
      api({ action: 'login', account: $('#acc').value.trim(), password: $('#pw').value }).then(function (r) {
        if (!r.ok) throw r;
        store('ot-auth', { token: r.token, name: r.name, exp: r.exp });
        header(); home();
      }).catch(function (e) {
        $('#le').textContent = enMsg((e && (e.error || e.message)) || 'Sign-in failed.');
        b.disabled = false; b.textContent = 'Sign in';
      });
    };
    $('#acc').focus();
  }

  /* ---------- Home ---------- */
  function home() {
    if (!auth()) { loginView(); return; }
    var cached = sstore('ot-data');
    if (cached) renderHome(cached); else $('#main').innerHTML = demoNote() + '<div class="skel"></div><div class="skel"></div><div class="skel" style="height:260px"></div>';
    loadData().then(renderHome).catch(function (e) { if (e && e.auth === false) { header(); loginView(); } else if (!cached) fail(e); });
  }
  function renderHome(d) {
    var s = d.summary, pctPaid = s.total ? Math.min(100, s.paid / s.total * 100) : 0;
    var STEP_COL = ['mu', 'ind', 'warn', 'ac', 'dn'];
    var h = demoNote() + '<h1>' + esc(d.user.name) + '’s orders</h1><p class="sub">Last updated ' + esc(d.serverTime) + '</p>';
    h += '<section class="pn"><div class="ph"><h2>Payment summary<small>Refunded orders excluded</small></h2>' + payBadge(s.payStatus) + '</div>' +
      '<div class="cards">' +
      '<div class="card"><div class="l">Order total</div><div class="v">' + money(s.total) + '</div><div class="s">' + plural(s.orders, 'order') + '</div></div>' +
      '<div class="card"><div class="l">Paid</div><div class="v" style="color:var(--dn)">' + money(s.paid) + '</div><div class="s">' + pctPaid.toFixed(0) + '% paid</div></div>' +
      '<div class="card"><div class="l">Balance due</div><div class="v" style="color:' + (s.unpaid > 0 ? 'var(--up)' : 'var(--tx)') + '">' + money(s.unpaid) + '</div><div class="s">' + (s.unpaid > 0 ? 'Payment pending' : 'Nothing to pay') + '</div></div>' +
      '<div class="card"><div class="l">In transit</div><div class="v">' + s.inTransit + '</div><div class="s">' + (s.nextEta ? 'Next arrival ' + esc(s.nextEta) : 'No orders in transit') + '</div></div>' +
      '</div><div class="paybar"><i style="width:' + pctPaid + '%"></i></div><div class="paylegend"><span>Paid ' + money(s.paid) + '</span><span>Total ' + money(s.total) + '</span></div></section>';
    h += '<section class="pn"><div class="ph"><h2>Delivery overview</h2><a class="more" href="status.html">Order status →</a></div><div class="pipe">' +
      STEPS.map(function (k, i) { var n = (s.counts && s.counts[k]) || 0; return '<div class="' + (n ? '' : 'zero') + '"><b style="' + (n ? 'color:var(--' + STEP_COL[i] + ')' : '') + '">' + n + '</b><span>' + k + '</span></div>'; }).join('') + '</div></section>';
    var rows = d.orders.slice(0, 6);
    h += '<section class="pn"><div class="ph"><h2>Recent orders</h2>' + (d.orders.length > rows.length ? '<a class="more" href="status.html">View all ' + d.orders.length + ' →</a>' : '') + '</div>' +
      (rows.length ? '<table class="list"><thead><tr><th>Order no.</th><th>Item</th><th class="r">Amount</th><th>Payment</th><th>Delivery</th><th>Est. arrival</th></tr></thead><tbody>' +
        rows.map(function (o) {
          return '<tr data-id="' + esc(o.id) + '"><td class="c-id oid">' + esc(o.id) + '</td><td class="c-item">' + esc(o.item) + '</td><td class="r num">' + money(o.amount) + '</td><td>' + payBadge(o.payStatus) + '</td><td>' + shipBadge(o.shipStatus) + '</td><td class="num c-hide">' + esc(o.eta || '—') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">You have no orders yet.</div>') + '</section>';
    $('#main').innerHTML = h;
    document.querySelectorAll('tbody tr[data-id]').forEach(function (tr) { tr.onclick = function () { location.href = 'status.html#' + encodeURIComponent(tr.dataset.id); }; });
  }

  /* ---------- Order status ---------- */
  var filter = 'all';
  function status() {
    if (!auth()) { location.href = 'index.html'; return; }
    var cached = sstore('ot-data');
    if (cached) renderStatus(cached); else $('#main').innerHTML = demoNote() + '<div class="skel"></div><div class="skel" style="height:260px"></div><div class="skel" style="height:260px"></div>';
    loadData().then(renderStatus).catch(function (e) { if (!cached || (e && e.auth === false)) fail(e); });
  }
  function renderStatus(d) {
    var target = decodeURIComponent(location.hash.slice(1));
    var groups = {
      all: function () { return true; },
      transit: function (o) { return o.shipStatus !== 'Delivered' && o.payStatus !== REFUND; },
      done: function (o) { return o.shipStatus === 'Delivered' && o.payStatus !== REFUND; },
      refund: function (o) { return o.payStatus === REFUND; }
    };
    var names = { all: 'All', transit: 'In transit', done: 'Delivered', refund: 'Refunded' };
    var cnt = function (k) { return d.orders.filter(groups[k]).length; };
    var list = d.orders.filter(groups[filter]);
    var h = demoNote() + '<h1>Order status</h1><p class="sub">' + plural(d.orders.length, 'order') + ' · Last updated ' + esc(d.serverTime) + '</p>' +
      '<div class="seg" id="seg">' + Object.keys(groups).filter(function (k) { return k === 'all' || cnt(k); }).map(function (k) {
        return '<button data-f="' + k + '"' + (k === filter ? ' class="on"' : '') + '>' + names[k] + ' ' + cnt(k) + '</button>';
      }).join('') + '</div>';
    h += list.length ? list.map(function (o) {
      var refunded = o.payStatus === REFUND;
      var steps = STEPS.map(function (k, i) {
        var cls = refunded ? '' : i < o.step || (i === o.step && o.step === 4) ? 'done' : i === o.step ? 'cur' : '';
        return '<div class="step ' + cls + '"><span class="dot">' + (cls === 'done' ? '✓' : '') + '</span>' + k + '</div>';
      }).join('');
      var et = etaText(o);
      return '<article class="pn order' + (o.id === target ? ' hl' : '') + '" id="' + esc(o.id) + '">' +
        '<div class="oh"><div><div class="oid">' + esc(o.id) + '</div><div class="t">' + esc(o.item) + '</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">' + payBadge(o.payStatus) + (refunded ? '' : shipBadge(o.shipStatus)) + '</div></div>' +
        (refunded ? '<div class="note">This order has been refunded.</div>' : '<div class="steps">' + steps + '</div>') +
        '<div class="facts">' +
        '<div><div class="l">Est. arrival</div><div class="v">' + esc(o.eta || '—') + (et && !refunded ? '<small>' + et + '</small>' : '') + '</div></div>' +
        '<div><div class="l">Ordered / Shipped</div><div class="v">' + esc((o.orderDate || '—').slice(5)) + ' / ' + esc(o.shipDate ? o.shipDate.slice(5) : '—') + '</div></div>' +
        '<div><div class="l">Amount</div><div class="v">' + money(o.amount) + '<small>paid ' + money(o.paid) + '</small></div></div>' +
        '<div><div class="l">' + (o.unpaid > 0 ? 'Balance due' : 'Tracking no.') + '</div><div class="v" style="' + (o.unpaid > 0 ? 'color:var(--up)' : '') + '">' + (o.unpaid > 0 ? money(o.unpaid) : esc(o.tracking || '—')) + '</div></div>' +
        '</div>' + (o.note ? '<div class="note">' + esc(o.note) + '</div>' : '') +
        (o.updated ? '<div class="upd">Updated ' + esc(o.updated) + (o.unpaid > 0 && o.tracking ? ' · Tracking no. ' + esc(o.tracking) : '') + '</div>' : '') +
        '</article>';
    }).join('') : '<div class="pn empty">No orders in this category.</div>';
    $('#main').innerHTML = h;
    $('#seg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; renderStatus(d); };
    if (target) { var el = document.getElementById(target); if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }
  }

  header();
  if (PAGE === 'status') status(); else home();
})();
