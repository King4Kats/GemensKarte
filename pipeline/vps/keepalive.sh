#!/usr/bin/env bash
# Relance le runner s'il est mort. Appele par cron (@reboot + toutes les 2 min).
# Test par le VERROU du runner (/tmp/gk-runner.lock, pose par runner.sh avec flock) et non plus
# par `pgrep -f runner.sh` (correctif du 12/10/2026) : sur une machine qui fait tourner un autre
# projet avec son propre runner.sh, pgrep le trouvait et concluait a tort que le runner
# GemensKarte etait vivant -> il n'etait jamais relance. (Ancien piege aussi evite : pgrep -f se
# reconnaissait lui-meme quand la ligne cron contenait "runner.sh".)
cd "$(dirname "$0")" || exit 1
# flock -n reussit seulement si PERSONNE ne tient le verrou -> runner absent -> on le relance.
flock -n /tmp/gk-runner.lock true || exit 0
setsid ./runner.sh >> _runner.log 2>&1 </dev/null &
