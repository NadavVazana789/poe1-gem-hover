const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/128.0';
const API = 'https://pathofexile.fandom.com/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One cargo page, retrying on Fandom's ratelimited error with backoff.
async function fetchPage(url, { retries = 6, backoffMs = 30000 } = {}) {
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

// Fetch every row of a cargo table, paged. fields e.g. "_pageName=gem,act,npc,classes"
async function fetchCargo(table, fields, { pageSize = 500, delayMs = 1200 } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${API}?action=cargoquery&format=json&tables=${table}` +
      `&fields=${encodeURIComponent(fields)}&limit=${pageSize}&offset=${offset}`;
    const json = await fetchPage(url).catch((e) => { throw new Error(`${table}: ${e.message}`); });
    const batch = (json.cargoquery || []).map((x) => x.title);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    await sleep(delayMs); // respect rate limit
  }
  return rows;
}

module.exports = { fetchCargo };
