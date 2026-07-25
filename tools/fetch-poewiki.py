"""Scrape complete gem acquisition data from poewiki.net into tools/.cache/*.json.

poewiki.net is the maintained, complete PoE wiki, but it's behind Cloudflare, so
plain HTTP fetches get a JS challenge. A real browser passes the challenge, so we
drive headless Firefox (Selenium) and run the cargo queries via fetch() from inside
a poewiki tab (same-origin, with the cf_clearance cookie the browser earned).

Output matches the cache format tools/gen-gems.cjs expects (array of row objects),
so after this run:  node tools/gen-gems.cjs --from-cache

Usage: python tools/fetch-poewiki.py
"""
import html, json, os, time
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

CACHE = os.path.join(os.path.dirname(__file__), ".cache")
TABLES = {
    "skill_gems": "_pageName=gem",
    "quest_rewards": "_pageName=gem,act,quest,classes",
    "vendor_rewards": "_pageName=gem,act,npc,classes",
}
PAGE = 500

PAGE_JS = r"""
const done = arguments[arguments.length-1];
const [table, fields, limit, offset] = arguments;
const u = `/w/api.php?action=cargoquery&format=json&tables=${table}`+
          `&fields=${encodeURIComponent(fields)}&limit=${limit}&offset=${offset}`;
fetch(u, {headers:{'Accept':'application/json'}})
  .then(r => r.headers.get('content-type','').includes('json') ? r.json()
            : r.text().then(t => ({__nonjson:true, status:r.status})))
  .then(j => done(j))
  .catch(e => done({__error:String(e)}));
"""

def fetch_all(driver, table, fields):
    rows, offset = [], 0
    while True:
        j = driver.execute_async_script(PAGE_JS, table, fields, PAGE, offset)
        if j.get("__error") or j.get("__nonjson"):
            raise RuntimeError(f"{table} @ {offset}: {j}")
        if "error" in j:
            raise RuntimeError(f"{table} @ {offset}: {j['error'].get('info')}")
        # poewiki HTML-encodes some values (e.g. apostrophes in quest names) — decode.
        batch = [{k: (html.unescape(v) if isinstance(v, str) else v) for k, v in x["title"].items()}
                 for x in j.get("cargoquery", [])]
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
        time.sleep(1.0)
    return rows

def main():
    os.makedirs(CACHE, exist_ok=True)
    opts = Options()
    opts.add_argument("-headless")
    d = webdriver.Firefox(options=opts)
    try:
        d.set_page_load_timeout(90)
        d.set_script_timeout(90)
        d.get("https://www.poewiki.net/wiki/Path_of_Exile_Wiki")  # solve Cloudflare
        time.sleep(8)
        if "wiki" not in (d.title or "").lower():
            raise RuntimeError(f"poewiki not reachable (title={d.title!r}) — Cloudflare not passed")
        for table, fields in TABLES.items():
            rows = fetch_all(d, table, fields)
            with open(os.path.join(CACHE, f"{table}.json"), "w", encoding="utf-8") as f:
                json.dump(rows, f)
            print(f"{table}: {len(rows)} rows")
    finally:
        d.quit()

if __name__ == "__main__":
    main()
