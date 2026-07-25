# Daily refresh: re-scrape poewiki (real Firefox passes Cloudflare), rebuild
# data/gems.json, and push to GitHub if it changed. Run by Task Scheduler.
$ErrorActionPreference = "Stop"
$repo = "C:\Users\david\Documents\Claude Projects\poe1-gem-hover"
Set-Location $repo

$log = Join-Path $repo "tools\refresh.log"
"[{0}] start" -f (Get-Date -Format s) | Add-Content $log

try {
  python tools\fetch-poewiki.py 2>&1 | Add-Content $log
  node tools\gen-gems.cjs 2>&1 | Add-Content $log

  git add data/gems.json
  if (git status --porcelain data/gems.json) {
    git commit -m ("data: refresh gems.json from poewiki {0}" -f (Get-Date -Format yyyy-MM-dd)) 2>&1 | Add-Content $log
    git push origin HEAD 2>&1 | Add-Content $log
    "[{0}] pushed update" -f (Get-Date -Format s) | Add-Content $log
  } else {
    "[{0}] no change" -f (Get-Date -Format s) | Add-Content $log
  }
} catch {
  "[{0}] ERROR: {1}" -f (Get-Date -Format s), $_.Exception.Message | Add-Content $log
  throw
}
