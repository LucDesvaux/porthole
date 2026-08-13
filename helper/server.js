#!/usr/bin/env node
// PortHole HTTP debug server — optional; the extension talks native messaging
// (helper/host.js) instead. Handy for curl: node helper/server.js
//   GET /servers · POST /kill?type=&target= · POST /start?project=&what=
//   POST /restart?project= · GET /logs?project=&what= · POST /stop?project=
//   POST /stopall

const http = require("http");
const { handle, dockerPortMap, HELPER_PORT } = require("./core");

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !origin.startsWith("chrome-extension://")) {
    res.writeHead(403).end();
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }

  const url = new URL(req.url, "http://localhost");
  const msg = { cmd: url.pathname.slice(1) };
  for (const [k, v] of url.searchParams) msg[k] = v;
  try {
    const body = await handle(msg);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body, null, 2));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(HELPER_PORT, "127.0.0.1", () => {
  console.log(`PortHole debug server at http://127.0.0.1:${HELPER_PORT}/servers`);
  dockerPortMap(); // warm up the docker CLI
});