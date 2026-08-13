#!/bin/zsh
# Register the PortHole native messaging host with Chrome (macOS).
# Usage:
#   ./install.sh                 # derive extension ID from ../extension (unpacked)
#   ./install.sh <extension-id>  # explicit ID (e.g. after Web Store publish)
set -euo pipefail

HOST_NAME="com.porthole.helper"
HELPER_DIR="${0:a:h}"
EXT_DIR="${HELPER_DIR:h}/extension"
NODE_BIN="$(command -v node)"

if [[ -n "${1:-}" ]]; then
  EXT_ID="$1"
else
  # Chrome derives an unpacked extension's ID from a SHA256 of its absolute path,
  # hex-mapped 0-9a-f -> a-p, first 32 chars.
  EXT_ID=$(python3 - "$EXT_DIR" <<'PY'
import hashlib, sys
h = hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest()[:32]
print("".join(chr(ord('a') + int(c, 16)) for c in h))
PY
  )
  echo "Derived unpacked extension ID from $EXT_DIR"
fi
echo "Extension ID: $EXT_ID"

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
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
)

installed=0
for dir in \
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts" \
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts" \
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"; do
  browser_dir="${dir:h}"
  [[ -d "$browser_dir" ]] || continue
  mkdir -p "$dir"
  echo "$MANIFEST_JSON" > "$dir/$HOST_NAME.json"
  echo "Installed: $dir/$HOST_NAME.json"
  installed=1
done

[[ $installed -eq 1 ]] || { echo "No Chrome-family browser found."; exit 1; }
echo "Done. Reload the extension in chrome://extensions."