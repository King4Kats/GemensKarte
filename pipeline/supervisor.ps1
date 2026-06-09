# GemensKarte — superviseur autonome du pipeline.
# Lancé par une tâche planifiée (au logon). Possède : 2 tunnels SSH + jobs scrap + apply/press
# périodiques. Auto-répare tunnels et jobs morts. Tout est idempotent/reprenable.
#
# DEUX TUNNELS pour répartir la charge DB (un seul forward SSH sérialise tout le trafic) :
#   5433 (tunnel A) : jobs DDG/LLM, écritures DB légères -> discover, verify, helloasso, fb->site
#   5434 (tunnel B) : jobs DB-lourds + bloc périodique  -> liveness, events, apply/press/reap/score
# Aucune exposition réseau (juste 2 connexions SSH locales).

$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\user\Documents\gemenskarte-enrich'
Set-Location $dir
$py  = "$dir\.venv\Scripts\python.exe"
$DSN_A = 'postgres://gemenskarte:gemenskarte@localhost:5433/gemenskarte'  # léger
$DSN_B = 'postgres://gemenskarte:gemenskarte@localhost:5434/gemenskarte'  # lourd + périodique
$env:DATABASE_URL = $DSN_B
$log = "$dir\_supervisor.log"
function Log($m) { "$(Get-Date -Format o)  $m" | Out-File -Append -Encoding utf8 $log }

function Test-Port($port) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('localhost', $port); $c.Close(); return $true }
  catch { return $false }
}

function Ensure-Ollama {
  try { Invoke-RestMethod -Uri 'http://localhost:11434/api/tags' -TimeoutSec 6 | Out-Null; return }
  catch {}
  Log 'ollama: (re)démarrage'
  Start-Process -WindowStyle Hidden -FilePath "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" `
    -ArgumentList 'serve' -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 8
}

function Start-Tunnel($port) {
  # Résout l'IP du conteneur gk-db (peut changer après reboot des conteneurs).
  # NB: `hostname -i` (pas de template Go {{...}}) survit au quoting wsl->ssh->bash.
  $ip = ''
  try {
    $raw = (wsl -e bash -lc "ssh -o ConnectTimeout=10 your-server 'docker exec gk-db hostname -i'").Trim()
    $ip = ($raw -split '\s+')[0]
  } catch {}
  if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { $ip = 'DB_CONTAINER_IP' }
  Log "tunnel ${port}: (re)demarrage vers ${ip}:5432"
  # Lance ssh DANS wsl en nohup+disown : un Start-Process détaché tue la session WSL et le
  # tunnel meurt aussitôt. pkill ciblé sur CE port évite doublons sans tuer l'autre tunnel.
  $cmd = "pkill -f 'ssh -N.*0.0.0.0:${port}:' 2>/dev/null; sleep 1; " +
         "nohup ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 " +
         "-o ExitOnForwardFailure=yes -L 0.0.0.0:${port}:${ip}:5432 your-server " +
         ">/tmp/gktun${port}.log 2>&1 & disown"
  wsl -e bash -lc $cmd
  Start-Sleep -Seconds 6
}

# Chaque bloc reçoit son DSN (tunnel A ou B) en argument.
$discBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py discover.py --limit 800 --sleep 1.2 *>> "$dir\_discLoop.log"; Start-Sleep -Seconds 15 }
}
$verBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py verify_llm.py --limit 200 *>> "$dir\_verLoop.log"; Start-Sleep -Seconds 20 }
}
# HelloAsso : trickle léger (petits lots + pause longue) pour ne pas affamer la découverte DDG.
$haBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py helloasso.py --limit 150 --sleep 2.0 *>> "$dir\_haLoop.log"; Start-Sleep -Seconds 90 }
}
# Liveness : balaie la DB par lots (HTTP parallèle, local). Gating interne (sain >14j / suspect >1j).
$livBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py liveness.py --limit 1500 *>> "$dir\_livLoop.log"; Start-Sleep -Seconds 60 }
}
# Events : agenda à venir via API OpenAgenda/Opendatasoft. Gating eventsScrapedAt (3j).
$evBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py events.py *>> "$dir\_evLoop.log"; Start-Sleep -Seconds 300 }
}
# FB->site : trickle TRÈS gentil (DDG partagé avec discover). Écrit un CANDIDAT meta.fbWebsite
# (jamais affiché tel quel : validé par fb_promote avant promotion). Gating fbWebsiteCheckedAt.
$fbBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py fb_website.py --limit 10 --sleep 4 --apply *>> "$dir\_fbLoop.log"; Start-Sleep -Seconds 240 }
}

Log '=== superviseur démarré (2 tunnels) ==='
$disc = $null; $ver = $null; $ha = $null; $liv = $null; $ev = $null; $fb = $null; $cycle = 0
while ($true) {
  if (-not (Test-Port 5433)) { Start-Tunnel 5433 }
  if (-not (Test-Port 5434)) { Start-Tunnel 5434 }
  Ensure-Ollama

  # Jobs légers (DDG/LLM) sur tunnel A = 5433.
  if ($null -eq $disc -or $disc.State -ne 'Running') {
    if ($disc) { Remove-Job $disc -Force -ErrorAction SilentlyContinue }
    $disc = Start-Job -Name gk-disc -ScriptBlock $discBlock -ArgumentList $py, $dir, $DSN_A
    Log "job découverte (re)lancé"
  }
  if ($null -eq $ver -or $ver.State -ne 'Running') {
    if ($ver) { Remove-Job $ver -Force -ErrorAction SilentlyContinue }
    $ver = Start-Job -Name gk-ver -ScriptBlock $verBlock -ArgumentList $py, $dir, $DSN_A
    Log "job vérif (re)lancé"
  }
  if ($null -eq $ha -or $ha.State -ne 'Running') {
    if ($ha) { Remove-Job $ha -Force -ErrorAction SilentlyContinue }
    $ha = Start-Job -Name gk-ha -ScriptBlock $haBlock -ArgumentList $py, $dir, $DSN_A
    Log "job HelloAsso (re)lancé"
  }
  if ($null -eq $fb -or $fb.State -ne 'Running') {
    if ($fb) { Remove-Job $fb -Force -ErrorAction SilentlyContinue }
    $fb = Start-Job -Name gk-fb -ScriptBlock $fbBlock -ArgumentList $py, $dir, $DSN_A
    Log "job fb->site (re)lancé"
  }
  # Jobs DB-lourds sur tunnel B = 5434.
  if ($null -eq $liv -or $liv.State -ne 'Running') {
    if ($liv) { Remove-Job $liv -Force -ErrorAction SilentlyContinue }
    $liv = Start-Job -Name gk-liv -ScriptBlock $livBlock -ArgumentList $py, $dir, $DSN_B
    Log "job liveness (re)lancé"
  }
  if ($null -eq $ev -or $ev.State -ne 'Running') {
    if ($ev) { Remove-Job $ev -Force -ErrorAction SilentlyContinue }
    $ev = Start-Job -Name gk-ev -ScriptBlock $evBlock -ArgumentList $py, $dir, $DSN_B
    Log "job events (re)lancé"
  }

  # Bloc périodique DB-lourd toutes les ~10 min sur tunnel B (idempotent).
  if ($cycle % 5 -eq 0 -and (Test-Port 5434)) {
    $env:DATABASE_URL = $DSN_B
    try { & $py apply.py        *>> "$dir\_applyLoop.log" } catch { Log "apply: $_" }
    try { & $py press_filter.py *>> "$dir\_pressLoop.log" } catch { Log "press: $_" }
    try { & $py reap_dead.py    *>> "$dir\_reapLoop.log" } catch { Log "reap: $_" }
    try { & $py score.py        *>> "$dir\_scoreLoop.log" } catch { Log "score: $_" }
    try { & $py fb_promote.py --limit 30 *>> "$dir\_fbPromoteLoop.log" } catch { Log "fbpromote: $_" }
    Log "apply+press+reap+score+fbpromote exécutés (cycle $cycle)"
  }
  $cycle++
  Start-Sleep -Seconds 120
}
