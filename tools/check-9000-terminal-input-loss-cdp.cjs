const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "data", "system-logs", "terminal-input-text-loss-20260602");
fs.mkdirSync(outDir, { recursive: true });

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const userDataDir = path.join(root, "tmp-chrome-cdp-terminal-input-loss");
const port = 19106;
const targetUrl =
  process.argv[2] ||
  "http://127.0.0.1:9000/?view=terminals&filter=development-team&layout=fit&session=developer-4";

const sentenceLine1 =
  "한국어 긴 지시문 테스트입니다. 입력 중간에 글자가 사라지면 안 되고, 줄바꿈과 긴 문장도 그대로 유지되어야 합니다.";
const sentenceLine2 =
  "두 번째 줄입니다. Shift+Enter 이후에도 이전 문장과 현재 문장이 모두 남아 있어야 하고 새로고침 전까지 손실되면 안 됩니다.";
const payload = process.env.CDP_TERMINAL_PAYLOAD || `${sentenceLine1}\n${sentenceLine2}`;
const payloadLines = payload.split("\n");
const payloadLine1Needle = payloadLines[0].slice(0, 18);
const payloadLine2Needle = (payloadLines[1] || "").slice(0, 18);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
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
      })
      .on("error", reject);
  });
}

async function waitForVersion() {
  const deadline = Date.now() + 15000;
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

async function findPageTarget() {
  const targets = await getJson(`http://127.0.0.1:${port}/json`);
  return (
    targets.find((target) => target.type === "page" && target.url.includes("127.0.0.1:9000")) ||
    targets.find((target) => target.type === "page")
  );
}

async function captureScreenshot(page, filename) {
  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const screenshotPath = path.join(outDir, filename);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  return screenshotPath;
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value;
}

async function typeText(page, text) {
  for (const ch of text) {
    await page.send("Input.insertText", { text: ch });
  }
}

async function main() {
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--window-size=1784,1105",
      targetUrl,
    ],
    { detached: false, stdio: "ignore" }
  );

  let browserCdp;
  let page;
  try {
    const version = await waitForVersion();
    browserCdp = await createCdp(version.webSocketDebuggerUrl);
    const pageTarget = await findPageTarget();
    if (!pageTarget) throw new Error("No page target found");

    page = await createCdp(pageTarget.webSocketDebuggerUrl);
    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Log.enable");
    await page.send("Console.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1784,
      height: 1105,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.navigate", { url: targetUrl });
    await page.send("Page.bringToFront");
    await sleep(2500);

    const sessionInfo = await evaluate(
      page,
      `(() => {
        const selectedCard = document.querySelector('article.terminal-card.selected');
        const name = selectedCard?.querySelector('strong')?.textContent?.trim() || '';
        const sessionParam = new URL(window.location.href).searchParams.get('session') || '';
        return {
          href: window.location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          selectedName: name,
          sessionParam
        };
      })()`
    );

    await evaluate(
      page,
      `(() => {
        for (const key of Object.keys(sessionStorage)) {
          if (key.startsWith('lcc-core-terminal-composer-draft:')) sessionStorage.removeItem(key);
        }
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        if (!textarea) return false;
        textarea.focus();
        textarea.value = '';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        return true;
      })()`
    );

    for (let index = 0; index < payloadLines.length; index += 1) {
      if (index > 0) {
        await page.send("Input.insertText", { text: "\n" });
        await sleep(200);
      }
      await typeText(page, payloadLines[index]);
    }
    await sleep(300);

    const beforeResize = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        return {
          value: textarea?.value || '',
          rowCount: textarea?.value.split('\\n').length || 0,
          hasNewline: textarea?.value.includes('\\n') || false,
          draftMarker: document.querySelector('article.terminal-card.selected .composer-state')?.textContent?.trim() || ''
        };
      })()`
    );
    const beforeResizeShot = await captureScreenshot(page, "before-resize-compose.png");

    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);
    const afterShrink = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        return {
          value: textarea?.value || '',
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      })()`
    );

    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1784,
      height: 1105,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(400);
    const afterRestore = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        return {
          value: textarea?.value || '',
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      })()`
    );
    const afterResizeShot = await captureScreenshot(page, "after-resize-compose.png");

    await page.send("Page.reload", { ignoreCache: true });
    await sleep(2500);
    const afterRefresh = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        const selectedCard = document.querySelector('article.terminal-card.selected');
        return {
          selectedName: selectedCard?.querySelector('strong')?.textContent?.trim() || '',
          value: textarea?.value || '',
          composerState: selectedCard?.querySelector('.composer-state')?.textContent?.trim() || '',
          hasStaticPreview: !!selectedCard?.querySelector('.static-terminal-preview'),
          hasXterm: !!selectedCard?.querySelector('.xterm')
        };
      })()`
    );
    const afterRefreshShot = await captureScreenshot(page, "after-refresh.png");

    const refreshLostText = afterRefresh.value !== payload;

    if (refreshLostText) {
      await evaluate(
        page,
        `(() => {
          const textarea = document.querySelector('article.terminal-card.selected footer textarea');
          if (!textarea) return false;
          textarea.focus();
          textarea.value = '';
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
          return true;
        })()`
      );
      await sleep(100);
      for (let index = 0; index < payloadLines.length; index += 1) {
        if (index > 0) {
          await page.send("Input.insertText", { text: "\n" });
          await sleep(200);
        }
        await typeText(page, payloadLines[index]);
      }
      await sleep(300);
    }

    const beforeSubmit = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        return {
          value: textarea?.value || '',
          rowCount: textarea?.value.split('\\n').length || 0,
          matchesPayload: (textarea?.value || '') === ${JSON.stringify(payload)}
        };
      })()`
    );
    const beforeSubmitShot = await captureScreenshot(page, "before-submit.png");

    await page.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await page.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await sleep(1500);
    let textareaAfterEnter = await evaluate(
      page,
      `(() => document.querySelector('article.terminal-card.selected footer textarea')?.value || '')()`
    );
    if (textareaAfterEnter) {
      await evaluate(
        page,
        `(() => {
          document.querySelector('article.terminal-card.selected footer button.primary')?.click();
          return true;
        })()`
      );
      await sleep(1500);
    }

    const afterSubmit = await evaluate(
      page,
      `(() => {
        const textarea = document.querySelector('article.terminal-card.selected footer textarea');
        const bodyText = document.body.innerText;
        const xtermText = Array.from(document.querySelectorAll('article.terminal-card.selected .xterm-rows')).map((node) => node.textContent || '').join('\\n');
        const previewText = document.querySelector('article.terminal-card.selected .static-terminal-preview')?.textContent || '';
        return {
          textareaValue: textarea?.value || '',
          bodyContainsLine1: bodyText.includes(${JSON.stringify(payloadLine1Needle)}),
          xtermContainsLine1: xtermText.includes(${JSON.stringify(payloadLine1Needle)}),
          previewContainsLine1: previewText.includes(${JSON.stringify(payloadLine1Needle)}),
          xtermSample: xtermText.slice(-600)
        };
      })()`
    );

    const logInfo = await evaluate(
      page,
      `(() => fetch(${JSON.stringify("/api/sessions/developer-4/log")})
        .then((response) => response.text())
        .then((text) => ({
          containsLine1: text.includes(${JSON.stringify(payloadLine1Needle)}),
          containsLine2: ${payloadLine2Needle ? `text.includes(${JSON.stringify(payloadLine2Needle)})` : "true"},
          tail: text.slice(-1200)
        }))
        .catch((error) => ({ error: String(error) })))()`
    );
    const afterSubmitShot = await captureScreenshot(page, "after-submit.png");

    const consoleErrors = page.events.filter(
      (event) =>
        event.method === "Runtime.consoleAPICalled" &&
        event.params?.type === "error"
    );
    const pageErrors = page.events.filter((event) => event.method === "Log.entryAdded");

    const summary = {
      ok:
        beforeResize.value === payload &&
        afterShrink.value === payload &&
        afterRestore.value === payload &&
        afterRefresh.value === payload &&
        beforeSubmit.matchesPayload === true &&
        afterSubmit.textareaValue === "" &&
        (afterSubmit.xtermContainsLine1 || logInfo.containsLine1) &&
        (afterSubmit.xtermContainsLine1 || logInfo.containsLine2),
      status: refreshLostText ? "reproduced" : "fixed",
      payload,
      sessionInfo,
      beforeResize,
      afterShrink,
      afterRestore,
      afterRefresh,
      beforeSubmit,
      afterSubmit,
      logInfo,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      screenshots: {
        beforeResizeShot,
        afterResizeShot,
        afterRefreshShot,
        beforeSubmitShot,
        afterSubmitShot,
      },
    };

    fs.writeFileSync(path.join(outDir, "terminal-input-text-loss-qa.json"), JSON.stringify(summary, null, 2), "utf8");
    fs.writeFileSync(
      path.join(outDir, "terminal-input-text-loss-qa-summary.txt"),
      [
        `status=${summary.status}`,
        `ok=${summary.ok}`,
        `selectedName=${summary.sessionInfo.selectedName}`,
        `viewport=${summary.sessionInfo.viewport.width}x${summary.sessionInfo.viewport.height}`,
        `beforeResizeMatches=${beforeResize.value === payload}`,
        `afterShrinkMatches=${afterShrink.value === payload}`,
        `afterRestoreMatches=${afterRestore.value === payload}`,
        `afterRefreshMatches=${afterRefresh.value === payload}`,
        `beforeSubmitMatches=${beforeSubmit.matchesPayload}`,
        `afterSubmitCleared=${afterSubmit.textareaValue === ""}`,
        `xtermContainsLine1=${afterSubmit.xtermContainsLine1}`,
        `logContainsLine1=${Boolean(logInfo.containsLine1)}`,
        `logContainsLine2=${Boolean(logInfo.containsLine2)}`,
        `consoleErrors=${summary.consoleErrorCount}`,
        `pageErrors=${summary.pageErrorCount}`,
      ].join("\n") + "\n",
      "utf8"
    );
    fs.writeFileSync(path.join(outDir, "submitted-log-tail.txt"), String(logInfo.tail || logInfo.error || ""), "utf8");

    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) process.exitCode = 1;
  } finally {
    try {
      if (browserCdp) await browserCdp.send("Browser.close");
    } catch {}
    await sleep(500);
    if (!chrome.killed) {
      try {
        chrome.kill();
      } catch {}
    }
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
