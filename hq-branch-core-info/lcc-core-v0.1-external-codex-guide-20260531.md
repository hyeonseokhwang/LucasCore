# LCC Core v0.1 외부 Codex 구현 가이드

작성일: 2026-05-31 KST  
대상: 외부 Codex 구현자, dev-2 케이든 인수인계용  
목표: 최소 시간 내 `LCC 터미널뷰 -> 캔버스 중심 미팅` 순서로 동작 가능한 v0.1 구현

## 절대 금지

- `G:/Lucas-Initiative/server/daemon/` 및 PTY daemon 코드는 수정하지 않는다.
- SQLite 사용 금지. 저장소는 PostgreSQL만 사용한다.
- `master` 직접 커밋 금지. 구현은 `dev` 기준 또는 `feature/lcc-core-v01-*`에서 진행한다.
- HTML 단일 파일을 만들 경우 외부 CDN 금지. CSS/JS는 inline 또는 repo-local asset만 사용한다.
- 사용자/에이전트 표시 문자열은 `escHtml()` 또는 동등 escaping을 적용한다.

### Git 접속 경로 (section[9] v1.8)

Repo URL:

- HTTPS: `https://github.com/hyeonseokhwang/Lucas-Initiative.git`
- SSH: `git@github.com:hyeonseokhwang/Lucas-Initiative.git`

Clone 예시:

```bash
# HTTPS
git clone https://github.com/hyeonseokhwang/Lucas-Initiative.git Lucas-Initiative
cd Lucas-Initiative
git switch dev
git pull --ff-only origin dev
```

```bash
# SSH
git clone git@github.com:hyeonseokhwang/Lucas-Initiative.git Lucas-Initiative
cd Lucas-Initiative
git switch dev
git pull --ff-only origin dev
```

PAT 발급/설정:

1. GitHub Settings -> Developer settings -> Personal access tokens에서 최소 권한 PAT를 발급한다. private repo 접근이 필요하면 repo read 권한만 먼저 부여한다.
2. PAT는 명령줄, git remote URL, 캔버스, 로그, 스크린샷에 평문으로 남기지 않는다.
3. 외부 노트북에는 repo 밖 보안 저장소 또는 각 작업 디렉토리의 ignored `.env`에만 저장한다.
4. `.env` 예시:

```bash
GITHUB_TOKEN=ghp_replace_with_real_token
GITHUB_REPO_HTTPS=https://github.com/hyeonseokhwang/Lucas-Initiative.git
GITHUB_REPO_SSH=git@github.com:hyeonseokhwang/Lucas-Initiative.git
```

5. 검증:

```bash
git remote -v
git status --short
```

`git remote -v`에 PAT가 포함되면 즉시 `git remote set-url origin https://github.com/hyeonseokhwang/Lucas-Initiative.git`로 되돌리고 해당 PAT를 revoke한다. `git status --short`에 `.env`가 보이면 commit 금지 후 `.gitignore`를 먼저 고친다.

외부 노트북 6개 Codex 인스턴스 작업 디렉토리:

| Instance | EXTERNAL_AGENT_ID | 작업 디렉토리 |
|---|---|---|
| 1 | `external-codex-1` | `C:/LCC-Codex/external-codex-1/Lucas-Initiative` |
| 2 | `external-codex-2` | `C:/LCC-Codex/external-codex-2/Lucas-Initiative` |
| 3 | `external-codex-3` | `C:/LCC-Codex/external-codex-3/Lucas-Initiative` |
| 4 | `external-codex-4` | `C:/LCC-Codex/external-codex-4/Lucas-Initiative` |
| 5 | `external-codex-5` | `C:/LCC-Codex/external-codex-5/Lucas-Initiative` |
| 6 | `external-codex-6` | `C:/LCC-Codex/external-codex-6/Lucas-Initiative` |

각 인스턴스는 별도 clone, 별도 `.env`, 별도 `agents/external-codex-N/AGENTS.md`를 사용한다. 같은 디렉토리를 6개 Codex가 공유하지 않는다.

## 먼저 봐야 할 핵심 파일

### Phase 1: LCC 터미널뷰

1. `G:/Lucas-Initiative/command-center/frontend/src/components/TerminalGrid.tsx`
   - 이미 그리드/윈도우 전환, 팀별 필터, xterm lazy mount 패턴이 있다.
   - v0.1은 이 구조를 얇게 가져와 "에이전트 카드 + 터미널 패널" 그리드로 축소하면 된다.

2. `G:/Lucas-Initiative/command-center/frontend/src/components/TerminalPanel.tsx`
   - 실제 터미널 UI, prompt 입력, approve/reject/sendPrompt UX가 있다.

3. `G:/Lucas-Initiative/command-center/frontend/src/hooks/useTerminal.ts`
   - xterm 생성, fit, input write, scrollback, cleanup 책임.

4. `G:/Lucas-Initiative/command-center/frontend/src/hooks/useTerminalSocket.ts`
   - `/ws/terminal` 프로토콜 사용 예시.
   - attach/replay/output/exit 흐름을 그대로 재사용한다.

5. `G:/Lucas-Initiative/command-center-v2/src/ws/terminal.ts`
   - Bun raw WebSocket 핸들러. 클라이언트 메시지:
     - `{ type: "attach", sessionId, requestReplay, cols, rows }`
     - `{ type: "input", sessionId, data }`
     - `{ type: "resize", sessionId, cols, rows }`
     - `{ type: "sendPrompt", sessionId, prompt }`
   - 서버 메시지:
     - `attached`, `replay`, `output`, `exit`, `error`

6. `G:/Lucas-Initiative/command-center-v2/src/routes/sessions-pty.ts`
   - 신규 PTY 생성/삭제 API의 최소 구현이 이미 있다.
   - `POST /api/sessions`: PTY spawn
   - `DELETE /api/sessions/:id`: PTY kill
   - `POST /api/sessions/:id/write`: PTY write
   - `POST /api/sessions/:id/resize`: PTY resize

7. `G:/Lucas-Initiative/command-center-v2/src/routes/sessions.ts`
   - 기존 세션 목록/스폰/킬/프리뷰 확장 API.
   - `GET /api/sessions/active`, `GET /api/sessions/org-tree`, `GET /api/sessions/:id/preview`

8. `G:/Lucas-Initiative/command-center-v2/src/routes/api.ts`
   - `GET /api/sessions`, `GET /api/workers`의 기존 목록 응답 구조 확인용.

9. `G:/Lucas-Initiative/command-center-v2/public/session-board.html`
   - 단일 HTML 보드의 기존 패턴.
   - API 목록 표시, polling, 필터 UI를 빠르게 참고할 수 있다.

### Phase 2: 캔버스 중심 미팅

1. `G:/Lucas-Initiative/command-center-v2/src/routes/canvases.ts`
   - 독립 캔버스 체계. 이번 방향의 중심으로 삼는다.
   - `POST /api/canvases`
   - `GET /api/canvases`
   - `GET/PATCH /api/canvases/:id`
   - `GET/PUT/PATCH /api/canvases/:id/content`
   - `GET/POST /api/canvases/:id/messages`
   - `POST /api/canvases/:id/invite`

2. `G:/Lucas-Initiative/command-center-v2/src/routes/meetings.ts`
   - 기존 미팅/스레드/speak API. v0.1에서는 "캔버스 보조 채팅"으로만 연결한다.
   - `POST /api/meetings/:id/speak`
   - thread 자동 생성, dedup, targets, author guard가 많으므로 새 중심축으로 확장하지 말고 참조만 한다.

3. `G:/Lucas-Initiative/command-center-v2/src/routes/canvas.ts`
   - 구 미팅 종속 캔버스.
   - `GET /api/meetings/:meetingId/canvas`, thread canvas, whiteboard, canvas WS room 로직이 있다.
   - 이번 v0.1에서는 마이그레이션 참고용으로만 보고, 새 화면은 `/api/canvases` 중심으로 만든다.

4. `G:/Lucas-Initiative/command-center/frontend/src/components/MeetingCanvas.tsx`
   - 기존 회의 캔버스 UI 패턴 참고용.

5. `G:/Lucas-Initiative/meeting-canvas/`
   - 과거 canvas 실험체. 필요한 UX 아이디어만 참고한다.

## Phase 1 구현 범위: LCC 터미널뷰

### v0.1 필수 기능

- 에이전트 신규 생성
  - UI 버튼: `+ Agent`
  - 입력: `id`, `name`, `team`, `cwd`, `cmd`, `args`
  - 호출: `POST /api/sessions`
  - 기본값 권장:
    - `cmd`: `cmd.exe` 또는 `powershell.exe`
    - `cols`: 140
    - `rows`: 36

- 에이전트 삭제
  - UI 버튼: 각 카드의 stop/delete
  - 호출: `DELETE /api/sessions/:id`
  - 삭제 전 confirm 1회

- 그리드 형태 터미널
  - 2~4열 responsive grid.
  - 각 cell은 `header + xterm panel + prompt bar`.
  - grid cell은 고정 min-height를 둔다. hidden terminal collapse 방지.

- PTY 통신
  - 사용자가 특정 agent 카드에서 prompt 입력.
  - `sendPrompt` 또는 `/api/sessions/:id/write`로 해당 PTY에 전송.
  - "에이전트 간 통신" v0.1은 브로커를 새로 만들지 말고, UI에서 대상 agent를 선택해 해당 PTY에 메시지를 주입하는 방식으로 시작한다.
  - 메시지 템플릿:
    ```text
    [FROM {senderId} TO {targetId}] {content}
    ```

### 구현 위치 제안

최소 시간 경로:

1. 새 단일 페이지 추가
   - `G:/Lucas-Initiative/command-center-v2/public/lcc-core-v01.html`
   - 장점: React 빌드 없이 빠르게 검증 가능.
   - xterm을 새로 CDN에서 가져오면 안 되므로, 이 경로는 터미널 "preview + input" 수준으로 시작하거나 repo-local xterm asset을 복사/번들해야 한다.

권장 경로:

1. React 기존 터미널을 재사용
   - `G:/Lucas-Initiative/command-center/frontend/src/components/LccCoreTerminalView.tsx` 신규
   - `TerminalGrid.tsx`, `TerminalPanel.tsx`, `useTerminalSocket.ts` 패턴 재사용
   - route/tab에 `lcc-core` 추가

### API 호출 예시

```bash
curl -X POST http://localhost:9000/api/sessions ^
  -H "Content-Type: application/json" ^
  -d "{\"id\":\"lcc-agent-1\",\"name\":\"LCC Agent 1\",\"team\":\"lcc\",\"cmd\":\"cmd.exe\",\"cols\":140,\"rows\":36}"
```

```bash
curl -X POST http://localhost:9000/api/sessions/lcc-agent-1/write ^
  -H "Content-Type: application/json" ^
  -d "{\"input\":\"echo hello from lcc-agent-1\"}"
```

```bash
curl -X DELETE http://localhost:9000/api/sessions/lcc-agent-1
```

### Phase 1 완료 기준

- `/api/health` 정상.
- UI에서 agent 2개 이상 생성 가능.
- 생성된 agent가 grid에 표시됨.
- 각 agent에 prompt 전송 시 해당 터미널/preview에 출력 반영.
- agent A 카드에서 target B를 선택해 `[FROM A TO B] ...` 메시지를 B PTY로 주입 가능.
- 삭제 후 grid와 `/api/sessions` 목록에서 제거 또는 inactive 처리 확인.
- PTY daemon 코드 변경 없음.

## Phase 2 구현 범위: 캔버스 중심 미팅

### 방향 전환

기존 흐름:

```text
meeting -> thread -> canvas
```

새 v0.1 흐름:

```text
canvas(issue workspace) -> participants -> messages/activity -> optional meeting link
```

즉, "회의방"이 주체가 아니라 "이슈별 공통 캔버스"가 주체다. 미팅 메시지는 캔버스의 보조 activity로 붙인다.

### v0.1 필수 기능

- 이슈 캔버스 생성
  - `POST /api/canvases`
  - 필드: `title`, `owner`, `canvas_type: "issue"`, `members`, `linked_issues`, `linked_meetings`

- 캔버스 목록
  - `GET /api/canvases?status=active`
  - 카드 정보: title, owner, members, updated_at, linked_issues

- 캔버스 상세
  - `GET /api/canvases/:id`
  - `GET /api/canvases/:id/content`
  - sections 구조는 JSON array.
  - 기본 섹션:
    - `Problem`
    - `Decision`
    - `Tasks`
    - `Evidence`
    - `Terminal Agents`

- 캔버스 중심 채팅
  - `POST /api/canvases/:id/messages`
  - 기존 `POST /api/meetings/:id/speak`는 필요한 경우 mirror 정도만 한다.

- 에이전트 초대
  - `POST /api/canvases/:id/invite`
  - Phase 1의 agent 목록과 연결해 "이 캔버스에 agent 배정" UX 제공.

### 화면 구조 제안

```text
Left rail: Canvas list / issue filter
Main: Canvas sections editor
Right rail: Participants + agent terminal mini-actions + canvas messages
Bottom optional: linked terminal grid drawer
```

카드 남발보다 작업 화면처럼 밀도 있게 만든다. v0.1에서 큰 히어로/랜딩 페이지는 만들지 않는다.

### 데이터 모델 원칙

- 새 테이블을 만들기 전 `canvases`, `canvas_messages`를 우선 사용한다.
- `content JSONB`에 섹션 상태를 저장한다.
- 캔버스와 미팅 연결은 `linked_meetings` JSONB 배열로 둔다.
- 캔버스와 이슈 연결은 `linked_issues` JSONB 배열로 둔다.
- SQL은 반드시 parameterized query.

### Phase 2 완료 기준

- 이슈별 캔버스 생성/목록/상세가 동작.
- 캔버스 content 섹션 전체 저장 및 부분 수정이 동작.
- 캔버스 메시지 추가/조회가 동작.
- 멤버 invite/remove가 동작.
- 기존 미팅 thread를 만들지 않아도 캔버스에서 협업 기록이 시작됨.
- 기존 `meetings.ts`의 author/targets/dedup guard를 우회하는 새 speak 경로를 만들지 않음.

## 빠른 구현 순서

1. `dev` 최신 상태 확인.
2. `curl http://localhost:9000/api/health`로 서버 생존 확인.
3. `curl http://localhost:9000/api/sessions`와 `curl http://localhost:9000/api/workers` 응답 구조 캡처.
4. Phase 1 UI 먼저 구현.
5. `POST /api/sessions`, `DELETE /api/sessions/:id`, `/ws/terminal` attach/sendPrompt 연동.
6. agent-to-agent 메시지 주입은 별도 백엔드 없이 target PTY write로 완성.
7. Phase 1 검증 스크린샷/로그 남김.
8. Phase 2에서 `/api/canvases` 중심 화면 추가.
9. 기존 meeting thread 화면과 연결은 "linked meeting" 수준으로 제한.
10. 최종 검증 결과를 `.coordination/` 또는 담당 agent output에 남김.

## 검증 명령

```bash
bun test
```

```bash
curl http://localhost:9000/api/health
```

```bash
curl http://localhost:9000/api/sessions
```

```bash
curl http://localhost:9000/api/canvases
```

## 리스크와 대응

- 리스크: 기존 `/api/sessions` 라우트가 `sessions-pty.ts`와 `sessions.ts`에 나뉘어 있어 라우팅 순서 영향을 받을 수 있다.
  - 대응: `command-center-v2/src/main.ts`의 `/api/sessions PTY 제어`와 `/api/sessions 확장` 순서를 확인하고, 새 UI는 현재 동작하는 endpoint만 사용한다.

- 리스크: xterm을 단일 HTML에서 새로 쓰려면 asset 문제가 생긴다.
  - 대응: 빠른 v0.1은 React 기존 `TerminalPanel` 재사용이 가장 안전하다.

- 리스크: 미팅 중심 API를 그대로 확장하면 thread/targets/dedup 정책에 묶여 속도가 떨어진다.
  - 대응: 새 협업 화면의 주체는 `/api/canvases`로 고정하고, `meetings.ts`는 호환/링크 용도로만 사용한다.

- 리스크: PTY daemon 수정 유혹.
  - 대응: 절대 수정하지 않는다. 필요한 기능은 `sessions-pty.ts`, `ws/terminal.ts`, frontend에서 해결한다.

## dev-2에게 넘길 한 줄 지시

외부 Codex는 먼저 `TerminalGrid.tsx + useTerminalSocket.ts + sessions-pty.ts + ws/terminal.ts`만 보고 LCC 터미널 그리드를 완성하고, 다음 단계에서 `canvases.ts` 중심으로 이슈 캔버스 화면을 붙인다. `server/daemon`과 기존 미팅 thread 중심 구조는 건드리지 않는다.
