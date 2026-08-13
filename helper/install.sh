#!/bin/zsh
# Register the PortHole native messaging host with your browser.
#
# Usage:
#   ./install.sh                    # allow the published extension + this local clone
#   ./install.sh <extension-id> ... # also allow extra IDs (any number)
#
# Every ID passed is added alongside the published ID and the ID Chrome derives
# for this clone when loaded unpacked, so store installs and local development
# both work from one registration.
set -euo pipefail

HOST_NAME="com.porthole.helper"
HELPER_DIR="${0:a:h}"
EXT_DIR="${HELPER_DIR:h}/extension"
NODE_BIN="$(command -v node || true)"

# Chrome Web Store ID — fill in after the first draft upload to the dashboard.
PUBLISHED_ID=""

[[ -n "$NODE_BIN" ]] || { echo "node not found in PATH. Install Node.js first."; exit 1; }

# Chrome derives an unpacked extension's ID from a SHA256 of its absolute path,
# hex-mapped 0-9a-f -> a-p, first 32 chars.
UNPACKED_ID=$(python3 - "$EXT_DIR" <<'PY'
import hashlib, sys
h = hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest()[:32]
print("".join(chr(ord('a') + int(c, 16)) for c in h))
PY
)

IDS=()
[[ -n "$PUBLISHED_ID" ]] && IDS+=("$PUBLISHED_ID")
IDS+=("$UNPACKED_ID")
IDS+=("$@")

# De-duplicate and build the allowed_origins array
ORIGINS=""
seen=""
for id in "${IDS[@]}"; do
  [[ -n "$id" && "$seen" != *"|$id|"* ]] || continue
  seen="$seen|$id|"
  [[ -n "$ORIGINS" ]] && ORIGINS="$ORIGINS, "
  ORIGINS="$ORIGINS\"chrome-extension://$id/\""
  echo "Allowing extension ID: $id"
done

# Wrapper so the manifest points at a stable executable with the right node
WRAPPER="$HELPER_DIR/run-host.sh"
cat > "$WRAPPER" <<EOF
#!/bin/zsh
export PATH="$PATH"
exec "$NODE_BIN" "$HELPER_DIR/host.js"
EOF
chmod +x "$WRAPPER"

MANIFEST_JSON=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "PortHole helper — local dev server scanner and controller",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [$ORIGINS]
}
EOF
)

# macOS paths first, then Linux (Linux support is untested — reports welcome)
HOST_DIRS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/.config/google-chrome/NativeMessagingHosts"
  "$HOME/.config/chromium/NativeMessagingHosts"
  "$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/.config/microsoft-edge/NativeMessagingHosts"
)

installed=0
for dir in "${HOST_DIRS[@]}"; do
  browser_dir="${dir:h}"
  [[ -d "$browser_dir" ]] || continue
  mkdir -p "$dir"
  echo "$MANIFEST_JSON" > "$dir/$HOST_NAME.json"
  echo "Installed: $dir/$HOST_NAME.json"
  installed=1
done

[[ $installed -eq 1 ]] || { echo "No Chrome-family browser found."; exit 1; }
echo "Done. Reload the extension in chrome://extensions."
