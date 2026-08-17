const HOST = "com.porthole.helper";
const content = document.getElementById("content");
const countEl = document.getElementById("count");
const statusEl = document.getElementById("status");
const openLogs = new Set(); // "project/what" panels kept open across refreshes

function elem(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const shortenCwd = (cwd) => (cwd ? cwd.replace(/^\/Users\/[^/]+/, "~") : "");

// One request/response per native host invocation; Chrome spawns the host on demand
async function native(msg) {
  const body = await chrome.runtime.sendNativeMessage(HOST, msg);
  if (!body) throw new Error(chrome.runtime.lastError?.message || "no response from helper");
  if (body.error) throw new Error(body.error);
  return body;
}

async function post(msg, okMsg, refreshDelay) {
  statusEl.textContent = "working…";
  try {
    await native(msg);
    statusEl.textContent = okMsg;
    setTimeout(load, refreshDelay);
  } catch (e) {
    statusEl.textContent = "ERROR: " + e.message;
    load();
  }
}

function actionBtn(cls, text, title, onClick) {
  const b = elem("button", cls, text);
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    b.disabled = true;
    onClick(b);
  });
  return b;
}

function copyBtn(value, title) {
  return actionBtn("copy", "⧉", title, (b) => {
    navigator.clipboard.writeText(value);
    b.textContent = "✓";
    setTimeout(() => { b.textContent = "⧉"; b.disabled = false; }, 900);
  });
}

function copyValue(s) {
  if (s.label === "Supabase DB")
    return [`postgresql://postgres:postgres@127.0.0.1:${s.port}/postgres`, "copy connection string"];
  return [s.url, "copy URL"];
}

function renderServer(s) {
  const row = elem("div", "server" + (s.http ? "" : " no-http"));
  const dot = elem("span", "dot", "●");
  if (s.health === "down") { dot.classList.add("down"); dot.title = "port open but not responding"; }
  row.appendChild(dot);

  if (s.http) {
    row.classList.add("clickable");
    row.title = `open ${s.url}`;
    row.addEventListener("click", () => chrome.tabs.create({ url: s.url }));
  }
  const main = elem("div", "main");
  const line1 = elem("div");
  line1.appendChild(elem("span", s.http ? "link" : "label-plain", s.label));
  line1.appendChild(document.createTextNode(" "));
  line1.appendChild(elem("span", "port", ":" + s.port));
  if (s.frontend) line1.appendChild(elem("span", "tag", "FE"));
  main.appendChild(line1);
  const meta = elem("div", "meta", s.cwd ? shortenCwd(s.cwd) : `pid ${s.pid} · ${s.command}`);
  meta.title = s.cwd || "";
  main.appendChild(meta);
  row.appendChild(main);

  row.appendChild(copyBtn(...copyValue(s)));
  row.appendChild(actionBtn("kill", "KILL",
    s.killType === "docker" ? `docker stop ${s.killTarget}` : `SIGTERM pid ${s.pid}`,
    () => post({ cmd: "kill", type: s.killType, target: s.killTarget },
               `killed :${s.port}`, s.killType === "docker" ? 1200 : 400)));
  return row;
}

async function renderLogPanel(name, what) {
  const panel = elem("pre", "logpanel", "loading…");
  try {
    const body = await native({ cmd: "logs", project: name, what });
    panel.textContent = body.lines.join("\n").trim() || "(empty)";
    panel.scrollTop = panel.scrollHeight;
  } catch {
    panel.textContent = "failed to load log";
  }
  return panel;
}

function renderProject(p) {
  const group = elem("div", "group");
  const head = elem("div", "group-head");
  head.appendChild(elem("div", "group-name", p.name));

  const actions = elem("div", "group-actions");
  for (const what of p.logs || []) {
    const key = `${p.name}/${what}`;
    const b = actionBtn("act", what === "app" ? "LOG" : "DB LOG", `tail ~/.porthole/logs/${p.name}-${what}.log`,
      async (btn) => {
        btn.disabled = false;
        if (openLogs.has(key)) { openLogs.delete(key); load(); return; }
        openLogs.add(key);
        group.appendChild(await renderLogPanel(p.name, what));
      });
    actions.appendChild(b);
  }
  const busy = (p.pending || []);
  const busyApp = busy.some((b) => b.what === "app");
  const busySupabase = busy.some((b) => b.what === "supabase");

  if (p.configured) {
    if (busyApp) {
      // start in flight — no button, the progress row below says what's happening
    } else if (p.appRunning) {
      actions.appendChild(actionBtn("act", "RESTART", "kill app process, then run start command",
        () => post({ cmd: "restart", project: p.name }, `restarting ${p.name}…`, 2500)));
    } else if (!p.conflict) {
      actions.appendChild(actionBtn("act go", "START APP",
        `run start command${p.port ? ` on :${p.port}` : ""}`,
        () => post({ cmd: "start", project: p.name, what: "app" }, `starting ${p.name}…`, 2500)));
    }
    if (p.hasSupabase && !p.supabaseRunning && !busySupabase) {
      actions.appendChild(actionBtn("act go", "START DB",
        "npx supabase start — a first run pulls Docker images and can take several minutes",
        () => post({ cmd: "start", project: p.name, what: "supabase" }, `starting supabase for ${p.name}…`, 1500)));
    }
  } else {
    // Not in the registry yet — offer one-click setup when a running process
    // tells us where the project lives
    const app = p.servers.find((s) => s.kind === "app" && s.cwd && s.cwd !== "/");
    if (app) {
      actions.appendChild(actionBtn("act add", "+ SETUP",
        `add ${p.name} to the registry (pins :${app.port}) to enable start, restart and stop`,
        () => post({ cmd: "register", project: p.name, dir: app.cwd, port: app.port },
                   `${p.name} added — start/restart enabled`, 600)));
    }
  }
  if (p.servers.length) {
    actions.appendChild(actionBtn("act stop", "STOP", "stop app + supabase for this project",
      () => post({ cmd: "stop", project: p.name }, `stopping ${p.name}…`, 2000)));
  }
  head.appendChild(actions);
  group.appendChild(head);

  if (p.conflict) {
    const c = elem("div", "conflict",
      `⚠ :${p.conflict.port} taken by ${p.conflict.by} (${p.conflict.label})`);
    c.appendChild(actionBtn("act stop", "KILL & START", "free the port, then start this project",
      async () => {
        await native({ cmd: "kill", type: p.conflict.killType, target: p.conflict.killTarget }).catch(() => {});
        setTimeout(() => post({ cmd: "start", project: p.name, what: "app" }, `starting ${p.name} on :${p.port}…`, 2500), 800);
      }));
    group.appendChild(c);
  }

  for (const b of busy) {
    const secs = Math.max(0, Math.round((Date.now() - b.startedAt) / 1000));
    const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    const row = elem("div", "working");
    row.appendChild(elem("span", "spin", "◐"));
    const body = elem("div", "main");
    body.appendChild(elem("div", "working-title",
      `${b.what === "supabase" ? "STARTING SUPABASE" : "STARTING APP"} · ${mmss}`));
    if (b.last) body.appendChild(elem("div", "meta", b.last));
    row.appendChild(body);
    group.appendChild(row);
  }

  if (!p.servers.length && !p.conflict && !busy.length) {
    group.appendChild(elem("div", "meta idle", `offline${p.port ? ` · pinned :${p.port}` : ""}`));
  }
  for (const s of p.servers) group.appendChild(renderServer(s));

  for (const what of p.logs || []) {
    if (openLogs.has(`${p.name}/${what}`)) {
      renderLogPanel(p.name, what).then((panel) => group.appendChild(panel));
    }
  }
  return group;
}

function render(data) {
  content.textContent = "";
  const total = data.projects.reduce((n, p) => n + p.servers.length, 0);
  countEl.textContent = String(total).padStart(2, "0");
  const running = data.projects.filter((p) => p.servers.length);
  const stopped = data.projects.filter((p) => !p.servers.length);
  for (const p of running) content.appendChild(renderProject(p));
  if (stopped.length) {
    content.appendChild(elem("div", "section", "// OFFLINE PROJECTS"));
    for (const p of stopped) content.appendChild(renderProject(p));
  }
  if (!data.projects.length) content.appendChild(elem("p", "muted", "NO DEV SERVERS DETECTED."));

  if (running.length) {
    const bar = elem("div", "stopall-bar");
    bar.appendChild(actionBtn("act stop", "STOP ALL", "stop every project (apps + supabase stacks)",
      () => post({ cmd: "stopall" }, "stopping everything…", 3000)));
    content.appendChild(bar);
  }
  statusEl.textContent = `native host · last scan ${new Date(data.generatedAt).toLocaleTimeString()}`;
}

function renderError() {
  content.textContent = "";
  countEl.textContent = "--";
  const box = elem("div", "onboard");
  box.appendChild(elem("p", "onboard-title", "ONE-TIME SETUP"));
  box.appendChild(elem("p", "muted",
    "Chrome can't see your local ports — a small open-source helper does the scanning. Install it once (needs Node.js):"));

  const cmd = `npx porthole-helper install ${chrome.runtime.id}`;
  const cmdRow = elem("div", "cmd");
  cmdRow.appendChild(elem("code", "", cmd));
  cmdRow.appendChild(copyBtn(cmd, "copy command"));
  box.appendChild(cmdRow);

  box.appendChild(elem("p", "muted", "Run it in any terminal, then click RESCAN above."));
  const src = elem("a", "srclink", "source code & docs →");
  src.href = "https://github.com/LucDesvaux/porthole";
  src.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: src.href });
  });
  box.appendChild(src);
  content.appendChild(box);
  statusEl.textContent = "helper not installed";
}

let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  try {
    render(await native({ cmd: "servers" }));
  } catch (e) {
    renderError();
    if (e.message && !/not found|native messaging host/i.test(e.message)) {
      statusEl.textContent = "ERROR: " + e.message;
    }
  } finally {
    loading = false;
  }
}

// Match the toolbar icon to the browser theme: white glyph on dark, black on light
function syncIcon(dark) {
  const suffix = dark ? "-white" : "";
  chrome.action.setIcon({
    path: Object.fromEntries([16, 32, 48].map((s) => [s, `icon${s}${suffix}.png`])),
  });
}
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
syncIcon(darkQuery.matches);
darkQuery.addEventListener("change", (e) => syncIcon(e.matches));

document.getElementById("refresh").addEventListener("click", load);
load();
setInterval(load, 5000); // auto-refresh while popup is open