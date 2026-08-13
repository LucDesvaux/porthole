#!/usr/bin/env node
// PortHole helper CLI.
//   npx porthole-helper install [extra-extension-id ...]
//   npx porthole-helper uninstall
//   npx porthole-helper status
//
// `install` copies the native messaging host to ~/.porthole (so it survives
// npx cache pruning) and registers it with every Chrome-family browser found.

const fs = require("fs");
const os = require("os");
const path = require("path");

const HOST_NAME = "com.porthole.helper";
const HOME = os.homedir();
const PORTHOLE_DIR = path.join(HOME, ".porthole");

// Chrome Web Store ID of the published PortHole extension.
// Filled in after the first draft upload to the dashboard.
const PUBLISHED_ID = "";

const HOST_DIRS = process.platform === "darwin" ? [
  "Library/Application Support/Google/Chrome/NativeMessagingHosts",
  "Library/Application Support/Google/Chrome Beta/NativeMessagingHosts",
  "Library/Application Support/Chromium/NativeMessagingHosts",
  "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
  "Library/Application Support/Microsoft Edge/NativeMessagingHosts",
] : [
  ".config/google-chrome/NativeMessagingHosts",
  ".config/chromium/NativeMessagingHosts",
  ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts",
  ".config/microsoft-edge/NativeMessagingHosts",
];

function browserDirs() {
  // Register only where the browser actually exists (its parent profile dir)
  return HOST_DIRS.map((d) => path.join(HOME, d)).filter((d) => fs.existsSync(path.dirname(d)));
}

function install(extraIds) {
  if (!["darwin", "linux"].includes(process.platform)) {
    console.error("PortHole currently supports macOS and Linux only.");
    process.exit(1);
  }

  const ids = [...new Set([PUBLISHED_ID, ...extraIds].filter(Boolean))];
  if (!ids.length) {
    console.error("No extension ID to allow. Pass one: npx porthole-helper install <extension-id>");
    process.exit(1);
  }
  for (const id of ids) {
    if (!/^[a-p]{32}$/.test(id)) {
      console.error(`"${id}" doesn't look like an extension ID (32 letters a-p, from chrome://extensions).`);
      process.exit(1);
    }
    console.log(`Allowing extension ID: ${id}`);
  }

  // Copy the host to a stable location — npx caches get pruned
  fs.mkdirSync(PORTHOLE_DIR, { recursive: true });
  for (const f of ["host.js", "core.js", "server.js"]) {
    fs.copyFileSync(path.join(__dirname, f), path.join(PORTHOLE_DIR, f));
  }
  const example = path.join(PORTHOLE_DIR, "projects.example.json");
  fs.copyFileSync(path.join(__dirname, "projects.example.json"), example);

  const wrapper = path.join(PORTHOLE_DIR, "run-host.sh");
  fs.writeFileSync(wrapper,
    `#!/bin/sh\nexport PATH="${process.env.PATH}"\nexec "${process.execPath}" "${path.join(PORTHOLE_DIR, "host.js")}"\n`,
    { mode: 0o755 });

  const manifest = JSON.stringify({
    name: HOST_NAME,
    description: "PortHole helper — local dev server scanner and controller",
    path: wrapper,
    type: "stdio",
    allowed_origins: ids.map((id) => `chrome-extension://${id}/`),
  }, null, 2);

  const dirs = browserDirs();
  if (!dirs.length) {
    console.error("No Chrome-family browser found on this machine.");
    process.exit(1);
  }
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${HOST_NAME}.json`), manifest);
    console.log(`Registered: ${path.join(dir, `${HOST_NAME}.json`)}`);
  }

  console.log(`
Done. Open the PortHole popup in Chrome (reload the extension if it was open).

Optional — to enable START/RESTART/STOP per project, create
${path.join(PORTHOLE_DIR, "projects.json")}
(an example is at ${example}).`);
}

function uninstall() {
  let removed = 0;
  for (const dir of browserDirs()) {
    const f = path.join(dir, `${HOST_NAME}.json`);
    if (fs.existsSync(f)) { fs.unlinkSync(f); console.log(`Removed: ${f}`); removed++; }
  }
  console.log(removed ? `Unregistered from ${removed} browser(s).` : "Nothing was registered.");
  console.log(`Host files and your registry remain in ${PORTHOLE_DIR} — delete that folder manually if you want a clean slate.`);
}

function status() {
  console.log(`Host directory: ${PORTHOLE_DIR} ${fs.existsSync(path.join(PORTHOLE_DIR, "host.js")) ? "(installed)" : "(not installed)"}`);
  for (const dir of browserDirs()) {
    const f = path.join(dir, `${HOST_NAME}.json`);
    if (fs.existsSync(f)) {
      const m = JSON.parse(fs.readFileSync(f, "utf8"));
      console.log(`Registered: ${f}\n  allowed: ${m.allowed_origins.join(", ")}`);
    }
  }
  const reg = path.join(PORTHOLE_DIR, "projects.json");
  console.log(`Registry: ${reg} ${fs.existsSync(reg) ? "(present)" : "(not created — START/STOP disabled)"}`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "install") install(args);
else if (cmd === "uninstall") uninstall();
else if (cmd === "status") status();
else {
  console.log(`PortHole helper — usage:
  npx porthole-helper install [extension-id ...]   register the native host
  npx porthole-helper uninstall                    unregister it
  npx porthole-helper status                       show what's registered`);
  process.exit(cmd ? 1 : 0);
}
