import urllib.request, os, json
os.makedirs("probe_out", exist_ok=True)
U = json.load(open("scripts/probe_urls.json"))
log = []
for k, u in U.items():
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}), timeout=40)
        b = r.read(); open("probe_out/" + k, "wb").write(b); log.append(f"OK {k} {len(b)}")
    except Exception as e:
        log.append(f"ERR {k} {e}")
open("probe_out/_log.txt", "w").write("\n".join(log))
