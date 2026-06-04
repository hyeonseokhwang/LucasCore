const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "terminal-9000-cdp");
fs.mkdirSync(outDir, { recursive: true });

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, "true");
  }
}

const chromePath = args.get("chrome") || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(args.get("port") || 19107);
const intervalMs = Number(args.get("interval-ms") || 5000);
const maxSamples = Number(args.get("max-samples") || 0);
const label = args.get("label") || "terminal-watch";
const targetUrl = args.get("url") || "http://127.0.0.1:9000/?view=terminals&filter=executive&layout=columns";
const viewport = (args.get("viewport") || "1800x1200").split("x").map((value) => Number(value));
const userDataDir = args.get("user-data-dir") || path.join(root, "tmp-chrome-cdp-9000-watch");
const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
const runName = `${label}-${startedAt}`;
const jsonlPath = path.join(outDir, `${runName}.jsonl`);
const latestPath = path.join(outDir, `${label}-latest.json`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

async function waitForVersion() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`CDP endpoint did not become ready on ${port}`);
}

function createCdp(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.onmessage = (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(JSON.stringify(payload.error)));
      else resolve(payload.result);
      return;
    }
    events.push(payload);
  };

  function send(method, params = {}) {
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(messageId, { resolve, reject });
      setTimeout(() => {
        if (!pending.has(messageId)) return;
        pending.delete(messageId);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10_000);
    });
  }

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, events });
    ws.onerror = (error) => reject(error);
  });
}

async function waitForPageTarget() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const targets = await getJson(`http://127.0.0.1:${port}/json`);
    const pageTarget = targets.find((target) => target.type === "page" && target.url.includes("127.0.0.1:9000")) || targets.find((target) => target.type === "page");
    if (pageTarget) return pageTarget;
    await sleep(250);
  }
  throw new Error("No page target found");
}

function detectResidue(text) {
  const lines = String(text || "").split(/\r?\n/);
  const tokenPattern = /^(?:[•◦]?\s*)?(?:\[[0-9;?]*[A-Za-z]\s*)*(?:(?:W|Wo|Wng|Wog|or|rk|ki|in|ng|g|in\d+|ng\d+|\d+)\s*)+$/;
  const hits = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (tokenPattern.test(trimmed)) {
      hits.push(trimmed);
    }
  }
  return hits.slice(-12);
}

async function main() {
  const width = Number.isFinite(viewport[0]) ? viewport[0] : 1800;
  const height = Number.isFinite(viewport[1]) ? viewport[1] : 1200;
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    `--window-size=${width},${height}`,
    targetUrl,
  ], {
    detached: false,
    stdio: "ignore",
  });

  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  try {
    await waitForVersion();
    const pageTarget = await waitForPageTarget();
    const page = await createCdp(pageTarget.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.navigate", { url: targetUrl });
    await sleep(2500);

    let sample = 0;
    while (!maxSamples || sample < maxSamples) {
      sample += 1;
      const at = new Date().toISOString();
      const textResult = await page.send("Runtime.evaluate", {
        expression: `({
          href: window.location.href,
          title: document.title,
          text: document.body.innerText,
          terminalCards: document.querySelectorAll('.terminal-card').length,
          popouts: document.querySelectorAll('.terminal-popout-page').length,
          scrollY: window.scrollY
        })`,
        returnByValue: true,
      });
      const value = textResult.result.value;
      const residueHits = detectResidue(value.text);
      const screenshot = await page.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const screenshotPath = path.join(outDir, `${runName}-${String(sample).padStart(4, "0")}.png`);
      fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
      const entry = {
        at,
        sample,
        url: targetUrl,
        screenshotPath,
        hasResidue: residueHits.length > 0,
        residueHits,
        metrics: {
          href: value.href,
          title: value.title,
          terminalCards: value.terminalCards,
          popouts: value.popouts,
          scrollY: value.scrollY,
          textLength: String(value.text || "").length,
        },
        textTail: String(value.text || "").slice(-3000),
      };
      fs.appendFileSync(jsonlPath, `${JSON.stringify(entry)}\n`, "utf8");
      fs.writeFileSync(latestPath, JSON.stringify({ jsonlPath, ...entry }, null, 2), "utf8");
      await sleep(intervalMs);
    }
  } finally {
    if (!chrome.killed) {
      try { chrome.kill(); } catch {}
    }
  }
}

main().catch((error) => {
  fs.appendFileSync(jsonlPath, `${JSON.stringify({ at: new Date().toISOString(), error: error.stack || String(error) })}\n`, "utf8");
  process.exit(1);
});
