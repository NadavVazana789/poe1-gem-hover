# PoE1 Gem Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Firefox extension that shows a hover tooltip on skill gems in maxroll.gg PoE1 build guides, giving the earliest vendor purchase (act + vendor + classes) and the free quest reward (quest + act + classes), if any.

**Architecture:** A shared transform turns three Fandom cargo tables (`skill_gems`, `quest_rewards`, `vendor_rewards`) into a `{gemName: {free?, buy, allBy?}}` map. A Node generator bakes a snapshot into `data/gems.json`. The background page re-fetches weekly and caches to `storage.local`; the content script reads cache-or-snapshot and attaches hover tooltips on a build-guide page. Data flow is live → cache → bundled snapshot.

**Tech Stack:** WebExtension Manifest V3 (Firefox), plain JavaScript, no dependencies, no build step. Node (built-in `assert`, `node:test` not required) for the generator and tests.

## Global Constraints

- **Firefox MV3 only.** Background is `"background": { "scripts": [...] }` (Firefox event page), NOT a Chrome `service_worker`. No Chrome build.
- **No runtime dependencies. No bundler.** Plain `.js` loaded directly by the manifest.
- **Cross-environment code sharing via plain scripts.** Shared logic files assign to `globalThis` for the browser AND `module.exports` for Node (`if (typeof module !== 'undefined') module.exports = ...`). Node tooling uses `require()` (CommonJS). This avoids ESM/service-worker module uncertainty in Firefox MV3.
- **Only source is Fandom:** `https://pathofexile.fandom.com/api.php`. It is CORS-open (`Access-Control-Allow-Origin: *`) and reachable with a normal browser User-Agent. **Do NOT use poewiki.net** — it is Cloudflare/Anubis-walled and returns an HTML challenge to background fetches.
- **Respect Fandom's rate limit.** Fetch each whole table via paging (`limit=500` + `offset`), never per-gem. Space paged requests ~1s apart. The background refresh runs at most weekly.
- **Content script scope:** `https://maxroll.gg/poe/build-guides/*` only.
- **Gem name = Fandom page name** (`_pageName`). Support gems include the `" Support"` suffix (e.g. `"Added Cold Damage Support"`), matching how maxroll writes them.

---

## Data contracts

**Cargo query shape** (all three tables), JSON from Fandom:
```
GET https://pathofexile.fandom.com/api.php?action=cargoquery&format=json
    &tables=<table>&fields=<...>&limit=500&offset=<n>
→ { "cargoquery": [ { "title": { <field>: <string>, ... } }, ... ] }
```
All values are strings. `classes` is a comma-joined list; empty string `""` means **all classes**.

**Fields used per table:**
- `skill_gems`: `_pageName=gem` → the authoritative set of gem names.
- `quest_rewards`: `_pageName=gem, act, quest, classes`
- `vendor_rewards`: `_pageName=gem, act, npc, classes`

**`data/gems.json` entry shape** (produced by the transform):
```json
{
  "Arc": {
    "free": { "act": 1, "quest": "The Siren's Cadence", "classes": ["Witch"] },
    "buy":  { "act": 1, "vendor": "Nessa", "classes": ["Witch"] },
    "allBy": { "act": 3, "vendor": "Siosa" }
  },
  "Fireball": {
    "buy":  { "act": 1, "vendor": "Nessa", "classes": ["Marauder","Scion","Shadow","Templar","Witch"] },
    "allBy": { "act": 3, "vendor": "Siosa" }
  }
}
```
- `free` — omitted when the gem has no `quest_rewards` row. When multiple rows exist, use the one with the smallest `act`.
- `buy` — the `vendor_rewards` row with the smallest `act`. `classes: []` (empty) means all classes.
- `allBy` — the smallest-`act` `vendor_rewards` row whose `classes` is empty (all classes). Omitted when `buy` already covers all classes (i.e. `buy.classes` is empty).

---

## Task 1: Project scaffold + manifest

**Files:**
- Create: `manifest.json`
- Create: `README.md` (one paragraph: what it is, how to load unpacked in Firefox)

**Interfaces:**
- Produces: a loadable (no-op) Firefox extension.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "PoE1 Gem Hover",
  "version": "1.0.0",
  "description": "Hover a skill gem on a maxroll.gg PoE1 build guide to see the earliest vendor purchase and free quest reward, by class.",
  "browser_specific_settings": { "gecko": { "id": "poe1-gem-hover@local" } },
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://pathofexile.fandom.com/*"],
  "background": { "scripts": ["transform.js", "background.js"] },
  "content_scripts": [
    {
      "matches": ["https://maxroll.gg/poe/build-guides/*"],
      "js": ["format.js", "content.js"],
      "css": ["tooltip.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    { "resources": ["data/gems.json"], "matches": ["https://maxroll.gg/*"] }
  ]
}
```

- [ ] **Step 2: Write `README.md`** — one paragraph plus: "Load unpacked: Firefox → `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `manifest.json`."

- [ ] **Step 3: Verify it loads** — In Firefox `about:debugging`, load the temporary add-on. Expected: loads with no manifest errors (background/content files can be empty stubs for now; create empty `transform.js`, `background.js`, `format.js`, `content.js`, `tooltip.css`, and `data/gems.json` containing `{}` so the manifest resolves).

- [ ] **Step 4: Commit**
```bash
git add manifest.json README.md transform.js background.js format.js content.js tooltip.css data/gems.json
git commit -m "scaffold: MV3 Firefox extension manifest and stubs"
```

---

## Task 2: Shared transform + test

**Files:**
- Create/replace: `transform.js`
- Create: `test/transform.test.cjs`

**Interfaces:**
- Produces: `globalThis.GemTransform.buildGems(skillGemNames, questRows, vendorRows)` → `{gemName: entry}` (also `module.exports`).
  - `skillGemNames`: `string[]` of gem page names.
  - `questRows`: `[{gem, act, quest, classes}]` (raw strings, `act` numeric-string, `classes` comma-joined).
  - `vendorRows`: `[{gem, act, npc, classes}]`.
  - Returns entries per the `data/gems.json` contract above. Only gems present in `skillGemNames` appear.

- [ ] **Step 1: Write the failing test** — `test/transform.test.cjs`

```js
const assert = require('node:assert');
const { buildGems } = require('../transform.js');

const skillGems = ['Arc', 'Fireball', 'Added Cold Damage Support'];
const questRows = [
  { gem: 'Arc', act: '1', quest: "The Siren's Cadence", classes: 'Witch' },
  { gem: 'Added Cold Damage Support', act: '1', quest: 'The Caged Brute', classes: 'Ranger,Shadow,Scion' },
  { gem: 'Agate Amulet', act: '6', quest: "Bestel's Epic", classes: '' }, // non-gem: must be dropped
];
const vendorRows = [
  { gem: 'Fireball', act: '1', npc: 'Nessa', classes: 'Marauder,Scion,Shadow,Templar,Witch' },
  { gem: 'Fireball', act: '3', npc: 'Siosa', classes: '' },
  { gem: 'Fireball', act: '6', npc: 'Lilly Roth', classes: '' },
  { gem: 'Arc', act: '1', npc: 'Nessa', classes: 'Witch' },
  { gem: 'Arc', act: '3', npc: 'Siosa', classes: '' },
];

const gems = buildGems(skillGems, questRows, vendorRows);

// non-gem quest reward dropped
assert.ok(!('Agate Amulet' in gems), 'Agate Amulet must be filtered out');

// Fireball: no free, buy from Nessa act1 (specific classes), allBy Siosa act3
assert.strictEqual(gems.Fireball.free, undefined);
assert.deepStrictEqual(gems.Fireball.buy, { act: 1, vendor: 'Nessa', classes: ['Marauder','Scion','Shadow','Templar','Witch'] });
assert.deepStrictEqual(gems.Fireball.allBy, { act: 3, vendor: 'Siosa' });

// Arc: free from quest for Witch; buy Nessa act1
assert.deepStrictEqual(gems.Arc.free, { act: 1, quest: "The Siren's Cadence", classes: ['Witch'] });
assert.deepStrictEqual(gems.Arc.buy, { act: 1, vendor: 'Nessa', classes: ['Witch'] });
assert.deepStrictEqual(gems.Arc.allBy, { act: 3, vendor: 'Siosa' });

// Added Cold Damage Support: free reward, but no vendor rows → buy undefined
assert.deepStrictEqual(gems['Added Cold Damage Support'].free, { act: 1, quest: 'The Caged Brute', classes: ['Ranger','Shadow','Scion'] });
assert.strictEqual(gems['Added Cold Damage Support'].buy, undefined);

console.log('transform.test OK');
```

- [ ] **Step 2: Run it, verify it fails**
Run: `node test/transform.test.cjs`
Expected: FAIL — `Cannot find module '../transform.js'` export / `buildGems is not a function`.

- [ ] **Step 3: Implement `transform.js`**

```js
// Shared by browser background (globalThis) and Node tooling (module.exports).
(function (root) {
  const parseClasses = (s) => (s && s.trim() ? s.split(',').map((c) => c.trim()) : []);
  const byActAsc = (a, b) => Number(a.act) - Number(b.act);

  function buildGems(skillGemNames, questRows, vendorRows) {
    const isGem = new Set(skillGemNames);
    const out = {};
    const ensure = (name) => (out[name] || (out[name] = {}));

    // free: earliest-act quest reward, gems only
    const questByGem = {};
    for (const r of questRows) {
      if (!isGem.has(r.gem)) continue;
      (questByGem[r.gem] || (questByGem[r.gem] = [])).push(r);
    }
    for (const [gem, rows] of Object.entries(questByGem)) {
      const r = rows.slice().sort(byActAsc)[0];
      ensure(gem).free = { act: Number(r.act), quest: r.quest, classes: parseClasses(r.classes) };
    }

    // buy + allBy from vendor rows, gems only
    const vendorByGem = {};
    for (const r of vendorRows) {
      if (!isGem.has(r.gem)) continue;
      (vendorByGem[r.gem] || (vendorByGem[r.gem] = [])).push(r);
    }
    for (const [gem, rows] of Object.entries(vendorByGem)) {
      const sorted = rows.slice().sort(byActAsc);
      const earliest = sorted[0];
      const buyClasses = parseClasses(earliest.classes);
      ensure(gem).buy = { act: Number(earliest.act), vendor: earliest.npc, classes: buyClasses };
      if (buyClasses.length > 0) {
        const all = sorted.find((r) => !r.classes || !r.classes.trim());
        if (all) out[gem].allBy = { act: Number(all.act), vendor: all.npc };
      }
    }
    return out;
  }

  const api = { buildGems, parseClasses };
  root.GemTransform = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test, verify pass**
Run: `node test/transform.test.cjs`
Expected: `transform.test OK`

- [ ] **Step 5: Commit**
```bash
git add transform.js test/transform.test.cjs
git commit -m "feat: shared gem-acquisition transform with tests"
```

---

## Task 3: Data generator + bundled snapshot

**Files:**
- Create: `tools/fetch-cargo.cjs` (shared fetch/paging helper)
- Create: `tools/gen-gems.cjs`
- Modify: `data/gems.json` (replace `{}` with generated data)

**Interfaces:**
- Consumes: `GemTransform.buildGems` from `transform.js`.
- Produces: `fetchCargo(table, fields)` → `Promise<Array<Record<string,string>>>` (all rows, paged). Used again in Task 4 conceptually (background reimplements with `fetch`, this one uses Node 18+ global `fetch`).

- [ ] **Step 1: Write `tools/fetch-cargo.cjs`**

```js
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0';
const API = 'https://pathofexile.fandom.com/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch every row of a cargo table, paged. fields e.g. "_pageName=gem,act,npc,classes"
async function fetchCargo(table, fields, { pageSize = 500, delayMs = 1200 } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${API}?action=cargoquery&format=json&tables=${table}` +
      `&fields=${encodeURIComponent(fields)}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const json = await res.json();
    if (json.error) throw new Error(`${table}: ${json.error.info}`);
    const batch = (json.cargoquery || []).map((x) => x.title);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    await sleep(delayMs); // respect rate limit
  }
  return rows;
}

module.exports = { fetchCargo };
```

- [ ] **Step 2: Write `tools/gen-gems.cjs`**

```js
const fs = require('node:fs');
const path = require('node:path');
const { fetchCargo } = require('./fetch-cargo.cjs');
const { buildGems } = require('../transform.js');

(async () => {
  const skillGems = await fetchCargo('skill_gems', '_pageName=gem');
  const questRows = await fetchCargo('quest_rewards', '_pageName=gem,act,quest,classes');
  const vendorRows = await fetchCargo('vendor_rewards', '_pageName=gem,act,npc,classes');

  const gems = buildGems(skillGems.map((r) => r.gem), questRows, vendorRows);
  const count = Object.keys(gems).length;
  if (count < 100) throw new Error(`Only ${count} gems produced — source likely broken, refusing to write.`);

  const outPath = path.join(__dirname, '..', 'data', 'gems.json');
  fs.writeFileSync(outPath, JSON.stringify(gems, null, 0));
  console.log(`Wrote ${count} gems to ${outPath}`);
})();
```

- [ ] **Step 3: Generate the snapshot**
Run: `node tools/gen-gems.cjs`
Expected: `Wrote <N> gems ...` with N in the hundreds (~250+). If rate-limited, wait ~2 min and rerun.

- [ ] **Step 4: Sanity-check output**
Run: `node -e "const g=require('./data/gems.json'); console.log(g.Fireball); console.log(g.Arc)"`
Expected: Fireball has `buy` Nessa act 1 + `allBy` Siosa act 3, no `free`; Arc has `free` (Witch, The Siren's Cadence) + `buy` Nessa.

- [ ] **Step 5: Commit**
```bash
git add tools/fetch-cargo.cjs tools/gen-gems.cjs data/gems.json
git commit -m "feat: cargo generator and bundled gems.json snapshot"
```

---

## Task 4: Background refresh + cache

**Files:**
- Create/replace: `background.js`

**Interfaces:**
- Consumes: `globalThis.GemTransform.buildGems` (loaded via manifest before `background.js`).
- Produces: `storage.local` key `gems` = `{gemName: entry}` and `gemsFetchedAt` = epoch ms. Content script reads `gems`.

- [ ] **Step 1: Implement `background.js`**

```js
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0';
const API = 'https://pathofexile.fandom.com/api.php';
const WEEK_MIN = 7 * 24 * 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCargo(table, fields, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${API}?action=cargoquery&format=json&tables=${table}` +
      `&fields=${encodeURIComponent(fields)}&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const json = await res.json();
    if (json.error) throw new Error(`${table}: ${json.error.info}`);
    const batch = (json.cargoquery || []).map((x) => x.title);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    await sleep(1200);
  }
  return rows;
}

async function refresh() {
  try {
    const skillGems = await fetchCargo('skill_gems', '_pageName=gem');
    const questRows = await fetchCargo('quest_rewards', '_pageName=gem,act,quest,classes');
    const vendorRows = await fetchCargo('vendor_rewards', '_pageName=gem,act,npc,classes');
    const gems = GemTransform.buildGems(skillGems.map((r) => r.gem), questRows, vendorRows);
    if (Object.keys(gems).length < 100) throw new Error('too few gems, keeping previous cache');
    await browser.storage.local.set({ gems, gemsFetchedAt: Date.now() });
  } catch (e) {
    console.warn('[PoE1 Gem Hover] refresh failed, keeping cache/snapshot:', e.message);
  }
}

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create('refresh', { periodInMinutes: WEEK_MIN });
  refresh();
});
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'refresh') refresh(); });
```

- [ ] **Step 2: Load in Firefox and verify cache populates**
Reload the temporary add-on. In `about:debugging` → Inspect the background page → console:
Run: `await browser.storage.local.get('gems').then(o => Object.keys(o.gems||{}).length)`
Expected: a number in the hundreds within ~10s. If 0/undefined, check console for the refresh warning.

- [ ] **Step 3: Commit**
```bash
git add background.js
git commit -m "feat: weekly background refresh into storage.local with snapshot fallback"
```

---

## Task 5: Tooltip formatting + test

**Files:**
- Create/replace: `format.js`
- Create: `test/format.test.cjs`

**Interfaces:**
- Produces: `globalThis.GemFormat.formatTooltip(gemName, entry)` → `string[]` (tooltip lines). Also `module.exports`.

- [ ] **Step 1: Write the failing test** — `test/format.test.cjs`

```js
const assert = require('node:assert');
const { formatTooltip } = require('../format.js');

const arc = {
  free: { act: 1, quest: "The Siren's Cadence", classes: ['Witch'] },
  buy:  { act: 1, vendor: 'Nessa', classes: ['Witch'] },
  allBy: { act: 3, vendor: 'Siosa' },
};
assert.deepStrictEqual(formatTooltip('Arc', arc), [
  'Arc',
  "Free: Act 1 'The Siren's Cadence' (Witch)",
  'Earliest buy: Act 1, Nessa',
  'All classes by Act 3 (Siosa)',
]);

const fireball = {
  buy: { act: 1, vendor: 'Nessa', classes: ['Marauder','Scion','Shadow','Templar','Witch'] },
  allBy: { act: 3, vendor: 'Siosa' },
};
assert.deepStrictEqual(formatTooltip('Fireball', fireball), [
  'Fireball',
  'Earliest buy: Act 1, Nessa',
  'All classes by Act 3 (Siosa)',
]);

// buy already all classes → no "All classes by" line
const allBuy = { buy: { act: 6, vendor: 'Lilly Roth', classes: [] } };
assert.deepStrictEqual(formatTooltip('X', allBuy), ['X', 'Earliest buy: Act 6, Lilly Roth (all classes)']);

// free but no vendor
const freeOnly = { free: { act: 1, quest: 'The Caged Brute', classes: ['Ranger','Shadow','Scion'] } };
assert.deepStrictEqual(formatTooltip('Added Cold Damage Support', freeOnly), [
  'Added Cold Damage Support',
  "Free: Act 1 'The Caged Brute' (Ranger, Shadow, Scion)",
]);

console.log('format.test OK');
```

- [ ] **Step 2: Run it, verify it fails**
Run: `node test/format.test.cjs`
Expected: FAIL — cannot find `formatTooltip`.

- [ ] **Step 3: Implement `format.js`**

```js
(function (root) {
  const cls = (arr) => (arr && arr.length ? arr.join(', ') : 'all classes');

  function formatTooltip(name, entry) {
    const lines = [name];
    if (entry.free) {
      lines.push(`Free: Act ${entry.free.act} '${entry.free.quest}' (${cls(entry.free.classes)})`);
    }
    if (entry.buy) {
      const who = entry.buy.classes.length ? '' : ' (all classes)';
      lines.push(`Earliest buy: Act ${entry.buy.act}, ${entry.buy.vendor}${who}`);
    }
    if (entry.allBy) {
      lines.push(`All classes by Act ${entry.allBy.act} (${entry.allBy.vendor})`);
    }
    return lines;
  }

  const api = { formatTooltip };
  root.GemFormat = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 4: Run test, verify pass**
Run: `node test/format.test.cjs`
Expected: `format.test OK`

- [ ] **Step 5: Commit**
```bash
git add format.js test/format.test.cjs
git commit -m "feat: tooltip line formatting with tests"
```

---

## Task 6: Content script — detect gems + hover tooltip

**Files:**
- Create/replace: `content.js`
- Create/replace: `tooltip.css`

**Interfaces:**
- Consumes: `globalThis.GemFormat.formatTooltip` (loaded before `content.js`); `data/gems.json` via `web_accessible_resources`; `storage.local.gems`.

- [ ] **Step 1: LIVE DOM INSPECTION (do this before writing the matcher).**
Open a real build guide in Firefox, e.g. `https://maxroll.gg/poe/build-guides/cold-dot-elementalist/skill-gems-passive-tree`. Open devtools, inspect a gem name (e.g. "Vortex", "Cruelty Support"). Record:
  - Is the gem name inside a distinct element (a link `<a href>`, a `<span>`/`<strong>` with a class, or a component with a `data-*`/`title`/`alt`)? **Prefer matching those elements** — reliable, no prose false-positives.
  - If gems are truly bare text in prose, note that; the fallback below matches exact-text nodes.
Write the finding as a comment at the top of `content.js` and choose `SELECTOR` accordingly.

- [ ] **Step 2: Implement `content.js`**

```js
// DOM finding (Step 1): <describe here>. SELECTOR chosen accordingly.
// Gems on maxroll build guides are written by their exact name; we match against
// the known gem-name set from data. Alias map covers name mismatches found in testing.
const ALIASES = {
  // 'maxroll name': 'wiki page name'   // fill in as mismatches are found
};

async function loadGems() {
  const cached = await browser.storage.local.get('gems');
  if (cached.gems && Object.keys(cached.gems).length) return cached.gems;
  const url = browser.runtime.getURL('data/gems.json');
  return (await fetch(url)).json();
}

function makeTooltipEl() {
  const el = document.createElement('div');
  el.id = 'poe1-gem-hover-tip';
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function lookup(gems, rawName) {
  const name = rawName.trim();
  const key = ALIASES[name] || name;
  return gems[key] ? { key, entry: gems[key] } : null;
}

(async () => {
  const gems = await loadGems();
  const tip = makeTooltipEl();
  let hideTimer;

  // Candidate elements. If Step 1 found a specific selector, use it; else fall back
  // to leaf elements whose exact text is a known gem name.
  const SELECTOR = 'a, span, strong, b, li'; // refine per Step 1 finding
  const names = new Set(Object.keys(gems));

  function attach() {
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.dataset.poeGemBound) continue;
      const text = el.textContent.trim();
      if (!text || (!names.has(text) && !ALIASES[text])) continue;
      // only bind leaf-ish elements to avoid wrapping whole paragraphs
      if (el.children.length > 0) continue;
      el.dataset.poeGemBound = '1';
      el.addEventListener('mouseenter', (e) => {
        const hit = lookup(gems, text);
        if (!hit) return;
        clearTimeout(hideTimer);
        tip.textContent = '';
        for (const line of GemFormat.formatTooltip(hit.key, hit.entry)) {
          const div = document.createElement('div');
          div.textContent = line;
          tip.appendChild(div);
        }
        tip.hidden = false;
        const r = el.getBoundingClientRect();
        tip.style.left = `${window.scrollX + r.left}px`;
        tip.style.top = `${window.scrollY + r.bottom + 4}px`;
      });
      el.addEventListener('mouseleave', () => {
        hideTimer = setTimeout(() => { tip.hidden = true; }, 100);
      });
    }
  }

  attach();
  // maxroll is a SPA; re-scan on DOM changes (debounced).
  let pending;
  new MutationObserver(() => {
    clearTimeout(pending);
    pending = setTimeout(attach, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
```

- [ ] **Step 3: Write `tooltip.css`**

```css
#poe1-gem-hover-tip {
  position: absolute;
  z-index: 2147483647;
  max-width: 320px;
  padding: 6px 9px;
  background: #14171c;
  color: #e6e6e6;
  border: 1px solid #3a3f47;
  border-radius: 4px;
  font: 12px/1.35 system-ui, sans-serif;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
#poe1-gem-hover-tip > div:first-child { font-weight: 600; margin-bottom: 2px; }
```

- [ ] **Step 4: Manual verify on a live page**
Reload the add-on, open the build guide, hover a gem name. Expected: tooltip appears with the formatted lines; no tooltip on ordinary prose words. If a gem shows no tooltip, check its exact text vs the `data/gems.json` key and add an `ALIASES` entry. If prose words false-trigger, tighten `SELECTOR` per the Step 1 finding.

- [ ] **Step 5: Commit**
```bash
git add content.js tooltip.css
git commit -m "feat: content script gem detection and hover tooltip"
```

---

## Task 7: Full manual acceptance

- [ ] **Step 1: Run all tests**
Run: `node test/transform.test.cjs && node test/format.test.cjs`
Expected: both print `... OK`.

- [ ] **Step 2: End-to-end check in Firefox** — Load add-on fresh, open 2 different build guides (one caster, one attack/support-heavy). Confirm: active-skill gems and support gems both show correct tooltips; `free`/`allBy` lines appear/omit correctly; SPA navigation between guide subpages still shows tooltips (MutationObserver working).

- [ ] **Step 3: Offline/fallback check** — In `about:debugging`, block network or set `storage.local` empty and reload the page; confirm tooltips still work from bundled `data/gems.json`.

- [ ] **Step 4: Final commit / tag**
```bash
git add -A && git commit -m "chore: manual acceptance pass" || echo "nothing to commit"
```

---

## Self-review notes (addressed)

- **Spec coverage:** live→cache→snapshot (Tasks 3/4/6 loadGems), build-guide scope (manifest matches), tooltip format (Task 5 matches approved format), classes/quest/vendor data (Task 2 transform), auto-update on new gems (Task 4 weekly refresh from Fandom).
- **Known limitation (documented, not a gap):** "always works with new gems" depends on Fandom being edited for a new league and staying reachable. If Fandom lags or breaks, the extension falls back to last-good cache then bundled snapshot (functional, possibly stale). poewiki.net is not usable from a background fetch (anti-bot). A second source is a future add-on, out of scope.
- **Discovery step:** Task 6 Step 1 (live DOM) is a genuine build-time finding, not a placeholder — the exact maxroll selector can only be read from the running SPA.
- **Type consistency:** `GemTransform.buildGems`, `GemFormat.formatTooltip`, `data/gems.json` entry shape, and `storage.local.gems` are consistent across Tasks 2–6.
