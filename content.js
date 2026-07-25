// DOM finding: maxroll build guides render gem names as text inside various leaf
// elements. We bind hover to leaf elements whose exact trimmed text is a known gem
// name (from the data set). SELECTOR is refined from live-DOM inspection.
// Aliases map maxroll's on-page name -> Fandom page name where they differ.
const ALIASES = {
  // 'maxroll name': 'wiki page name'   // fill in as mismatches are found
};

const SELECTOR = 'a, span, strong, b, li, td, p'; // refined per live DOM inspection

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
