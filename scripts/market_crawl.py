"""大盤估值儀表板資料管線：台股加權指數、S&P 500、Nasdaq-100。

輸出 market/data/market.json（頁面讀取），中間快取放在 market/data/cache/。

資料來源
- 台股加權：證交所月報【大盤、各產業類股及上市股票本益比、殖利率及股價淨值比】（大盤本益比）、
  證交所 OpenAPI t187ap14_L（上市公司各產業EPS統計資訊，即 data.gov.tw 20756）、
  BWIBBU_d（個股本益比）＋ t187ap03_L（發行股數）＋ 鉅亨網 FactSet 調查（stock/data/factset.json）彙總前瞻 EPS
- S&P 500：multpl.com（本益比、TTM 盈餘，1871 起）
- Nasdaq-100：worldperatio.com（以 QQQ 計算之本益比，1990 起）
- 美股前瞻本益比：WSJ「P/Es & Yields on Major Indexes」（Birinyi Associates 預估未來 12 個月，營業盈餘），
  歷史以 Wayback Machine 每月快照回補
- 指數價格：Yahoo Finance

只用標準函式庫，另需 xlrd 讀取證交所舊版 xls。
"""
import bisect
import datetime as dt
import gzip
import html
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "market", "data", "market.json")
CACHE = os.path.join(ROOT, "market", "data", "cache")
FACTSET = os.path.join(ROOT, "stock", "data", "factset.json")
TZ = dt.timezone(dt.timedelta(hours=8))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
TODAY = dt.datetime.now(TZ).date()
LOG = []
T0 = time.time()
BUDGET = float(os.environ.get("CRAWL_BUDGET_MIN", "35")) * 60  # 回補用時間上限，未完成的下次再補


def time_left():
    return BUDGET - (time.time() - T0)


def log(*a):
    s = f"[{time.time() - T0:6.0f}s] " + " ".join(str(x) for x in a)
    print(s, flush=True)
    LOG.append(s)


def get(url, binary=False, tries=3, timeout=40):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            if b[:2] == b"\x1f\x8b":  # Wayback 原始檔可能仍是 gzip
                b = gzip.decompress(b)
            return b if binary else b.decode("utf-8", "replace")
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(2 + 3 * i)


def load(name, default):
    p = os.path.join(CACHE, name)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return default


def save(name, obj):
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def num(s):
    try:
        v = float(str(s).replace(",", "").strip())
        return v
    except (TypeError, ValueError):
        return None


def r2(x, n=2):
    return None if x is None else round(x, n)


def months_between(a, b):
    """'YYYY-MM' inclusive list."""
    y, m = map(int, a.split("-"))
    out = []
    while f"{y:04d}-{m:02d}" <= b:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


# ---------------------------------------------------------------- Yahoo 價格
def yahoo(sym, interval, rng):
    q = f"period1=0&period2={int(time.time()) + 86400}" if rng == "max" else f"range={rng}"
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?{q}&interval={interval}"
    j = json.loads(get(u))["chart"]["result"][0]
    off = j["meta"].get("gmtoffset", 0)
    ts, cl = j.get("timestamp") or [], j["indicators"]["quote"][0]["close"]
    out = []
    for t, c in zip(ts, cl):
        if c is None:
            continue
        d = dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date()
        out.append((d.isoformat(), c))
    last = j["meta"].get("regularMarketPrice")
    lt = j["meta"].get("regularMarketTime")
    if last and lt:
        d = dt.datetime.fromtimestamp(lt + off, dt.timezone.utc).date().isoformat()
        if not out or out[-1][0] < d:
            out.append((d, last))
        elif out[-1][0] == d:
            out[-1] = (d, last)
    return out


def monthly_close(daily_or_monthly):
    """取每月最後一筆收盤 → {YYYY-MM: (date, close)}"""
    m = {}
    for d, c in daily_or_monthly:
        m[d[:7]] = (d, c)
    return m


def price_on(daily, date):
    """date 當日或之前最近的收盤"""
    i = bisect.bisect_right([d for d, _ in daily], date)
    return daily[i - 1] if i else None


# ---------------------------------------------------------------- 台股：大盤本益比（證交所月報）
def twse_month_pe(ym):
    import xlrd  # 只有這裡需要

    y, m = ym.split("-")
    u = f"https://www.twse.com.tw/staticFiles/inspection/inspection/04/001/{y}{m}_C04001.zip"
    z = zipfile.ZipFile(io.BytesIO(get(u, binary=True, tries=2, timeout=25)))
    name = [n for n in z.namelist() if n.lower().endswith((".xls", ".xlsx"))][0]
    book = xlrd.open_workbook(file_contents=z.read(name), encoding_override="cp950")
    for sh in book.sheets():
        for r in range(sh.nrows):
            row = sh.row_values(r)
            for j, v in enumerate(row):
                if isinstance(v, str) and re.fullmatch(r"\s*大\s*盤\s*", v):
                    vals = [num(x) for x in row[j + 1:j + 6] if str(x).strip()]
                    vals = [x for x in vals if x is not None]
                    if vals and 3 < vals[0] < 200:
                        return vals[0]
    return None


def taiex_trailing():
    cache = load("twse_pe.json", {})
    last_month = (TODAY.replace(day=1) - dt.timedelta(days=1)).strftime("%Y-%m")
    todo = [ym for ym in months_between("2000-01", last_month)
            if ym not in cache or (cache[ym] is None and ym >= (TODAY - dt.timedelta(days=100)).strftime("%Y-%m"))]
    for i, ym in enumerate(todo):
        if time_left() < BUDGET * 0.55:
            log("台股月報回補暫停（時間預算），剩", len(todo) - i, "個月下次補")
            break
        try:
            cache[ym] = twse_month_pe(ym)
        except Exception as e:
            cache[ym] = None if ym < (TODAY - dt.timedelta(days=100)).strftime("%Y-%m") else cache.get(ym)
            log("twse pe", ym, "失敗", type(e).__name__)
        if i % 20 == 19:
            save("twse_pe.json", cache)
            log("台股月報進度", ym)
        time.sleep(0.3)
    save("twse_pe.json", cache)
    log("台股月報本益比", sum(v is not None for v in cache.values()), "個月，新抓", len(todo))
    px = monthly_close(yahoo("^TWII", "1d", "max"))
    m, pe, eps, p = [], [], [], []
    for ym in sorted(cache):
        if cache[ym] and ym in px:
            m.append(ym); pe.append(cache[ym]); p.append(px[ym][1]); eps.append(px[ym][1] / cache[ym])
    return {"m": m, "px": [r2(x) for x in p], "pe": [r2(x) for x in pe], "eps": [r2(x) for x in eps]}


# ---------------------------------------------------------------- 台股：產業 EPS（data.gov.tw 20756）
def tw_industry():
    rows = json.loads(get("https://openapi.twse.com.tw/v1/opendata/t187ap14_L"))
    if not rows:
        return None
    y, q = rows[0]["年度"], rows[0]["季別"]
    agg = {}
    for r in rows:
        ind = r["產業別"].strip()
        ni = num(r["稅後淨利"])
        e = num(r["基本每股盈餘(元)"])
        a = agg.setdefault(ind, {"ni": 0.0, "n": 0, "eps": []})
        if ni is not None:
            a["ni"] += ni
        if e is not None:
            a["eps"].append(e)
        a["n"] += 1
    out = []
    for ind, a in agg.items():
        es = sorted(a["eps"])
        med = es[len(es) // 2] if es else None
        out.append([ind, round(a["ni"] / 1e5, 1), a["n"], med])  # 稅後淨利單位千元 → 億元
    out.sort(key=lambda x: -x[1])
    period = f"{int(y) + 1911}Q{q}"
    hist = load("tw_industry.json", {})
    hist[period] = out
    save("tw_industry.json", hist)
    log("產業EPS", period, len(out), "產業")
    return {"period": period, "rows": out, "n": len(rows),
            "hist": {k: {r[0]: r[1] for r in v} for k, v in sorted(hist.items())}}


# ---------------------------------------------------------------- 台股：前瞻 EPS（FactSet 共識彙總）
def bwibbu(date):
    """回傳 {code: (close, pe)}；非交易日回傳 None"""
    u = f"https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date={date.strftime('%Y%m%d')}&selectType=ALL&response=json"
    j = json.loads(get(u, tries=2, timeout=25))
    if j.get("stat") != "OK" or not j.get("data"):
        return None
    f = j["fields"]
    ic, ip, ie = f.index("證券代號"), f.index("收盤價"), f.index("本益比")
    out = {}
    for row in j["data"]:
        c, p, e = row[ic].strip(), num(row[ip]), num(row[ie])
        if p:
            out[c] = [p, e]
    return out


def last_trading_snapshot(end, cache, lookback=8):
    d = end
    for _ in range(lookback):
        k = d.isoformat()
        if k in cache:
            return k, cache[k]
        if d.weekday() < 5:
            try:
                s = bwibbu(d)
            except Exception as e:
                log("BWIBBU", k, type(e).__name__)
                s = None
            time.sleep(2.5)
            if s:
                cache[k] = s
                return k, s
        d -= dt.timedelta(days=1)
    return None, None


def ntm_eps(survey, d):
    ys = survey.get("years") or {}
    y = d.year
    a, b = ys.get(str(y)), ys.get(str(y + 1))
    va = a and (a.get("mean") if a.get("mean") is not None else a.get("med"))
    vb = b and (b.get("mean") if b.get("mean") is not None else b.get("med"))
    if va is None or vb is None:
        return None
    f = (d.timetuple().tm_yday - 1) / 365.0
    return (1 - f) * va + f * vb


def taiex_forward(tr):
    if not os.path.exists(FACTSET):
        return None
    fs = json.load(open(FACTSET, encoding="utf-8"))
    prof = json.loads(get("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"))
    shares = {p["公司代號"].strip(): num(p.get("已發行普通股數或TDR原股發行股數")) for p in prof}
    snap = load("tw_bwibbu.json", {})
    first = min(s["date"] for v in fs.values() for s in v["surveys"])
    start = dt.date.fromisoformat(first) + dt.timedelta(days=60)  # 先累積兩個月調查再開始
    ends = []
    d = dt.date(start.year, start.month, 1)
    while d < TODAY.replace(day=1):
        nxt = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
        ends.append(nxt - dt.timedelta(days=1))
        d = nxt
    ends.append(TODAY)
    trm = dict(zip(tr["m"], tr["eps"]))
    trm_sorted = sorted(trm)
    out = {"d": [], "px": [], "fpe": [], "feps": [], "eps": [], "g": [], "cov": [], "n": []}
    px_daily = yahoo("^TWII", "1d", "5y")
    for e in ends:
        k, s = last_trading_snapshot(e, snap)
        if not s:
            continue
        day = dt.date.fromisoformat(k)
        F = T = covcap = totcap = 0.0
        n = 0
        for code, (p, pe) in s.items():
            sh = shares.get(code)
            if not sh:
                continue
            totcap += sh * p
            v = fs.get(code)
            if not v or not pe or pe <= 0:
                continue
            sv = [x for x in v["surveys"] if x["date"] <= k and (day - dt.date.fromisoformat(x["date"])).days <= 120]
            if not sv:
                continue
            f = ntm_eps(sv[-1], day)
            if f is None:
                continue
            F += sh * f
            T += sh * p / pe
            covcap += sh * p
            n += 1
        if not T or not totcap:
            continue
        cov = covcap / totcap
        # 該日大盤 TTM EPS：取該月（或之前最近月）證交所大盤本益比換算之 EPS
        ym = k[:7]
        cand = [m for m in trm_sorted if m <= ym]
        if not cand:
            continue
        eps_idx = trm[cand[-1]]
        pp = price_on(px_daily, k)
        if not pp:
            continue
        g = F / T
        feps = eps_idx * g
        out["d"].append(k); out["px"].append(r2(pp[1])); out["eps"].append(r2(eps_idx)); out["g"].append(r2(g, 4))
        out["feps"].append(r2(feps)); out["fpe"].append(r2(pp[1] / feps)); out["cov"].append(r2(cov, 3)); out["n"].append(n)
    # 只保留近 800 天的快照快取
    keep = (TODAY - dt.timedelta(days=800)).isoformat()
    save("tw_bwibbu.json", {k: v for k, v in snap.items() if k >= keep and (k in out["d"] or k >= (TODAY - dt.timedelta(days=10)).isoformat())})
    log("台股前瞻EPS", len(out["d"]), "點；最新涵蓋市值", out["cov"][-1] if out["cov"] else None)
    return out


# ---------------------------------------------------------------- S&P 500：multpl
def multpl_table(path):
    t = get(f"https://www.multpl.com/{path}/table/by-month")
    rows = re.findall(r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>", t, re.S)
    out = {}
    for a, b in rows:
        a = re.sub(r"<[^>]+>", "", a).strip()
        b = re.sub(r"<[^>]+>", " ", html.unescape(b)).replace("†", " ")
        v = num(b.split()[-1]) if b.split() else None
        try:
            d = dt.datetime.strptime(a, "%b %d, %Y").date()
        except ValueError:
            continue
        if v is None:
            continue
        ym = d.strftime("%Y-%m")
        if ym not in out or d.isoformat() > out[ym][0]:
            out[ym] = (d.isoformat(), v)
    return out


def spx_trailing():
    pe = multpl_table("s-p-500-pe-ratio")
    eps = multpl_table("s-p-500-earnings")
    daily = yahoo("^GSPC", "1d", "max")
    keys = [d for d, _ in daily]
    m, P, E, PX = [], [], [], []
    last_eps = None
    for ym in sorted(set(pe) | set(eps)):
        if ym in eps:
            last_eps = eps[ym][1]
        if ym in pe and last_eps:
            d0, v = pe[ym]
            i = bisect.bisect_right(keys, d0)
            if i and (dt.date.fromisoformat(d0) - dt.date.fromisoformat(keys[i - 1])).days <= 5:
                px = daily[i - 1][1]  # 有實際收盤價時：EPS = 價格 ÷ multpl 本益比
                e = px / v
            else:
                px, e = v * last_eps, last_eps
            m.append(ym); P.append(v); E.append(e); PX.append(px)
    log("S&P 500 multpl", len(m), "個月", m[0], "→", m[-1], "PE", P[-1], "EPS", E[-1])
    return {"m": m, "px": [r2(x) for x in PX], "pe": [r2(x) for x in P], "eps": [r2(x) for x in E],
            "asof": pe[m[-1]][0]}


# ---------------------------------------------------------------- Nasdaq-100：worldperatio
def ndx_trailing():
    w = get("https://worldperatio.com/index/nasdaq-100/")
    mm = re.search(r"detailPE_data\s*=\s*\[(.*?)\]\s*;?\s*\n", w, re.S)
    pts = re.findall(r"Date\.UTC\((\d+),\s*(\d+),\s*(\d+)\),\s*([\d.]+)", mm.group(1))
    pe = {f"{int(y):04d}-{int(m) + 1:02d}": float(v) for y, m, d, v in pts}
    px = monthly_close(yahoo("^NDX", "1d", "max"))
    m, P, E, PX = [], [], [], []
    for ym in sorted(pe):
        if ym in px:
            m.append(ym); P.append(pe[ym]); PX.append(px[ym][1]); E.append(px[ym][1] / pe[ym])
    log("Nasdaq-100 worldperatio", len(m), "個月", m[0], "→", m[-1], "PE", P[-1])
    return {"m": m, "px": [r2(x) for x in PX], "pe": [r2(x) for x in P], "eps": [r2(x) for x in E]}


# ---------------------------------------------------------------- 美股前瞻：WSJ / Birinyi
MON = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                    "September", "October", "November", "December"], 1)}


def parse_wsj(page):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", " | ", t))
    t = re.sub(r"(\s*\|\s*)+", " | ", t)
    md = re.search(r"Other Indexes \| (?:[A-Za-z]+,)?\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", t)
    if not md or md.group(1) not in MON:
        return None
    d = dt.date(int(md.group(3)), MON[md.group(1)], int(md.group(2))).isoformat()
    res = {"d": d}
    for key, pat in (("NDX", r"(?:Nasdaq 100|NASDAQ 100)(?: Index)?"), ("SPX", r"S&P 500(?: Index)?")):
        mm = re.search(pat + r" \| ([\d.,]+) \| ([\d.,]+|[^|]{0,6}) \| ([\d.,]+) \|", t)
        if mm:
            tr, fw = num(mm.group(1)), num(mm.group(3))
            if fw and 5 < fw < 80:
                res[key] = [tr, fw]
    return res if len(res) > 1 else None


def wsj_forward():
    cache = load("wsj_pe.json", {"done": [], "obs": {}})
    done = set(cache["done"])
    snaps = []
    for orig in ("wsj.com/mdc/public/page/2_3021-peyield.html", "wsj.com/market-data/stocks/peyields"):
        try:
            cdx = json.loads(get("http://web.archive.org/cdx/search/cdx?url=" + orig +
                                 "&output=json&filter=statuscode:200&collapse=timestamp:6", tries=2, timeout=60))
            snaps += [(r[1], r[2]) for r in cdx[1:]]
        except Exception as e:
            log("CDX 失敗", orig, type(e).__name__)
    newn = 0
    todo = [(ts, o) for ts, o in snaps if ts not in done]
    log("Wayback 待抓", len(todo))
    for i, (ts, orig) in enumerate(todo):
        if time_left() < BUDGET * 0.15:
            log("Wayback 回補暫停（時間預算），剩", len(todo) - i)
            break
        if i % 15 == 14:
            cache["done"] = sorted(done)
            save("wsj_pe.json", cache)
            log("Wayback 進度", ts)
        try:
            r = parse_wsj(get(f"https://web.archive.org/web/{ts}id_/{orig}", tries=2, timeout=30))
            done.add(ts)  # 抓到但解析不到也算完成；連線失敗下次重試
        except Exception as e:
            r = None
            log("wayback", ts, type(e).__name__)
        if r:
            cache["obs"][r["d"]] = {k: v for k, v in r.items() if k != "d"}
            newn += 1
        time.sleep(0.5)
    try:
        r = parse_wsj(get("https://www.wsj.com/market-data/stocks/peyields"))
        if r:
            cache["obs"][r["d"]] = {k: v for k, v in r.items() if k != "d"}
            log("WSJ 最新", r)
    except Exception as e:
        log("WSJ 即時頁失敗", type(e).__name__)
    cache["done"] = sorted(done)
    save("wsj_pe.json", cache)
    log("WSJ 前瞻本益比", len(cache["obs"]), "個觀測點，新增", newn)
    return cache["obs"]


def us_forward(obs, key, sym):
    daily = yahoo(sym, "1d", "15y")
    out = {"d": [], "px": [], "fpe": [], "feps": [], "tpe": []}
    for d in sorted(obs):
        v = obs[d].get(key)
        if not v or not v[1]:
            continue
        p = price_on(daily, d)
        if not p or (dt.date.fromisoformat(d) - dt.date.fromisoformat(p[0])).days > 7:
            continue
        out["d"].append(d); out["px"].append(r2(p[1])); out["fpe"].append(v[1]); out["feps"].append(r2(p[1] / v[1]))
        out["tpe"].append(v[0])
    last = daily[-1] if daily else None
    return out, last


# ---------------------------------------------------------------- main
def main():
    os.makedirs(CACHE, exist_ok=True)
    prev = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    res = {"updated": dt.datetime.now(TZ).strftime("%Y-%m-%d %H:%M"), "idx": {}}

    def safe(name, fn, *a):
        try:
            return fn(*a)
        except Exception as e:
            log(name, "失敗：", type(e).__name__, str(e)[:200])
            return None

    # 台股
    tr = safe("台股本益比", taiex_trailing)
    tw = {"name": "台股加權指數", "short": "台股加權", "ccy": "點"}
    if tr:
        tw["tr"] = tr
        tw["fw"] = safe("台股前瞻", taiex_forward, tr)
        tw["ind"] = safe("產業EPS", tw_industry)
        last = yahoo("^TWII", "1d", "5d")[-1]
        tw["now"] = {"d": last[0], "px": r2(last[1]), "eps": tr["eps"][-1], "pe": r2(last[1] / tr["eps"][-1])}
    res["idx"]["TAIEX"] = tw

    obs = safe("WSJ", wsj_forward) or {}
    sp = {"name": "S&P 500 指數", "short": "S&P 500", "ccy": "點"}
    t = safe("S&P 500", spx_trailing)
    if t:
        sp["tr"] = t
        fw, last = us_forward(obs, "SPX", "^GSPC")
        sp["fw"] = fw
        sp["now"] = {"d": last[0], "px": r2(last[1]), "eps": t["eps"][-1], "pe": r2(last[1] / t["eps"][-1])}
    res["idx"]["SPX"] = sp

    nd = {"name": "Nasdaq-100 指數", "short": "Nasdaq-100", "ccy": "點"}
    t = safe("Nasdaq-100", ndx_trailing)
    if t:
        nd["tr"] = t
        fw, last = us_forward(obs, "NDX", "^NDX")
        nd["fw"] = fw
        nd["now"] = {"d": last[0], "px": r2(last[1]), "eps": t["eps"][-1], "pe": r2(last[1] / t["eps"][-1])}
    res["idx"]["NDX"] = nd

    # 任何一個指數失敗就沿用上一版，避免頁面空白
    for k, v in res["idx"].items():
        if "tr" not in v and prev.get("idx", {}).get(k):
            res["idx"][k] = prev["idx"][k]
            res["idx"][k]["stale"] = True
        elif v.get("tr") and not v.get("fw") and prev.get("idx", {}).get(k, {}).get("fw"):
            v["fw"] = prev["idx"][k]["fw"]
    res["log"] = LOG[-40:]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))
    ok = [k for k, v in res["idx"].items() if v.get("tr") and not v.get("stale")]
    log("完成", ok)
    if not ok:
        sys.exit("所有指數都失敗")


if __name__ == "__main__":
    main()
