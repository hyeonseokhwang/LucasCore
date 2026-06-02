const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "ceo-ledger-9100-cdp");
fs.mkdirSync(outDir, { recursive: true });

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = path.join(root, "tmp-chrome-cdp-9100");
const port = 19100;
const targetUrl = "http://127.0.0.1:9100";

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
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(250);
    }
  }
  throw new Error("CDP endpoint did not become ready");
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
    });
  }

  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve({ ws, send, events });
    ws.onerror = (error) => reject(error);
  });
}

async function main() {
  const chrome = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--window-size=1800,1200",
    targetUrl,
  ], {
    detached: false,
    stdio: "ignore",
  });

  let cdp;
  try {
    const version = await waitForVersion();
    cdp = await createCdp(version.webSocketDebuggerUrl);
    const { send, events } = cdp;

    await send("Target.setDiscoverTargets", { discover: true });
    const targets = await getJson(`http://127.0.0.1:${port}/json`);
    const pageTarget = targets.find((target) => target.type === "page" && target.url.includes("127.0.0.1:9100")) || targets.find((target) => target.type === "page");
    if (!pageTarget) throw new Error("No page target found");

    const page = await createCdp(pageTarget.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Log.enable");
    await page.send("Page.navigate", { url: targetUrl });
    await page.send("Page.bringToFront");
    await sleep(1800);

    const textResult = await page.send("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    const metricsResult = await page.send("Runtime.evaluate", {
      expression: `({
        title: document.title,
        h1: document.querySelector('h1')?.innerText || '',
        directives: document.querySelectorAll('.card').length,
        agents: document.querySelectorAll('.agent-card').length,
        progressBars: document.querySelectorAll('.progress-bar').length,
        hasKorean: document.body.innerText.includes('CEO 지시 원장') && document.body.innerText.includes('에이전트 현황'),
        h1CodePoints: Array.from(document.querySelector('h1')?.innerText || '').map((ch) => ch.codePointAt(0).toString(16)),
        replacementChars: (document.body.innerText.match(/\\uFFFD/g) || []).length,
        questionRuns: (document.body.innerText.match(/\\?\\?/g) || []).length
      })`,
      returnByValue: true,
    });

    const screenshot = await page.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    const screenshotPath = path.join(outDir, "ceo-ledger-9100.png");
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const consoleEvents = page.events.filter((event) => event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded");
    const report = {
      at: new Date().toISOString(),
      url: targetUrl,
      screenshotPath,
      metrics: metricsResult.result.value,
      bodyTextSample: String(textResult.result.value || "").slice(0, 4000),
      consoleEvents,
    };
    const reportPath = path.join(outDir, "ceo-ledger-9100-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({ ok: true, screenshotPath, reportPath, metrics: report.metrics, consoleEvents: consoleEvents.length }, null, 2));
  } finally {
    try {
      if (cdp) await cdp.send("Browser.close");
    } catch {}
    await sleep(500);
    if (!chrome.killed) {
      try { chrome.kill(); } catch {}
    }
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
