# PortHole Privacy Policy

_Last updated: 13 August 2026_

**PortHole does not collect, transmit, store, or sell any user data.**

## What the extension does

PortHole shows you which development servers are running on your own computer.
The extension popup asks a companion program on your machine (the "native
messaging host", which you install yourself) for a list of listening TCP ports,
and displays it.

## Where your data goes

Nowhere. Specifically:

- **No analytics, telemetry, or crash reporting.** The extension contains no
  tracking code of any kind.
- **No remote servers.** PortHole makes no network requests to any host on the
  internet. The only communication is between the extension and the companion
  program on the same machine, over Chrome's native messaging channel.
- **No account, no login.** There is nothing to sign up for.
- **No browsing data.** PortHole cannot read your tabs, history, cookies,
  bookmarks, or the content of any web page. It does not request the permissions
  that would allow this.

## What is processed locally

To build the list you see, the companion program reads, on your machine only:

- listening TCP ports and the processes that own them (via `lsof`)
- the working directory of those processes, to group them by project
- running Docker container names (via `docker ps`), to identify Supabase services
- a project registry file you create yourself (`~/.porthole/projects.json`)
- log files that PortHole itself wrote, for servers you started through it

This information is passed to the extension popup for display and is discarded
when the popup closes. It is never written anywhere except the local log files
described above, and never leaves your computer.

## Permissions

- **`nativeMessaging`** — the sole permission the extension requests. It allows
  the popup to talk to the companion program you installed. The companion
  program only answers extension IDs explicitly listed in its own configuration
  file at install time.

## Actions you take

When you click Start, Restart, Stop, or Kill, the companion program runs the
corresponding command on your machine (for example `npm run dev`, `docker stop`,
or sending a termination signal to a process you selected). These actions are
performed only when you click, and only against processes and directories on
your own computer.

## Source code

PortHole is open source. You can read exactly what it does at
https://github.com/LucDesvaux/porthole

## Contact

For questions about this policy, open an issue at
https://github.com/LucDesvaux/porthole/issues
