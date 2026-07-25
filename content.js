// DOM finding (verified live via Selenium on multiple maxroll guides):
// maxroll marks every item reference as `<span class="poe-item" data-poe-text="Name">`.
// maxroll is a React SPA that REPLACES gem nodes on hover, so per-element listeners
// get lost. We use event delegation on `document` (capture phase) instead.
// The panel is PINNED to a fixed screen corner (not cursor-following): maxroll shows
// its own big native tooltip at the cursor, so competing there hides ours. A fixed,
// high-contrast corner panel is always visible and never overlaps maxroll's tooltip.
// Match on maxroll's data-poe-text (fallback textContent); the gem-name gate excludes
// uniques/bases, which also use .poe-item.
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

const VERSION = '1.4.0';

// maxroll renders gems two ways: inline prose as `.poe-item[data-poe-text]`, and
// the skills-widget entries as `div[class*="SkillEntry"]` (CSS-module hashed).
const GEM_SEL = '.poe-item, [class*="SkillEntry"]';

function gemNameOf(el) {
  if (el.dataset && el.dataset.poeText) return el.dataset.poeText;
  const nameEl = el.matches && el.matches('[class*="SkillEntry__name"]')
    ? el
    : (el.querySelector && el.querySelector('[class*="SkillEntry__name"]'));
  return ((nameEl || el).textContent || '').trim();
}

(async () => {
  const gems = await loadGems();
  const tip = makeTooltipEl();
  let hideTimer;
  let currentName = null;
  console.log(`[PoE1 Gem Hover] v${VERSION} active — ${Object.keys(gems).length} gems loaded`);

  function lookup(rawName) {
    const name = (rawName || '').trim();
    const key = ALIASES[name] || name;
    return gems[key] ? { key, entry: gems[key] } : null;
  }

  function render(lines, dim) {
    tip.textContent = '';
    tip.classList.toggle('poe1-gh-idle', !!dim);
    lines.forEach((line, i) => {
      const div = document.createElement('div');
      div.textContent = line;
      if (i === 0) div.className = 'poe1-gh-name';
      tip.appendChild(div);
    });
    tip.hidden = false; // panel is always visible (also a load indicator)
  }

  // Idle state doubles as a "the extension is running" badge.
  function idle() {
    currentName = null;
    render([`◆ PoE1 Gem Hover v${VERSION}`, `${Object.keys(gems).length} gems — hover a skill gem`], true);
  }

  function show(key, entry) {
    clearTimeout(hideTimer);
    currentName = key;
    render(GemFormat.formatTooltip(key, entry), false);
  }

  idle();

  // TEMP DIAGNOSTIC (one round): confirm the SkillEntry match in the live page.
  const dbg = document.createElement('div');
  dbg.id = 'poe1-gh-debug';
  dbg.textContent = 'dbg: (hover a gem)';
  document.body.appendChild(dbg);
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest(GEM_SEL);
    const nm = el ? gemNameOf(el) : '';
    const gem = el ? (lookup(nm) ? `KNOWN:${nm}` : `unknown:${nm}`) : 'no';
    dbg.textContent = `dbg: ${e.target.tagName}.${(e.target.className || '').toString().slice(0, 22)} | match:${el ? 'yes' : 'no'} | gem:${gem}`;
  }, true);

  // Delegated (capture phase) so it survives React re-renders and can't be
  // blocked by maxroll's own stopPropagation on the element.
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest(GEM_SEL);
    if (!el) return;
    const hit = lookup(gemNameOf(el));
    if (hit) show(hit.key, hit.entry);
  }, true);

  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest(GEM_SEL);
    if (!el) return;
    const hit = lookup(gemNameOf(el));
    if (hit && hit.key === currentName) hideTimer = setTimeout(idle, 200);
  }, true);
})();
