const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

function parseArgs(argv) {
  const args = {
    waitMs: 2500,
    browser: "chrome",
    viewport: [],
    expectText: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--url") args.url = value;
    else if (key === "--out-dir") args.outDir = value;
    else if (key === "--prefix") args.prefix = value;
    else if (key === "--wait-ms") args.waitMs = Number(value);
    else if (key === "--browser") args.browser = value;
    else if (key === "--viewport") args.viewport.push(value);
    else if (key === "--expect-text") args.expectText.push(value);
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

function parseViewport(raw) {
  const [name, dims] = String(raw).split("=");
  const [width, height] = String(dims || "").split("x").map((value) => Number(value));
  if (!name || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid viewport: ${raw}`);
  }
  return { name, width, height };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = ensureArg(args.url, "--url");
  const outDir = path.resolve(ensureArg(args.outDir, "--out-dir"));
  const prefix = ensureArg(args.prefix, "--prefix");
  const browserPath = resolveBrowserExecutable(args.browser);
  const { chromium } = resolvePlaywright(process.cwd());
  const viewports = (args.viewport.length ? args.viewport : [
    "desktop=1600x1200",
  ]).map(parseViewport);

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });

  const page = await browser.newPage();
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

  const captures = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(args.waitMs);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const missingText = args.expectText.filter((item) => !bodyText.includes(item));
    const screenshotPath = path.join(outDir, `${prefix}-${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    captures.push({
      viewport,
      screenshotPath,
      title: await page.title(),
      missingText,
    });
  }

  const apiUrls = [...new Set(requests.filter((value) => value.includes("/api/")))].sort();
  const wsUrls = [...new Set(websockets)].sort();
  const failedConsole = consoleEvents.filter((event) => event.type === "error");
  const failedExpectations = captures.flatMap((capture) =>
    capture.missingText.map((text) => ({ viewport: capture.viewport.name, text }))
  );

  const summary = {
    ok: failedConsole.length === 0 && pageErrors.length === 0 && failedExpectations.length === 0,
    url,
    browser: args.browser,
    outDir,
    captures,
    apiUrls,
    wsUrls,
    consoleEvents,
    pageErrors,
    failedExpectations,
  };

  fs.writeFileSync(
    path.join(outDir, `${prefix}-console.json`),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  const textSummary = [
    `url=${url}`,
    `browser=${args.browser}`,
    `ok=${summary.ok}`,
    `screenshots=${captures.map((item) => item.screenshotPath).join(", ")}`,
    `apiUrls=${apiUrls.join(", ") || "none"}`,
    `wsUrls=${wsUrls.join(", ") || "none"}`,
    `consoleErrors=${failedConsole.length}`,
    `pageErrors=${pageErrors.length}`,
    `failedExpectations=${failedExpectations.length}`,
  ];
  fs.writeFileSync(
    path.join(outDir, `${prefix}-summary.txt`),
    `${textSummary.join("\n")}\n`,
    "utf8"
  );

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
