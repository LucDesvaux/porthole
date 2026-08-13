#!/bin/zsh
# Build the Chrome Web Store package: store/porthole.zip
set -euo pipefail
ROOT="${0:a:h:h}"
STAGE=$(mktemp -d)
cd "$ROOT/extension"
cp manifest.json popup.html popup.css popup.js \
   icon16.png icon32.png icon48.png icon128.png \
   icon16-white.png icon32-white.png icon48-white.png icon128-white.png "$STAGE/"
rm -f "$ROOT/store/porthole.zip"
(cd "$STAGE" && zip -qr "$ROOT/store/porthole.zip" . -x ".*")
rm -rf "$STAGE"
echo "Built store/porthole.zip"
unzip -l "$ROOT/store/porthole.zip" | tail -3
