const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "terminal-9000-cdp");
fs.mkdirSync(outDir, { recursive: true });

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = path.join(root, "tmp-chrome-cdp-9000-tail");
const port = 19111;

function parseArgs(argv) {
  const positional = [];
  const args = {
    url: "http://127.0.0.1:9000/?view=terminals&layout=columns&filter=all",
    captureName: "terminal-tail",
    tailChars: 3000,
    session: "",
    fullscreen: false,
    waitMs: 2200,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--url") {
      args.url = value;
      i += 1;
    } else if (key === "--name") {
      args.captureName = value;
      i += 1;
    } else if (key === "--tail-chars") {
      args.tailChars = Number(value);
      i += 1;
    } else if (key === "--session") {
      args.session = value;
      i += 1;
    } else if (key === "--fullscreen") {
      args.fullscreen = true;
    } else if (key === "--wait-ms") {
      args.waitMs = Number(value);
      i += 1;
    } else {
      positional.push(key);
    }
  }

  if (positional[0]) args.url = positional[0];
  if (positional[1]) args.captureName = positional[1];
  if (positional[2]) args.tailChars = Number(positional[2]);
  args.tailChars = Math.max(500, args.tailChars || 3000);
  args.waitMs = Math.max(500, args.waitMs || 2200);
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
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

async function capturePng(page, captureName, suffix) {
  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(outDir, `${captureName}-${suffix}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return screenshotPath;
}

async function extractState(page, tailChars) {
  const result = await page.send("Runtime.evaluate", {
    expression: `(() => {
      const tailChars = ${JSON.stringify(tailChars)};
      const tail = (text) => String(text || '').slice(-tailChars);
      const normalize = (text) => String(text || '').replace(/\\r\\n/g, '\\n');
      const cardNodes = Array.from(document.querySelectorAll('.terminal-card'));
      const cards = cardNodes.map((card, index) => {
        const title = card.querySelector('header strong')?.innerText || '';
        const select = card.querySelector('footer select');
        const textarea = card.querySelector('footer textarea');
        const terminal = card.querySelector('.terminal-snapshot-preview, .static-terminal-preview, .xterm-preview, .xterm');
        const rect = card.getBoundingClientRect();
        return {
          index,
          title,
          selectedTarget: select?.value || '',
          composerText: textarea?.value || '',
          terminalClass: terminal?.className || '',
          terminalTail: normalize(tail(terminal?.textContent || '')),
          cardTail: normalize(tail(card.textContent || '')),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      });
      const fullscreen = document.querySelector('.terminal-fullscreen-panel, .terminal-popout-page');
      const fullscreenTerminal = fullscreen?.querySelector('.terminal-snapshot-preview, .static-terminal-preview, .xterm-preview, .xterm');
      return {
        href: location.href,
        title: document.title,
        cardCount: cards.length,
        cards,
        fullscreen: fullscreen ? {
          className: fullscreen.className || '',
          terminalClass: fullscreenTerminal?.className || '',
          textTail: normalize(tail(fullscreenTerminal?.textContent || fullscreen.textContent || '')),
          panelTail: normalize(tail(fullscreen.textContent || '')),
          composerText: fullscreen.querySelector('textarea')?.value || ''
        } : null
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

async function openFullscreenForSession(page, session) {
  return page.send("Runtime.evaluate", {
    expression: `(() => {
      const wanted = ${JSON.stringify(session)};
      const cards = Array.from(document.querySelectorAll('.terminal-card'));
      const card = cards.find((item) => {
        const select = item.querySelector('footer select');
        const title = item.querySelector('header strong')?.innerText || '';
        return select?.value === wanted || title === wanted;
      });
      if (!card) return { ok: false, reason: 'card-not-found', wanted };
      const buttons = Array.from(card.querySelectorAll('button'));
      const button = buttons.find((item) => {
        const title = item.getAttribute('title') || '';
        return title.includes('크게') || title.toLowerCase().includes('fullscreen');
      });
      const fullscreenButton = button || buttons[0];
      if (!fullscreenButton) return { ok: false, reason: 'fullscreen-button-not-found', wanted };
      fullscreenButton.click();
      return { ok: true, wanted };
    })()`,
    returnByValue: true,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetUrl = args.url;
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

  let browserCdp;
  try {
    const version = await waitForVersion();
    browserCdp = await createCdp(version.webSocketDebuggerUrl);
    await browserCdp.send("Target.setDiscoverTargets", { discover: true });
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
    await sleep(args.waitMs);

    const before = await extractState(page, args.tailChars);
    const screenshots = {
      card: await capturePng(page, args.captureName, "card"),
    };
    let fullscreenOpen = null;
    let afterFullscreen = null;

    if (args.fullscreen && args.session) {
      fullscreenOpen = await openFullscreenForSession(page, args.session);
      await sleep(1200);
      afterFullscreen = await extractState(page, args.tailChars);
      screenshots.fullscreen = await capturePng(page, args.captureName, "fullscreen");
    }

    const consoleEvents = page.events.filter((event) => event.method === "Runtime.consoleAPICalled" || event.method === "Log.entryAdded");
    const report = {
      at: new Date().toISOString(),
      url: targetUrl,
      args,
      screenshots,
      before,
      fullscreenOpen: fullscreenOpen?.result?.value || null,
      afterFullscreen,
      consoleEvents,
    };
    const reportPath = path.join(outDir, `${args.captureName}-tail.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify({
      ok: true,
      reportPath,
      screenshots,
      cardCount: before.cardCount,
      fullscreenOpen: report.fullscreenOpen,
      consoleEvents: consoleEvents.length,
    }, null, 2));
  } finally {
    try {
      if (browserCdp) await browserCdp.send("Browser.close");
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
