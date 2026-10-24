#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE:-http://localhost:4000/api}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

json() {
  node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(0,"utf8"));let v=j;for(const k of process.argv[1].split("."))v=v?.[k];if(v===undefined)process.exit(1);process.stdout.write(String(v))' "$1"
}
ok() { printf 'OK  %s\n' "$1"; }
fail() { printf 'ÉCHEC  %s\n' "$1"; exit 1; }
call() { curl -fsS "$@"; }

login=$(call -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"client@bookly.dev","password":"Bookly2026!"}') || fail "login client"
token=$(printf '%s' "$login" | json data.accessToken) || fail "token client"
ok "login client"

businesses=$(call "$BASE/businesses?sort=rating") || fail "GET /businesses"
printf '%s' "$businesses" | json data.0.slug >/dev/null || fail "liste prestataires"
ok "GET /businesses"

slug=$(printf '%s' "$businesses" | json data.0.slug)
detail=$(call "$BASE/businesses/$slug") || fail "GET /businesses/:slug"
business_id=$(printf '%s' "$detail" | json data.id)
service_id=$(printf '%s' "$detail" | json data.services.0.id)
staff_id=$(printf '%s' "$detail" | json data.staff.0.id)
ok "GET /businesses/:slug"

date=$(node -e 'const d=new Date(Date.now()+864e5);while(d.getUTCDay()!==1)d.setUTCDate(d.getUTCDate()+1);process.stdout.write(d.toISOString().slice(0,10))')
availability=$(call "$BASE/businesses/$business_id/availability?serviceId=$service_id&staffId=$staff_id&date=$date") || fail "GET availability"
time=$(printf '%s' "$availability" | json data.0.time) || fail "aucun créneau"
ok "GET availability"

booking=$(call -X POST "$BASE/bookings" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -d "{\"businessId\":$business_id,\"serviceId\":$service_id,\"staffId\":$staff_id,\"startAt\":\"${date}T${time}\"}") || fail "POST /bookings"
booking_id=$(printf '%s' "$booking" | json data.id)
ok "POST /bookings"

call "$BASE/bookings/mine" -H "Authorization: Bearer $token" >/dev/null || fail "GET /bookings/mine"
ok "GET /bookings/mine"

call -X POST "$BASE/bookings/$booking_id/cancel" -H "Authorization: Bearer $token" >/dev/null || fail "POST cancel"
ok "POST /bookings/:id/cancel"

owner_login=$(call -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"email":"owner@bookly.dev","password":"Bookly2026!"}') || fail "login owner"
owner_token=$(printf '%s' "$owner_login" | json data.accessToken) || fail "token owner"
ok "login owner"

call "$BASE/owner/stats" -H "Authorization: Bearer $owner_token" >/dev/null || fail "GET /owner/stats"
ok "GET /owner/stats"

call "$BASE/owner/bookings" -H "Authorization: Bearer $owner_token" >/dev/null || fail "GET /owner/bookings"
ok "GET /owner/bookings"

printf '\nSmoke Bookly : tout est OK.\n'
