# PoE1 Gem Hover — Firefox Extension Design

**Date:** 2026-07-26
**Status:** Approved design, pre-implementation

## Purpose

A Firefox extension that, when hovering a skill gem on a **maxroll.gg PoE1 build-guide page**, shows a tooltip with:

- Whether a **quest gives the gem for free**, which quest/act, and to **which classes**.
- The **earliest point the gem can be purchased** from a vendor (act + vendor), and the note for when all classes can buy it.

Path of Exile 1 only. Both active skill gems and support gems are covered ("skill gem" in PoE terminology includes supports).

## Success criteria

- Hovering a recognized gem on a maxroll build-guide page shows the tooltip within a few hundred ms.
- Data stays correct across PoE updates/new leagues **without shipping a new extension version** — it refreshes from a live source.
- Unrecognized text never shows a (wrong) tooltip.
- Works on first install and offline (falls back to bundled data).

## Non-goals (explicitly skipped)

- PoE2 support.
- Chrome/Edge build (Firefox only for now).
- Settings/options UI.
- Coverage of the maxroll PoEPlanner tool or arbitrary non-guide pages (build-guide pages only).
- In-game overlay (browser only).

## Architecture

Three data layers, in priority order — **live → cache → bundled snapshot** — so it self-heals and always shows something.

```
PoE Wiki cargo API  ──fetch (weekly TTL)──►  browser.storage.local cache  ──►  content script tooltip
        │                                            ▲
        └── (on fetch failure) ──────────────────────┘
                                                     │
  bundled gems.json (snapshot) ──(if cache empty)────┘
```

### Components

**1. `data/gems.json` (bundled snapshot)**
A point-in-time export of the gem acquisition data, shipped in the extension. Guarantees the extension works on first install and when the wiki is unreachable. Regenerated occasionally at build time, but never the primary source.

**2. `background.js` (MV3 service worker)**
- On install and on an alarm (~weekly), fetches gem acquisition data from the PoE Wiki cargo API.
- MV3 `host_permissions` for the wiki domain lets the background worker fetch cross-origin without CORS issues.
- Writes result + timestamp to `browser.storage.local`.
- On fetch failure: keeps the existing cache; if no cache exists, the content script uses the bundled snapshot.

**3. `content.js` (content script, runs on maxroll build-guide pages)**
- Loads the gem data (from `storage.local`, else bundled `gems.json`).
- Scans the page for gem references and reads each gem's **name** (exact source attribute verified against a live page during implementation — expected to be an icon `alt`/`title` or adjacent label text).
- Attaches hover handlers; on hover, looks the name up and renders a tooltip element positioned near the cursor.
- Handles maxroll's SPA navigation (re-scan on DOM mutations via a `MutationObserver`).
- Unknown name → no tooltip.

**4. `tooltip.css` (or inline styles)**
Minimal styling for the tooltip; dark theme to match maxroll.

## Data model

Per gem (keyed by gem name):

```json
"Fireball": {
  "free": { "act": 1, "quest": "Enemy at the Gate", "classes": ["Witch","Shadow","Templar","Scion"] },
  "buy":  { "act": 1, "vendor": "Nessa", "classes": ["Witch","Shadow","Templar","Scion"] },
  "allBy": { "act": 3, "vendor": "Siosa" }
}
```

- `free` — omitted if no class gets the gem as a free quest reward.
- `buy` — earliest vendor purchase: the soonest act/vendor any class can buy it, with the class list that can buy at that point.
- `allBy` — the point every class can buy it (Siosa in Act 3 for Act 1–3 gems; Lilly Roth in Act 6 for the rest). Omitted if `buy.classes` is already all classes.

## Tooltip content (approved format)

```
Fireball
Free: Act 1 'Enemy at the Gate' (Witch, Shadow, Templar, Scion)
Earliest buy: Act 1, Nessa
All classes by Act 3 (Siosa)
```

- Line 1: gem name.
- `Free:` line omitted when no free quest reward.
- `Earliest buy:` always present.
- `All classes by ...` omitted when all classes can already buy at the earliest point.

## Data source detail

PoE Wiki cargo API (`https://www.poewiki.net/w/api.php` with `action=cargoquery`, JSON). The wiki tracks, per gem, the quest reward offers (quest, act, classes) and vendor reward offers (vendor, act, classes). New/changed gems appear on the wiki, so a live query keeps the extension current automatically.

**Exact cargo table/field names are confirmed during implementation** — the wiki's schema is the detail to verify. The generator script for `data/gems.json` and the runtime fetch in `background.js` share the same query and transform logic.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| maxroll DOM/attribute for gem names differs from expectation | Verify against a live build-guide page before writing the matcher; add an alias map if maxroll names ≠ wiki names (e.g. Vaal/Awakened/alt-quality variants). |
| Wiki renames cargo tables / changes schema | Live fetch fails gracefully → falls back to last-good cache, then bundled snapshot (stale but functional). |
| maxroll changes its markup later | Content-script scan isolated to one small module; re-verify and patch selectors. Silent no-op if it breaks (no wrong data shown). |
| Name collisions (a gem name appears as ordinary prose) | Only attach to elements identified as gem references, not arbitrary text nodes. |

## Testing

- **Data transform:** a small self-check (`assert`-based) that the wiki-response → `gems.json` transform produces the expected shape for a few known gems (Fireball has `free`, a support gem, a gem with no free reward).
- **Name matching:** unit check that lookup handles known names, unknown names (no tooltip), and any alias mappings.
- **Manual:** load the unpacked extension in Firefox, open a real build-guide page, confirm tooltips appear on gems and not on prose.

## File layout

```
poe1-gem-hover/
  manifest.json          # MV3, Firefox
  background.js          # weekly fetch + cache
  content.js             # scan + hover tooltip
  tooltip.css
  data/gems.json         # bundled snapshot fallback
  tools/gen-gems.mjs     # one-off generator (shares transform with background.js)
  docs/2026-07-26-poe1-gem-hover-design.md
```
