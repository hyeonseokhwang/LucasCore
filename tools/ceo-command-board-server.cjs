const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const boardPath = path.join(root, "data", "ceo-command-board.md");
const port = Number(process.env.CEO_BOARD_PORT || 9010);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listOpen = false;

  function closeList() {
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else {
      closeList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  closeList();
  return html.join("\n");
}

function page(markdown) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="15" />
  <title>CEO Command Board</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101216;
      --panel: #171b21;
      --line: #2a3039;
      --text: #eef2f7;
      --muted: #9da8b8;
      --accent: #43b581;
      --warn: #f2b84b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
      line-height: 1.45;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 14px 22px;
      border-bottom: 1px solid var(--line);
      background: rgba(16, 18, 22, 0.96);
    }
    header strong { font-size: 15px; }
    header span { color: var(--muted); font-size: 12px; }
    main {
      width: min(1180px, calc(100vw - 32px));
      margin: 18px auto 40px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 14px;
    }
    h1 {
      grid-column: 1 / -1;
      margin: 0;
      padding: 18px 0 2px;
      font-size: 28px;
      font-weight: 700;
    }
    h2 {
      margin: 0;
      padding: 14px 16px 8px;
      border: 1px solid var(--line);
      border-bottom: 0;
      border-radius: 8px 8px 0 0;
      background: var(--panel);
      font-size: 16px;
    }
    h2 + ul, h2 + p, h2 + h3 {
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
    h3 {
      margin: 0;
      padding: 12px 16px 6px;
      background: var(--panel);
      border-left: 1px solid var(--line);
      border-right: 1px solid var(--line);
      font-size: 14px;
      color: var(--warn);
    }
    ul, p {
      margin: 0;
      padding: 12px 18px 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      min-height: 42px;
    }
    ul {
      padding-left: 34px;
    }
    li + li { margin-top: 7px; }
    code {
      padding: 1px 5px;
      border-radius: 4px;
      background: #222831;
      color: #bdebd0;
    }
    @media (max-width: 720px) {
      main { width: calc(100vw - 20px); grid-template-columns: 1fr; }
      header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <strong>CEO Command Board</strong>
    <span>source: data/ceo-command-board.md · auto refresh 15s · port ${port}</span>
  </header>
  <main>${renderMarkdown(markdown)}</main>
</body>
</html>`;
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, boardPath }));
    return;
  }

  fs.readFile(boardPath, "utf8", (error, markdown) => {
    if (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack || String(error));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page(markdown));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`CEO command board listening on http://127.0.0.1:${port}`);
});
