/* 訂單查詢網站：登入、資料讀取、首頁與 Order status 頁的畫面 */
(function () {
  'use strict';
  var CFG = window.ORDER_CONFIG || {};
  var API = (CFG.API_URL || '').trim();
  var DEMO = !API;
  var PAGE = document.body.dataset.page;
  var STEPS = ['Order placed', 'Shipped', 'Arrived in TW', 'Out for delivery', 'Delivered'];
  var STEP_ZH = { 'Order placed': '已下單', 'Shipped': '已出貨', 'Arrived in TW': '已抵台', 'Out for delivery': '配送中', 'Delivered': '已送達' };
  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 儲存 ---------- */
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function sstore(k, v) { try { if (v === undefined) return JSON.parse(sessionStorage.getItem(k) || 'null'); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function auth() { var a = store('ot-auth'); return a && a.exp > Date.now() ? a : null; }
  function logout() { store('ot-auth', null); sstore('ot-data', null); location.href = 'index.html'; }

  /* ---------- 工具 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(n) { return 'NT$' + Math.round(+n || 0).toLocaleString('en-US'); }
  function shipBadge(s) { var i = Math.max(0, STEPS.indexOf(s)); return '<span class="bd s' + i + '">' + esc(STEP_ZH[s] || s) + '</span>'; }
  function payBadge(s) { var c = { '未付款': 'p-unpaid', '已付訂金': 'p-dep', '已付清': 'p-paid', '部分付款': 'p-dep', '已退款': 'p-ref' }[s] || 'p-ref'; return '<span class="bd ' + c + '">' + esc(s) + '</span>'; }
  function daysTo(d) { if (!d) return null; var t = new Date(d + 'T00:00:00'), n = new Date(); n.setHours(0, 0, 0, 0); return Math.round((t - n) / 864e5); }
  function etaText(o) {
    if (o.shipStatus === 'Delivered') return '已送達';
    var k = daysTo(o.eta); if (k == null) return '';
    return k > 0 ? '還有 ' + k + ' 天' : k === 0 ? '預計今天' : '已逾 ' + (-k) + ' 天';
  }

  /* ---------- API ---------- */
  function api(body) {
    if (DEMO) return demoApi(body);
    var timer, to = new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error('連線逾時，請稍後再試')); }, 30000); });
    var req = fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('伺服器回應 ' + r.status); return r.json(); });
    return Promise.race([req, to]).then(function (j) { clearTimeout(timer); return j; }, function (e) {
      clearTimeout(timer);
      throw (/Failed to fetch|NetworkError|Load failed/i.test(e.message) ? new Error('無法連線到伺服器，請檢查網路') : e);
    });
  }
  function loadData() {
    var a = auth(); if (!a) return Promise.reject({ auth: false });
    return api({ action: 'data', token: a.token }).then(function (d) {
      if (!d.ok) { if (d.auth === false) { store('ot-auth', null); sstore('ot-data', null); } throw d; }
      sstore('ot-data', d); return d;
    });
  }

  /* ---------- 示範模式（未設定 API_URL 時） ---------- */
  function demoApi(b) {
    return new Promise(function (res) {
      setTimeout(function () {
        if (b.action === 'login') return res(b.account && b.password ? { ok: true, token: 'demo', name: '示範客戶', exp: Date.now() + 36e5 } : { ok: false, error: '請輸入帳號與密碼' });
        var d0 = new Date(), f = function (k) { var d = new Date(d0); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
        var orders = [
          { id: 'ORD-DEMO-003', item: 'Lululemon 瑜珈褲 ×2', qty: 2, amount: 6400, paid: 0, unpaid: 6400, payStatus: '未付款', shipStatus: 'Shipped', step: 1, orderDate: f(-8), shipDate: f(-4), days: 8, eta: f(6), tracking: 'US9400111298', note: '', updated: f(-3) + ' 11:02' },
          { id: 'ORD-DEMO-002', item: 'Le Creuset 鑄鐵鍋 24cm', qty: 1, amount: 9800, paid: 3000, unpaid: 6800, payStatus: '已付訂金', shipStatus: 'Out for delivery', step: 3, orderDate: f(-18), shipDate: f(-14), days: 8, eta: f(0), tracking: 'TW8820417902', note: '已付訂金 3,000，尾款到貨時付', updated: f(0) + ' 09:10' },
          { id: 'ORD-DEMO-001', item: "Arc'teryx Beta 外套", qty: 1, amount: 18900, paid: 18900, unpaid: 0, payStatus: '已付清', shipStatus: 'Delivered', step: 4, orderDate: f(-28), shipDate: f(-24), days: 7, eta: f(-15), tracking: 'TW8820415563', note: '', updated: f(-16) + ' 15:20' }
        ];
        res({ ok: true, user: { account: 'demo', name: '示範客戶' }, steps: STEPS, orders: orders, serverTime: f(0) + ' 12:00',
          summary: { orders: 3, total: 35100, paid: 21900, unpaid: 13200, payStatus: '部分付款', inTransit: 2, nextEta: f(0), counts: { 'Order placed': 0, 'Shipped': 1, 'Arrived in TW': 0, 'Out for delivery': 1, 'Delivered': 1 } } });
      }, 350);
    });
  }

  /* ---------- 共用版面 ---------- */
  function header() {
    var a = auth();
    var brand = esc(CFG.BRAND || 'Order Tracker');
    $('#top').innerHTML = '<div class="in"><a class="brand" href="index.html"><i>✓</i><span>' + brand + '</span></a>' +
      (a ? '<nav class="tabs"><a href="index.html"' + (PAGE === 'home' ? ' class="on"' : '') + '>首頁</a><a href="status.html"' + (PAGE === 'status' ? ' class="on"' : '') + '>Order status</a></nav>' +
        '<div class="who"><span class="nm">嗨，<b>' + esc(a.name) + '</b></span><button class="btn-ghost" id="logout">登出</button></div>' : '') + '</div>';
    var lo = $('#logout'); if (lo) lo.onclick = logout;
    document.title = (PAGE === 'status' ? 'Order status' : '首頁') + ' · ' + (CFG.BRAND || 'Order Tracker');
    if (CFG.CONTACT) $('#foot').textContent = '有任何問題請聯絡：' + CFG.CONTACT;
  }
  function demoNote() { return DEMO ? '<div class="demo">示範模式：尚未連接 Google Sheet 後端（config.js 的 API_URL 為空），以下為假資料。部署 Apps Script 並填入網址後即會顯示真實訂單。</div>' : ''; }
  function fail(e) {
    if (e && e.auth === false) { location.href = 'index.html'; return; }
    $('#main').innerHTML = demoNote() + '<div class="pn empty">資料載入失敗：' + esc((e && (e.error || e.message)) || '未知錯誤') + '<br><br><button class="btn-ghost" onclick="location.reload()">重新整理</button></div>';
  }

  /* ---------- 登入 ---------- */
  function loginView() {
    $('#main').innerHTML = demoNote() + '<div class="login"><div class="pn"><h1>查詢你的訂單</h1><p class="sub">登入後可查看付款與運送進度</p>' +
      '<form id="lf" autocomplete="on"><label for="acc">帳號</label><input id="acc" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required>' +
      '<label for="pw">密碼</label><input id="pw" name="password" type="password" autocomplete="current-password" required>' +
      '<button class="btn" id="lb" type="submit">登入</button><div class="err" id="le"></div></form>' +
      '<div class="hint">忘記帳號或密碼，請直接聯絡我們重設' + (CFG.CONTACT ? '：' + esc(CFG.CONTACT) : '') + '</div></div></div>';
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault();
      var b = $('#lb'); b.disabled = true; b.textContent = '登入中…'; $('#le').textContent = '';
      api({ action: 'login', account: $('#acc').value.trim(), password: $('#pw').value }).then(function (r) {
        if (!r.ok) throw r;
        store('ot-auth', { token: r.token, name: r.name, exp: r.exp });
        header(); home();
      }).catch(function (e) {
        $('#le').textContent = (e && (e.error || e.message)) || '登入失敗';
        b.disabled = false; b.textContent = '登入';
      });
    };
    $('#acc').focus();
  }

  /* ---------- 首頁 ---------- */
  function home() {
    if (!auth()) { loginView(); return; }
    var cached = sstore('ot-data');
    if (cached) renderHome(cached); else $('#main').innerHTML = demoNote() + '<div class="skel"></div><div class="skel"></div><div class="skel" style="height:260px"></div>';
    loadData().then(renderHome).catch(function (e) { if (e && e.auth === false) { header(); loginView(); } else if (!cached) fail(e); });
  }
  function renderHome(d) {
    var s = d.summary, pctPaid = s.total ? Math.min(100, s.paid / s.total * 100) : 0;
    var h = demoNote() + '<h1>' + esc(d.user.name) + ' 的訂單總覽</h1><p class="sub">資料更新於 ' + esc(d.serverTime) + '</p>';
    h += '<section class="pn"><div class="ph"><h2>Payment Summary<small>不含已退款訂單</small></h2>' + payBadge(s.payStatus) + '</div>' +
      '<div class="cards">' +
      '<div class="card"><div class="l">訂單總額</div><div class="v">' + money(s.total) + '</div><div class="s">' + s.orders + ' 筆訂單</div></div>' +
      '<div class="card"><div class="l">已付金額</div><div class="v" style="color:var(--dn)">' + money(s.paid) + '</div><div class="s">' + pctPaid.toFixed(0) + '% 已付</div></div>' +
      '<div class="card"><div class="l">未付金額</div><div class="v" style="color:' + (s.unpaid > 0 ? 'var(--up)' : 'var(--tx)') + '">' + money(s.unpaid) + '</div><div class="s">' + (s.unpaid > 0 ? '尚待付款' : '沒有待付款項') + '</div></div>' +
      '<div class="card"><div class="l">運送中</div><div class="v">' + s.inTransit + ' 筆</div><div class="s">' + (s.nextEta ? '最快 ' + esc(s.nextEta) + ' 到貨' : '目前沒有運送中的訂單') + '</div></div>' +
      '</div><div class="paybar"><i style="width:' + pctPaid + '%"></i></div><div class="paylegend"><span>已付 ' + money(s.paid) + '</span><span>總額 ' + money(s.total) + '</span></div></section>';
    h += '<section class="pn"><div class="ph"><h2>運送概況</h2><a class="more" href="status.html">Order status →</a></div><div class="pipe">' +
      STEPS.map(function (k, i) { var n = (s.counts && s.counts[k]) || 0; return '<div class="' + (n ? '' : 'zero') + '"><b class="' + (n ? '' : '') + '" style="' + (n ? 'color:var(--' + ['mu', 'ind', 'warn', 'ac', 'dn'][i] + ')' : '') + '">' + n + '</b><span>' + STEP_ZH[k] + '</span></div>'; }).join('') + '</div></section>';
    var rows = d.orders.slice(0, 6);
    h += '<section class="pn"><div class="ph"><h2>最近訂單</h2>' + (d.orders.length > rows.length ? '<a class="more" href="status.html">查看全部 ' + d.orders.length + ' 筆 →</a>' : '') + '</div>' +
      (rows.length ? '<table class="list"><thead><tr><th>訂單編號</th><th>品項</th><th class="r">金額</th><th>付款</th><th>運送</th><th>預估到達</th></tr></thead><tbody>' +
        rows.map(function (o) {
          return '<tr data-id="' + esc(o.id) + '"><td class="c-id oid">' + esc(o.id) + '</td><td class="c-item">' + esc(o.item) + '</td><td class="r num">' + money(o.amount) + '</td><td>' + payBadge(o.payStatus) + '</td><td>' + shipBadge(o.shipStatus) + '</td><td class="num c-hide">' + esc(o.eta || '—') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<div class="empty">目前沒有訂單</div>') + '</section>';
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
      transit: function (o) { return o.shipStatus !== 'Delivered' && o.payStatus !== '已退款'; },
      done: function (o) { return o.shipStatus === 'Delivered' && o.payStatus !== '已退款'; },
      refund: function (o) { return o.payStatus === '已退款'; }
    };
    var names = { all: '全部', transit: '運送中', done: '已送達', refund: '已退款' };
    var cnt = function (k) { return d.orders.filter(groups[k]).length; };
    var list = d.orders.filter(groups[filter]);
    var h = demoNote() + '<h1>Order status</h1><p class="sub">共 ' + d.orders.length + ' 筆訂單 · 資料更新於 ' + esc(d.serverTime) + '</p>' +
      '<div class="seg" id="seg">' + Object.keys(groups).filter(function (k) { return k === 'all' || cnt(k); }).map(function (k) {
        return '<button data-f="' + k + '"' + (k === filter ? ' class="on"' : '') + '>' + names[k] + ' ' + cnt(k) + '</button>';
      }).join('') + '</div>';
    h += list.length ? list.map(function (o) {
      var refunded = o.payStatus === '已退款';
      var steps = STEPS.map(function (k, i) {
        var cls = refunded ? '' : i < o.step || (i === o.step && o.step === 4) ? 'done' : i === o.step ? 'cur' : '';
        return '<div class="step ' + cls + '"><span class="dot">' + (cls === 'done' ? '✓' : '') + '</span>' + STEP_ZH[k] + '</div>';
      }).join('');
      var et = etaText(o);
      return '<article class="pn order' + (o.id === target ? ' hl' : '') + '" id="' + esc(o.id) + '">' +
        '<div class="oh"><div><div class="oid">' + esc(o.id) + '</div><div class="t">' + esc(o.item) + '</div></div><div style="display:flex;gap:6px;flex-wrap:wrap">' + payBadge(o.payStatus) + (refunded ? '' : shipBadge(o.shipStatus)) + '</div></div>' +
        (refunded ? '<div class="note">此訂單已退款</div>' : '<div class="steps">' + steps + '</div>') +
        '<div class="facts">' +
        '<div><div class="l">預估到達</div><div class="v">' + esc(o.eta || '—') + (et && !refunded ? '<small>' + et + '</small>' : '') + '</div></div>' +
        '<div><div class="l">下單 / 出貨</div><div class="v">' + esc((o.orderDate || '—').slice(5)) + ' / ' + esc(o.shipDate ? o.shipDate.slice(5) : '—') + '</div></div>' +
        '<div><div class="l">金額 · 已付</div><div class="v">' + money(o.amount) + '<small>已付 ' + money(o.paid) + '</small></div></div>' +
        '<div><div class="l">' + (o.unpaid > 0 ? '尚未付款' : '物流單號') + '</div><div class="v" style="' + (o.unpaid > 0 ? 'color:var(--up)' : '') + '">' + (o.unpaid > 0 ? money(o.unpaid) : esc(o.tracking || '—')) + '</div></div>' +
        '</div>' + (o.note ? '<div class="note">' + esc(o.note) + '</div>' : '') +
        (o.updated ? '<div class="upd">最後更新 ' + esc(o.updated) + (o.unpaid > 0 && o.tracking ? ' · 物流單號 ' + esc(o.tracking) : '') + '</div>' : '') +
        '</article>';
    }).join('') : '<div class="pn empty">這個分類沒有訂單</div>';
    $('#main').innerHTML = h;
    $('#seg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; renderStatus(d); };
    if (target) { var el = document.getElementById(target); if (el) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60); }
  }

  header();
  if (PAGE === 'status') status(); else home();
})();
