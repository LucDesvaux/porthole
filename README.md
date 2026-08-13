# PortHole

A window onto your local dev servers. See what's running on your Mac — grouped by project, straight from a Chrome toolbar popup — open them, start them, restart them, kill them, and pin each project to its own port.

Two parts:

- **`helper/`** — a zero-dependency Node **native messaging host** (`host.js` + `core.js`). Chrome spawns it on demand; nothing runs in the background. It scans listening TCP ports with `lsof`, labels them (Vite, Next.js, Supabase API/Studio/DB, Postgres, …), and **groups servers by project**: regular processes via their working directory, Docker/Supabase ports via `docker ps` container names (`supabase_studio_<project>` → project). It can kill servers (SIGTERM / `docker stop`), start, restart, and stop whole projects. OS/app noise (Dropbox, Raycast, AirPlay, …) is filtered out, and the host only answers the extension ID registered at install time.
- **`extension/`** — a Manifest V3 Chrome extension with a terminal-styled popup: servers grouped by project, click a card to open it (non-HTTP ports like Postgres shown but not clickable), KILL/START/RESTART/STOP controls, log viewer, health dots.

## Setup

1. **Load the extension**
   - Open `chrome://extensions`
   - Enable **Developer mode** (top right)
   - Click **Load unpacked** and select the `extension/` folder
   - Pin "PortHole" to the toolbar

2. **Register the native helper**

   ```bash
   ./helper/install.sh
   ```

   This derives the unpacked extension's ID from its path and writes the
   `com.porthole.helper` manifest into every installed Chrome-family browser.
   If the popup says HELPER NOT CONNECTED, the derived ID didn't match — copy
   the real ID from `chrome://extensions` and rerun `./helper/install.sh <id>`.

No always-on process needed: Chrome launches `helper/host.js` per request and it
exits after answering.

## Debug mode (optional)

`node helper/server.js` serves the same commands over HTTP for curl:
`GET /servers`, `POST /kill?type=&target=`, `POST /start?project=&what=app|supabase`,
`POST /restart?project=`, `GET /logs?project=&what=`, `POST /stop?project=`, `POST /stopall`.

## Project registry (`helper/projects.json`)

Copy `helper/projects.example.json` to `helper/projects.json` (git-ignored — it's personal to your machine) and map each project to its directory, start command, pinned port, and whether it has a Supabase stack:

```json
"my-app": {
  "dir": "/path/to/my-app",
  "start": "npm run dev -- --port $PORT",
  "port": 5173,
  "supabase": true
}
```

- Registered projects appear in the popup even when **offline**, with **START APP** / **START DB** buttons; running ones get **RESTART**.
- `$PORT` in the start command (and the `PORT` env var) is filled from `port` — that's how a project always gets the same port. Works with `vite --port`, `astro dev --port`, Next.js (`PORT` env), etc.
- **START DB** runs `npx supabase start` in the project dir (takes ~30s; hit RESCAN).
- Start/restart output is logged to `~/.local-servers-logs/<project>-<what>.log`.
- The file is re-read on every request — edit it and just reopen the popup.

## Other features

- **Health dots** — green pulsing = serving; amber blinking = port open but not answering HTTP (hung, or a non-HTTP service like Supabase Analytics).
- **Log viewer** — LOG / DB LOG buttons tail `~/.local-servers-logs/` inline (ANSI-stripped).
- **Port-conflict warning** — if a project's pinned port is squatted by something else, an amber banner appears with a one-click **KILL & START**.
- **Copy buttons** — ⧉ copies a server's URL; on Supabase DB rows it copies the Postgres connection string.
- **STOP / STOP ALL** — stop a whole project (SIGTERM app + `npx supabase stop`), or everything at once.
- **Auto-refresh** — the popup rescans every 5s while open.

## Customizing

- Add port labels in `KNOWN_PORTS` in `helper/core.js`.
- Add noisy processes to `IGNORE_COMMANDS` there too.
