"""Headless-Firefox verification for the PoE1 Gem Hover extension.

Loads the unpacked extension as a temporary add-on, opens a real maxroll build
guide, and reports:
  1. DOM shape of gem references (ground truth: every leaf element whose exact
     text is a known gem name) -> informs SELECTOR / ALIASES.
  2. What the content script actually bound (data-poe-gem-bound).
  3. Whether hovering a bound gem shows the tooltip with the right text.

Usage: python tools/verify-browser.py [--headful]
"""
import json
import os
import sys
import time

from selenium import webdriver
from selenium.webdriver.firefox.options import Options

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_GUIDE = "https://maxroll.gg/poe/build-guides/cold-dot-elementalist/skill-gems-passive-tree"

def main():
    headful = "--headful" in sys.argv
    urls = [a for a in sys.argv[1:] if a.startswith("http")]
    guide_url = urls[0] if urls else DEFAULT_GUIDE
    gems = json.load(open(os.path.join(ROOT, "data", "gems.json"), encoding="utf-8"))
    gem_names = list(gems.keys())

    opts = Options()
    if not headful:
        opts.add_argument("-headless")
    driver = webdriver.Firefox(options=opts)
    try:
        driver.install_addon(ROOT, temporary=True)
        driver.set_page_load_timeout(90)
        driver.get(guide_url)
        time.sleep(8)  # let React render + content script scan

        title = driver.title
        print("PAGE:", guide_url, "\nTITLE:", title)

        # 1. Ground-truth: INNERMOST element whose full text == a known gem name
        #    (allows links/spans with child icons — not just bare leaves).
        ground = driver.execute_script(
            """
            const names = new Set(arguments[0]);
            const out = [];
            for (const el of document.querySelectorAll('*')) {
              const t = (el.textContent || '').trim();
              if (!names.has(t)) continue;
              // innermost: no child element also exactly equals the gem name
              if ([...el.children].some(c => (c.textContent||'').trim() === t)) continue;
              out.push({name: t, tag: el.tagName,
                        cls: (el.className && el.className.toString().slice(0,50)) || '',
                        childTags: [...el.children].map(c=>c.tagName).join(','),
                        href: el.getAttribute && (el.getAttribute('href')||'')});
            }
            return out;
            """,
            gem_names,
        )
        print(f"\nGROUND-TRUTH gem-name elements found: {len(ground)}")
        # class histogram — reveals the selector to use
        from collections import Counter
        hist = Counter((g["tag"] + "." + g["cls"]) for g in ground)
        print("  tag.class histogram:")
        for k, v in hist.most_common(12):
            print(f"    {v:3d}  {k}")
        for g in ground[:10]:
            print("  ", g)

        # 2 + 3. Delegated hover test: dispatch a bubbling mouseover on a VISIBLE
        # .poe-item gem (as a real cursor would), then read the tooltip. Also
        # simulate a React node-swap first to prove delegation survives it.
        result = driver.execute_script(
            """
            const names = new Set(arguments[0]);
            const items = [...document.querySelectorAll('.poe-item')].filter(el => {
              const r = el.getBoundingClientRect();
              const n = (el.dataset && el.dataset.poeText) || el.textContent.trim();
              return r.width > 0 && r.height > 0 && names.has(n);
            });
            if (!items.length) return {ok:false, reason:'no visible gem .poe-item'};
            const el = items[0];
            const n = (el.dataset && el.dataset.poeText) || el.textContent.trim();
            // React-swap simulation: replace node with an identical clone
            const clone = el.cloneNode(true);
            el.parentNode.replaceChild(clone, el);
            const r = clone.getBoundingClientRect();
            const opts = {bubbles:true, clientX:Math.round(r.x+r.width/2), clientY:Math.round(r.y+r.height/2)};
            clone.dispatchEvent(new MouseEvent('mouseover', opts));
            const tip = document.getElementById('poe1-gem-hover-tip');
            return {ok:true, name:n, visibleGems:items.length,
                    hidden: tip ? tip.hidden : 'no-tip',
                    text: tip ? tip.innerText : null};
            """,
            gem_names,
        )
        print("\nDELEGATED HOVER CHECK (after node swap):", result)
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
