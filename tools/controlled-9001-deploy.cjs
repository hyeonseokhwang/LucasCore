#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const apiBase = process.env.LCC_API_BASE || "http://127.0.0.1:9001";
const expectedOldPid = Number(process.env.LCC_EXPECTED_9001_PID || 24228);
const candidateExe = path.join(root, "target-9001-deploy", "debug", "lcc-core-api.exe");
const evidenceDir = path.join(root, "data", "system-logs", "terminal-normalization-20260604");
const evidencePath = path.join(evidenceDir, "controlled-9001-deploy.json");
const approvalToken = "LUCAS_APPROVED_9001_DEPLOY";

const execute = process.argv.includes("--execute");
const approvalIndex = process.argv.indexOf("--approval");
const approval = approvalIndex >= 0 ? process.argv[approvalIndex + 1] : "";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed with ${code}: ${stderr || stdout}`));
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, json: JSON.parse(body), body });
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    }).on("error", reject);
  });
}

async function listenerPid(port) {
  const command = `Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object -First 1 -ExpandProperty OwningProcess`;
  const result = await run("powershell.exe", ["-NoProfile", "-Command", command]);
  const pid = Number(result.stdout.trim());
  return Number.isFinite(pid) ? pid : null;
}

async function stopPid(pid) {
  await run("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`]);
}

async function startCandidate() {
  const child = spawn(candidateExe, [], {
    cwd: root,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

async function waitForHealth(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const health = await getJson(`${apiBase}/api/health`);
      if (health.status === 200 && health.json?.ok === true) return health.json;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`9001 health did not recover: ${lastError}`);
}

function summarizeSessions(sessions) {
  const items = Array.isArray(sessions) ? sessions : Array.isArray(sessions?.value) ? sessions.value : [];
  return items.map((session) => ({
    id: session.id,
    name: session.name,
    team: session.team,
    status: session.status,
    source: session.source,
    interactive: session.interactive,
    updated_at: session.updated_at,
    input_disabled_reason: session.input_disabled_reason || null
  }));
}

async function main() {
  const report = {
    at: new Date().toISOString(),
    mode: execute ? "execute" : "dry-run",
    approval_ok: approval === approvalToken,
    expected_old_pid: expectedOldPid,
    candidate_exe: candidateExe,
    candidate_exists: fs.existsSync(candidateExe),
    pre: {},
    post: {},
    actions: [],
    next: ""
  };

  fs.mkdirSync(evidenceDir, { recursive: true });

  report.pre.listener_pid = await listenerPid(9001);
  report.pre.health = await getJson(`${apiBase}/api/health`).then((item) => item.json).catch((error) => ({ error: error.message }));
  report.pre.sessions = await getJson(`${apiBase}/api/sessions`).then((item) => summarizeSessions(item.json)).catch((error) => ({ error: error.message }));

  if (!report.candidate_exists) {
    report.next = "Build target-9001-deploy before executing.";
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
    throw new Error(`Candidate executable missing: ${candidateExe}`);
  }

  if (!execute) {
    report.next = `Dry run only. To execute after Lucas approval: node tools/controlled-9001-deploy.cjs --execute --approval ${approvalToken}`;
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (approval !== approvalToken) {
    report.next = "Execution refused: explicit approval token missing.";
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
    throw new Error(`Execution requires --approval ${approvalToken}`);
  }

  if (report.pre.listener_pid !== expectedOldPid) {
    report.next = "Execution refused: live 9001 PID does not match expected guard.";
    fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
    throw new Error(`Expected 9001 PID ${expectedOldPid}, found ${report.pre.listener_pid}`);
  }

  await stopPid(expectedOldPid);
  report.actions.push(`stopped ${expectedOldPid}`);
  report.post.spawn_pid = await startCandidate();
  report.actions.push(`started candidate spawn_pid=${report.post.spawn_pid}`);
  report.post.health = await waitForHealth();
  report.post.listener_pid = await listenerPid(9001);
  report.post.recover_ceo = await getJson(`${apiBase}/api/memory/recover/ceo?limit=3`).then((item) => ({
    status: item.status,
    has_daily_memory: Boolean(item.json?.recovered_context?.daily_memory),
    daily_exists: item.json?.recovered_context?.daily_memory?.exists
  }));
  report.next = "Run dedicated split-submit semantic ACK verification.";

  fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
