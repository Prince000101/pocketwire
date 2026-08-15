#!/usr/bin/env bash
# pocketwire setup: install deps, create config + token, optionally install systemd service.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG_DIR="${POCKETWIRE_CFG_DIR:-$HOME/.config/pocketwire}"
CFG_FILE="$CFG_DIR/pocketwire.json"
DATA_DIR="${POCKETWIRE_DATA_DIR:-$HOME/.pocketwire}"

echo "pocketwire setup (repo: $REPO_DIR)"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node.js >= 22 is required (https://nodejs.org)" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: node.js >= 22 required, found $(node -v)" >&2
  exit 1
fi

echo "[1/4] installing dependencies..."
npm install --prefix "$REPO_DIR" --no-audit --no-fund

echo "[2/4] creating config at $CFG_FILE..."
mkdir -p "$CFG_DIR" "$DATA_DIR"
if [ -f "$CFG_FILE" ]; then
  echo "  existing config found, leaving it untouched:"
  echo "  $CFG_FILE"
else
  NTFY=""
  read -r -p "  ntfy topic for push alerts? (blank to skip, e.g. my-pw) " NTFY_ANSWER || true
  if [ -n "${NTFY_ANSWER:-}" ]; then
    NTFY="\"ntfy\": { \"topic\": \"$NTFY_ANSWER\" }"
  fi
  cat > "$CFG_FILE" <<EOF
{
  "host": "127.0.0.1",
  "port": 8787,
  "tokens": [],
  "skillsDirs": [
    "$HOME/.agents/skills",
    "$HOME/.config/opencode/skills",
    "$HOME/.config/opencode/command"
  ],
  "dataDir": "$DATA_DIR",
  $NTFY
  "opencode": { "serverUrl": "http://127.0.0.1:4096" }
}
EOF
  # normalize the trailing comma if ntfy was skipped
  if [ -z "${NTFY:-}" ]; then
    sed -i 's/^  ,$/  /' "$CFG_FILE"
    sed -i ':a;N;$!ba;s/,\n  "opencode"/\n  "opencode"/' "$CFG_FILE"
  fi
  echo "  wrote $CFG_FILE (phone token will be generated on first start)"
fi

echo "[3/4] verifying the relay starts..."
"$REPO_DIR/node_modules/.bin/tsx" "$REPO_DIR/packages/server/src/cli.ts" >/dev/null 2>&1 & PW_PID=$!
sleep 2
kill "$PW_PID" 2>/dev/null || true
wait "$PW_PID" 2>/dev/null || true

echo "[4/4] optional systemd user service"
read -r -p "  install as a user service (autostart on login)? [y/N] " SVC_ANSWER || true
if [[ "${SVC_ANSWER:-}" =~ ^[Yy]$ ]]; then
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"
  sed "s|__REPO__|$REPO_DIR|g; s|__NODE__|$(command -v node)|g; s|__TSX__|$REPO_DIR/node_modules/tsx/dist/cli.mjs|g" \
    "$REPO_DIR/scripts/pocketwire.service" > "$SYSTEMD_DIR/pocketwire.service"
  systemctl --user daemon-reload
  systemctl --user enable --now pocketwire.service
  echo "  enabled: systemctl --user status pocketwire.service"
else
  echo "  skip. run manually: npm start --prefix \"$REPO_DIR\""
fi

echo
echo "done. Next steps:"
echo "  1. Start opencode headless:   opencode serve --port 4096"
echo "  2. Start relay:               npm start --prefix \"$REPO_DIR\""
echo "  3. Read the phone token from the relay log, enter it in the PWA."
echo "  4. Expose remotely over Tailscale (see README Quick start)."
