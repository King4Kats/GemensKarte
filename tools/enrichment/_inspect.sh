#!/usr/bin/env bash
echo "user=$(whoami) realhome=/home/$(whoami)"
for c in docker node pnpm python3 pip3 git curl; do
  if command -v "$c" >/dev/null 2>&1; then
    echo "$c -> $($c --version 2>&1 | head -1)"
  else
    echo "$c -> ABSENT"
  fi
done
echo "=== ports 5432/3000/5173/7700/11434 ==="
ss -ltn 2>/dev/null | grep -E ':(5432|3000|5173|7700|11434)\b' || echo "aucun occupé"
echo "=== /home/flavien libre ? ==="
ls -ld /home/flavien 2>&1
echo "=== git in path for flavien login ==="
bash -lc 'command -v node pnpm python3 2>&1'
