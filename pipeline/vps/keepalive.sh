#!/usr/bin/env bash
# Relance le runner s'il est mort. Appele par cron (@reboot + toutes les 2 min).
# PIEGE resolu : le motif pgrep doit vivre ICI, dans un fichier dont le NOM ne contient
# pas "runner.sh". Si la ligne cron (ou le nom du script appelant) contient "runner.sh",
# le sh -c de cron se matche lui-meme -> pgrep toujours vrai -> jamais de relance.
cd "$(dirname "$0")" || exit 1
pgrep -f '[r]unner\.sh' >/dev/null && exit 0
setsid ./runner.sh >> _runner.log 2>&1 </dev/null &
