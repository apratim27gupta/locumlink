# Run after fully closing Cursor (all windows). Clears cached workspace state for this repo.
$ws = Join-Path $env:APPDATA "Cursor\User\workspaceStorage\0f44f3f7763511683382fef1afebed95"
if (-not (Test-Path $ws)) {
    Write-Host "Workspace cache already cleared."
    exit 0
}
$bak = "${ws}.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Rename-Item -LiteralPath $ws -NewName (Split-Path $bak -Leaf) -Force
Write-Host "Cleared. Reopen Cursor and open: C:\Users\arora\Desktop\l2"
