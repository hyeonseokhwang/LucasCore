/**
 * branch-hq-bridge.cjs
 * 지사 LucasCore ↔ 본사 CC 양방향 미팅 브리지
 *
 * - 지사→본사: 지사 session terminal output을 본사 미팅에 speak
 * - 본사→지사: 본사 미팅 새 메시지를 지사 session에 prompt 전송
 *
 * Usage:
 *   node branch-hq-bridge.cjs [--meeting=<mtgId>] [--hq=<hqUrl>] [--branch=<branchUrl>]
 *
 * Default:
 *   --meeting=mtg-1780195037159
 *   --hq=http://localhost:9000
 *   --branch=http://127.0.0.1:20086
 */

const http = require('http');

const MEETING_ID = process.env.BRIDGE_MEETING_ID || 'mtg-1780195037159';
const HQ_URL = process.env.BRIDGE_HQ_URL || 'http://localhost:9000';
const BRANCH_URL = process.env.BRIDGE_BRANCH_URL || 'http://127.0.0.1:20086';
const POLL_MS = 3000;

// 지사 에이전트 → 본사 author 매핑
const AGENT_MAP = {
  'ceo': 'branch-ceo',
  'dev-lead': 'branch-dev-lead',
  'lux': 'branch-lux',
  'arum': 'branch-arum',
};

// 본사 미팅에서 지사 에이전트로 전달할 트리거 접두어 (@branch-ceo 등)
const BRANCH_TRIGGERS = Object.values(AGENT_MAP);

// 지사 에이전트 이름 (트리거 키워드)
const AGENT_NAMES = {
  'ceo': ['시저', 'caesar'],
  'dev-lead': ['맥스', 'max'],
  'lux': ['럭스', 'lux'],
  'arum': ['아름', 'arum'],
};

function req(base, method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(path, base);
    const b = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' }
    };
    if (b) opts.headers['Content-Length'] = Buffer.byteLength(b);
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 300, status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ ok: false, status: res.statusCode, data: d }); }
      });
    });
    r.on('error', e => resolve({ ok: false, status: 0, data: e.message }));
    if (b) r.write(b);
    r.end();
  });
}

// 본사 미팅 최신 메시지 since 타임스탬프 추적
let hqLastMsgId = null;

// 지사 session preview 추적 (마지막 본 텍스트)
const branchLastPreview = {};

async function pollBranchToHQ() {
  // 지사 sessions 조회
  const r = await req(BRANCH_URL, 'GET', '/api/sessions');
  if (!r.ok || !Array.isArray(r.data)) return;

  for (const session of r.data) {
    const agentKey = session.id;
    if (!AGENT_MAP[agentKey]) continue;
    if (session.status !== 'active') continue;

    const preview = session.preview_text?.trim();
    if (!preview) continue;
    if (preview === branchLastPreview[agentKey]) continue;

    // ANSI 코드 제거 후 실제 텍스트 추출
    const stripped = preview.replace(/\x1b\[[0-9;]*[mGKHJABCDEFhilRnsu?@]/g, '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
    // 의미있는 텍스트가 없으면 skip
    if (!stripped || stripped.length < 10) continue;

    // 새 출력 감지 → 본사 미팅에 speak
    branchLastPreview[agentKey] = preview;
    const author = AGENT_MAP[agentKey];
    // 너무 긴 출력은 마지막 500자만
    const body = `[${author}] ${stripped.slice(-500)}`;

    const sr = await req(HQ_URL, 'POST', `/api/meetings/${MEETING_ID}/speak`, {
      author, body, targets: ['lucas', 'coo', 'cto']
    });
    if (sr.ok) {
      console.log(`[bridge] ${author} → HQ meeting: ${body.slice(0, 60)}...`);
    } else {
      console.warn(`[bridge] speak failed for ${author}:`, sr.status, sr.data?.error);
    }
  }
}

async function pollHQToBranch() {
  // 본사 미팅 최신 메시지 조회
  const path = hqLastMsgId
    ? `/api/meetings/${MEETING_ID}/messages?limit=10&after=${encodeURIComponent(hqLastMsgId)}`
    : `/api/meetings/${MEETING_ID}/messages?limit=5`;

  const r = await req(HQ_URL, 'GET', path);
  if (!r.ok) return;

  const msgs = r.data?.messages || r.data || [];
  if (!Array.isArray(msgs) || msgs.length === 0) return;

  // 최신 msgId 업데이트
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg?.id) hqLastMsgId = lastMsg.id;

  for (const msg of msgs) {
    const body = msg.body || msg.content || '';
    const author = msg.author || msg.from || '';

    // 지사 에이전트 발언은 echo 방지
    if (BRANCH_TRIGGERS.includes(author)) continue;

    // @branch-ceo 등 트리거 감지
    for (const [sessionId, branchAuthor] of Object.entries(AGENT_MAP)) {
      const names = AGENT_NAMES[sessionId] || [];
      const triggered = body.includes(`@${branchAuthor}`) || names.some(n => body.toLowerCase().includes(n));
      if (!triggered) continue;

      // 지사 session에 prompt 전송
      const prompt = `[본사 미팅 mtg-1780195037159 / ${author}] ${body}`;
      const pr = await req(BRANCH_URL, 'POST', `/api/sessions/${sessionId}/prompt-text`, { data: prompt });
      if (pr.ok) {
        await req(BRANCH_URL, 'POST', `/api/sessions/${sessionId}/prompt-submit`, { repeat: 1 });
        console.log(`[bridge] HQ → branch ${sessionId}: ${prompt.slice(0, 80)}...`);
      }
    }
  }
}

async function loop() {
  console.log(`[bridge] 시작: HQ=${HQ_URL} Branch=${BRANCH_URL} Meeting=${MEETING_ID}`);
  while (true) {
    try {
      await Promise.all([pollBranchToHQ(), pollHQToBranch()]);
    } catch (e) {
      console.error('[bridge] loop error:', e.message);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}

loop();
