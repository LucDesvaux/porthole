#!/usr/bin/env node
// PortHole native messaging host. Chrome spawns this process per request
// (chrome.runtime.sendNativeMessage), sends one length-prefixed JSON message
// on stdin, and reads one length-prefixed JSON response from stdout.
// Registered via helper/install.sh — never run manually.

const { handle } = require("./core");

function send(obj) {
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
}

let buf = Buffer.alloc(0);
let responded = false;

process.stdin.on("data", async (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  if (responded || buf.length < 4) return;
  const len = buf.readUInt32LE(0);
  if (buf.length < 4 + len) return;
  responded = true;
  let msg;
  try {
    msg = JSON.parse(buf.subarray(4, 4 + len).toString("utf8"));
  } catch {
    send({ error: "bad message" });
    process.exit(0);
  }
  try {
    send(await handle(msg));
  } catch (e) {
    send({ error: String(e.message || e) });
  }
  process.exit(0);
});

// Don't exit on stdin end while a command is still being handled —
// the handler path exits itself after responding.
process.stdin.on("end", () => { if (!responded) process.exit(0); });
setTimeout(() => process.exit(0), 60000); // safety net