# PoE1 Gem Hover

Firefox extension. On any maxroll.gg Path of Exile 1 page (build guides and the PoB planner), hover a skill gem name to see a pinned bottom-left panel with:

- the earliest vendor you can **buy** it from (act + vendor + classes), and when **all classes** can buy it;
- whether a quest grants it **free**, which quest/act, and to which classes.

## Data source

Gem acquisition data is scraped from **poewiki.net** (the maintained, complete PoE wiki) and baked into `data/gems.json`. poewiki is behind Cloudflare, so it can't be fetched at runtime by the extension — the scraper drives a real (headless) Firefox that passes the challenge, then queries poewiki's cargo API. The extension ships the resulting snapshot; there is no runtime network call.

(Fandom's wiki *is* fetchable but is incomplete — it was missing gems like Energy Blade — so it is not used.)

## Load unpacked (manual)

Firefox → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`.
After loading, reload the maxroll tab. A gold badge appears bottom-left when active.

## Regenerate bundled data

Requires Python + `selenium` and Firefox installed.

```
python tools/fetch-poewiki.py     # scrapes poewiki -> tools/.cache/*.json
node tools/gen-gems.cjs           # transforms cache -> data/gems.json
```

## Run tests

```
node test/transform.test.cjs && node test/format.test.cjs
```
