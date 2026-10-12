#!/usr/bin/env bash
# Superviseur de recherche GemensKarte (tourne sur un VPS, 24/7). Lit .passes et maintient
# une boucle par passe. Chaque VPS scrape depuis SA propre IP (pas de proxy). La DB maison
# est jointe via le tunnel inverse (localhost:55432, voir .env DATABASE_URL).
#
# Format .passes (1 passe/ligne) : LABEL  MOTEUR  SCRIPT ARGS...
#   {DEPT} dans les args est remplace par le departement actif (progression region/region).
cd "$(dirname "$0")" || exit 1

# Une seule instance (le keepalive cron peut relancer ; flock garantit l'unicite).
exec 9>/tmp/gk-runner.lock
flock -n 9 || exit 0

set -a; . ./.env 2>/dev/null; set +a   # DATABASE_URL
TARGETS=$(sed 's/#.*//' .targets 2>/dev/null | tr ', ' '\n\n' | grep -E '^[0-9]+$' | paste -sd, -)
[ -z "$TARGETS" ] && TARGETS=85,46,12,09,11,30,31,32,48,65,66,81,82

run_pass() { # $1=label $2=moteur $3..=script+args
  local label=$1 backend=$2; shift 2
  local raw="$*" dept=85
  while true; do
    local d
    d=$(timeout 70 .venv/bin/python target_dept.py "$TARGETS" "$dept" </dev/null 2>/dev/null | tail -1)
    [[ "$d" =~ ^[0-9]+$ ]] && dept=$d
    local args=${raw//\{DEPT\}/$dept}
    GK_DDGS_BACKEND="$backend" timeout 2400 .venv/bin/python $args </dev/null >> "_${label}.log" 2>&1
    sleep 30
  done
}

# Battement de coeur machine -> table pipeline_heartbeat (id = GK_HB_ID, mis dans .env :
# 2 = VPS 1, 3 = VPS 2). gk-watch (serveur maison) alerte si battement absent
# (VPS cense etre 24/7) ou si une passe est figee (log sans ecriture depuis > 40 min).
hb_loop() {
  [ -z "$GK_HB_ID" ] && return 0
  local lbl lf age issues host
  host=$(hostname)
  while true; do
    issues=""
    while IFS= read -r pline; do
      case "$pline" in ''|\#*) continue;; esac
      read -r lbl _ <<< "$pline"
      lf="_${lbl}.log"
      if [ -f "$lf" ]; then
        age=$(( ($(date +%s) - $(stat -c %Y "$lf")) / 60 ))
        [ "$age" -gt 40 ] && issues="${issues}\"figee:${lbl}:${age}min\","
      else
        issues="${issues}\"morte:${lbl}:pas-de-log\","
      fi
    done < .passes
    printf '{"host":"%s","issues":[%s]}' "$host" "${issues%,}" \
      | timeout 60 .venv/bin/python heartbeat.py --id "$GK_HB_ID" >/dev/null 2>&1
    sleep 120
  done
}
hb_loop </dev/null &

# IMPORTANT : on charge .passes dans un tableau AVANT de spawner les boucles. Sinon le
# `while read ... done < .passes` partage son stdin avec les run_pass lances en arriere-plan,
# et le premier `target_dept.py` consomme le reste du fichier -> seules la 1re passe demarre
# (bug du 2026-06-16 : seul tgtig tournait, ha jamais lancee). mapfile + </dev/null = sur.
mapfile -t PASS_LINES < .passes
for line in "${PASS_LINES[@]}"; do
  case "$line" in ''|\#*) continue;; esac
  read -r label backend rest <<< "$line"
  run_pass "$label" "$backend" $rest </dev/null &
done
wait
