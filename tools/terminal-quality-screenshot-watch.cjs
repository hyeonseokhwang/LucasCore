#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "terminal-quality-watch");
const statePath = path.join(root, "data", "terminal-quality-watch-latest.json");
const eventsPath = path.join(root, "data", "terminal-quality-watch-events.jsonl");
const once = process.argv.includes("--once");
const intervalMs = Math.max(30_000, Number(process.env.TERMINAL_QUALITY_WATCH_INTERVAL_MS || 300_000));
const url = process.env.TERMINAL_QUALITY_WATCH_URL || "http://127.0.0.1:9000";

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function appendEvent(event) {
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.appendFileSync(eventsPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function hasMojibake(value) {
  return /(?:�|占|\?먯|�먯|쨌|â|â|â|Ã|Â)/.test(String(value || ""));
}

function assess(report) {
  const metrics = report?.metrics || {};
  const problems = [];
  const consoleText = String(metrics.consoleText || "");
  const consoleEvents = report?.consoleEvents || [];
  const consoleErrorEvents = consoleEvents.filter((event) => {
    const type = event?.params?.type;
    const level = event?.params?.entry?.level;
    return type === "error" || level === "error";
  });

  if (consoleErrorEvents.length > 0) problems.push("console-errors");
  if (!metrics.terminalCards || metrics.terminalCards < 1) problems.push("no-terminal-cards");
  if (metrics.horizontalScrollable) problems.push("horizontal-scroll");
  if (hasMojibake(consoleText)) problems.push("mojibake");
  if (consoleText.includes("[Pasted Content")) problems.push("pasted-content-placeholder");

  return {
    ok: problems.length === 0,
    problems,
    terminalCards: metrics.terminalCards || 0,
    layout: metrics.layout || null,
    horizontalScrollable: Boolean(metrics.horizontalScrollable),
    consoleEvents: consoleEvents.length,
    consoleErrorEvents: consoleErrorEvents.length,
    screenshotPath: report?.screenshotPath || null,
    reportPath: report?.reportPath || null
  };
}

function runCapture() {
  const name = `terminal-quality-${stamp()}`;
  fs.mkdirSync(outDir, { recursive: true });
  const result = spawnSync(process.execPath, [path.join(root, "tools", "capture-9000-cdp.cjs"), url, name], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });

  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout.trim() || "{}");
  } catch {}

  const report = parsed?.reportPath ? readJson(parsed.reportPath) : null;
  const assessment = assess(report);
  const state = {
    at: new Date().toISOString(),
    url,
    captureName: name,
    exitCode: result.status,
    stdout: result.stdout.slice(-2000),
    stderr: result.stderr.slice(-2000),
    ...assessment
  };

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
  appendEvent({ type: assessment.ok ? "terminal_quality_sample_ok" : "terminal_quality_sample_problem", ...state });
  console.log(JSON.stringify(state, null, 2));
}

async function main() {
  do {
    runCapture();
    if (once) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (true);
}

main().catch((error) => {
  appendEvent({ type: "terminal_quality_watch_error", message: error.message, stack: error.stack });
  console.error(error.stack || String(error));
  process.exit(1);
});
