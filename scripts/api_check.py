import json, urllib.request
U = "https://script.google.com/macros/s/AKfycbz3Ox6VqsW2QaYGYp9_XujgQ5-FWQ1eK_y_CtNu8f1CCAWREzR2tA5VNQgWJ4HRux7_/exec"
def go(body=None):
    req = urllib.request.Request(U, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "text/plain;charset=utf-8", "Origin": "https://peterchiqng.github.io"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read().decode("utf-8", "replace")
            return {"status": r.status, "final": r.geturl()[:60], "acao": r.headers.get("Access-Control-Allow-Origin"), "body": t[:300]}
    except Exception as e:
        return {"error": repr(e)[:300]}
out = {"get": go(), "ping": go({"action": "ping"}), "wrong_pw": go({"action": "login", "password": "definitely-wrong"}), "bad_token": go({"action": "get", "token": "abc.def"})}
open("api_check.json", "w").write(json.dumps(out, ensure_ascii=False, indent=1))
