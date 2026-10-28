import urllib.request, ssl, sys
U = {
 "multpl_pe_month": "https://www.multpl.com/s-p-500-pe-ratio/table/by-month",
 "multpl_eps_month": "https://www.multpl.com/s-p-500-earnings/table/by-month",
 "spdji_eps_xlsx": "https://www.spglobal.com/spdji/en/documents/additional-material/sp-500-eps-est.xlsx",
 "factset_ei": "https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_102426.pdf",
 "factset_ei2": "https://advantage.factset.com/hubfs/Website/Resources%20Section/Research%20Desk/Earnings%20Insight/EarningsInsight_101726.pdf",
 "twse_open_eps": "https://openapi.twse.com.tw/v1/opendata/t187ap14_L",
 "twse_bwibbu_d": "https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20261027&selectType=ALL&response=json",
 "twse_stat_list": "https://www.twse.com.tw/zh/statistics/statisticsList?type=04&subType=220",
 "twse_mi_index": "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=20261027&type=MS&response=json",
 "yahoo_ndx": "https://query1.finance.yahoo.com/v8/finance/chart/%5ENDX?range=1y&interval=1mo",
 "yahoo_twii": "https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?range=max&interval=1mo",
 "siblis_indices": "https://siblisresearch.com/api/v1/indices",
 "siblis_ndx_fwd": "https://siblisresearch.com/api/v1/NDX/pe-forward",
 "siblis_ndx_tr": "https://siblisresearch.com/api/v1/NDX/pe-trailing",
 "siblis_spx_fwd": "https://siblisresearch.com/api/v1/SPX/pe-forward",
 "gurufocus_ndx": "https://www.gurufocus.com/economic_indicators/6778/nasdaq-100-pe-ratio",
 "worldpe_ndx": "https://worldperatio.com/index/nasdaq-100/",
 "wsj_pe": "https://www.wsj.com/market-data/stocks/peyields",
 "stooq_ndx": "https://stooq.com/q/d/l/?s=%5Endx&i=m",
 "cnyes_tw_fwd": "https://ess.api.cnyes.com/ess/api/v1/news/keyword?q=%E5%8F%B0%E8%82%A1%20EPS%20%E9%A0%90%E4%BC%B0&limit=5",
}
for k, u in U.items():
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}), timeout=30)
        b = r.read()
        print(f"OK  {k} {r.status} {len(b)} {r.headers.get('content-type')} ACAO={r.headers.get('access-control-allow-origin')}")
        print("    ", b[:300].decode('utf-8', 'replace').replace('\n', ' ')[:300])
    except Exception as e:
        print(f"ERR {k} {e}")
