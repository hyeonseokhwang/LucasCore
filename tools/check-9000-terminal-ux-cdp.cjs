const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:9000",
    browser: "chrome",
    waitMs: 2500,
    sessionName: "scrollback-check-2",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--out-dir") args.outDir = value;
    else if (key === "--url") args.url = value;
    else if (key === "--browser") args.browser = value;
    else if (key === "--wait-ms") args.waitMs = Number(value);
    else if (key === "--session-name") args.sessionName = value;
  }
  return args;
}

function ensureArg(value, name) {
  if (!value) throw new Error(`Missing required argument: ${name}`);
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
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
  });
  const page = await context.newPage();
  const consoleEvents = [];
  const pageErrors = [];
  const requests = [];
  const websockets = [];

  page.on("console", (message) => {
    consoleEvents.push({ type: message.type(), text: message.text() });
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

  const initial = await page.evaluate((sessionName) => {
    const card = [...document.querySelectorAll("article.terminal-card")].find(
      (item) => item.querySelector("strong")?.textContent?.trim() === sessionName
    );
    const grid = document.querySelector(".terminal-grid");
    const composer = card?.querySelector("footer textarea");
    return {
      found: Boolean(card),
      gridClass: grid?.className || "",
      composerPlaceholder: composer?.getAttribute("placeholder") || "",
    };
  }, args.sessionName);
  if (!initial.found) {
    throw new Error(`Session card not found: ${args.sessionName}`);
  }

  async function clickLayout(label) {
    const locator = page.locator(".terminal-layout-toggle button").filter({ hasText: label }).first();
    await locator.click();
    await page.waitForTimeout(600);
    return page.evaluate(() => ({
      className: document.querySelector(".terminal-grid")?.className || "",
      scrollWidth: document.querySelector(".terminal-grid")?.scrollWidth || 0,
      clientWidth: document.querySelector(".terminal-grid")?.clientWidth || 0,
      scrollHeight: document.querySelector(".terminal-grid")?.scrollHeight || 0,
      clientHeight: document.querySelector(".terminal-grid")?.clientHeight || 0,
    }));
  }

  const stackState = await clickLayout("Focus");
  await page.screenshot({ path: path.join(outDir, "9000-terminal-layout-stack.png"), fullPage: true });
  const columnsState = await clickLayout("Work");
  await page.screenshot({ path: path.join(outDir, "9000-terminal-layout-columns.png"), fullPage: true });
  const gridState = await clickLayout("Fleet");
  await page.screenshot({ path: path.join(outDir, "9000-terminal-layout-grid.png"), fullPage: true });

  const composer = page.locator("article.terminal-card footer textarea").first();
  await composer.click();
  await composer.fill("");
  await composer.type("line-1");
  await composer.press("Shift+Enter");
  await composer.type("line-2");
  const beforeSubmit = await composer.inputValue();
  await composer.press("Enter");
  await page.waitForTimeout(700);
  const afterSubmit = await composer.inputValue();
  await page.screenshot({ path: path.join(outDir, "9000-terminal-newline.png"), fullPage: true });

  await page.locator("article.terminal-card .card-actions button").nth(1).click().catch(() => undefined);
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape").catch(() => undefined);
  const popoutPromise = context.waitForEvent("page").catch(() => null);
  await page.locator("article.terminal-card .card-actions button").nth(0).click().catch(() => undefined);
  const popoutPage = await Promise.race([
    popoutPromise,
    new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);

  let popoutState = { opened: false };
  if (popoutPage) {
    await popoutPage.waitForLoadState("domcontentloaded").catch(() => undefined);
    await popoutPage.waitForTimeout(800).catch(() => undefined);
    const popoutUrl = popoutPage.url();
    const popoutText = await popoutPage.locator("body").innerText().catch(() => "");
    await popoutPage.screenshot({ path: path.join(outDir, "9000-terminal-popout.png"), fullPage: true }).catch(() => undefined);
    popoutState = {
      opened: true,
      url: popoutUrl,
      hasPopoutParam: popoutUrl.includes("popout="),
      textSample: String(popoutText).slice(0, 400),
    };
    await popoutPage.close().catch(() => undefined);
  }

  const summary = {
    ok:
      pageErrors.length === 0 &&
      consoleEvents.filter((item) => item.type === "error").length === 0 &&
      beforeSubmit === "line-1\nline-2" &&
      afterSubmit === "" &&
      stackState.className.includes("stack") &&
      columnsState.className.includes("columns") &&
      gridState.className.includes("grid") &&
      popoutState.opened === true,
    sessionName: args.sessionName,
    initial,
    layout: {
      stack: stackState,
      columns: columnsState,
      grid: gridState,
    },
    newline: {
      beforeSubmit,
      afterSubmit,
    },
    popout: popoutState,
    apiUrls: [...new Set(requests.filter((value) => value.includes("/api/")))].sort(),
    wsUrls: [...new Set(websockets)].sort(),
    consoleEvents,
    pageErrors,
  };

  fs.writeFileSync(path.join(outDir, "9000-terminal-ux.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(
    path.join(outDir, "9000-terminal-ux-summary.txt"),
    [
      `ok=${summary.ok}`,
      `sessionName=${summary.sessionName}`,
      `stackClass=${stackState.className}`,
      `columnsClass=${columnsState.className}`,
      `gridClass=${gridState.className}`,
      `newlineBeforeSubmit=${JSON.stringify(beforeSubmit)}`,
      `newlineAfterSubmit=${JSON.stringify(afterSubmit)}`,
      `popoutOpened=${popoutState.opened}`,
      `popoutUrl=${popoutState.url || ""}`,
      `consoleErrors=${consoleEvents.filter((item) => item.type === "error").length}`,
      `pageErrors=${pageErrors.length}`,
    ].join("\n") + "\n",
    "utf8"
  );

  await context.close();
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
