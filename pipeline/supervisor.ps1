# GemensKarte — superviseur autonome du pipeline.
# Lancé par une tâche planifiée (au logon). Possède : 2 tunnels SSH + jobs scrap + apply/reap/score
# périodiques. Auto-répare tunnels et jobs morts. Tout est idempotent/reprenable.
#
# DEUX TUNNELS pour répartir la charge DB (un seul forward SSH sérialise tout le trafic) :
#   5433 (tunnel A) : jobs DDG/LLM, écritures DB légères -> discover, verify, helloasso, fb->site
#   5434 (tunnel B) : jobs DB-lourds + bloc périodique  -> liveness, events, apply/reap/purge/score
# Aucune exposition réseau (juste 2 connexions SSH locales).

$ErrorActionPreference = 'Continue'
$dir = 'C:\Users\user\Documents\gemenskarte-enrich'
Set-Location $dir
$py  = "$dir\.venv\Scripts\python.exe"
# Mot de passe de la base lu depuis un fichier local NON versionné (.dbpass), jamais
# écrit en clair dans le code ni dans le dépôt. Repli sur l'ancien défaut si absent.
$dbPassFile = "$dir\.dbpass"
$dbPass = if (Test-Path $dbPassFile) { (Get-Content $dbPassFile -Raw).Trim() } else { 'gemenskarte' }
$DSN_A = "postgres://gemenskarte:$dbPass@localhost:5433/gemenskarte"  # léger
$DSN_B = "postgres://gemenskarte:$dbPass@localhost:5434/gemenskarte"  # lourd + périodique
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

# On garde une réf vers le process Windows de chaque tunnel pour pouvoir le tuer/relancer.
$script:Tunnels = @{}
function Start-Tunnel($port) {
  # Tue l'ancien tunnel de CE port s'il traîne (process mort/zombie), sans toucher l'autre.
  $old = $script:Tunnels[$port]
  if ($old -and -not $old.HasExited) { Stop-Process -Id $old.Id -Force -ErrorAction SilentlyContinue }
  wsl -e bash -lc "pkill -f 'ssh -N.*0.0.0.0:${port}:' 2>/dev/null" 2>$null

  # Résout l'IP du conteneur gk-db (peut changer après reboot des conteneurs).
  # NB: `hostname -i` (pas de template Go {{...}}) survit au quoting wsl->ssh->bash.
  $ip = ''
  try {
    $raw = (wsl -e bash -lc "ssh -o ConnectTimeout=10 your-server 'docker exec gk-db hostname -i'").Trim()
    $ip = ($raw -split '\s+')[0]
  } catch {}
  if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { $ip = 'DB_CONTAINER_IP' }
  Log "tunnel ${port}: (re)demarrage vers ${ip}:5432"

  # ssh EN AVANT-PLAN dans un process Windows persistant (fenêtre cachée). nohup+disown dans
  # `wsl -e bash -lc` ne survit PAS : WSL tue les process de la session qui se termine, donc le
  # tunnel meurt à chaque cycle. Un Start-Process garde le ssh vivant tant qu'il tourne ; quand
  # il tombe (réseau), Test-Port le détecte et on relance.
  $script:Tunnels[$port] = Start-Process -WindowStyle Hidden -PassThru wsl -ArgumentList `
    '-e', 'ssh', '-N', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3', `
    '-o', 'ExitOnForwardFailure=yes', '-L', "0.0.0.0:${port}:${ip}:5432", 'your-server'
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
# UNIFIÉ : passe désormais par discover_targeted.py --platform helloasso, qui AJOUTE le candidat
# dans meta.discovery (au lieu d'écrire `social` direct comme l'ancien helloasso.py) -> apply
# redevient le seul à écrire `social`. find_helloasso (strict) est toujours utilisé en interne.
$haBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py discover_targeted.py --platform helloasso --limit 150 --sleep 2.0 *>> "$dir\_haLoop.log"; Start-Sleep -Seconds 90 }
}
# Passes de découverte CIBLÉES par plateforme (réseaux sociaux + site). Trickle TRÈS gentil :
# elles PARTAGENT DDG avec discover/helloasso/fb->site, donc petits lots + longues pauses.
# Elles ajoutent des candidats dans meta.discovery puis effacent verification.model -> la boucle
# verify les reprend toute seule, puis apply (bloc périodique) reconstruit `social`.
$tgtFbBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py discover_targeted.py --platform facebook --limit 120 --sleep 2.0 *>> "$dir\_tgtFbLoop.log"; Start-Sleep -Seconds 60 }
}
$tgtIgBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py discover_targeted.py --platform instagram --limit 120 --sleep 2.0 *>> "$dir\_tgtIgLoop.log"; Start-Sleep -Seconds 60 }
}
$tgtWebBlock = {
  param($py, $dir, $dsn)
  Set-Location $dir; $env:DATABASE_URL = $dsn
  while ($true) { & $py discover_targeted.py --platform website --limit 120 --sleep 2.0 *>> "$dir\_tgtWebLoop.log"; Start-Sleep -Seconds 60 }
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
$disc = $null; $ver = $null; $ha = $null; $liv = $null; $ev = $null; $fb = $null
$tgtFb = $null; $tgtIg = $null; $tgtWeb = $null; $cycle = 0
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
  # Passes de découverte ciblées (facebook / instagram / website) sur tunnel A = 5433.
  if ($null -eq $tgtFb -or $tgtFb.State -ne 'Running') {
    if ($tgtFb) { Remove-Job $tgtFb -Force -ErrorAction SilentlyContinue }
    $tgtFb = Start-Job -Name gk-tgtfb -ScriptBlock $tgtFbBlock -ArgumentList $py, $dir, $DSN_A
    Log "job découverte ciblée facebook (re)lancé"
  }
  if ($null -eq $tgtIg -or $tgtIg.State -ne 'Running') {
    if ($tgtIg) { Remove-Job $tgtIg -Force -ErrorAction SilentlyContinue }
    $tgtIg = Start-Job -Name gk-tgtig -ScriptBlock $tgtIgBlock -ArgumentList $py, $dir, $DSN_A
    Log "job découverte ciblée instagram (re)lancé"
  }
  if ($null -eq $tgtWeb -or $tgtWeb.State -ne 'Running') {
    if ($tgtWeb) { Remove-Job $tgtWeb -Force -ErrorAction SilentlyContinue }
    $tgtWeb = Start-Job -Name gk-tgtweb -ScriptBlock $tgtWebBlock -ArgumentList $py, $dir, $DSN_A
    Log "job découverte ciblée website (re)lancé"
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
    try { & $py apply.py             *>> "$dir\_applyLoop.log" } catch { Log "apply: $_" }
    try { & $py reap_dead.py         *>> "$dir\_reapLoop.log" } catch { Log "reap: $_" }
    try { & $py purge_directories.py *>> "$dir\_purgeDirLoop.log" } catch { Log "purgeDir: $_" }
    try { & $py score.py             *>> "$dir\_scoreLoop.log" } catch { Log "score: $_" }
    try { & $py fb_promote.py --limit 30 *>> "$dir\_fbPromoteLoop.log" } catch { Log "fbpromote: $_" }
    Log "apply+reap+purgeDir+score+fbpromote exécutés (cycle $cycle)"
  }
  $cycle++
  Start-Sleep -Seconds 120
}
