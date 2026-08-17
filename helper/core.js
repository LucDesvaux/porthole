// PortHole core — port scanning, project registry, start/stop/kill logic.
// Shared by host.js (Chrome native messaging) and server.js (HTTP debug mode).
// Projects are configured in helper/projects.json (reloaded on every request):
//   { "<name>": { "dir": "...", "start": "npm run dev -- --port $PORT",
//                 "port": 5173, "supabase": true } }
// $PORT in the start command (and the PORT env var) is set from "port",
// which is how a project always gets the same port.
// No dependencies; uses lsof + docker + supabase CLIs.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");

const HELPER_PORT = 7799;
const PORTHOLE_DIR = path.join(os.homedir(), ".porthole");
// ~/.porthole/projects.json for npm installs; repo-local file for development
const REGISTRY_CANDIDATES = [
  path.join(PORTHOLE_DIR, "projects.json"),
  path.join(__dirname, "projects.json"),
];
const LOG_DIR = path.join(PORTHOLE_DIR, "logs");

const KNOWN_PORTS = {
  3000: "Next.js / dev",
  4173: "Vite preview",
  4321: "Astro",
  5432: "PostgreSQL",
  6379: "Redis",
  8000: "Django/FastAPI",
  8080: "Dev server",
  8787: "Wrangler",
  8888: "Jupyter",
  11434: "Ollama",
};

const SUPABASE_SERVICES = {
  kong: "Supabase API",
  db: "Supabase DB",
  studio: "Supabase Studio",
  inbucket: "Supabase Mail",
  analytics: "Supabase Analytics",
};

const IGNORE_COMMANDS = /^(rapportd|ControlCe|Dropbox|DropboxFi|Raycast|Fastmail|Spotify|Discord|Slack|1Password|Creative|Adobe|Google|Arc|Chrome|Safari|zoom|WhatsApp|Telegram|Notion|Figma|Logi|Elgato|corespeechd|sharingd|AirPlay)/i;

function sh(cmd, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, out) => resolve(err && !out ? null : out));
  });
}

function loadRegistry() {
  for (const p of REGISTRY_CANDIDATES) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch {
      // try next candidate
    }
  }
  return {};
}

// Where to write the registry: whichever candidate exists, else ~/.porthole
function registryPath() {
  return REGISTRY_CANDIDATES.find((p) => fs.existsSync(p)) || REGISTRY_CANDIDATES[0];
}

// Work out a start command from package.json. Frameworks whose dev script
// accepts a --port flag get one; everything else relies on the PORT env var
// that startProject already sets.
function inferStart(dir) {
  let scripts;
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts || {};
  } catch {
    return null;
  }
  const name = scripts.dev ? "dev" : scripts.start ? "start" : null;
  if (!name) return null;
  const takesPortFlag = /\b(vite|astro|next|nuxt|remix|svelte-kit|serve|http-server)\b/.test(String(scripts[name]));
  return takesPortFlag ? `npm run ${name} -- --port $PORT` : `npm run ${name}`;
}

function pickPort(preferred, registry) {
  const taken = new Set(Object.values(registry).map((c) => c.port).filter(Boolean));
  if (preferred && !taken.has(preferred)) return preferred;
  for (let p = 5173; p < 6000; p++) if (!taken.has(p)) return p;
  return null;
}

// One-click registration for a project we can see running: the directory comes
// from the process's cwd, so nothing has to be typed by hand.
function registerProject({ project, dir, port }) {
  if (!project || !dir) throw new Error("project and dir are required");
  if (!fs.existsSync(dir)) throw new Error(`directory not found: ${dir}`);
  const registry = loadRegistry();
  if (registry[project]) throw new Error(`"${project}" is already in the registry`);
  const start = inferStart(dir);
  if (!start) throw new Error(`no dev or start script in ${dir}/package.json — add this one by hand`);
  // only claim a Supabase stack if it lives under this dir, since `supabase
  // start` runs here
  const supabase = fs.existsSync(path.join(dir, "supabase", "config.toml"));
  registry[project] = { dir, start, port: pickPort(Number(port) || null, registry), supabase };
  const target = registryPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(registry, null, 2) + "\n");
  return { ok: true, project, entry: registry[project], registry: target };
}

async function getCwd(pid) {
  const out = await sh("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], 3000);
  if (!out) return null;
  const line = out.split("\n").find((l) => l.startsWith("n"));
  return line ? line.slice(1) : null;
}

async function dockerPortMap() {
  const out = await sh("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"], 15000);
  const map = new Map();
  if (!out) return map;
  for (const line of out.split("\n")) {
    const [name, ports] = line.split("\t");
    if (!name || !ports) continue;
    const m = name.match(/^supabase_([a-z_]+?)_(.+)$/);
    for (const pm of ports.matchAll(/0\.0\.0\.0:(\d+)->/g)) {
      map.set(Number(pm[1]), { container: name, service: m ? m[1] : null, project: m ? m[2] : null });
    }
  }
  return map;
}

async function listListeners() {
  const out = await sh("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]);
  const rows = [];
  if (!out) return rows;
  let pid = null, command = null;
  for (const line of out.split("\n")) {
    const tag = line[0], val = line.slice(1);
    if (tag === "p") pid = Number(val);
    else if (tag === "c") command = val;
    else if (tag === "n") {
      const m = val.match(/:(\d+)$/);
      if (m) rows.push({ pid, command, port: Number(m[1]) });
    }
  }
  return rows;
}

// HEAD the port with a short timeout: "up" = responded, "down" = refused/hung.
// Any HTTP status counts as alive — we only care that something is serving.
async function healthCheck(port) {
  // Vite/Astro often bind only to [::1], so probe both loopback addresses
  for (const host of ["127.0.0.1", "[::1]"]) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    try {
      await fetch(`http://${host}:${port}/`, { method: "HEAD", signal: ctrl.signal });
      return "up";
    } catch {
      // try next host
    } finally {
      clearTimeout(t);
    }
  }
  return "down";
}

function projectNameFromCwd(cwd) {
  if (!cwd || cwd === "/") return null;
  const parts = cwd.split("/").filter(Boolean);
  const generic = new Set(["site", "app", "web", "frontend", "backend", "src", "server", "client"]);
  let i = parts.length - 1;
  while (i > 0 && generic.has(parts[i])) i--;
  return parts[i] || null;
}

// Map a running server to a registry project name, if any
function registryMatch(registry, { cwd, dockerProject }) {
  if (dockerProject && registry[dockerProject]) return dockerProject;
  if (cwd) {
    for (const [name, cfg] of Object.entries(registry)) {
      if (cwd === cfg.dir || cwd.startsWith(cfg.dir + "/")) return name;
    }
  }
  return null;
}

async function buildReport() {
  const registry = loadRegistry();
  let [rows, docker] = await Promise.all([listListeners(), dockerPortMap()]);
  if (docker.size === 0) docker = await dockerPortMap(); // first docker CLI call can come back empty

  const byPort = new Map();
  for (const r of rows) {
    if (r.port === HELPER_PORT) continue;
    if (IGNORE_COMMANDS.test(r.command || "")) continue;
    if (/docker/i.test(r.command || "") && !docker.has(r.port)) continue;
    if (!byPort.has(r.port)) byPort.set(r.port, { ...r, docker: docker.get(r.port) || null });
  }

  const entries = await Promise.all(
    [...byPort.values()].map(async (r) => {
      const d = r.docker;
      let label, project, cwd = null, killType, killTarget, http, kind;
      if (d) {
        label = (d.service && SUPABASE_SERVICES[d.service]) || d.container;
        project = registryMatch(registry, { dockerProject: d.project }) || d.project || d.container;
        killType = "docker";
        killTarget = d.container;
        http = d.service !== "db";
        kind = "supabase";
      } else {
        cwd = await getCwd(r.pid);
        project = registryMatch(registry, { cwd }) || projectNameFromCwd(cwd) || r.command;
        label = KNOWN_PORTS[r.port] || (/node/i.test(r.command) ? "Node.js" : r.command);
        killType = "process";
        killTarget = String(r.pid);
        http = ![5432, 6379].includes(r.port);
        kind = "app";
      }
      const health = http ? await healthCheck(r.port) : null;
      const frontend = kind === "app" && http;
      return { port: r.port, pid: r.pid, command: r.command, label, project, cwd,
               http, kind, frontend, health, killType, killTarget, url: `http://localhost:${r.port}` };
    })
  );
  entries.sort((a, b) => a.port - b.port);

  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.project)) groups.set(e.project, []);
    groups.get(e.project).push(e);
  }
  // Configured projects that aren't (fully) running still get a card
  for (const name of Object.keys(registry)) {
    if (!groups.has(name)) groups.set(name, []);
  }

  const projects = [...groups.entries()].map(([name, servers]) => {
    const cfg = registry[name] || null;
    const appRunning = servers.some((s) => s.kind === "app");
    // Someone else squatting on this project's pinned port?
    let conflict = null;
    if (cfg && cfg.port && !appRunning) {
      const squatter = entries.find((e) => e.port === cfg.port && e.project !== name);
      if (squatter) conflict = { port: cfg.port, by: squatter.project, label: squatter.label,
                                 killType: squatter.killType, killTarget: squatter.killTarget };
    }
    return {
      name,
      servers,
      configured: !!cfg,
      port: cfg ? cfg.port : null,
      appRunning,
      supabaseRunning: servers.some((s) => s.kind === "supabase"),
      hasSupabase: cfg ? !!cfg.supabase : servers.some((s) => s.kind === "supabase"),
      conflict,
      logs: ["app", "supabase"].filter((w) =>
        fs.existsSync(path.join(LOG_DIR, `${name}-${w}.log`))),
    };
  });
  projects.sort((a, b) => a.name.localeCompare(b.name));
  return { generatedAt: new Date().toISOString(), projects };
}

function startProject(name, what) {
  const cfg = loadRegistry()[name];
  if (!cfg) throw new Error(`unknown project "${name}" — add it to helper/projects.json`);
  if (!fs.existsSync(cfg.dir)) throw new Error(`dir not found: ${cfg.dir}`);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${name}-${what}.log`);
  const log = fs.openSync(logPath, "a");
  const cmd = what === "supabase" ? "npx supabase start" : cfg.start;
  if (!cmd) throw new Error(`no start command configured for "${name}"`);
  fs.writeSync(log, `\n=== ${new Date().toISOString()} · ${cmd} ===\n`);
  const child = spawn("/bin/zsh", ["-lc", cmd], {
    cwd: cfg.dir,
    env: { ...process.env, PORT: String(cfg.port || "") },
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  return { started: cmd, cwd: cfg.dir, port: cfg.port, log: logPath };
}

async function kill(type, target) {
  if (type === "docker") {
    if (!/^[\w.-]+$/.test(target)) throw new Error("bad container name");
    const out = await sh("docker", ["stop", target], 30000);
    if (out === null) throw new Error("docker stop failed");
  } else {
    const pid = Number(target);
    if (!Number.isInteger(pid) || pid <= 1) throw new Error("bad pid");
    process.kill(pid, "SIGTERM");
  }
}

function tailLog(name, what, lines = 60) {
  if (!/^[\w.-]+$/.test(name || "") || !["app", "supabase"].includes(what)) throw new Error("bad params");
  const p = path.join(LOG_DIR, `${name}-${what}.log`);
  if (!fs.existsSync(p)) return { log: p, lines: [] };
  const data = fs.readFileSync(p, "utf8")
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "") // strip ANSI escapes
    .split("\n");
  return { log: p, lines: data.slice(-lines) };
}

// Stop a whole project: SIGTERM its app processes, `npx supabase stop` its stack.
async function stopProject(name, report) {
  const project = report.projects.find((p) => p.name === name);
  if (!project) throw new Error(`unknown project "${name}"`);
  const actions = [];
  for (const s of project.servers.filter((s) => s.kind === "app")) {
    try { process.kill(s.pid, "SIGTERM"); actions.push(`SIGTERM ${s.pid} (:${s.port})`); } catch {}
  }
  const cfg = loadRegistry()[name];
  if (project.supabaseRunning && cfg && cfg.supabase) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const log = fs.openSync(path.join(LOG_DIR, `${name}-supabase.log`), "a");
    fs.writeSync(log, `\n=== ${new Date().toISOString()} · npx supabase stop ===\n`);
    const child = spawn("/bin/zsh", ["-lc", "npx supabase stop"], {
      cwd: cfg.dir, detached: true, stdio: ["ignore", log, log],
    });
    child.unref();
    actions.push("npx supabase stop (background, ~15s)");
  }
  return { actions };
}

async function restartProject(name) {
  const report = await buildReport();
  const project = report.projects.find((p) => p.name === name);
  const appServers = project ? project.servers.filter((s) => s.kind === "app") : [];
  for (const s of appServers) {
    try { process.kill(s.pid, "SIGTERM"); } catch {}
  }
  if (appServers.length) await new Promise((r) => setTimeout(r, 1000));
  return startProject(name, "app");
}

// Uniform command dispatcher used by both transports.
async function handle(msg) {
  switch (msg.cmd) {
    case "servers":
      return buildReport();
    case "kill":
      await kill(msg.type, msg.target);
      return { ok: true };
    case "start":
      return { ok: true, ...startProject(msg.project, msg.what === "supabase" ? "supabase" : "app") };
    case "restart":
      return { ok: true, ...(await restartProject(msg.project)) };
    case "logs":
      return tailLog(msg.project, msg.what || "app");
    case "register":
      return registerProject(msg);
    case "stop":
      return { ok: true, ...(await stopProject(msg.project, await buildReport())) };
    case "stopall": {
      const report = await buildReport();
      const results = {};
      for (const p of report.projects) {
        if (!p.servers.length) continue;
        try { results[p.name] = (await stopProject(p.name, report)).actions; }
        catch (e) { results[p.name] = [String(e.message)]; }
      }
      return { ok: true, results };
    }
    default:
      throw new Error(`unknown cmd "${msg.cmd}"`);
  }
}

module.exports = { handle, buildReport, dockerPortMap, HELPER_PORT };
