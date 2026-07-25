const fs = require('node:fs');
const path = require('node:path');
const { fetchCargo } = require('./fetch-cargo.cjs');
const { buildGems } = require('../transform.js');

const CACHE = path.join(__dirname, '.cache');
const fromCache = process.argv.includes('--from-cache');

const TABLES = {
  skill_gems: '_pageName=gem',
  quest_rewards: '_pageName=gem,act,quest,classes',
  vendor_rewards: '_pageName=gem,act,npc,classes',
};

async function getTable(table, fields) {
  const cacheFile = path.join(CACHE, `${table}.json`);
  if (fromCache) return JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  const rows = await fetchCargo(table, fields);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(rows));
  return rows;
}

(async () => {
  const skillGems = await getTable('skill_gems', TABLES.skill_gems);
  const questRows = await getTable('quest_rewards', TABLES.quest_rewards);
  const vendorRows = await getTable('vendor_rewards', TABLES.vendor_rewards);

  const gems = buildGems(skillGems.map((r) => r.gem), questRows, vendorRows);
  const count = Object.keys(gems).length;
  if (count < 100) throw new Error(`Only ${count} gems produced — source likely broken, refusing to write.`);

  const outPath = path.join(__dirname, '..', 'data', 'gems.json');
  fs.writeFileSync(outPath, JSON.stringify(gems, null, 0));
  const withSrc = Object.values(gems).filter((e) => e.free || e.buy).length;
  console.log(`Wrote ${count} gems (${withSrc} with a listed source) to ${outPath}`);
})();
