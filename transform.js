// Shared by browser background (globalThis) and Node tooling (module.exports).
(function (root) {
  const parseClasses = (s) => (s && s.trim() ? s.split(',').map((c) => c.trim()) : []);
  const byActAsc = (a, b) => Number(a.act) - Number(b.act);

  function buildGems(skillGemNames, questRows, vendorRows) {
    const isGem = new Set(skillGemNames);
    // Seed an entry for every skill gem so gems with no listed source are still
    // recognized (hover shows "drop-only") and the name set is complete for matching.
    const out = {};
    for (const name of skillGemNames) out[name] = {};

    // free: earliest-act quest reward, gems only
    const questByGem = {};
    for (const r of questRows) {
      if (!isGem.has(r.gem)) continue;
      (questByGem[r.gem] || (questByGem[r.gem] = [])).push(r);
    }
    for (const [gem, rows] of Object.entries(questByGem)) {
      const r = rows.slice().sort(byActAsc)[0];
      out[gem].free = { act: Number(r.act), quest: r.quest, classes: parseClasses(r.classes) };
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
      out[gem].buy = { act: Number(earliest.act), vendor: earliest.npc, classes: buyClasses };
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
