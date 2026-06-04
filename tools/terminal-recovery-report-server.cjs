#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || "9101");
const taskReportPath = path.join(root, "data", "task-reports", "terminal-cardview-snapshot-recovery-20260603.md");
const lessonPath = path.join(root, "docs", "terminal-cardview-recovery-lessons-20260603.md");

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return `Unable to read ${filePath}: ${error.message}`;
  }
}

function gitStatus() {
  try {
    return execFileSync("git", ["status", "--short", "--branch"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    return `git status failed: ${error.message}`;
  }
}

function currentStatus() {
  const now = new Date().toISOString();
  const report = readFile(taskReportPath);
  const lesson = readFile(lessonPath);
  return {
    now,
    title: "Terminal Card/Fullscreen Recovery",
    status: "reopened: visual contract fix in progress",
    checkpoint: "Fixing snapshot source scoring and Codex-like passive DOM styling; 9001 must stay preserved.",
    git: gitStatus(),
    report,
    lesson
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(status) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="15" />
  <title>LCC Terminal Recovery Report</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #080d17; color: #d8e2f1; }
    body { margin: 0; background: #080d17; }
    header { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 14px 18px; border-bottom: 1px solid #24344d; background: #101a2b; }
    h1 { margin: 0; font-size: 18px; }
    .stamp { color: #8ea0b8; font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; }
    main { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 14px; padding: 14px; }
    section { min-width: 0; border: 1px solid #24344d; border-radius: 8px; overflow: hidden; background: #0c1422; }
    h2 { margin: 0; padding: 10px 12px; border-bottom: 1px solid #24344d; background: #111d30; font-size: 13px; color: #f1f5f9; }
    .summary { display: grid; gap: 8px; padding: 12px; }
    .pill { display: inline-flex; width: fit-content; align-items: center; min-height: 26px; padding: 0 9px; border-radius: 999px; background: #19324a; color: #9bdcff; font-size: 12px; }
    pre { margin: 0; max-height: calc(100vh - 180px); overflow: auto; padding: 12px; white-space: pre-wrap; word-break: break-word; font-family: "Cascadia Code", Consolas, monospace; font-size: 12px; line-height: 1.45; color: #dbe7f6; }
    .git { color: #a7f3d0; }
    @media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(status.title)}</h1>
      <div class="stamp">auto-refresh 15s · ${escapeHtml(status.now)}</div>
    </div>
    <span class="pill">${escapeHtml(status.status)}</span>
  </header>
  <main>
    <section>
      <h2>Current Checkpoint</h2>
      <div class="summary">
        <div>${escapeHtml(status.checkpoint)}</div>
        <pre class="git">${escapeHtml(status.git)}</pre>
      </div>
      <h2>Restart-Safe Lesson</h2>
      <pre>${escapeHtml(status.lesson)}</pre>
    </section>
    <section>
      <h2>Live Task Report</h2>
      <pre>${escapeHtml(status.report)}</pre>
    </section>
  </main>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  if (req.url === "/status.json") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(currentStatus(), null, 2));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(renderHtml(currentStatus()));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`terminal recovery report server listening at http://127.0.0.1:${port}`);
});
