// Transforms the scraped cargo tables in tools/.cache/*.json into data/gems.json.
// Populate the cache first with:  python tools/fetch-poewiki.py
const fs = require('node:fs');
const path = require('node:path');
const { buildGems } = require('../transform.js');

const CACHE = path.join(__dirname, '.cache');

function readTable(name) {
  const p = path.join(CACHE, `${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`Missing ${p} — run: python tools/fetch-poewiki.py`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

const skillGems = readTable('skill_gems');
const questRows = readTable('quest_rewards');
const vendorRows = readTable('vendor_rewards');

const gems = buildGems(skillGems.map((r) => r.gem), questRows, vendorRows);
const count = Object.keys(gems).length;
if (count < 100) throw new Error(`Only ${count} gems produced — source likely broken, refusing to write.`);

const outPath = path.join(__dirname, '..', 'data', 'gems.json');
fs.writeFileSync(outPath, JSON.stringify(gems, null, 0));
const withSrc = Object.values(gems).filter((e) => e.free || e.buy).length;
console.log(`Wrote ${count} gems (${withSrc} with a listed source) to ${outPath}`);
