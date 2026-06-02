const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:9000",
    sessionName: "scrollback-check-2",
    waitMs: 2500,
    browser: "chrome",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--out-dir") args.outDir = value;
    else if (key === "--url") args.url = value;
    else if (key === "--session-name") args.sessionName = value;
    else if (key === "--wait-ms") args.waitMs = Number(value);
    else if (key === "--browser") args.browser = value;
  }
  return args;
}

function ensureArg(value, name) {
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function resolvePlaywright(cwd) {
  const packageJsonPath = path.join(cwd, "package.json");
  const scopedRequire = createRequire(fs.existsSync(packageJsonPath) ? packageJsonPath : path.join(cwd, "index.js"));
  return scopedRequire("playwright-core");
}

function resolveBrowserExecutable(browser) {
  if (browser === "edge") {
    return "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  }
  return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ensureArg(args.outDir, "--out-dir"));
  fs.mkdirSync(outDir, { recursive: true });

  const { chromium } = resolvePlaywright(process.cwd());
  const browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(args.browser),
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  const consoleEvents = [];
  const pageErrors = [];
  const requests = [];
  const websockets = [];

  page.on("console", (message) => {
    consoleEvents.push({
      type: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("request", (request) => {
    requests.push(request.url());
  });
  page.on("websocket", (socket) => {
    websockets.push(socket.url());
  });

  await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(args.waitMs);

  const mainState = await page.evaluate((sessionName) => {
    const cards = [...document.querySelectorAll("article.terminal-card")];
    const names = cards.map((card) => card.querySelector("strong")?.textContent?.trim() || "");
    const card = cards.find((item) => item.querySelector("strong")?.textContent?.trim() === sessionName);
    if (!card) {
      return { found: false, names };
    }
    const viewport = card.querySelector(".xterm-viewport");
    return {
      found: true,
      names,
      viewport: viewport ? {
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      } : null,
    };
  }, args.sessionName);

  if (!mainState.found) {
    throw new Error(`Session card not found: ${args.sessionName}`);
  }

  await page.screenshot({ path: path.join(outDir, "9000-terminal-main.png"), fullPage: true });

  await page.evaluate((sessionName) => {
    const cards = [...document.querySelectorAll("article.terminal-card")];
    const card = cards.find((item) => item.querySelector("strong")?.textContent?.trim() === sessionName);
    card?.querySelector(".card-actions button[title='터미널 크게 보기']")?.click();
  }, args.sessionName);
  await page.waitForTimeout(1500);
  const fullscreenState = await page.evaluate(() => {
    const viewport = document.querySelector(".terminal-fullscreen-panel .xterm-viewport");
    if (!viewport) return { present: false };
    const before = viewport.scrollTop;
    viewport.scrollTop = 0;
    return {
      present: true,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      before,
      after: viewport.scrollTop,
    };
  });
  await page.screenshot({ path: path.join(outDir, "9000-terminal-fullscreen.png"), fullPage: true });

  await page.evaluate((sessionName) => {
    document.querySelector(".terminal-fullscreen-panel button.icon")?.click();
    const cards = [...document.querySelectorAll("article.terminal-card")];
    const card = cards.find((item) => item.querySelector("strong")?.textContent?.trim() === sessionName);
    card?.querySelector(".card-actions button[title='터미널 로그']")?.click();
  }, args.sessionName);
  await page.waitForTimeout(1500);
  const logState = await page.evaluate(() => {
    const viewport = document.querySelector(".log-panel .xterm-viewport");
    if (!viewport) return { present: false };
    const before = viewport.scrollTop;
    viewport.scrollTop = 0;
    return {
      present: true,
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      before,
      after: viewport.scrollTop,
    };
  });
  await page.screenshot({ path: path.join(outDir, "9000-terminal-log.png"), fullPage: true });

  const apiUrls = [...new Set(requests.filter((value) => value.includes("/api/")))].sort();
  const wsUrls = [...new Set(websockets)].sort();
  const result = {
    ok:
      Boolean(mainState.viewport) &&
      Boolean(fullscreenState.present) &&
      Boolean(logState.present) &&
      consoleEvents.filter((event) => event.type === "error").length === 0 &&
      pageErrors.length === 0,
    url: args.url,
    sessionName: args.sessionName,
    mainState,
    fullscreenState,
    logState,
    apiUrls,
    wsUrls,
    consoleEvents,
    pageErrors,
  };

  fs.writeFileSync(
    path.join(outDir, "9000-terminal-dom.json"),
    JSON.stringify(result, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "9000-terminal-dom-summary.txt"),
    [
      `url=${args.url}`,
      `sessionName=${args.sessionName}`,
      `ok=${result.ok}`,
      `mainViewport=${JSON.stringify(mainState.viewport)}`,
      `fullscreenViewport=${JSON.stringify(fullscreenState)}`,
      `logViewport=${JSON.stringify(logState)}`,
      `apiUrls=${apiUrls.join(", ") || "none"}`,
      `wsUrls=${wsUrls.join(", ") || "none"}`,
      `consoleErrors=${consoleEvents.filter((event) => event.type === "error").length}`,
      `pageErrors=${pageErrors.length}`,
    ].join("\n") + "\n",
    "utf8"
  );

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
