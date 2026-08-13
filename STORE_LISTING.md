# Chrome Web Store listing — copy & paste

Everything below is ready to paste into the Developer Dashboard when submitting
`porthole.zip`. Nothing here needs editing except where marked **[TODO]**.

---

## Item name

```
PortHole
```

## Short description (132 char max — currently 92)

```
A window onto your local dev servers — see, open, start, and kill them, grouped by project.
```

## Category

Developer Tools

## Language

English (United Kingdom)

---

## Detailed description

```
Stop guessing what's running on localhost.

If you juggle several projects at once — a Vite frontend here, an Astro site
there, three Supabase stacks in Docker — you lose track of which ports are
taken, which server belongs to which project, and what's still eating memory
from yesterday. PortHole puts all of it in one popup.

WHAT YOU GET

• Everything grouped by project. PortHole works out which project each server
  belongs to from its working directory, and reads Docker container names to
  match Supabase services to the right stack — so you finally know which
  Supabase Studio is which.

• One click to open. Click any server card to open it in a new tab. Ports that
  aren't web servers (Postgres, Redis) are listed but not clickable.

• Start, restart and stop. Register a project once with its folder and start
  command, and PortHole can launch it, restart it, or shut it down — app and
  Supabase stack together — without touching a terminal.

• Pinned ports. Give each project a fixed port in the registry and it gets that
  port every time. If something else has squatted on it, PortHole warns you and
  offers to free the port and start your project in one click.

• Health at a glance. A green dot means the server is answering. Amber means the
  port is open but nothing is responding — the hung dev server you'd otherwise
  spend ten minutes debugging.

• Logs without hunting. Tail the output of anything PortHole started, right in
  the popup.

• Copy what you need. One click copies a server's URL, or the full Postgres
  connection string for a Supabase database.

• Stop everything. One button shuts down every dev server and Supabase stack
  when you're done for the day.

PRIVACY

PortHole makes no network requests, collects no data, and has no analytics. It
cannot read your tabs, history or page content — it doesn't request those
permissions. Everything happens on your own machine.

REQUIRES A ONE-TIME LOCAL SETUP

A browser extension cannot see which ports are open on your computer — that's a
security boundary Chrome enforces. PortHole therefore ships with a small
open-source companion program (Node.js, no dependencies) that you install once
from GitHub:

  git clone https://github.com/LucDesvaux/porthole
  cd porthole && ./helper/install.sh

Chrome starts the companion only when you open the popup, and it exits straight
after answering. Nothing runs in the background.

Currently supports macOS (Linux is included but untested). Requires Node.js.

Open source, MIT licensed: https://github.com/LucDesvaux/porthole
```

---

## Privacy practices tab

**Single purpose description**

```
PortHole displays the local development servers running on the user's own
computer and lets the user open, start, restart, or stop them. That is its only
function.
```

**Justification for `nativeMessaging`**

```
A Chrome extension cannot enumerate listening TCP ports — the browser sandbox
does not expose them. PortHole uses native messaging to ask a small companion
program, which the user installs themselves and which the user's own machine
authorises by extension ID, for the list of running local servers, and to carry
out the start/stop/kill actions the user clicks. There is no other way to build
this functionality.
```

**Data usage disclosures**: tick nothing. PortHole collects no user data.
Certify all three compliance checkboxes.

**Privacy policy URL**

```
https://github.com/LucDesvaux/porthole/blob/main/PRIVACY.md
```

---

## Reviewer notes (Account tab → "Notes for reviewers")

```
Testing this extension requires the companion native messaging host, since the
popup has nothing to display without it. Without the host installed the popup
shows "HELPER NOT CONNECTED" — that is the expected fallback, not a bug.

To test on macOS or Linux with Node.js installed:

  git clone https://github.com/LucDesvaux/porthole
  cd porthole
  ./helper/install.sh <the extension ID assigned to this item>

Then start any local web server (for example `python3 -m http.server 8000`) and
open the popup — it will be listed, and clicking it opens the page.

Full source, including the companion program, is at
https://github.com/LucDesvaux/porthole
```

---

## Graphics checklist

| Asset | Requirement | Status |
|---|---|---|
| Store icon | 128×128 PNG | `extension/icon128.png` ✅ |
| Screenshot | 1280×800 or 640×400, at least 1, up to 5 | `store/screenshot-1.png` ✅ |
| Small promo tile | 440×280 PNG (optional) | `store/promo-440x280.png` ✅ |
| Marquee promo tile | 1400×560 PNG (optional, for featuring) | not made |

---

## Submission steps **[requires your Google account]**

1. Register as a Chrome Web Store developer and pay the one-time $5 fee:
   https://chrome.google.com/webstore/devconsole
2. **Add new item** → upload `store/porthole.zip`. Do not publish yet.
3. Copy the item ID from the dashboard URL (32 letters) — this is the permanent
   extension ID.
4. Put it into `helper/install.sh` as `PUBLISHED_ID="…"`, commit, and push, so
   people installing from the store register the right ID.
5. Fill in the listing using the copy above, upload the graphics, complete the
   Privacy practices tab, and paste the reviewer notes.
6. Submit for review. Expect a few days; extensions using native messaging are
   sometimes looked at more closely.
