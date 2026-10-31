/* 持股投資儀表板：手動新增、CSV 匯入／匯出、即時報價（FinMind）、損益與配置、提醒
 * 資料只存在這個瀏覽器（localStorage），可用「匯出 CSV」備份。
 */
(function () {
  'use strict';
  var root = document.getElementById('pf');
  if (!root) return;
  var $ = function (s) { return root.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  var FM = 'https://api.finmindtrade.com/api/v4/data';
  var KEY = 'pf-v1', PXKEY = 'pf-px-v1', LISTKEY = 'pf-list-v1';
  var TYPES = ['長期', '短期', 'ETF'];
  var PALETTE = ['#2A82B8', '#FF9F55', '#5FB4E2', '#F5852F', '#8FCDEE', '#FFC08F', '#236C9A', '#FFD9B8', '#7FA6C2', '#B8D9EC', '#E56B2A', '#4B6B85'];
  var ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  var ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
  var CART = '<svg viewBox="0 0 24 24" fill="none" stroke="#3A1E06" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h2.6l2.2 10.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.2"/><circle cx="9.5" cy="19.6" r="1.3" fill="#3A1E06"/><circle cx="17" cy="19.6" r="1.3" fill="#3A1E06"/><path d="M11 11.2h6.2M14.8 8.8l2.4 2.4-2.4 2.4"/></svg>';

  /* ---------------- 狀態 ---------------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('瀏覽器無法儲存資料（可能是無痕模式）'); } }
  var S = load(KEY, null) || { holdings: [], settings: { conc: 25, tp: 20, sl: -10 } };
  S.settings = Object.assign({ conc: 25, tp: 20, sl: -10 }, S.settings || {});
  var PX = load(PXKEY, {});
  var FX = PX.__fx || null;
  var LIST = null;
  var ui = { mkt: 'all', type: 'all', q: '', sort: { k: 'mv', d: -1 }, alloc: 'stock', visible: false, loading: false };
  var charts = {};
  function persist() { save(KEY, S); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ---------------- 工具 ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(x) { return x == null || isNaN(x) ? '—' : Math.round(x).toLocaleString('en-US'); }
  function n2(x, d) { return x == null || isNaN(x) ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function money(x) { return x == null || isNaN(x) ? '—' : (x < 0 ? '-' : '') + '$' + n0(Math.abs(x)); }
  function smoney(x) { return x == null || isNaN(x) ? '—' : (x > 0 ? '+' : x < 0 ? '-' : '') + '$' + n0(Math.abs(x)); }
  function pct(x, d) { return x == null || isNaN(x) || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d == null ? 2 : d) + '%'; }
  function cls(x) { return x > 0 ? 'up' : x < 0 ? 'dn' : ''; }
  function today() { return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); }
  function daysAgo(n) { return new Date(Date.now() + 8 * 3600e3 - n * 864e5).toISOString().slice(0, 10); }
  function num(v) { if (v == null) return NaN; var s = String(v).replace(/[,\s$＄NT元股]/g, '').replace(/^\((.*)\)$/, '-$1'); return s === '' ? NaN : +s; }
  function inferMkt(code) { return /^[0-9]{4,6}[A-Z]?$/i.test(code) ? 'TW' : 'US'; }
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#16324A;color:#fff;padding:11px 18px;border-radius:999px;font:700 13.5px Nunito,system-ui,sans-serif;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------------- 資料來源（FinMind，免 token） ---------------- */
  function fm(ds, p) {
    var u = new URL(FM); u.searchParams.set('dataset', ds);
    Object.keys(p).forEach(function (k) { u.searchParams.set(k, p[k]); });
    return fetch(u.toString()).then(function (r) { return r.json(); }).then(function (j) {
      if (j.status !== 200) throw new Error(j.msg || 'API ' + j.status);
      return j.data || [];
    });
  }
  function loadList() {
    if (LIST) return Promise.resolve(LIST);
    var c = load(LISTKEY, null);
    if (c && c.t > Date.now() - 7 * 864e5 && c.rows && c.rows.length > 1000) { LIST = c.rows; return Promise.resolve(LIST); }
    return fm('TaiwanStockInfo', {}).then(function (rows) {
      var seen = {}, out = [];
      rows.forEach(function (r) { if (r.stock_id && r.stock_name && !seen[r.stock_id] && /^[0-9A-Z]{4,6}$/.test(r.stock_id)) { seen[r.stock_id] = 1; out.push([r.stock_id, r.stock_name]); } });
      LIST = out; save(LISTKEY, { t: Date.now(), rows: out }); return LIST;
    }).catch(function () { LIST = (c && c.rows) || []; return LIST; });
  }
  function twName(code) { if (!LIST) return ''; for (var i = 0; i < LIST.length; i++) if (LIST[i][0] === code) return LIST[i][1]; return ''; }
  function twCodeByName(name) {
    if (!LIST) return '';
    for (var i = 0; i < LIST.length; i++) if (LIST[i][1] === name) return LIST[i][0];
    for (i = 0; i < LIST.length; i++) if (LIST[i][1].indexOf(name) === 0) return LIST[i][0];
    return '';
  }
  function weekKey(d) { var t = new Date(d + 'T00:00:00Z'); var day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day); return t.toISOString().slice(0, 10); }
  function fetchPx(h) {
    var key = h.market + ':' + h.code, c = PX[key];
    if (c && c.t > Date.now() - 30 * 60e3) return Promise.resolve(c);
    var ds = h.market === 'US' ? 'USStockPrice' : 'TaiwanStockPrice';
    return fm(ds, { data_id: h.code, start_date: daysAgo(200) }).then(function (rows) {
      var s = rows.map(function (r) { return [r.date, +(r.close != null ? r.close : r.Close)]; }).filter(function (x) { return x[1] > 0; });
      if (!s.length) throw new Error('查無報價');
      var last = s[s.length - 1], prev = s.length > 1 ? s[s.length - 2][1] : null;
      var wk = {}; s.forEach(function (x) { wk[weekKey(x[0])] = x[1]; });
      var wks = Object.keys(wk).sort().map(function (k) { return wk[k]; });
      var ma20 = wks.length >= 20 ? wks.slice(-20).reduce(function (a, b) { return a + b; }, 0) / 20 : null;
      var weekAgo = s.length > 5 ? s[s.length - 6][1] : null;
      var v = { t: Date.now(), date: last[0], close: last[1], prev: prev, ma20w: ma20, wk: weekAgo ? last[1] / weekAgo - 1 : null, spark: s.slice(-60).map(function (x) { return x[1]; }) };
      PX[key] = v; return v;
    }).catch(function (e) { if (c) return c; return { err: e.message || '查無報價', t: Date.now() }; });
  }
  function fetchFx() {
    if (FX && FX.t > Date.now() - 6 * 3600e3) return Promise.resolve(FX);
    return fm('TaiwanExchangeRate', { data_id: 'USD', start_date: daysAgo(20) }).then(function (rows) {
      var r = rows.filter(function (x) { return x.spot_buy > 0 && x.spot_sell > 0; }).slice(-1)[0];
      if (!r) throw new Error('no fx');
      FX = { t: Date.now(), rate: (r.spot_buy + r.spot_sell) / 2, date: r.date }; PX.__fx = FX; return FX;
    }).catch(function () { return FX || { rate: 32, date: '', fallback: true }; });
  }
  function refresh(force) {
    if (force) { Object.keys(PX).forEach(function (k) { if (PX[k] && PX[k].t) PX[k].t = 0; }); if (FX) FX.t = 0; }
    if (!S.holdings.length) { render(); return; }
    ui.loading = true; render();
    var uniq = {}; S.holdings.forEach(function (h) { uniq[h.market + ':' + h.code] = h; });
    var list = Object.keys(uniq).map(function (k) { return uniq[k]; });
    var i = 0, out = [];
    function next() { if (i >= list.length) return Promise.resolve(); var h = list[i++]; return fetchPx(h).then(next); }
    Promise.all([fetchFx(), loadList(), next(), next(), next(), next()]).then(function () {
      ui.loading = false; save(PXKEY, PX);
      var fixed = false;
      S.holdings.forEach(function (h) { if (!h.name && h.market === 'TW') { var nm = twName(h.code); if (nm) { h.name = nm; fixed = true; } } });
      if (fixed) persist();
      render();
    });
  }

  /* ---------------- 計算 ---------------- */
  function compute() {
    var fx = (FX && FX.rate) || 32;
    var rows = S.holdings.map(function (h) {
      var p = PX[h.market + ':' + h.code] || {};
      var f = h.market === 'US' ? fx : 1;
      var price = p.close != null ? p.close : null;
      var cost = h.shares * h.cost * f;
      var mv = price != null ? h.shares * price * f : cost;
      var day = price != null && p.prev ? h.shares * (price - p.prev) * f : 0;
      var held = h.date ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(h.date)) / 864e5)) : null;
      return { h: h, p: p, price: price, cost: cost, mv: mv, pnl: mv - cost, ret: cost ? (mv - cost) / cost : null, day: day, dayPct: price != null && p.prev ? price / p.prev - 1 : null, held: held, noPx: price == null };
    });
    var tot = rows.reduce(function (a, r) { a.mv += r.mv; a.cost += r.cost; a.day += r.day; return a; }, { mv: 0, cost: 0, day: 0 });
    rows.forEach(function (r) { r.w = tot.mv ? r.mv / tot.mv : 0; });
    tot.pnl = tot.mv - tot.cost; tot.ret = tot.cost ? tot.pnl / tot.cost : null;
    tot.dayPct = tot.mv - tot.day ? tot.day / (tot.mv - tot.day) : null;
    var dates = rows.map(function (r) { return r.p.date; }).filter(Boolean).sort();
    tot.date = dates[dates.length - 1] || '';
    return { rows: rows, tot: tot, fx: fx };
  }
  function filtered(rows) {
    var q = ui.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (ui.mkt !== 'all' && r.h.market !== ui.mkt) return false;
      if (ui.type !== 'all' && r.h.type !== ui.type) return false;
      if (q && (r.h.code + ' ' + (r.h.name || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function alerts(C) {
    // 依個股彙整：每檔一張卡，嚴重度高的排前面
    var st = S.settings, out = [];
    C.rows.forEach(function (r) {
      var nm = r.h.name || r.h.code, it = [], lv = 0, ic = '';
      if (r.noPx) { out.push({ lv: 3, cls: 'warn', ic: '⚠️', nm: nm, it: ['查無報價：請確認代號與市場（' + (r.h.market === 'US' ? '美股' : '台股') + '）'] }); return; }
      if (r.ret != null && r.ret * 100 <= st.sl) { it.push('🛑 觸及停損：報酬 ' + pct(r.ret, 1) + '（設定 ' + st.sl + '%）'); lv = Math.max(lv, 4); ic = ic || '🛑'; }
      if (r.ret != null && r.ret * 100 >= st.tp) { it.push('🎯 達到停利：報酬 ' + pct(r.ret, 1) + '（設定 +' + st.tp + '%）'); lv = Math.max(lv, 3); ic = ic || '🎯'; }
      if (r.w * 100 > st.conc && C.rows.length > 1) { it.push('⚖️ 佔投資部位 ' + (r.w * 100).toFixed(1) + '%（上限 ' + st.conc + '%）'); lv = Math.max(lv, 2); ic = ic || '⚖️'; }
      if (r.p.ma20w && r.price < r.p.ma20w) { it.push('📉 跌破 20 週均線：' + n2(r.price) + ' < ' + n2(r.p.ma20w)); lv = Math.max(lv, 1); ic = ic || '📉'; }
      if (it.length) out.push({ lv: lv, cls: lv === 4 ? 'cool' : lv === 3 ? 'hot' : 'warn', ic: ic, nm: nm, it: it, w: r.w });
    });
    return out.sort(function (a, b) { return b.lv - a.lv || (b.w || 0) - (a.w || 0); });
  }

  /* ---------------- 版面 ---------------- */
  function shell() {
    root.innerHTML =
      '<div class="pf-head"><div><h1><i>' + CART + '</i>持股投資儀表板</h1><p class="pf-sub" id="pf-sub"></p></div>' +
      '<div class="pf-actions"><button class="btn btn-sec" data-act="import">⬆ 匯入 CSV</button><button class="btn btn-sec" data-act="export">⬇ 匯出</button><button class="btn btn-sec btn-sm" data-act="settings" title="提醒設定">⚙</button><button class="btn btn-pri" data-act="add">＋ 新增持股</button></div></div>' +
      '<div id="pf-body"></div>' +
      dialogs();
  }
  function render() {
    if (!ui.visible) return;
    if (!$('#pf-body')) shell();
    var body = $('#pf-body');
    destroyCharts();
    if (!S.holdings.length) {
      $('#pf-sub').textContent = '資料只存在這個瀏覽器，可隨時匯出備份';
      body.innerHTML = '<div class="empty"><div class="ic">' + CART + '</div><h2>還沒有持股</h2><p>手動新增你的第一筆持股，或匯入券商匯出的 CSV。<br>報價會自動從 FinMind 更新（台股、美股皆可）。</p>' +
        '<div class="pf-actions"><button class="btn btn-pri" data-act="add">＋ 新增持股</button><button class="btn btn-blue" data-act="import">⬆ 匯入 CSV</button><button class="btn btn-sec" data-act="sample">載入範例資料</button></div></div>';
      return;
    }
    var C = compute(), T = C.tot;
    var rows = filtered(C.rows);
    $('#pf-sub').innerHTML = (ui.loading ? '更新報價中…' : '報價日期 ' + esc(T.date || '—')) + ' · ' + C.rows.length + ' 檔 · 資料存在這個瀏覽器 <button class="btn-ghost" data-act="refresh" title="重新抓取報價">↻ 更新</button>';
    var h = '<section class="hero"><div class="fx">USD/TWD ' + n2(C.fx, 2) + (FX && FX.date ? '<br>' + esc(FX.date) : '') + '</div>' +
      '<div class="l">總市值（新台幣）</div><div class="big num">' + money(T.mv) + '</div>' +
      '<span class="chg">今日 ' + smoney(T.day) + '（' + pct(T.dayPct) + '）</span>' +
      '<div class="row">' +
      '<div class="it"><div class="l">投入成本</div><div class="v num">' + money(T.cost) + '</div><div class="s">' + C.rows.length + ' 檔持股</div></div>' +
      '<div class="it"><div class="l">未實現損益</div><div class="v num ' + (T.pnl >= 0 ? 'pos' : 'neg') + '">' + smoney(T.pnl) + '</div><div class="s">報酬率 ' + pct(T.ret) + '</div></div>' +
      '<div class="it"><div class="l">台股市值</div><div class="v num">' + money(sumBy(C.rows, 'TW')) + '</div><div class="s">' + share(sumBy(C.rows, 'TW'), T.mv) + '</div></div>' +
      '<div class="it"><div class="l">美股市值（換算台幣）</div><div class="v num">' + money(sumBy(C.rows, 'US')) + '</div><div class="s">' + share(sumBy(C.rows, 'US'), T.mv) + '</div></div>' +
      '</div></section>';
    var al = alerts(C);
    var shown = ui.allAlerts ? al : al.slice(0, 6);
    h += '<section class="pn alerts"><div class="ph"><h2>需要注意<small>' + (al.length ? al.length + ' 檔' : '') + '</small></h2>' + (al.length > 6 ? '<button class="btn-ghost" data-act="alerts">' + (ui.allAlerts ? '收合' : '顯示全部 ' + al.length + ' 檔') + '</button>' : '') + '</div>' +
      (al.length ? '<ul>' + shown.map(function (x) { return '<li class="' + x.cls + '"><em>' + x.ic + '</em><div><b>' + esc(x.nm) + '</b>' + x.it.map(function (s) { return '<small>' + esc(s) + '</small>'; }).join('<br>') + '</div></li>'; }).join('') + '</ul>' : '<div class="ok">✅ 目前沒有需要注意的持股</div>') + '</section>';
    h += '<div class="grid"><section class="pn"><div class="ph"><h2>資產配置</h2><div class="mini" id="pf-alloc">' +
      [['stock', '個股'], ['type', '類型'], ['mkt', '市場']].map(function (x) { return '<button data-v="' + x[0] + '"' + (ui.alloc === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') +
      '</div></div><div class="alloc"><div class="cv"><canvas id="pf-c1"></canvas></div><ul class="legend" id="pf-leg"></ul></div></section>' +
      '<section class="pn"><div class="ph"><h2>個股損益<small>新台幣 · 紅賺綠賠</small></h2></div><div class="cv"><canvas id="pf-c2"></canvas></div></section></div>';
    h += '<section class="pn"><div class="bar"><div class="seg" id="pf-mkt">' + [['all', '全部'], ['TW', '台股'], ['US', '美股']].map(function (x) { return '<button data-v="' + x[0] + '"' + (ui.mkt === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="seg" id="pf-type">' + [['all', '全部類型']].concat(TYPES.map(function (t) { return [t, t]; })).map(function (x) { return '<button data-v="' + x[0] + '"' + (ui.type === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' +
      '<label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="pf-q" type="text" placeholder="搜尋代號或名稱" value="' + esc(ui.q) + '"></label></div>' +
      table(rows) +
      '<div class="foot"><span>報價來源：FinMind（台股收盤、美股收盤、台銀即期匯率）· 每 30 分鐘最多更新一次</span><span>資料儲存在這個瀏覽器；換電腦請先「匯出」再「匯入」</span></div></section>';
    body.innerHTML = h;
    var qi = $('#pf-q'); if (qi && document.activeElement !== qi && ui._qFocus) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    drawCharts(C);
  }
  function sumBy(rows, m) { return rows.filter(function (r) { return r.h.market === m; }).reduce(function (a, r) { return a + r.mv; }, 0); }
  function share(x, t) { return t ? (x / t * 100).toFixed(1) + '% 配置' : '—'; }
  function table(rows) {
    var cols = [['name', '股票'], ['type', '類型'], ['w', '佔比'], ['shares', '股數'], ['cost', '均價'], ['price', '現價'], ['costT', '投入成本'], ['mv', '市值'], ['pnl', '損益'], ['ret', '報酬率'], ['held', '持有'], ['', '']];
    var key = ui.sort.k, dir = ui.sort.d;
    var val = function (r) { return { name: r.h.code, type: r.h.type, w: r.w, shares: r.h.shares, cost: r.h.cost, price: r.price, costT: r.cost, mv: r.mv, pnl: r.pnl, ret: r.ret, held: r.held }[key]; };
    rows = rows.slice().sort(function (a, b) { var x = val(a), y = val(b); if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    if (!rows.length) return '<div class="empty" style="padding:28px"><p style="margin:0">沒有符合條件的持股</p></div>';
    return '<div class="tblwrap"><table class="hold"><thead><tr>' + cols.map(function (c) { return '<th data-k="' + c[0] + '" class="' + (c[0] ? (c[0] === key ? 'sorted' : '') : 'noc') + (c[0] === 'costT' || c[0] === 'held' ? ' c-hide' : '') + '">' + c[1] + (c[0] === key ? (dir > 0 ? ' ↑' : ' ↓') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        var h = r.h, us = h.market === 'US';
        var pxs = r.noPx ? '<span class="stale">' + esc(r.p.err || '查無報價') + '</span>' : n2(r.price) + '<small class="' + cls(r.dayPct) + '">' + pct(r.dayPct) + '</small>';
        return '<tr>' +
          '<td class="stk"><b>' + esc(h.name || h.code) + '<span class="tag' + (us ? ' us' : '') + '">' + (us ? 'US' : 'TW') + '</span></b><small>' + esc(h.code) + '</small></td>' +
          '<td class="c-r" data-l="類型"><span class="type">' + esc(h.type) + '</span></td>' +
          '<td data-l="佔比"><span class="wbar">' + (r.w * 100).toFixed(1) + '%<i><u style="width:' + Math.min(100, r.w * 100).toFixed(1) + '%"></u></i></span></td>' +
          '<td class="c-r" data-l="股數">' + n2(h.shares, h.shares % 1 ? 3 : 0) + '</td>' +
          '<td data-l="均價' + (us ? '（USD）' : '') + '">' + n2(h.cost) + '</td>' +
          '<td class="c-r px" data-l="現價">' + pxs + '</td>' +
          '<td class="c-hide" data-l="投入成本">' + money(r.cost) + '</td>' +
          '<td data-l="市值">' + money(r.mv) + '</td>' +
          '<td class="c-r ' + cls(r.pnl) + '" data-l="損益">' + (r.noPx ? '—' : smoney(r.pnl)) + '</td>' +
          '<td data-l="報酬率">' + (r.noPx ? '—' : '<span class="ret ' + cls(r.ret) + '">' + pct(r.ret) + '</span>') + '</td>' +
          '<td class="c-r c-hide" data-l="持有">' + (r.held != null ? r.held + ' 天' : '—') + '</td>' +
          '<td class="ops"><button class="btn-ghost ic" data-act="edit" data-id="' + h.id + '" title="編輯" aria-label="編輯">' + ICON_EDIT + '</button><button class="btn-ghost ic del" data-act="del" data-id="' + h.id + '" title="刪除" aria-label="刪除">' + ICON_DEL + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ---------------- 圖表 ---------------- */
  function css(v) { return getComputedStyle(root).getPropertyValue(v).trim(); }
  function destroyCharts() { Object.keys(charts).forEach(function (k) { charts[k].destroy(); }); charts = {}; }
  function drawCharts(C) {
    if (typeof Chart === 'undefined') return;
    var tx = css('--tx2'), mu = css('--mu'), ln = css('--ln'), up = css('--up'), dn = css('--dn');
    var font = { family: "Nunito, system-ui, sans-serif", weight: '700' };
    // 配置
    var groups = {};
    C.rows.forEach(function (r) {
      var k = ui.alloc === 'type' ? r.h.type : ui.alloc === 'mkt' ? (r.h.market === 'US' ? '美股' : '台股') : (r.h.name || r.h.code);
      groups[k] = (groups[k] || 0) + r.mv;
    });
    var arr = Object.keys(groups).map(function (k) { return [k, groups[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    if (arr.length > 9) { var rest = arr.slice(8).reduce(function (a, x) { return a + x[1]; }, 0); arr = arr.slice(0, 8).concat([['其他', rest]]); }
    var total = arr.reduce(function (a, x) { return a + x[1]; }, 0);
    var el = document.getElementById('pf-c1');
    if (el) {
      charts.c1 = new Chart(el, { type: 'doughnut', data: { labels: arr.map(function (x) { return x[0]; }), datasets: [{ data: arr.map(function (x) { return x[1]; }), backgroundColor: arr.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), borderColor: css('--pn'), borderWidth: 3, hoverOffset: 6, borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '64%', animation: { duration: 400 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return ' ' + c.label + '  $' + n0(c.parsed) + '（' + (c.parsed / total * 100).toFixed(1) + '%）'; } } } } },
        plugins: [{ id: 'center', afterDraw: function (ch) { var a = ch.chartArea, x = ch.ctx; if (!a) return; x.save(); x.textAlign = 'center'; x.fillStyle = mu; x.font = '700 11px Nunito, sans-serif'; x.fillText('總市值', (a.left + a.right) / 2, (a.top + a.bottom) / 2 - 9); x.fillStyle = css('--tx'); x.font = '600 17px Fredoka, Nunito, sans-serif'; x.fillText('$' + abbr(total), (a.left + a.right) / 2, (a.top + a.bottom) / 2 + 12); x.restore(); } }] });
      $('#pf-leg').innerHTML = arr.map(function (x, i) { return '<li><i style="background:' + PALETTE[i % PALETTE.length] + '"></i><span>' + esc(x[0]) + '</span><b>' + (x[1] / total * 100).toFixed(1) + '%</b></li>'; }).join('');
    }
    // 損益
    var pr = C.rows.filter(function (r) { return !r.noPx; }).sort(function (a, b) { return b.pnl - a.pnl; });
    var el2 = document.getElementById('pf-c2');
    if (el2 && pr.length) {
      var mob = window.innerWidth <= 600;
      el2.parentNode.style.height = Math.max(200, Math.min(520, pr.length * 34 + 60)) + 'px';
      charts.c2 = new Chart(el2, { type: 'bar',
        data: { labels: pr.map(function (r) { return r.h.name || r.h.code; }), datasets: [{ data: pr.map(function (r) { return Math.round(r.pnl); }), borderRadius: 8, borderSkipped: false, barPercentage: 0.7,
          backgroundColor: function (ctx) {
            var v = ctx.raw, ch = ctx.chart, a = ch.chartArea; if (!a) return v >= 0 ? up : dn;
            var g = ch.ctx.createLinearGradient(a.left, 0, a.right, 0);
            if (v >= 0) { g.addColorStop(0, '#FFB27A'); g.addColorStop(1, up); } else { g.addColorStop(0, dn); g.addColorStop(1, '#8FE0BD'); }
            return g;
          } }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { var r = pr[c.dataIndex]; return ' ' + smoney(r.pnl) + '（' + pct(r.ret) + '）'; } } } },
          scales: { x: { grid: { color: ln }, border: { display: false }, ticks: { color: mu, font: font, maxTicksLimit: mob ? 4 : 6, callback: function (v) { return (v < 0 ? '-' : '') + '$' + abbr(Math.abs(v)); } } },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: tx, font: font, autoSkip: false } } } } });
    }
  }
  function abbr(v) { return v >= 1e8 ? (v / 1e8).toFixed(2) + '億' : v >= 1e4 ? (v / 1e4).toFixed(v >= 1e6 ? 0 : 1) + '萬' : n0(v); }

  /* ---------------- 對話框 ---------------- */
  function dialogs() {
    return '<dialog id="pf-dlg-h"><form method="dialog" id="pf-fh"><div class="dh"><h3 id="pf-dh-t">新增持股</h3><button type="button" data-close>✕</button></div><div class="db">' +
      '<div class="fg"><div class="full"><label>市場</label><div class="chips" id="pf-fmkt"><button type="button" data-v="TW" class="on">🇹🇼 台股</button><button type="button" data-v="US">🇺🇸 美股</button></div></div>' +
      '<div><label for="pf-fcode">代號或名稱</label><input id="pf-fcode" type="text" list="pf-dl" autocomplete="off" placeholder="例如 2330、台積電、VOO" required><datalist id="pf-dl"></datalist></div>' +
      '<div><label for="pf-fname">名稱</label><input id="pf-fname" type="text" placeholder="自動帶入，可修改"></div>' +
      '<div class="full"><label>類型</label><div class="chips" id="pf-ftype">' + TYPES.map(function (t, i) { return '<button type="button" data-v="' + t + '"' + (i === 0 ? ' class="on"' : '') + '>' + t + '</button>'; }).join('') + '</div></div>' +
      '<div><label for="pf-fsh">股數</label><input id="pf-fsh" type="number" min="0" step="any" placeholder="1000" required></div>' +
      '<div><label for="pf-fcost" id="pf-fcost-l">平均成本（每股）</label><input id="pf-fcost" type="number" min="0" step="any" placeholder="580" required></div>' +
      '<div><label for="pf-fdate">首次買入日期</label><input id="pf-fdate" type="date"></div>' +
      '<div><label for="pf-fnote">備註</label><input id="pf-fnote" type="text" placeholder="選填"></div></div>' +
      '<div class="hint" id="pf-fhint"></div><div class="err" id="pf-ferr"></div></div>' +
      '<div class="df"><button type="button" class="btn btn-sec" data-close>取消</button><button type="submit" class="btn btn-pri" id="pf-fsave">儲存</button></div></form></dialog>' +

      '<dialog id="pf-dlg-i" class="wide"><div class="dh"><h3>匯入 CSV</h3><button type="button" data-close>✕</button></div><div class="db">' +
      '<label class="drop" id="pf-drop"><input type="file" id="pf-file" accept=".csv,.txt,text/csv" hidden>📄 點這裡選擇 CSV 檔，或把檔案拖曳進來<small>支援券商匯出的庫存檔（UTF-8 或 Big5）；欄位名稱會自動對應</small></label>' +
      '<div class="or">或直接貼上</div><textarea id="pf-paste" placeholder="代號,股數,平均成本&#10;2330,1000,580&#10;0050,2000,135.5&#10;VOO,3,520"></textarea>' +
      '<div class="hint">可辨識欄位：代號／名稱／股數／平均成本（或「投入成本」總額）／市場／類型／日期。沒有標題列時依序視為「代號或名稱, 股數, 平均成本」。<a href="#" id="pf-tpl">下載範本</a></div>' +
      '<div class="prev" id="pf-prev"></div></div>' +
      '<div class="df"><div class="chips" id="pf-imode" style="margin-right:auto"><button type="button" data-v="merge" class="on">合併到現有持股</button><button type="button" data-v="replace">取代全部</button></div>' +
      '<button type="button" class="btn btn-sec" data-close>取消</button><button type="button" class="btn btn-pri" id="pf-idone" disabled>匯入</button></div></dialog>' +

      '<dialog id="pf-dlg-s"><form method="dialog" id="pf-fs"><div class="dh"><h3>提醒設定</h3><button type="button" data-close>✕</button></div><div class="db"><div class="fg">' +
      '<div><label for="pf-sconc">單檔集中度上限（%）</label><input id="pf-sconc" type="number" step="1" min="1" max="100"></div>' +
      '<div><label for="pf-stp">停利線（報酬率 %）</label><input id="pf-stp" type="number" step="1"></div>' +
      '<div><label for="pf-ssl">停損線（報酬率 %）</label><input id="pf-ssl" type="number" step="1" max="0"></div>' +
      '<div class="full"><div class="hint">跌破 20 週均線的提醒會自動計算，不需設定。</div></div>' +
      '<div class="full"><button type="button" class="btn btn-sec btn-sm" id="pf-clear" style="color:var(--up)">清除所有持股資料</button></div></div></div>' +
      '<div class="df"><button type="button" class="btn btn-sec" data-close>取消</button><button type="submit" class="btn btn-pri">儲存</button></div></form></dialog>';
  }
  function open(id) { var d = $(id); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  function close(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  function chipVal(id) { var b = $(id + ' button.on'); return b ? b.dataset.v : ''; }
  function setChip(id, v) { $$(id + ' button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); }); }

  var editing = null;
  function openForm(h) {
    editing = h || null;
    $('#pf-dh-t').textContent = h ? '編輯持股' : '新增持股';
    setChip('#pf-fmkt', h ? h.market : 'TW'); setChip('#pf-ftype', h ? h.type : '長期');
    $('#pf-fcode').value = h ? h.code : ''; $('#pf-fname').value = h ? h.name || '' : '';
    $('#pf-fsh').value = h ? h.shares : ''; $('#pf-fcost').value = h ? h.cost : '';
    $('#pf-fdate').value = h ? h.date || '' : today(); $('#pf-fnote').value = h ? h.note || '' : '';
    $('#pf-ferr').textContent = ''; $('#pf-fhint').textContent = '';
    costLabel(); open('#pf-dlg-h');
    loadList().then(function (L) { $('#pf-dl').innerHTML = L.slice(0, 4000).map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + '</option>'; }).join(''); });
    setTimeout(function () { $('#pf-fcode').focus(); }, 50);
  }
  function costLabel() { $('#pf-fcost-l').textContent = '平均成本（每股' + (chipVal('#pf-fmkt') === 'US' ? '，美元' : '，台幣') + '）'; }
  function resolveCode() {
    var raw = $('#pf-fcode').value.trim(), mkt = chipVal('#pf-fmkt');
    if (!raw) return;
    var m = raw.match(/^([0-9]{4,6}[A-Z]?)\s*(.*)$/i);
    if (m && mkt === 'TW') { $('#pf-fcode').value = m[1].toUpperCase(); if (!$('#pf-fname').value) $('#pf-fname').value = m[2] || twName(m[1].toUpperCase()); }
    else if (/[一-鿿]/.test(raw)) { var c = twCodeByName(raw); if (c) { setChip('#pf-fmkt', 'TW'); $('#pf-fcode').value = c; $('#pf-fname').value = twName(c); } else $('#pf-ferr').textContent = '找不到「' + raw + '」，請改輸入代號'; }
    else { if (/^[A-Z.]{1,6}$/i.test(raw) && mkt !== 'US') setChip('#pf-fmkt', 'US'); $('#pf-fcode').value = raw.toUpperCase(); }
    var code = $('#pf-fcode').value;
    if (chipVal('#pf-fmkt') === 'TW' && /^00/.test(code)) setChip('#pf-ftype', 'ETF');
    costLabel();
    var ex = S.holdings.filter(function (x) { return x.code === code && x.market === chipVal('#pf-fmkt') && x !== editing; })[0];
    $('#pf-fhint').textContent = ex ? '已有這檔持股（' + n2(ex.shares, 0) + ' 股），儲存後會合併並重新計算平均成本。' : '';
  }
  function saveForm(ev) {
    ev.preventDefault(); resolveCode();
    var code = $('#pf-fcode').value.trim().toUpperCase(), mkt = chipVal('#pf-fmkt');
    var sh = +$('#pf-fsh').value, cost = +$('#pf-fcost').value;
    if (!code) { $('#pf-ferr').textContent = '請輸入代號'; return; }
    if (!(sh > 0)) { $('#pf-ferr').textContent = '股數需大於 0'; return; }
    if (!(cost >= 0) || $('#pf-fcost').value === '') { $('#pf-ferr').textContent = '請輸入平均成本'; return; }
    var rec = { code: code, market: mkt, name: $('#pf-fname').value.trim() || (mkt === 'TW' ? twName(code) : ''), type: chipVal('#pf-ftype') || '長期', shares: sh, cost: cost, date: $('#pf-fdate').value || '', note: $('#pf-fnote').value.trim() };
    if (editing) Object.assign(editing, rec);
    else {
      var ex = S.holdings.filter(function (x) { return x.code === code && x.market === mkt; })[0];
      if (ex) merge(ex, rec); else S.holdings.push(Object.assign({ id: uid() }, rec));
    }
    persist(); close($('#pf-dlg-h')); toast(editing ? '已更新 ' + (rec.name || code) : '已新增 ' + (rec.name || code)); refresh();
  }
  function merge(ex, rec) {
    var sh = ex.shares + rec.shares;
    ex.cost = sh ? (ex.shares * ex.cost + rec.shares * rec.cost) / sh : rec.cost;
    ex.cost = Math.round(ex.cost * 10000) / 10000;
    ex.shares = sh;
    if (rec.date && (!ex.date || rec.date < ex.date)) ex.date = rec.date;
    if (!ex.name && rec.name) ex.name = rec.name;
  }

  /* ---------------- CSV ---------------- */
  var ALIAS = {
    code: ['代號', '股票代號', '證券代號', '商品代號', '代碼', 'code', 'symbol', 'ticker', 'stock_id', 'stockid'],
    name: ['名稱', '股票名稱', '證券名稱', '商品名稱', '股名', 'name', 'stock_name'],
    shares: ['股數', '持有股數', '庫存股數', '庫存', '數量', '持股', '現股', 'shares', 'qty', 'quantity', 'units'],
    cost: ['平均成本', '均價', '成交均價', '買進均價', '持有均價', '成本均價', '每股成本', '平均價', 'avgcost', 'avg_cost', 'averagecost', 'avgprice', 'cost', '成本', 'price'],
    total: ['投入成本', '總成本', '成本總額', '付出成本', '持有成本', 'totalcost', 'cost_total', 'costbasis'],
    market: ['市場', '交易所', 'market', 'exchange'],
    type: ['類型', '分類', 'type', 'category'],
    date: ['日期', '買入日期', '首買日期', '成交日期', 'date', 'buydate']
  };
  function norm(s) { return String(s || '').replace(/^﻿/, '').replace(/[\s"'（）()]/g, '').toLowerCase(); }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (!text) return [];
    var first = text.split('\n')[0];
    var delim = [',', '\t', ';', '|'].map(function (d) { return [d, first.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    row.push(cur.trim()); rows.push(row);
    return rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  }
  function mapHeader(hdr) {
    // 先完全比對、再部分比對；總成本優先於每股成本，避免「投入成本」被當成均價
    var order = ['code', 'name', 'shares', 'total', 'cost', 'market', 'type', 'date'];
    var m = {}, used = {}, H = hdr.map(norm);
    order.forEach(function (k) {
      for (var i = 0; i < H.length; i++) if (!used[i] && ALIAS[k].some(function (a) { return H[i] === norm(a); })) { m[k] = i; used[i] = 1; return; }
    });
    order.forEach(function (k) {
      if (m[k] != null) return;
      var al = ALIAS[k].slice().sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < H.length; i++) if (!used[i] && H[i] && al.some(function (a) { return a.length > 1 && H[i].indexOf(norm(a)) >= 0; })) { m[k] = i; used[i] = 1; return; }
    });
    return m;
  }
  function toRecords(rows) {
    if (!rows.length) return [];
    var m = mapHeader(rows[0]);
    var hasHdr = (m.code != null || m.name != null) && (m.shares != null);
    var data = hasHdr ? rows.slice(1) : rows;
    if (!hasHdr) m = { code: 0, shares: 1, cost: 2, date: 3 };
    return data.map(function (r, i) {
      var g = function (k) { return m[k] != null ? r[m[k]] : undefined; };
      var codeRaw = String(g('code') || '').trim(), name = String(g('name') || '').trim();
      var code = codeRaw.replace(/\.TW[O]?$/i, '').toUpperCase(), market = '';
      var mk = String(g('market') || '').trim();
      if (mk) market = /美|us|nyse|nasdaq|amex/i.test(mk) ? 'US' : 'TW';
      if (/[一-鿿]/.test(code)) { name = name || codeRaw; code = twCodeByName(codeRaw) || ''; }
      if (!code && name) code = twCodeByName(name);
      if (!market) market = code ? inferMkt(code) : 'TW';
      if (market === 'TW' && !name) name = twName(code);
      var shares = num(g('shares')), cost = num(g('cost')), total = num(g('total'));
      if ((isNaN(cost) || m.cost == null) && !isNaN(total) && shares > 0) cost = total / shares;
      var type = String(g('type') || '').trim();
      type = /短/.test(type) ? '短期' : /etf/i.test(type) ? 'ETF' : /長/.test(type) ? '長期' : (market === 'TW' && /^00/.test(code) ? 'ETF' : '長期');
      var d = String(g('date') || '').trim().replace(/\//g, '-');
      var dm = d.match(/^(\d{2,4})-(\d{1,2})-(\d{1,2})/);
      if (dm) { var y = +dm[1]; if (y < 1911) y += 1911; d = y + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[3]).slice(-2); } else d = '';
      var err = !code ? '找不到代號' : !(shares > 0) ? '股數有誤' : !(cost >= 0) || isNaN(cost) ? '成本有誤' : '';
      return { line: i + (hasHdr ? 2 : 1), code: code, market: market, name: name, type: type, shares: shares, cost: Math.round(cost * 10000) / 10000, date: d, note: '', err: err };
    });
  }
  var pending = [];
  function preview(text) {
    loadList().then(function () {
      pending = toRecords(parseCSV(text));
      var ok = pending.filter(function (r) { return !r.err; });
      $('#pf-idone').disabled = !ok.length;
      if (!pending.length) { $('#pf-prev').innerHTML = '<div class="err">讀不到資料，請確認格式</div>'; return; }
      $('#pf-prev').innerHTML = '<table><thead><tr><th>列</th><th>代號</th><th>名稱</th><th>市場</th><th>類型</th><th>股數</th><th>平均成本</th><th>日期</th><th>狀態</th></tr></thead><tbody>' +
        pending.slice(0, 200).map(function (r) {
          return '<tr class="' + (r.err ? 'bad' : '') + '"><td>' + r.line + '</td><td>' + esc(r.code || '—') + '</td><td>' + esc(r.name || '') + '</td><td>' + (r.market === 'US' ? '美股' : '台股') + '</td><td>' + esc(r.type) + '</td><td>' + (isNaN(r.shares) ? '—' : n2(r.shares, r.shares % 1 ? 3 : 0)) + '</td><td>' + (isNaN(r.cost) ? '—' : n2(r.cost)) + '</td><td>' + esc(r.date || '—') + '</td><td>' + (r.err ? '⚠ ' + r.err : '✓') + '</td></tr>';
        }).join('') + '</tbody></table><p class="sum">可匯入 ' + ok.length + ' 筆' + (pending.length - ok.length ? '，' + (pending.length - ok.length) + ' 筆有問題會略過' : '') + '</p>';
    });
  }
  function readFile(f) {
    var r = new FileReader();
    r.onload = function () {
      var buf = r.result, txt;
      try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { try { txt = new TextDecoder('big5').decode(buf); } catch (e2) { txt = new TextDecoder().decode(buf); } }
      $('#pf-paste').value = txt; preview(txt);
    };
    r.readAsArrayBuffer(f);
  }
  function doImport() {
    var ok = pending.filter(function (r) { return !r.err; });
    if (!ok.length) return;
    if (chipVal('#pf-imode') === 'replace') {
      if (!confirm('確定要用這份 CSV 取代目前全部 ' + S.holdings.length + ' 檔持股嗎？')) return;
      S.holdings = [];
    }
    ok.forEach(function (r) {
      var rec = { code: r.code, market: r.market, name: r.name, type: r.type, shares: r.shares, cost: r.cost, date: r.date, note: '' };
      var ex = S.holdings.filter(function (x) { return x.code === r.code && x.market === r.market; })[0];
      if (ex) merge(ex, rec); else S.holdings.push(Object.assign({ id: uid() }, rec));
    });
    persist(); close($('#pf-dlg-i')); toast('已匯入 ' + ok.length + ' 筆'); refresh();
  }
  function csvOut(rows) { return '﻿' + rows.map(function (r) { return r.map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n'); }
  function download(name, text) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportCSV() {
    if (!S.holdings.length) { toast('目前沒有持股可匯出'); return; }
    var C = compute();
    var rows = [['代號', '名稱', '市場', '類型', '股數', '平均成本', '首次買入日期', '備註', '現價', '市值(台幣)', '損益(台幣)', '報酬率']].concat(C.rows.map(function (r) {
      var h = r.h; return [h.code, h.name, h.market === 'US' ? '美股' : '台股', h.type, h.shares, h.cost, h.date, h.note, r.price == null ? '' : r.price, Math.round(r.mv), r.noPx ? '' : Math.round(r.pnl), r.noPx ? '' : (r.ret * 100).toFixed(2) + '%'];
    }));
    download('持股_' + today() + '.csv', csvOut(rows)); toast('已匯出 CSV，可用來備份或在其他電腦匯入');
  }
  function template() { download('持股匯入範本.csv', csvOut([['代號', '名稱', '市場', '類型', '股數', '平均成本', '首次買入日期'], ['2330', '台積電', '台股', '長期', 1000, 580, '2024-01-15'], ['0050', '元大台灣50', '台股', 'ETF', 2000, 135.5, '2024-03-01'], ['VOO', 'Vanguard S&P 500 ETF', '美股', '長期', 3, 520, '2025-06-10']])); }
  function sample() {
    var d = function (n) { return daysAgo(n); };
    S.holdings = [
      { id: uid(), code: '2330', market: 'TW', name: '台積電', type: '長期', shares: 200, cost: 1180, date: d(420), note: '範例' },
      { id: uid(), code: '0050', market: 'TW', name: '元大台灣50', type: 'ETF', shares: 2000, cost: 98, date: d(300), note: '範例' },
      { id: uid(), code: '1476', market: 'TW', name: '儒鴻', type: '長期', shares: 500, cost: 420, date: d(200), note: '範例' },
      { id: uid(), code: '2317', market: 'TW', name: '鴻海', type: '短期', shares: 1000, cost: 210, date: d(90), note: '範例' },
      { id: uid(), code: 'VOO', market: 'US', name: 'Vanguard S&P 500 ETF', type: 'ETF', shares: 10, cost: 520, date: d(380), note: '範例' },
      { id: uid(), code: 'NVDA', market: 'US', name: 'NVIDIA', type: '短期', shares: 20, cost: 150, date: d(60), note: '範例' }
    ];
    persist(); toast('已載入範例資料，可直接編輯或刪除'); refresh();
  }

  /* ---------------- 事件 ---------------- */
  root.addEventListener('click', function (e) {
    var b = e.target.closest('button,[data-act],a#pf-tpl'); if (!b || !root.contains(b)) return;
    if (b.id === 'pf-tpl') { e.preventDefault(); template(); return; }
    if (b.hasAttribute('data-close')) { close(b.closest('dialog')); return; }
    var seg = b.parentNode;
    if (seg && seg.id === 'pf-mkt') { ui.mkt = b.dataset.v; render(); return; }
    if (seg && seg.id === 'pf-type') { ui.type = b.dataset.v; render(); return; }
    if (seg && seg.id === 'pf-alloc') { ui.alloc = b.dataset.v; render(); return; }
    if (seg && (seg.id === 'pf-fmkt' || seg.id === 'pf-ftype' || seg.id === 'pf-imode')) { setChip('#' + seg.id, b.dataset.v); if (seg.id === 'pf-fmkt') costLabel(); return; }
    if (b.tagName === 'TH' || e.target.closest('th')) return;
    var act = b.dataset.act, id = b.dataset.id;
    if (act === 'add') openForm(null);
    else if (act === 'edit') openForm(S.holdings.filter(function (h) { return h.id === id; })[0]);
    else if (act === 'del') {
      var h = S.holdings.filter(function (x) { return x.id === id; })[0];
      if (h && confirm('確定刪除 ' + (h.name || h.code) + '？')) { S.holdings = S.holdings.filter(function (x) { return x.id !== id; }); persist(); render(); }
    }
    else if (act === 'import') { pending = []; $('#pf-paste').value = ''; $('#pf-prev').innerHTML = ''; $('#pf-idone').disabled = true; setChip('#pf-imode', 'merge'); open('#pf-dlg-i'); loadList(); }
    else if (act === 'export') exportCSV();
    else if (act === 'settings') { $('#pf-sconc').value = S.settings.conc; $('#pf-stp').value = S.settings.tp; $('#pf-ssl').value = S.settings.sl; open('#pf-dlg-s'); }
    else if (act === 'sample') sample();
    else if (act === 'refresh') refresh(true);
    else if (act === 'alerts') { ui.allAlerts = !ui.allAlerts; render(); }
  });
  root.addEventListener('click', function (e) {
    var th = e.target.closest('th[data-k]'); if (!th || !th.dataset.k) return;
    var k = th.dataset.k; ui.sort = { k: k, d: ui.sort.k === k ? -ui.sort.d : (k === 'name' || k === 'type' ? 1 : -1) }; render();
  });
  root.addEventListener('input', function (e) {
    if (e.target.id === 'pf-q') { ui.q = e.target.value; ui._qFocus = true; render(); ui._qFocus = false; }
    if (e.target.id === 'pf-paste') { clearTimeout(ui._pt); ui._pt = setTimeout(function () { preview(e.target.value); }, 300); }
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'pf-fcode') resolveCode();
    if (e.target.id === 'pf-file' && e.target.files[0]) readFile(e.target.files[0]);
  });
  root.addEventListener('submit', function (e) {
    if (e.target.id === 'pf-fh') saveForm(e);
    if (e.target.id === 'pf-fs') {
      e.preventDefault();
      S.settings = { conc: +$('#pf-sconc').value || 25, tp: +$('#pf-stp').value || 20, sl: -Math.abs(+$('#pf-ssl').value || 10) };
      persist(); close($('#pf-dlg-s')); render();
    }
  });
  root.addEventListener('dragover', function (e) { var d = e.target.closest('#pf-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  root.addEventListener('dragleave', function (e) { var d = e.target.closest('#pf-drop'); if (d) d.classList.remove('over'); });
  root.addEventListener('drop', function (e) { var d = e.target.closest('#pf-drop'); if (d) { e.preventDefault(); d.classList.remove('over'); if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]); } });
  document.addEventListener('click', function (e) {
    if (e.target.id === 'pf-idone') doImport();
    if (e.target.id === 'pf-clear' && confirm('確定清除所有持股資料？此動作無法復原（建議先匯出備份）。')) { S.holdings = []; persist(); close($('#pf-dlg-s')); render(); }
  });

  document.addEventListener('tabshow', function (e) {
    ui.visible = e.detail === 'portfolio';
    if (ui.visible) { render(); refresh(); }
  });
  var lastMob = window.innerWidth <= 600;
  window.addEventListener('resize', function () { var m = window.innerWidth <= 600; if (m !== lastMob) { lastMob = m; render(); } });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
})();
