#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const defaultOutDir = path.join(root, "data", "system-logs", "terminal-work-cdp-monitor");
const latestPath = path.join(root, "data", "terminal-work-cdp-monitor-latest.json");
const eventsPath = path.join(root, "data", "terminal-work-cdp-monitor-events.jsonl");

function parseArgs(argv) {
  const args = {
    cdpPort: Number(process.env.WORK_CDP_PORT || 9240),
    url: process.env.WORK_CDP_URL || "http://127.0.0.1:20085/?view=terminals&layout=columns&filter=all",
    api: process.env.WORK_CDP_API || "http://127.0.0.1:20086",
    chromePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    profile: process.env.WORK_CDP_PROFILE || path.join(root, "tmp-chrome-cdp-work-20085"),
    outDir: process.env.WORK_CDP_OUT_DIR || defaultOutDir,
    intervalMs: Number(process.env.WORK_CDP_INTERVAL_MS || 4000),
    startupWaitMs: Number(process.env.WORK_CDP_STARTUP_WAIT_MS || 3500),
    collapseAfterMs: Number(process.env.WORK_CDP_COLLAPSE_AFTER_MS || 12000),
    tailChars: Number(process.env.WORK_CDP_TAIL_CHARS || 500),
    cycles: Number(process.env.WORK_CDP_CYCLES || 0),
    once: false,
    screenshots: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const value = () => {
      if (next == null) throw new Error(`missing value for ${arg}`);
      index += 1;
      return next;
    };

    if (arg === "--cdp-port") args.cdpPort = Number(value());
    else if (arg === "--url") args.url = value();
    else if (arg === "--api") args.api = value();
    else if (arg === "--chrome") args.chromePath = value();
    else if (arg === "--profile") args.profile = value();
    else if (arg === "--out-dir") args.outDir = value();
    else if (arg === "--interval-ms") args.intervalMs = Number(value());
    else if (arg === "--startup-wait-ms") args.startupWaitMs = Number(value());
    else if (arg === "--collapse-after-ms") args.collapseAfterMs = Number(value());
    else if (arg === "--tail-chars") args.tailChars = Number(value());
    else if (arg === "--cycles") args.cycles = Number(value());
    else if (arg === "--once") args.once = true;
    else if (arg === "--no-screenshots") args.screenshots = false;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }

  args.intervalMs = Math.max(1000, args.intervalMs || 4000);
  args.startupWaitMs = Math.max(500, args.startupWaitMs || 3500);
  args.collapseAfterMs = Math.max(1000, args.collapseAfterMs || 12000);
  args.tailChars = Math.max(100, args.tailChars || 500);
  if (args.once) args.cycles = 1;
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node tools/terminal-work-cdp-resident-monitor.cjs [options]",
    "",
    "Options:",
    "  --cdp-port <n>          CDP port. Default: 9240",
    "  --url <url>             Fixed Work tab URL. Default: 20085 terminals columns",
    "  --api <url>             API origin for /api/sessions. Default: http://127.0.0.1:20086",
    "  --interval-ms <n>       Cycle interval. Default: 4000",
    "  --cycles <n>            Stop after n cycles. Default: 0 (forever)",
    "  --once                  One sample, then close owned Chrome",
    "  --no-screenshots        DOM/API detection only"
  ].join("\n");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET"
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`${res.statusCode} ${body.slice(0, 400)}`));
          return;
        }
        try {
          resolve(JSON.parse(body || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error(`timeout fetching ${url}`)));
    req.on("error", reject);
    req.end();
  });
}

async function cdpReady(port) {
  try {
    await requestJson(`http://127.0.0.1:${port}/json/version`);
    return true;
  } catch {
    return false;
  }
}

async function waitForVersion(port, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await requestJson(`http://127.0.0.1:${port}/json/version`);
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
      const waiter = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) waiter.reject(new Error(JSON.stringify(payload.error)));
      else waiter.resolve(payload.result);
      return;
    }
    events.push(payload);
  };

  function send(method, params = {}) {
    if (ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP socket not open for ${method}`));
    const messageId = ++id;
    ws.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(messageId, { resolve, reject });
      setTimeout(() => {
        if (!pending.has(messageId)) return;
        pending.delete(messageId);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000).unref?.();
    });
  }

  function close() {
    try { ws.close(); } catch {}
  }

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, events, close });
    ws.onerror = (error) => reject(error);
  });
}

async function ensureChrome(args) {
  if (await cdpReady(args.cdpPort)) {
    return { owned: false, process: null };
  }

  ensureDir(args.profile);
  const chrome = spawn(args.chromePath, [
    `--remote-debugging-port=${args.cdpPort}`,
    `--user-data-dir=${args.profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--window-size=1920,1080",
    args.url
  ], {
    detached: false,
    stdio: "ignore",
    windowsHide: true
  });

  await waitForVersion(args.cdpPort);
  return { owned: true, process: chrome };
}

async function ensureWorkPage(args) {
  const targets = await requestJson(`http://127.0.0.1:${args.cdpPort}/json`);
  const wantedOrigin = new URL(args.url).origin;
  let target = targets.find((item) => item.type === "page" && item.url && item.url.startsWith(wantedOrigin));

  if (!target) {
    const newTarget = await requestJson(`http://127.0.0.1:${args.cdpPort}/json/new?${encodeURIComponent(args.url)}`, { method: "PUT" });
    target = Array.isArray(newTarget) ? newTarget[0] : newTarget;
  }
  if (!target?.webSocketDebuggerUrl) throw new Error("No Work page target found");

  const page = await createCdp(target.webSocketDebuggerUrl);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Log.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });
  await page.send("Runtime.evaluate", {
    expression: "localStorage.setItem('lcc-core-terminal-layout', 'columns'); localStorage.setItem('lcc-core-terminal-filter', 'all');",
    returnByValue: true
  });
  await page.send("Page.navigate", { url: args.url });
  await page.send("Page.bringToFront");
  await sleep(args.startupWaitMs);
  return page;
}

async function fetchSessions(args) {
  const payload = await requestJson(`${args.api.replace(/\/$/, "")}/api/sessions`);
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload.sessions) ? payload.sessions : [];
  const byId = new Map();
  for (const row of rows) {
    const id = row.id || row.session_id || row.sessionId || row.name;
    if (!id) continue;
    const preview = row.preview_text || row.previewText || row.preview || row.last_output || "";
    byId.set(String(id), {
      id: String(id),
      name: row.name || "",
      status: row.status || "",
      preview: String(preview || ""),
      previewLength: String(preview || "").trim().length
    });
  }
  return byId;
}

async function extractDomState(page, args) {
  const result = await page.send("Runtime.evaluate", {
    expression: `(() => {
      const tailChars = ${JSON.stringify(args.tailChars)};
      const norm = (value) => String(value || '').replace(/\\r\\n/g, '\\n');
      const tail = (value) => norm(value).slice(-tailChars);
      const visible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const cards = Array.from(document.querySelectorAll('.terminal-card')).map((card, index) => {
        const terminal = card.querySelector('.xterm, .terminal-snapshot-preview, .static-terminal-preview, .xterm-preview');
        const title = card.querySelector('header strong')?.innerText || '';
        const select = card.querySelector('footer select');
        const rect = card.getBoundingClientRect();
        const terminalRect = terminal?.getBoundingClientRect();
        const text = norm(terminal?.textContent || '');
        return {
          index,
          title,
          sessionId: select?.value || title,
          status: card.querySelector('header em')?.innerText || '',
          cardTextLength: norm(card.textContent || '').trim().length,
          terminalTextLength: text.trim().length,
          terminalTail: tail(text),
          visible: visible(card),
          terminalVisible: visible(terminal),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          terminalRect: terminalRect ? { x: terminalRect.x, y: terminalRect.y, width: terminalRect.width, height: terminalRect.height } : null,
          terminalClass: terminal?.className || ''
        };
      });
      const layoutButtons = Array.from(document.querySelectorAll('.terminal-layout-toggle button')).map((button) => ({
        text: button.innerText.trim(),
        active: button.classList.contains('primary')
      }));
      return {
        href: location.href,
        title: document.title,
        layout: localStorage.getItem('lcc-core-terminal-layout'),
        viewport: { width: innerWidth, height: innerHeight },
        bodyTextLength: norm(document.body.innerText || '').trim().length,
        cardCount: cards.length,
        cards,
        layoutButtons
      };
    })()`,
    returnByValue: true
  });
  return result.result.value;
}

async function captureScreenshot(page, args, cycle) {
  if (!args.screenshots) return null;
  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  const screenshotPath = path.join(args.outDir, `work-20085-${String(cycle).padStart(4, "0")}-${stamp()}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return screenshotPath;
}

function hasMeaningfulText(text) {
  return String(text || "").replace(/\s+/g, "").length >= 20;
}

function assess(sample, previousBySession, startedAtMs, args) {
  const nowMs = Date.now();
  const problems = [];
  const collapses = [];
  const consoleErrorEvents = sample.consoleEvents.filter((event) => {
    const type = event?.params?.type;
    const level = event?.params?.entry?.level;
    return type === "error" || level === "error";
  });

  if (consoleErrorEvents.length > 0) problems.push("console-errors");
  if (!sample.dom.cardCount) problems.push("no-terminal-cards");

  for (const card of sample.dom.cards) {
    const api = sample.apiSessions[card.sessionId] || sample.apiSessions[card.title];
    const apiPreviewLength = api?.previewLength || 0;
    const domLength = card.terminalTextLength || 0;
    const prev = previousBySession.get(card.sessionId) || previousBySession.get(card.title) || null;
    const apiMeaningful = apiPreviewLength >= 50 || hasMeaningfulText(api?.preview);
    const domBlank = domLength < 10;
    const droppedToBlank = prev && prev.terminalTextLength >= 50 && domBlank;
    const oldEnough = nowMs - startedAtMs >= args.collapseAfterMs;

    if (apiMeaningful && domBlank && (oldEnough || droppedToBlank)) {
      collapses.push({
        code: oldEnough ? "t-plus-collapse" : "random-blank-drop",
        sessionId: card.sessionId,
        title: card.title,
        apiPreviewLength,
        domTerminalTextLength: domLength,
        previousDomTerminalTextLength: prev?.terminalTextLength ?? null,
        visible: card.visible,
        terminalVisible: card.terminalVisible,
        rect: card.rect,
        terminalRect: card.terminalRect,
        apiTail: String(api?.preview || "").slice(-300),
        domTail: card.terminalTail
      });
    }
  }

  if (collapses.length > 0) problems.push("terminal-preview-collapse");
  return {
    ok: problems.length === 0,
    problems,
    collapseCount: collapses.length,
    collapses,
    consoleEvents: sample.consoleEvents.length,
    consoleErrorEvents: consoleErrorEvents.length
  };
}

function appendEvent(event) {
  ensureDir(path.dirname(eventsPath));
  fs.appendFileSync(eventsPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function writeLatest(state) {
  ensureDir(path.dirname(latestPath));
  fs.writeFileSync(latestPath, JSON.stringify(state, null, 2), "utf8");
}

function sessionsObject(map) {
  const out = {};
  for (const [key, value] of map.entries()) out[key] = value;
  return out;
}

async function runCycle(page, args, cycle, previousBySession, startedAtMs) {
  const apiSessions = await fetchSessions(args);
  const dom = await extractDomState(page, args);
  const screenshotPath = await captureScreenshot(page, args, cycle);
  const consoleEvents = page.events.splice(0).filter((event) => event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded");
  const sample = {
    at: new Date().toISOString(),
    cycle,
    monitorUptimeMs: Date.now() - startedAtMs,
    url: args.url,
    api: args.api,
    screenshotPath,
    dom,
    apiSessions: sessionsObject(apiSessions),
    consoleEvents
  };
  const assessment = assess(sample, previousBySession, startedAtMs, args);
  const report = { ...sample, assessment };
  const reportPath = path.join(args.outDir, `work-20085-${String(cycle).padStart(4, "0")}-${stamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  for (const card of dom.cards) {
    previousBySession.set(card.sessionId, { terminalTextLength: card.terminalTextLength, at: sample.at });
    if (card.title) previousBySession.set(card.title, { terminalTextLength: card.terminalTextLength, at: sample.at });
  }

  const latest = {
    at: sample.at,
    ok: assessment.ok,
    cycle,
    reportPath,
    screenshotPath,
    url: args.url,
    api: args.api,
    cardCount: dom.cardCount,
    layout: dom.layout,
    viewport: dom.viewport,
    problems: assessment.problems,
    collapseCount: assessment.collapseCount,
    collapses: assessment.collapses,
    consoleErrorEvents: assessment.consoleErrorEvents
  };
  writeLatest(latest);
  appendEvent({ type: assessment.ok ? "work_cdp_sample_ok" : "work_cdp_sample_problem", ...latest });
  console.log(JSON.stringify(latest));
  return latest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  ensureDir(args.outDir);
  const chrome = await ensureChrome(args);
  let page = null;
  const previousBySession = new Map();
  const startedAtMs = Date.now();
  let stop = false;

  const stopHandler = () => { stop = true; };
  process.on("SIGINT", stopHandler);
  process.on("SIGTERM", stopHandler);

  try {
    page = await ensureWorkPage(args);
    for (let cycle = 1; !stop; cycle += 1) {
      await runCycle(page, args, cycle, previousBySession, startedAtMs);
      if (args.cycles > 0 && cycle >= args.cycles) break;
      await sleep(args.intervalMs);
    }
  } finally {
    if (page) page.close();
    if (args.once && chrome.owned) {
      try {
        const version = await waitForVersion(args.cdpPort, 1000);
        const browser = await createCdp(version.webSocketDebuggerUrl);
        await browser.send("Browser.close").catch(() => undefined);
        browser.close();
      } catch {}
      await sleep(500);
      if (chrome.process && !chrome.process.killed) {
        try { chrome.process.kill(); } catch {}
      }
    }
  }
}

main().catch((error) => {
  appendEvent({ type: "work_cdp_monitor_error", message: error.message, stack: error.stack });
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
