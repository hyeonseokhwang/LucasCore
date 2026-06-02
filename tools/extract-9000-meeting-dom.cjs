const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:9000",
    browser: "chrome",
    waitMs: 2500,
    expectText: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--out-dir") args.outDir = value;
    else if (key === "--url") args.url = value;
    else if (key === "--browser") args.browser = value;
    else if (key === "--wait-ms") args.waitMs = Number(value);
    else if (key === "--expect-text") args.expectText.push(value);
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

  const consoleEvents = [];
  const pageErrors = [];
  page.on("console", (message) => {
    consoleEvents.push({
      type: message.type(),
      text: message.text(),
    });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(args.waitMs);

  const result = await page.evaluate((expectText) => {
    const bodyText = document.body.innerText || "";
    const lines = bodyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const findMatchingLines = (patterns) => {
      const matched = [];
      for (const pattern of patterns) {
        const lower = pattern.toLowerCase();
        const line = lines.find((item) => item.toLowerCase().includes(lower));
        matched.push({ pattern, found: Boolean(line), line: line || null });
      }
      return matched;
    };

    const keywords = {
      channel: ["channel", "채널"],
      meetingList: ["meeting", "회의", "room"],
      messages: ["message", "messages", "메시지", "대화"],
      decisions: ["decision", "decisions", "결정"],
      actionItems: ["action item", "action items", "액션", "todo", "할 일"],
    };

    return {
      title: document.title,
      h1: document.querySelector("h1")?.textContent?.trim() || "",
      bodyText,
      lineCount: lines.length,
      sampleLines: lines.slice(0, 120),
      expectations: expectText.map((item) => ({
        text: item,
        found: bodyText.includes(item),
      })),
      keywordMatches: {
        channel: findMatchingLines(keywords.channel),
        meetingList: findMatchingLines(keywords.meetingList),
        messages: findMatchingLines(keywords.messages),
        decisions: findMatchingLines(keywords.decisions),
        actionItems: findMatchingLines(keywords.actionItems),
      }
    };
  }, args.expectText);

  const summary = {
    ok:
      pageErrors.length === 0 &&
      consoleEvents.filter((item) => item.type === "error").length === 0 &&
      result.expectations.every((item) => item.found),
    ...result,
    consoleEvents,
    pageErrors,
  };

  fs.writeFileSync(
    path.join(outDir, "9000-meeting-dom.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(outDir, "9000-meeting-dom.txt"),
    [
      `ok=${summary.ok}`,
      `title=${summary.title}`,
      `h1=${summary.h1}`,
      `lineCount=${summary.lineCount}`,
      `consoleErrors=${consoleEvents.filter((item) => item.type === "error").length}`,
      `pageErrors=${pageErrors.length}`,
      "",
      "[expectations]",
      ...summary.expectations.map((item) => `${item.text} => ${item.found}`),
      "",
      "[sampleLines]",
      ...summary.sampleLines,
    ].join("\n") + "\n",
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
