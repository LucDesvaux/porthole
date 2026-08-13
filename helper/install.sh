#!/bin/zsh
# Repo-developer install: registers the native host allowing this clone's
# unpacked extension ID (derived from the extension/ path) plus any IDs passed.
# End users installing from the Chrome Web Store should instead run the command
# shown in the popup:  npx porthole-helper install <extension-id>
set -euo pipefail

HELPER_DIR="${0:a:h}"
EXT_DIR="${HELPER_DIR:h}/extension"

# Chrome derives an unpacked extension's ID from a SHA256 of its absolute path,
# hex-mapped 0-9a-f -> a-p, first 32 chars.
UNPACKED_ID=$(python3 - "$EXT_DIR" <<'PY'
import hashlib, sys
h = hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest()[:32]
print("".join(chr(ord('a') + int(c, 16)) for c in h))
PY
)
echo "Derived unpacked extension ID: $UNPACKED_ID"
exec node "$HELPER_DIR/cli.js" install "$UNPACKED_ID" "$@"
