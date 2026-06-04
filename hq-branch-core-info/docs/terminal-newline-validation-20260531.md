# 터미널 개행 검증 시나리오

일자: 2026-05-31 KST

범위: 9002 단일 운영 기준의 터미널 입력/전송 경로, PTY 주입, 메모리 로그 정책 검증.

## 운영 원칙

- 당분간 운영 포트는 `9002`만 사용한다.
- 검증 중 `9002` 프로세스, live PTY 세션, Spring MSA TF 세션을 죽이거나 재시작하지 않는다.
- 종료된 TF 세션을 재사용해야 할 때만 해당 종료 세션을 삭제하고 같은 ID로 재생성한다.
- 검증 입력은 운영 메시지와 구분되도록 `newline-validation-20260531` 표식을 포함한다.
- 토큰, 세션 비밀값, 개인 인증정보는 화면 출력, 로그, 문서에 남기지 않는다.

## 테스트 케이스

| ID | 시나리오 | 입력 | 기대 결과 | 실패 기준 |
|---|---|---|---|---|
| NL-001 | 단일 행 제출 | `newline-validation-20260531 single-line` | 본문은 그대로 PTY에 들어가고 제출키는 최종 `CR` 1회만 사용된다. | 본문 뒤에 불필요한 LF/CR이 붙거나 제출되지 않는다. |
| NL-002 | trailing newline 제거 | 끝에 빈 줄이 붙은 단일 메시지 | 전송 직전 trailing newline은 제거되고 최종 `CR`만 제출키로 사용된다. | 저장/전송 본문 끝에 불필요한 빈 줄이 남는다. |
| NL-003 | CRLF 정규화 | `line1\r\nline2\r\nline3` | 본문 내부 CRLF는 LF로 정규화되어 `line1\nline2\nline3`으로 보존된다. | 내부 개행이 제거되거나 CRLF가 그대로 누적된다. |
| NL-004 | 다중행 LF 보존 + 최종 CR 제출 | `line1`, `line2`, `line3` | 본문 내부 LF는 보존되고 마지막 제출 신호로 `CR` 1회만 주입된다. | 내부 LF가 사라지거나 최종 제출이 LF/CSI/bracketed paste로 처리된다. |
| NL-005 | CSI Enter 방지 | Enter 제출 경로 관찰 | `\x1b[13;1u` 같은 CSI Enter가 PTY에 들어가지 않는다. | CSI 계열 Enter escape sequence가 로그나 PTY 원문에 보인다. |
| NL-006 | bracketed paste 미사용 | 다중행 본문 제출 | `\x1b[200~`, `\x1b[201~`가 사용되지 않는다. | bracketed paste 시작/종료 시퀀스가 기록된다. |
| NL-007 | Spring MSA TF PTY 주입 | TF 세션에 표식 포함 다중행 본문 주입 | 대상 세션에서만 본문 LF와 최종 CR 제출이 확인된다. | 무응답, 중복 제출, 대상 외 세션 오염이 발생한다. |
| NL-008 | 메모리 로그 정책 | 큰 로그 세션 조회 | 파일 로그는 보존하되 API preview/log 조회와 웹 scrollback은 tail만 유지한다. | 전체 로그를 메모리에 적재하거나 브라우저가 장시간 로그를 무제한 유지한다. |
| NL-009 | API/WS 경로 비교 | `/write`, WS `sendPrompt`, WS `input`+delayed CR | semantic 경로는 모두 LF 보존 + 최종 CR, raw input은 명시 입력 그대로 처리된다. | 경로별 결과가 의도와 다르거나 raw input이 자동 제출된다. |
| NL-010 | 빈 입력과 newline-only | `""`, `\n`, `\r\n\r\n` | 본문은 비고 최종 제출키 `CR` 1회만 사용된다. | 빈 줄이 중복 제출되거나 제출키가 누락된다. |
| NL-011 | 내부 빈 줄 보존 | `line1\n\nline3\n` | 내부 빈 줄은 보존되고 trailing newline만 제거된다. | 내부 빈 줄이 사라지거나 trailing newline이 본문에 남는다. |
| NL-012 | 한글 IME Enter | 조합 중 Enter, 조합 종료 직후 Enter | 조합 중 Enter는 제출하지 않고, 조합 종료 후 명시 Enter만 제출한다. | 조합 중 제출되거나 조합 종료 후 입력이 누락된다. |
| NL-013 | Shift+Enter | 카드/풀스크린 composer에서 Shift+Enter 후 Enter | Shift+Enter는 본문 개행, Enter는 제출로 동작한다. | Shift+Enter가 제출되거나 본문 LF가 사라진다. |
| NL-014 | raw xterm paste | 터미널 본체에 다중행 paste | raw xterm 경로의 `\n -> \r` 동작을 별도 위험으로 기록하고 composer 제출과 혼동하지 않는다. | raw paste가 composer submit과 같은 의미로 오인되어 회귀한다. |
| NL-015 | 고부하 순서보장 | 큰 출력 중 20회 연속 delayed CR 제출 | 본문 전송 후 최종 CR 순서가 유지되고 누락/역전이 없다. | 본문과 CR 순서가 바뀌거나 제출이 누락된다. |
| NL-016 | 새로고침/세션오염 | 전송 직후 새로고침, 대상 변경 직후 제출 | 같은 target session에만 표식이 남고 중복 제출이 없다. | stale target으로 오송신되거나 대상 외 로그에 표식이 남는다. |

## Spring MSA TF PTY 주입 절차

1. `9002`의 `joon-msa`, `spring-msa-research-1`, `spring-msa-research-2`, `spring-msa-research-3` 상태를 확인한다.
2. 세션이 명령 수행 중이면 강제 중단하지 않고 입력 대기 상태가 될 때까지 기다린다.
3. 종료된 TF 세션은 해당 ID만 삭제한 뒤 같은 ID와 같은 workspace로 재생성한다.
4. 다음 본문을 raw WS `input`으로 먼저 보낸다.

```text
REPORT newline-validation-20260531 spring-msa-tf session=<session-id>
line-a: Spring MSA TF newline verification
line-b: preserve LF inside body
line-c: submit once with final CR
```

5. 본문 전송 후 300ms 대기하고 `\r`만 별도 raw WS `input`으로 보낸다.
6. 대상 세션 로그에서 표식, 3개 본문 라인, 단일 제출 여부를 확인한다.
7. 다른 세션 로그에 같은 표식이 섞이지 않았는지 확인한다.

## 메모리 로그 검증

- 세션 preview는 tail만 표시되어야 한다.
- `/api/sessions/:id/log`는 파일 전체가 아니라 최신 tail만 반환해야 한다.
- 웹 터미널 scrollback은 카드/풀스크린/로그 모달별 제한을 따라야 한다.
- 전체 ANSI 로그 파일은 `data/terminal-logs/*.ansi.log`에 보존하되, API 응답이나 브라우저 메모리에 전체를 올리지 않는다.

## 자동 테스트 범위

- API: `cargo test prompt_submit -- --nocapture`
- Web: `.\scripts\bun.ps1 --cwd apps/web test`
- Build: `.\scripts\bun.ps1 --cwd apps/web build`
- 필수 통과 기준: API 8개, Web 5개 테스트 통과, Vite build 통과, 9002 health 유지.

## 9002 직원 분담

- `han-ops`: 운영/프로세스 검증, 9002 외 세션 정리 상태 확인.
- `joon-msa`: 개행 경우의 수 매트릭스 검토.
- `spring-msa-research-1`: API 테스트 커버리지 검토.
- `spring-msa-research-2`: 웹 테스트/빌드 커버리지 검토.
- `spring-msa-research-3`: 실제 9002 PTY 주입 결과와 세션 오염 여부 검토.

## 결과 기록 양식

```text
검증시각:
대상 세션:
입력 표식:
본문 라인 수:
제출키:
대상 세션 결과:
대상 외 세션 오염:
메모리/로그 관찰:
판정:
근거:
```

## 2026-05-31 최종 검증 기록

검증시각: 2026-05-31 16:43-16:48 KST

자동 테스트:

- API: `cargo test prompt_submit -- --nocapture` 통과, 8 passed.
- Web: `.\scripts\bun.ps1 --cwd apps/web test` 통과, 8 passed.
- Web build: `.\scripts\bun.ps1 --cwd apps/web build` 통과. Vite chunk size warning은 기존 번들 크기 경고이며 빌드 실패가 아니다.

9002 운영 정리:

- `lcc-core-api.exe`는 `target-9002\debug\lcc-core-api.exe` PID `19608` 하나만 유지.
- `codex.exe`는 9002 자손 6개만 유지.
- 9002 health 응답은 `ok=true`, `sessions=6`.
- 9002 외 9001/9003/9004/9100/9102 LCC API 프로세스는 혼선 방지를 위해 종료.

9002 직원 검증:

- `han-ops`: `REPORT newline-split-ops-r2 status=ok`.
- `joon-msa`: `REPORT newline-split-matrix status=gap`로 누락 케이스를 식별했고, NL-009~NL-016에 반영.
- `spring-msa-research-1`: `REPORT newline-split-api status=ok`.
- `spring-msa-research-2`: `REPORT newline-split-web-r2 status=ok`.
- `spring-msa-research-3`: r2 REPORT는 시간 내 미수신. 대신 전체 로그 검색으로 TF 4개 대상 세션의 표식과 3개 라인 수신을 확인.

실제 PTY 주입 검증:

- 검수 표식: `newline-validation-20260531-1640`.
- 대상: `joon-msa`, `spring-msa-research-1`, `spring-msa-research-2`, `spring-msa-research-3`.
- 결과: 네 대상 로그 모두 표식, `line-a`, `line-b`, `line-c` 확인.
- `han-ops`에는 해당 표식/라인 없음.
- `chief-min` 로그에는 지휘자가 실행한 검수 명령 출력이 남을 수 있으므로 대상 외 오염 판정에서 제외.

판정: 개행 제출 경로는 자동 테스트와 9002 실제 PTY 주입 기준으로 통과. 남은 주의점은 raw xterm paste가 composer submit과 다른 경로라는 점이며, 이는 NL-014에 별도 회귀 항목으로 고정한다.
