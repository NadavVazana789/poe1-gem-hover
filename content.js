// DOM finding (verified live via Selenium against a maxroll build guide):
// maxroll marks every item reference as `<span class="poe-item">Name</span>`.
// We bind those whose exact text is a known gem name (the name gate excludes
// uniques/bases, which also use .poe-item).
// Aliases map maxroll's on-page name -> Fandom page name where they differ.
const ALIASES = {
  // 'maxroll name': 'wiki page name'   // fill in as mismatches are found
};

const SELECTOR = '.poe-item'; // maxroll's item-reference marker

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
  const names = new Set(Object.keys(gems));
  const tip = makeTooltipEl();
  let hideTimer;

  function show(el, key, entry) {
    clearTimeout(hideTimer);
    tip.textContent = '';
    for (const line of GemFormat.formatTooltip(key, entry)) {
      const div = document.createElement('div');
      div.textContent = line;
      tip.appendChild(div);
    }
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    tip.style.left = `${window.scrollX + r.left}px`;
    tip.style.top = `${window.scrollY + r.bottom + 4}px`;
  }

  function attach() {
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.dataset.poeGemBound) continue;
      if (el.children.length > 0) continue; // leaf only — avoid wrapping paragraphs
      const text = el.textContent.trim();
      if (!text || (!names.has(text) && !ALIASES[text])) continue;
      el.dataset.poeGemBound = '1';
      el.addEventListener('mouseenter', () => {
        const hit = lookup(gems, text);
        if (hit) show(el, hit.key, hit.entry);
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
