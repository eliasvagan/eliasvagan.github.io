#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR="$ROOT/test"

cd "$TEST_DIR"

python3 -m pip install -r requirements.txt
python3 -m playwright install chromium

python3 -m pytest "$@"