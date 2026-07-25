// Auto-update: pull the latest gem data from GitHub (kept fresh by a daily local
// scrape of poewiki that pushes here). CORS-open, always reachable. Falls back to
// the bundled snapshot if the fetch fails.
const RAW_URL = 'https://raw.githubusercontent.com/NadavVazana789/poe1-gem-hover/master/data/gems.json';
const REFRESH_MIN = 360; // every 6 hours

async function refresh() {
  try {
    const res = await fetch(RAW_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const gems = await res.json();
    if (!gems || Object.keys(gems).length < 100) throw new Error('too few gems');
    await browser.storage.local.set({ gems, gemsFetchedAt: Date.now() });
    console.log(`[PoE1 Gem Hover] data refreshed — ${Object.keys(gems).length} gems`);
  } catch (e) {
    console.warn('[PoE1 Gem Hover] refresh failed, using cache/bundle:', e.message);
  }
}

browser.runtime.onInstalled.addListener(() => {
  browser.alarms.create('refresh', { periodInMinutes: REFRESH_MIN });
  refresh();
});
browser.runtime.onStartup.addListener(refresh);
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'refresh') refresh(); });
