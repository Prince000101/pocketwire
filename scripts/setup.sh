#!/usr/bin/env bash
# pocketwire setup (Unix convenience wrapper around setup.mjs)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$SCRIPT_DIR/setup.mjs" "$@"
