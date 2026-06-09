#!/usr/bin/env bash
# Smoke-test de l'API GemensKarte : vérifie tous les endpoints de bout en bout.
# Usage : BASE=http://localhost:3000/api scripts/smoke.sh
set -uo pipefail

BASE="${BASE:-http://localhost:3000/api}"
pass=0; fail=0

check() { # $1 description, $2 valeur observée, $3 motif attendu (grep -E)
  if echo "$2" | grep -Eq "$3"; then
    echo "✅ $1"; pass=$((pass+1))
  else
    echo "❌ $1 -> obtenu : $(echo "$2" | head -c 200)"; fail=$((fail+1))
  fi
}

# JSON helper (node est toujours présent)
j() { node -e "$1"; }

echo "⏳ Attente de l'API sur $BASE …"
for _ in $(seq 1 60); do curl -s -m2 "$BASE/health" >/dev/null 2>&1 && break; sleep 1; done

check "health"              "$(curl -s "$BASE/health")" '"status":"ok"'
check "categories = 7"      "$(curl -s "$BASE/categories" | j 'console.log(JSON.parse(require("fs").readFileSync(0)).length)')" '^7$'
check "list total présent"  "$(curl -s "$BASE/associations?limit=1")" '"total":'
check "filtre category=eco" "$(curl -s "$BASE/associations?category=eco&limit=5" | j 'const d=JSON.parse(require("fs").readFileSync(0));console.log(d.items.every(a=>a.categoryId==="eco")?"OK":"KO")')" 'OK'
check "tri par distance"    "$(curl -s "$BASE/associations?near=-1.55,47.21&limit=3" | j 'const d=JSON.parse(require("fs").readFileSync(0)).items.map(a=>a.distanceM);console.log(d[0]!=null&&d[0]<=d[1]?"OK":"KO")')" 'OK'
check "geojson bbox"        "$(curl -s "$BASE/associations/geojson?bbox=-5,46,2,50" | j 'const d=JSON.parse(require("fs").readFileSync(0));console.log(d.type)')" 'FeatureCollection'
check "404 id inexistant"   "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/associations/00000000-0000-0000-0000-000000000000")" '404'
check "400 id non-uuid"     "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/associations/xxx")" '400'
check "400 bbox invalide"   "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/associations?bbox=1,2,3")" '400'
check "suggest (Meili)"     "$(curl -s "$BASE/search/suggest?q=theatr&limit=3" | j 'const d=JSON.parse(require("fs").readFileSync(0));console.log(Array.isArray(d)?"OK":"KO")')" 'OK'
check "POST référencement"  "$(curl -s -X POST "$BASE/associations" -H 'content-type: application/json' -d '{"name":"Smoke Test Asso","categoryId":"sport","postalCode":"35000","city":"Rennes"}')" '"status":"pending"'
check "POST 400 invalide"   "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/associations" -H 'content-type: application/json' -d '{"name":"x"}')" '400'

echo "────────────────────────────────────"
echo "RÉSULTAT : $pass réussis, $fail échoués"
[ "$fail" -eq 0 ]
