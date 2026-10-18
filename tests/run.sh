#!/usr/bin/env bash
# تشغيل الاختبارات التلقائية لـ«شجرة العائلة 4»
set -e
cd "$(dirname "$0")/.."
python3 tests/build_harness.py
mkdir -p tests/.results
PORT=8765
( cd tests/.harness && exec python3 -m http.server $PORT >/dev/null 2>&1 ) &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
PW_PATH="$(npm root -g 2>/dev/null)" BASE_URL="http://localhost:$PORT/" node tests/e2e.mjs
