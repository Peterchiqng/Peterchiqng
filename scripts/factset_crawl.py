"""收集鉅亨網「Factset 最新調查」快訊，整理成個股儀表板使用的 stock/data/factset.json。

用法：
  python scripts/factset_crawl.py --days 10      # 只抓最近 10 天（每日排程）
  python scripts/factset_crawl.py --days 730     # 回補兩年歷史

只用 Python 標準函式庫。資料來源為鉅亨網公開 API，數據僅供參考。
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

API = "https://api.cnyes.com/media/api/v1/newslist/category/tw_forecast"
OUT = os.path.join(os.path.dirname(__file__), "..", "stock", "data", "factset.json")
TZ = dt.timezone(dt.timedelta(hours=8))
UA = "Mozilla/5.0 (compatible; stock-dashboard-factset/1.0)"

# 首次建立檔案時保留先前手動整理的資料（approx = 依發布時間推算的日期）
SEED = {
    "1476": {"name": "儒鴻", "priceRef": {"close": 324, "date": "2026-10-15"},
             "surveys": [
                 {"date": "2026-03-23", "n": 18, "tp": 486.5, "years": {"2026": {"hi": 26, "lo": 21.72, "mean": 23.98, "med": 23.99}, "2027": {"hi": 29.1, "lo": 24.72, "mean": 27.04, "med": 27.32}, "2028": {"hi": 32.68, "lo": 26.43, "mean": 30.26, "med": 30.96}}},
                 {"date": "2026-05-20", "approx": True, "n": 17, "tp": 450, "years": {"2026": {"hi": 27.8, "lo": 22.41, "mean": 24.63, "med": 24.43}, "2027": {"hi": 30.7, "lo": 24.42, "mean": 27.24, "med": 27.32}, "2028": {"hi": 34.05, "lo": 26.43, "mean": 30.56, "med": 30.9}}},
                 {"date": "2026-06-24", "approx": True, "n": 17, "tp": 450, "years": {"2026": {"hi": 27.8, "lo": 23.06, "mean": 24.81, "med": 24.44}, "2027": {"hi": 30.7, "lo": 24.42, "mean": 27.27, "med": None}, "2028": {"hi": 34.05, "lo": 26.43, "mean": 30.6, "med": None}}},
                 {"date": "2026-09-05", "approx": True, "n": 17, "tp": 425, "years": {"2026": {"hi": 25.55, "lo": 23.23, "mean": 24.58, "med": 24.47}, "2027": {"hi": 28.4, "lo": 24.72, "mean": 26.72, "med": 26.58}, "2028": {"hi": 32.35, "lo": 26.43, "mean": 29.88, "med": 30.56}}},
             ],
             "tp": [{"date": "2026-08-07", "approx": True, "med": 429, "hi": 601, "lo": 352},
                    {"date": "2026-09-28", "med": 407.5, "hi": 547, "lo": 333},
                    {"date": "2026-10-15", "med": 403.5, "hi": 547, "lo": 333}],
             "rating": {"date": "2026-10-15", "n": 15, "bull": 12, "neutral": 3, "bear": 0}},
    "1477": {"name": "聚陽", "priceRef": {"close": 195, "date": "2026-09-07"},
             "surveys": [
                 {"date": "2026-04-27", "approx": True, "n": 16, "tp": 320, "years": {"2026": {"hi": 17.64, "lo": 15.14, "mean": 16.29, "med": 16.36}, "2027": {"hi": 20.21, "lo": 16.31, "mean": 17.99, "med": 18.11}, "2028": {"hi": 20.84, "lo": 17.31, "mean": 19.28, "med": 19.7}}},
                 {"date": "2026-05-03", "approx": True, "n": 15, "tp": 315, "years": {"2026": {"hi": 17.64, "lo": 15.14, "mean": 16.27, "med": 16.2}, "2027": {"hi": 20.21, "lo": 16.31, "mean": 17.98, "med": None}, "2028": {"hi": 20.84, "lo": 17.31, "mean": None, "med": None}}},
                 {"date": "2026-08-12", "n": 14, "tp": 271, "years": {"2026": {"hi": 17.27, "lo": 15, "mean": 15.75, "med": 15.68}, "2027": {"hi": 19.41, "lo": 15.79, "mean": 17.21, "med": 17.05}, "2028": {"hi": 22.37, "lo": 17.25, "mean": 19.19, "med": 19.4}}},
                 {"date": "2026-09-05", "approx": True, "n": 15, "tp": 270.5, "years": {"2026": {"hi": 17.27, "lo": 15, "mean": 15.72, "med": 15.77}, "2027": {"hi": 19.41, "lo": 15.79, "mean": 17.25, "med": 17.08}, "2028": {"hi": 22.37, "lo": 17.25, "mean": 19.19, "med": 19.4}}},
             ],
             "tp": [{"date": "2026-09-08", "approx": True, "med": 255, "hi": 380, "lo": 206}],
             "rating": {"date": "2026-09-08", "n": 14, "bull": 9, "neutral": 3, "bear": 2}},
}

NUM = r"(-?[\d,]+(?:\.\d+)?)"


def num(s):
    if s is None:
        return None
    s = s.replace(",", "").strip()
    try:
        v = float(s)
    except ValueError:
        return None
    return int(v) if v.is_integer() else v


def get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # 網路暫時錯誤就重試
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)


def fetch_window(start, end):
    page, out = 1, []
    while True:
        j = get({"limit": 30, "page": page, "startAt": int(start.timestamp()), "endAt": int(end.timestamp())})
        items = j.get("items", {})
        out.extend(items.get("data") or [])
        if page >= (items.get("last_page") or 1):
            return out
        page += 1
        time.sleep(0.4)


def clean(content):
    t = html.unescape(content or "")
    return html.unescape(t)  # 內容是兩層跳脫的 HTML


def text_of(cell):
    return re.sub(r"<[^>]+>", "", cell).strip()


def parse_eps_table(h):
    m = re.search(r"市場預估EPS.*?<table>(.*?)</table>", h, re.S)
    if not m:
        return {}
    rows = [[text_of(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)] for r in re.findall(r"<tr>(.*?)</tr>", m.group(1), re.S)]
    if not rows:
        return {}
    years = [re.search(r"(\d{4})", c).group(1) if re.search(r"(\d{4})", c) else None for c in rows[0][1:]]
    key = {"最高值": "hi", "最低值": "lo", "平均值": "mean", "中位數": "med"}
    res = {y: {"hi": None, "lo": None, "mean": None, "med": None} for y in years if y}
    for r in rows[1:]:
        k = key.get(r[0])
        if not k:
            continue
        for y, c in zip(years, r[1:]):
            if y:
                res[y][k] = num(c.split("(")[0])
    return res


def parse(item):
    title = item.get("title") or ""
    h = clean(item.get("content"))
    body = re.sub(r"<[^>]+>", "", h)
    m = re.search(r"對(.+?)\((\d{4,6}[A-Z]?)-TW\)", body) or re.search(r"：(.+?)\((\d{4,6}[A-Z]?)-TW\)", title)
    if not m:
        return None
    name, code = m.group(1).strip(), m.group(2)
    date = dt.datetime.fromtimestamp(item["publishAt"], TZ).strftime("%Y-%m-%d")
    nm = re.search(r"共(\d+)位分析師", body)
    n = int(nm.group(1)) if nm else None
    rec = {"code": code, "name": name, "date": date, "n": n}
    if "EPS預估" in body or "EPS預估" in title:
        years = parse_eps_table(h)
        if not years:
            return None
        tp = re.search(r"預估目標價為" + NUM + "元", body)
        rec.update(kind="eps", years=years, tp=num(tp.group(1)) if tp else None)
        return rec
    if "目標價估值" in body:
        med = re.search(r"中位數(?:由" + NUM + r"元(?:上修|下修))?(?:至|為)" + NUM + "元", body)
        hi = re.search(r"最高估值" + NUM + "元", body)
        lo = re.search(r"最低估值" + NUM + "元", body)
        rt = re.search(r"積極樂觀(\d+)位.*?保持中立(\d+)位.*?保守悲觀(\d+)位", body)
        px = re.search(r"收盤價為" + NUM + "元", body)
        rec.update(kind="tp", med=num(med.group(2)) if med else None, hi=num(hi.group(1)) if hi else None,
                   lo=num(lo.group(1)) if lo else None,
                   rating={"n": n, "bull": int(rt.group(1)), "neutral": int(rt.group(2)), "bear": int(rt.group(3))} if rt else None,
                   close=num(px.group(1)) if px else None)
        return rec if rec["med"] is not None else None
    return None


def merge(db, rec):
    s = db.setdefault(rec["code"], {"name": rec["name"], "surveys": [], "tp": []})
    s["name"] = rec["name"] or s.get("name")
    if rec["kind"] == "eps":
        sv = [x for x in s["surveys"] if x["date"] != rec["date"]]
        sv.append({"date": rec["date"], "n": rec["n"], "tp": rec.get("tp"), "years": rec["years"]})
        s["surveys"] = sorted(sv, key=lambda x: x["date"])
    else:
        tp = [x for x in s["tp"] if x["date"] != rec["date"]]
        tp.append({"date": rec["date"], "med": rec["med"], "hi": rec["hi"], "lo": rec["lo"]})
        s["tp"] = sorted(tp, key=lambda x: x["date"])
        if rec.get("rating") and (not s.get("rating") or s["rating"]["date"] <= rec["date"]):
            s["rating"] = dict(rec["rating"], date=rec["date"])
        if rec.get("close") is not None and (not s.get("priceRef") or s["priceRef"]["date"] <= rec["date"]):
            s["priceRef"] = {"close": rec["close"], "date": rec["date"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=10)
    a = ap.parse_args()
    db = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else json.loads(json.dumps(SEED))
    end = dt.datetime.now(TZ)
    start = end - dt.timedelta(days=a.days)
    seen = parsed = 0
    cur = start
    while cur < end:
        nxt = min(cur + dt.timedelta(days=15), end)
        for item in fetch_window(cur, nxt):
            seen += 1
            rec = parse(item)
            if rec:
                merge(db, rec)
                parsed += 1
        cur = nxt
        time.sleep(0.4)
    # 只保留有 EPS 調查的個股（頁面需要 surveys 才能畫圖）
    db = {k: v for k, v in sorted(db.items()) if v.get("surveys")}
    for v in db.values():
        v.setdefault("tp", [])
        if not v.get("priceRef"):
            v["priceRef"] = {"close": None, "date": None}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, separators=(",", ":"))
    print(f"articles={seen} parsed={parsed} stocks={len(db)}")
    if seen and not parsed:
        sys.exit("沒有解析到任何資料，可能是快訊格式改變")


if __name__ == "__main__":
    main()
