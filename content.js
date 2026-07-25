// DOM finding (verified live via Selenium on multiple maxroll guides):
// maxroll marks every item reference as `<span class="poe-item" data-poe-text="Name">`.
// maxroll is a React SPA that REPLACES gem nodes on hover, so per-element listeners
// get lost. We use event delegation on `document` instead: check whatever is under
// the cursor at event time. Match on maxroll's data-poe-text (fallback textContent);
// the gem-name gate excludes uniques/bases, which also use .poe-item.
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

function gemNameOf(el) {
  return (el.dataset && el.dataset.poeText) || el.textContent.trim();
}

(async () => {
  const gems = await loadGems();
  const tip = makeTooltipEl();
  let hideTimer;
  let currentName = null;
  console.log(`[PoE1 Gem Hover] active — ${Object.keys(gems).length} gems loaded`);

  function lookup(rawName) {
    const name = (rawName || '').trim();
    const key = ALIASES[name] || name;
    return gems[key] ? { key, entry: gems[key] } : null;
  }

  function fill(key, entry) {
    tip.textContent = '';
    for (const line of GemFormat.formatTooltip(key, entry)) {
      const div = document.createElement('div');
      div.textContent = line;
      tip.appendChild(div);
    }
    tip.hidden = false;
  }

  // position near the cursor (fixed), clamped to the viewport
  function move(x, y) {
    const w = tip.offsetWidth || 240;
    const h = tip.offsetHeight || 60;
    let left = x + 14;
    let top = y + 16;
    if (left + w > window.innerWidth) left = x - w - 14;
    if (top + h > window.innerHeight) top = y - h - 16;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${Math.max(0, top)}px`;
  }

  function hide() { tip.hidden = true; currentName = null; }

  // Delegated: survives React re-renders because it inspects the live cursor target.
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.poe-item');
    if (!el) return;
    const hit = lookup(gemNameOf(el));
    if (!hit) return;
    clearTimeout(hideTimer);
    currentName = hit.key;
    fill(hit.key, hit.entry);
    move(e.clientX, e.clientY);
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!tip.hidden) move(e.clientX, e.clientY);
  }, true);

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('.poe-item');
    if (el && lookup(gemNameOf(el)) && lookup(gemNameOf(el)).key === currentName) {
      hideTimer = setTimeout(hide, 120);
    }
  }, true);
})();
