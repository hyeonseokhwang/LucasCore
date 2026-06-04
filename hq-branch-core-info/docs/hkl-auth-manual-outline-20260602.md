# Heungkuk Life Integrated-Auth Manual Outline Notes

Date: 2026-06-02
Agent: hkl-tf-1
Role: hkl-tf-manual-outline
Ledger item: hkl-auth-manual-handover-20260602
Mode: normal

## 1. Scope

This note prepares the Korean manual/handover structure for Heungkuk Life integrated authentication work. It is based on local source and local project documents only. No product code was edited.

Target readers:

- End users performing app-based authentication or certificate actions
- Operators/QA staff reproducing or validating the flow
- Handover owners who need exact local evidence paths

## 2. Primary evidence used

Local documents:

- `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md`
- `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md`
- `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md`
- `D:\WorkSpace\HeungKukLife\공동인증서_Android_입력오류_ITO_보고.md`
- `D:\WorkSpace\HeungKukLife\ReadMe.txt`
- `D:\WorkSpace\HeungKukLife\안드로이드 수정사항.txt`

Android source:

- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\activity\GateActivity.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\config\Config.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\AndroidManifest.xml`

Reference workspaces inventoried:

- `D:\WorkSpace\HeungKukLife_0516_Final\doc`
- `D:\drive-download-20260506T042238Z-3-001`
- `D:\WorkSpace\HeungKukLife`
- `D:\WorkSpace\HeungKukLife-popup-stable`
- `D:\WorkSpace\HeungKukLife-popup-final`

## 3. Observed real Android auth flow

### 3.1 Main WebView boot and bridge registration

- `SplashActivity.kt:753-781` initializes the main WebView settings.
- `SplashActivity.kt:762-763` explicitly allows `window.open()` and multiple windows.
- `SplashActivity.kt:783-899` loads the main WebView and registers:
  - `HklifeHybrid` at `SplashActivity.kt:881-887`
  - `HKAndroidPlainInput` at `SplashActivity.kt:888`
  - `vestfin` at `SplashActivity.kt:908`
- `SplashActivity.kt:844-848` calls `injectJntMngAndroidInputFix(...)` on page finish, which is relevant to the certificate input recovery discussion.

### 3.2 Main JS bridge entry points

- `HklifeHybrid.kt:50-57` receives JSON from the web layer through `execute(param: String)`.
- Certificate-management actions route to native `SignActivity`:
  - `sign`: `HklifeHybrid.kt:70-78`
  - `signVid`: `HklifeHybrid.kt:80-88`
  - `delete`: `HklifeHybrid.kt:90-97`
  - `export`: `HklifeHybrid.kt:99-106`
  - `import`: `HklifeHybrid.kt:108-115`
  - `changePw`: `HklifeHybrid.kt:117-124`
  - `manage`: `HklifeHybrid.kt:126-133`
- Third-party auth launch points:
  - Kakao: starts at `HklifeHybrid.kt:138`
  - Naver: `HklifeHybrid.kt:191-243`
  - PASS: `HklifeHybrid.kt:245-260`

### 3.3 Custom-scheme return path

- App scheme constants are defined in `Config.kt:63-65` and `Config.kt:152-153`.
- Android manifest declares return hosts in `AndroidManifest.xml:107-112`:
  - `hklifem://kakaocert`
  - `hklifem://navercert`
  - `hklifem://passcert`
  - `hklifem://tosscert`
- `GateActivity.kt:43-66` dispatches callback payloads by host:
  - Kakao uses `tx_id`
  - Naver uses `txId`
  - PASS uses `code`
  - Toss accepts both `tx_id` and `txId`

### 3.4 Back navigation and popup handling

- Main back handling is in `SplashActivity.kt:528-535`.
- When the app is already launched, back goes through `javascript:common.util.prev()` rather than plain native history.
- Certificate popup handling is implemented in `SplashActivity.kt:2274-2425`.
- Important popup behaviors:
  - popup close cleanup: `SplashActivity.kt:2295-2329`
  - `onCloseWindow`: `SplashActivity.kt:2342-2345`
  - auth popup detection by URL: `SplashActivity.kt:2356-2404`
  - popup back behavior:
    - goBack when history exists: `SplashActivity.kt:2419-2421`
    - `window.close()` when history does not exist: `SplashActivity.kt:2422-2425`

## 4. Manual structure recommended

The final Korean manual should be split into four documents or four major sections in one document.

### A. End-user quick guide

Purpose:

- Explain what integrated authentication is used for
- Show the supported paths a customer can expect inside the app
- Keep wording procedural, not technical

Recommended section order:

1. 이용 전 준비사항
2. 앱 실행과 기본 진입 경로
3. 간편인증 진행 방법
4. 공동인증서 진행 방법
5. 인증 완료 후 결과 확인
6. 자주 발생하는 실패 상황과 조치

### B. Operator/CS response guide

Purpose:

- Help operators identify which path the customer used
- Distinguish app issue, external certificate-app issue, popup issue, and keyboard/input issue

Recommended section order:

1. 문의 접수 시 필수 확인 항목
2. 인증 수단별 분류 기준
3. 앱 내 재현 경로
4. 실패 증상별 1차 분류표
5. 이관 기준

### C. QA/handover verification guide

Purpose:

- Turn the release gate and popup/input risk into a repeatable checklist

Recommended section order:

1. 테스트 환경
2. 메인 WebView back 검증
3. popup open/close 검증
4. 공동인증서 입력 및 Android back 검증
5. 기기/OS 조합 기록 양식

### D. Technical appendix

Purpose:

- Preserve exact paths, bridge names, and callback parameters for maintainers

Recommended section order:

1. 브리지 이름과 method map
2. scheme/host/callback parameter map
3. popup/back lifecycle note
4. known issue note
5. local source and doc index

## 5. Korean manual draft skeleton

Below is the recommended reader flow for the actual Korean manual prose.

### 5.1 사용자용 본문 골격

1. `개요`
   - 흥국생명 앱에서는 인증 업무가 웹 화면과 Android 네이티브 브리지, 외부 인증 앱, 공동인증서 WebView popup 흐름으로 연결된다.
2. `인증 전 준비`
   - 네트워크 연결 확인
   - 외부 인증 앱 설치 여부 확인
   - Android 뒤로가기 사용 시 입력 중 화면 이탈을 최소화하도록 안내
3. `간편인증 진행`
   - 카카오/네이버/PASS 선택
   - 외부 앱 이동
   - 인증 완료 후 앱 복귀
4. `공동인증서 진행`
   - 공동인증서 화면 진입
   - 이름/생년월일 등 입력
   - popup 화면 내 뒤로가기 동작 안내
   - 완료 후 결과 반영 확인
5. `오류 시 조치`
   - 외부 인증 앱 미설치
   - popup 닫힘 후 입력 불가
   - Android 뒤로가기 후 재진입 입력 이상

### 5.2 운영자용 본문 골격

1. 고객이 사용한 인증 수단 확인
2. 실패 시점 확인
   - 외부 앱 실행 전
   - 외부 앱 실행 후 복귀 전
   - 앱 복귀 후 callback 반영 단계
   - 공동인증서 popup 단계
3. Android back 사용 여부 확인
4. popup 닫힘 방식 확인
   - 사이트 닫기
   - `window.close()`
   - system back
5. 재현 로그 수집 항목 정리

## 6. Operator procedure draft

### 6.1 문의 접수 시 필수 질문

- 어떤 인증 수단을 사용했는지
- 어느 화면 URL 또는 메뉴에서 시작했는지
- 외부 앱으로 이동했는지
- 앱으로 복귀했는지
- Android 뒤로가기를 눌렀는지
- popup이 열렸는지, 닫힌 직후 화면이 멈췄는지
- 입력 불가가 이름 필드인지 다른 필드인지
- 기기 모델, Android 버전, navigation mode

### 6.2 1차 분류 기준

- 외부 앱 미설치/실행 실패:
  - Kakao/Naver/PASS launch path 점검
  - relevant source: `HklifeHybrid.kt:191-243`, `HklifeHybrid.kt:245-260`
- 앱 복귀 callback 이상:
  - scheme/host/parameter mapping 점검
  - relevant source: `GateActivity.kt:43-66`, `AndroidManifest.xml:107-112`
- popup/back 이상:
  - relevant source: `SplashActivity.kt:2295-2425`
- 공동인증서 입력 이상:
  - relevant docs: `Android_final_release_gate_checklist.md`, `공동인증서_Android_입력오류_ITO_보고.md`

## 7. Known risk that must be explicit in the handover

The manual must not imply that the certificate-input issue is fully solved.

Evidence:

- `Android_final_release_gate_checklist.md:14-16` states the certificate input recovery feature flags are currently off:
  - `isJntInputFixEnabled() == false`
  - `isJntNativeBridgeEnabled() == false`
- `공동인증서_Android_입력오류_ITO_보고.md:46-66` describes the remaining hypothesis:
  - likely interaction among WebView, Android IME/focus lifecycle, and nppfs/Inca security keypad behavior
  - supplier or certificate-page-side confirmation is still needed

Required handover wording:

- 현재 앱에는 공동인증서 popup/back 처리 코드가 존재하지만, Android 입력 복구 문제는 완전 종결로 표기하면 안 된다.
- 운영 매뉴얼에는 “Android 뒤로가기 후 재진입 입력 이상”을 독립 장애 유형으로 남겨야 한다.

## 8. Blockers

- The local docs/source inspected here are sufficient for the manual outline, but not sufficient to finalize a customer-safe step-by-step script for every integrated-auth variant.
- The strongest remaining blocker is unresolved behavior around certificate-screen input recovery after Android back.
- The G10 planning docs exist, but final production operator wording should not be merged from those docs until the live branch target and real rollout scope are confirmed.

## 9. Residual risk

- Popup logic and callback routing are source-backed, but actual customer wording still needs validation against the currently shipped app branch/package.
- The certificate-screen issue appears lifecycle-related, not just text validation related, so troubleshooting text must stay conservative.
- Several reference documents were authored for planning/analysis phases; they are useful, but should not be treated as runtime truth without a package/build confirmation.

## 10. Next action

Next drafting move for hkl-tf-1:

1. Convert this outline into Korean manual prose with separate end-user and operator sections.
2. Keep exact path evidence in an appendix.
3. Leave the certificate-input issue explicitly open until QA or Android owner provides a verified resolution state.
