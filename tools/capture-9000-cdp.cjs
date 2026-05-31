const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "terminal-9000-cdp");
fs.mkdirSync(outDir, { recursive: true });

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = path.join(root, "tmp-chrome-cdp-9000");
const port = 19101;
const targetUrl = process.argv[2] || "http://127.0.0.1:9000";
const captureName = process.argv[3] || "terminal-9000-columns";

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
    await cdp.send("Target.setDiscoverTargets", { discover: true });
    const targets = await getJson(`http://127.0.0.1:${port}/json`);
    const pageTarget = targets.find((target) => target.type === "page" && target.url.includes("127.0.0.1:9000")) || targets.find((target) => target.type === "page");
    if (!pageTarget) throw new Error("No page target found");

    const page = await createCdp(pageTarget.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Log.enable");
    await page.send("Runtime.evaluate", {
      expression: "localStorage.setItem('lcc-core-terminal-layout', 'columns')",
      returnByValue: true,
    });
    await page.send("Page.navigate", { url: targetUrl });
    await page.send("Page.bringToFront");
    await sleep(2200);

    const metricsResult = await page.send("Runtime.evaluate", {
      expression: `({
        title: document.title,
        href: window.location.href,
        search: window.location.search,
        h1: document.querySelector('h1')?.innerText || '',
        layout: localStorage.getItem('lcc-core-terminal-layout'),
        gridHasColumnsClass: !!document.querySelector('.terminal-grid.columns'),
        terminalCards: document.querySelectorAll('.terminal-card').length,
        isPopout: !!document.querySelector('.terminal-popout-page'),
        popoutFooterVisible: (() => {
          const footer = document.querySelector('.terminal-popout-page footer');
          if (!footer) return false;
          const rect = footer.getBoundingClientRect();
          return rect.height > 0 && rect.bottom <= window.innerHeight && rect.top >= 0;
        })(),
        popoutTextareaVisible: (() => {
          const textarea = document.querySelector('.terminal-popout-page textarea');
          if (!textarea) return false;
          const rect = textarea.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && rect.bottom <= window.innerHeight;
        })(),
        layoutButtons: Array.from(document.querySelectorAll('.terminal-layout-toggle button')).map((button) => button.innerText.trim()),
        horizontalScrollable: (() => {
          const grid = document.querySelector('.terminal-grid');
          return grid ? grid.scrollWidth > grid.clientWidth : false;
        })(),
        consoleText: document.body.innerText.slice(0, 500)
      })`,
      returnByValue: true,
    });

    const screenshot = await page.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const screenshotPath = path.join(outDir, `${captureName}.png`);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const consoleEvents = page.events.filter((event) => event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded");
    const report = {
      at: new Date().toISOString(),
      url: targetUrl,
      screenshotPath,
      metrics: metricsResult.result.value,
      consoleEvents,
    };
    const reportPath = path.join(outDir, `${captureName}-report.json`);
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
