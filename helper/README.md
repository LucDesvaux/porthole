# porthole-helper

Native messaging helper for [PortHole](https://github.com/LucDesvaux/porthole),
the Chrome extension that shows every dev server running on your machine —
grouped by project — and lets you open, start, restart, or kill them.

A browser extension can't see which local ports are listening; this small
zero-dependency companion does the scanning (via `lsof` and `docker ps`) and is
invoked by Chrome on demand through native messaging. Nothing runs in the
background, and nothing ever leaves your machine.

## Install

1. Install the PortHole extension from the Chrome Web Store.
2. Open the popup — it shows the exact command to run, including your extension ID:

   ```sh
   npx porthole-helper install <extension-id>
   ```

3. Click RESCAN in the popup. Done.

The installer copies the host to `~/.porthole/` and registers it with every
Chrome-family browser on your machine (Chrome, Chromium, Brave, Edge).

macOS and Linux, Node.js ≥ 18. Windows is not supported yet.

## Optional: project registry

Create `~/.porthole/projects.json` (an example is placed next to it at install
time) to unlock START / RESTART / STOP buttons and pinned ports per project:

```json
{
  "my-app": {
    "dir": "/Users/you/Projects/my-app",
    "start": "npm run dev -- --port $PORT",
    "port": 5173,
    "supabase": true
  }
}
```

## Other commands

```sh
npx porthole-helper status      # what's registered, where
npx porthole-helper uninstall   # remove the browser registrations
```

MIT · source: https://github.com/LucDesvaux/porthole
