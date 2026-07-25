// Shared by content script (globalThis) and Node tooling (module.exports).
(function (root) {
  const cls = (arr) => (arr && arr.length ? arr.join(', ') : 'all classes');

  function formatTooltip(name, entry) {
    const lines = [name];
    if (entry.free) {
      lines.push(`Free: Act ${entry.free.act} '${entry.free.quest}' (${cls(entry.free.classes)})`);
    }
    if (entry.buy) {
      const who = entry.buy.classes.length ? '' : ' (all classes)';
      lines.push(`Earliest buy: Act ${entry.buy.act}, ${entry.buy.vendor}${who}`);
    }
    if (entry.allBy) {
      lines.push(`All classes by Act ${entry.allBy.act} (${entry.allBy.vendor})`);
    }
    if (!entry.free && !entry.buy && !entry.allBy) {
      lines.push('No quest or vendor source listed (likely drop-only)');
    }
    return lines;
  }

  const api = { formatTooltip };
  root.GemFormat = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
