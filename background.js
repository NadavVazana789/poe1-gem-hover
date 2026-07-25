const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0';
const API = 'https://pathofexile.fandom.com/api.php';
const WEEK_MIN = 7 * 24 * 60;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url, retries = 6, backoffMs = 30000) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const json = await res.json();
    if (!json.error) return json;
    if (json.error.code === 'ratelimited' && attempt < retries) {
      await sleep(backoffMs);
      continue;
    }
    throw new Error(json.error.info);
  }
}

async function fetchCargo(table, fields, pageSize = 500) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${API}?action=cargoquery&format=json&tables=${table}` +
      `&fields=${encodeURIComponent(fields)}&limit=${pageSize}&offset=${offset}`;
    const json = await fetchPage(url);
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
    console.log(`[PoE1 Gem Hover] cached ${Object.keys(gems).length} gems`);
  } catch (e) {
    console.warn('[PoE1 Gem Hover] refresh failed, keeping cache/snapshot:', e.message);
  }
}

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create('refresh', { periodInMinutes: WEEK_MIN });
  refresh();
});
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'refresh') refresh(); });
