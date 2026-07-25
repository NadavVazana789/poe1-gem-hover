# PoE1 Gem Hover

Firefox extension. On a maxroll.gg Path of Exile 1 build guide, hover a skill gem name to see a tooltip with:

- the earliest vendor you can **buy** it from (act + vendor + classes), and when **all classes** can buy it;
- whether a quest grants it **free**, which quest/act, and to which classes.

Gem acquisition data comes from the PoE Fandom wiki cargo API, cached weekly, with a bundled `data/gems.json` snapshot as offline fallback.

## Load unpacked (manual)

Firefox → `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick `manifest.json`.

## Regenerate bundled data

```
node tools/gen-gems.cjs
```

## Run tests

```
node test/transform.test.cjs && node test/format.test.cjs
```
