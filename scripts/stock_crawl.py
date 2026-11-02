"""個股分析備援資料：每天從 FinMind 抓取 stock/tickers.json 內個股的資料，存成 stock/data/<代號>.json。

網頁會先讀這些檔案（同網站、不受跨網域與每小時查詢上限影響），找不到才改用 FinMind 即時查詢。
另產生 stock/data/index.json（全部上市櫃股票代號與名稱），讓搜尋建議不必連 FinMind。
只用 Python 標準函式庫。
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "stock", "data")
TICKERS = os.path.join(ROOT, "stock", "tickers.json")
API = "https://api.finmindtrade.com/api/v4/data"
TOKEN = os.environ.get("FINMIND_TOKEN", "")
TZ = dt.timezone(dt.timedelta(hours=8))
TODAY = dt.datetime.now(TZ).date()


def fm(dataset, **p):
    p["dataset"] = dataset
    if TOKEN:
        p["token"] = TOKEN
    url = API + "?" + urllib.parse.urlencode(p)
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "stock-dashboard"}), timeout=60) as r:
                j = json.load(r)
            if j.get("status") != 200:
                raise RuntimeError(j.get("msg"))
            return j.get("data") or []
        except Exception as e:
            if i == 2:
                raise
            time.sleep(5 + 10 * i)


def years_ago(n):
    try:
        return TODAY.replace(year=TODAY.year - n).isoformat()
    except ValueError:
        return (TODAY - dt.timedelta(days=365 * n)).isoformat()


def one(sid):
    px = fm("TaiwanStockPrice", data_id=sid, start_date=years_ago(10))
    if not px:
        raise RuntimeError("沒有股價資料")
    time.sleep(1)
    try:
        per = fm("TaiwanStockPER", data_id=sid, start_date=(TODAY - dt.timedelta(days=40)).isoformat())
    except Exception:
        per = []
    time.sleep(1)
    try:
        fin = fm("TaiwanStockFinancialStatements", data_id=sid, start_date=years_ago(12))
    except Exception:
        fin = []
    time.sleep(1)
    try:
        rev = fm("TaiwanStockMonthRevenue", data_id=sid, start_date=years_ago(11))
    except Exception:
        rev = []
    return {
        "id": sid,
        "updated": dt.datetime.now(TZ).strftime("%Y-%m-%d %H:%M"),
        "price": [{"date": r["date"], "close": r["close"]} for r in px if r.get("close")],
        "per": [{"date": r["date"], "PER": r.get("PER"), "PBR": r.get("PBR"), "dividend_yield": r.get("dividend_yield")} for r in per],
        "fin": [{"date": r["date"], "type": r["type"], "value": r["value"]} for r in fin],
        "rev": [{"date": r["date"], "revenue": r["revenue"], "revenue_year": r["revenue_year"], "revenue_month": r["revenue_month"]} for r in rev],
    }


def main():
    os.makedirs(DATA, exist_ok=True)
    tickers = json.load(open(TICKERS, encoding="utf-8"))
    ok, bad = [], []
    for sid in tickers:
        sid = str(sid).strip().upper()
        try:
            d = one(sid)
            with open(os.path.join(DATA, sid + ".json"), "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
            ok.append(sid)
            print(sid, "ok", len(d["price"]), len(d["fin"]), len(d["rev"]), flush=True)
        except Exception as e:
            bad.append(sid)
            print(sid, "失敗", e, flush=True)
        time.sleep(1.5)
    try:
        info = fm("TaiwanStockInfo")
        seen, lst = set(), []
        for r in info:
            i, n = r.get("stock_id"), r.get("stock_name")
            if i and n and i not in seen and len(i) <= 6 and r.get("industry_category") not in ("Index", "大盤"):
                seen.add(i)
                lst.append({"id": i, "name": n})
        if len(lst) > 1000:
            with open(os.path.join(DATA, "index.json"), "w", encoding="utf-8") as f:
                json.dump(lst, f, ensure_ascii=False, separators=(",", ":"))
            print("index.json", len(lst))
    except Exception as e:
        print("股票清單失敗", e)
    print("完成", len(ok), "檔；失敗", bad)
    if not ok:
        sys.exit("全部失敗")


if __name__ == "__main__":
    main()
