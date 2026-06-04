# HKL Integrated-Auth Manual Handover Support Notes

Date: 2026-06-02
Agent: hkl-tf-2
Ledger item: `hkl-auth-manual-handover-20260602`
Mode: `normal`

## 1. Source of truth and inventory

- Planning/docs inventory:
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md`
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md`
- Main working source:
  - `D:\WorkSpace\HeungKukLife`
- Popup baseline/reference trees:
  - `D:\WorkSpace\HeungKukLife-popup-stable`
  - `D:\WorkSpace\HeungKukLife-popup-final`
- Download/archive mirror:
  - `D:\drive-download-20260506T042238Z-3-001`

## 2. Integrated-auth technical flow

### 2.1 Main WebView entry

- Main launcher/activity is `SplashActivity`.
- Main WebView back flow uses `javascript:common.util.prev()` from `handleBackPressed()`.
- Evidence:
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:339`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:346`

### 2.2 JS bridge entry points

- Android bridge class is `HklifeHybrid`.
- `execute()` dispatches integrated-auth actions from WebView JS into native code.
- Supported auth-related method constants include:
  - `certKakao`
  - `certNaver`
  - `certPass`
  - `certToss`
  - `sign`
  - `signVid`
  - `delete`
  - `import`
  - `export`
  - `manage`
  - `changePw`
- Evidence:
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:50`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:68`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\config\Config.kt:63`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\config\Config.kt:89`

### 2.3 Kakao, Naver, PASS, Toss scheme flow

- `HklifeHybrid.execute()` launches external auth apps by `Intent.ACTION_VIEW`.
- Completion returns through app scheme handled by `GateActivity`.
- Current callback hosts/parameters:
  - `kakaocert` -> `tx_id`
  - `navercert` -> `txId`
  - `passcert` -> `code`
  - `tosscert` -> `code`, `tx_id` or `txId`
- Evidence:
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:138`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:191`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:245`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt:283`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\GateActivity.kt:40`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\GateActivity.kt:43`

### 2.4 KoreaMint joint-certificate flow

- Joint certificate work is handled by native `SignActivity`.
- `SignActivity` creates a KoreaMint WebView wrapper, sets `Config.AUTH_URL`, and dispatches operations such as `sign`, `signVid`, `delete`, `changePw`, `import`, `export`, and `manager`.
- On callback, native posts `AuthEvent` and finishes the activity.
- Evidence:
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\auth\SignActivity.kt:31`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\auth\SignActivity.kt:67`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\auth\SignActivity.kt:69`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\auth\SignActivity.kt:74`

### 2.5 WebView popup and Android back handling

- Popup creation is in `SplashActivity.CustomWebChromeClient.onCreateWindow()`.
- Joint certificate popup detection currently keys off:
  - `/crtcnt/crtmth/jntMng/regist.do`
  - `https://auth.heungkuklife.co.kr`
- Joint certificate popup back behavior:
  - If popup WebView has history, call `goBack()`.
  - Otherwise call `window.close()`.
  - If `onCloseWindow()` does not arrive, force dialog close after 300ms fallback.
- Evidence:
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2047`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2061`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2091`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2148`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2154`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt:2160`

## 3. Build and artifact evidence

- App identity and SDK targets are consistent across `HeungKukLife`, `HeungKukLife-popup-stable`, and `HeungKukLife-popup-final`:
  - `applicationId "kr.co.heungkuklife.hklifem"`
  - `minSdk 23`
  - `targetSdk 35`
  - `versionCode 256`
  - `versionName "2.5.6"`
- Evidence:
  - `D:\WorkSpace\HeungKukLife\app\build.gradle:68`
  - `D:\WorkSpace\HeungKukLife\app\build.gradle:72`
  - `D:\WorkSpace\HeungKukLife-popup-stable\app\build.gradle:68`
  - `D:\WorkSpace\HeungKukLife-popup-final\app\build.gradle:68`
- Release artifact exists in the main working tree:
  - `D:\WorkSpace\HeungKukLife\app\build\outputs\apk\release\app-release.apk`
  - size: `41,195,642` bytes
  - timestamp: `2026-06-01 20:50:18`
- Release metadata:
  - `D:\WorkSpace\HeungKukLife\app\build\outputs\apk\release\output-metadata.json`
  - variant `release`
  - `versionCode 256`
  - `versionName 2.5.6`
- Additional build evidence:
  - `D:\WorkSpace\HeungKukLife\app\build\outputs\logs\manifest-merger-release-report.txt`
  - `D:\WorkSpace\HeungKukLife\app\build\outputs\sdk-dependencies\release\sdkDependencies.txt`
- Popup-stable debug artifact exists:
  - `D:\WorkSpace\HeungKukLife-popup-stable\app\build\outputs\apk\debug\app-debug.apk`
  - size: `44,823,201` bytes
  - timestamp: `2026-06-01 14:28:10`

## 4. Baseline and branch state evidence

- Enterprise popup-safe baseline commit:
  - `b2826b2abb738438d86a9a735b5a0e94af0e59bb`
  - subject: `fix: stabilize joint certificate WebView input and popup back`
- This commit exists in all three local repositories checked:
  - `D:\WorkSpace\HeungKukLife`
  - `D:\WorkSpace\HeungKukLife-popup-stable`
  - `D:\WorkSpace\HeungKukLife-popup-final`
- Current repo/worktree state:
  - `D:\WorkSpace\HeungKukLife` branch `test/android-ime-lock` is dirty.
  - `D:\WorkSpace\HeungKukLife-popup-stable` branch `release/popup-stable-ito` is dirty.
  - `D:\WorkSpace\HeungKukLife-popup-final` branch `release/popup-stable-350d225-commented` is clean.
- Relevant diffs:
  - Main working tree vs `b2826b2`: only `SplashActivity.kt` changed in committed history, but current working tree also has uncommitted changes in manifest/config/scraping files.
  - Popup-final vs `350d225`: `SplashActivity.kt` has the popup back stabilization delta (`71 insertions`, `2 deletions`) in committed history.

## 5. Release-gate and QA relevance

- Manual QA gate file exists and should be cited directly in the handover:
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md`
- Key gate areas named in that checklist:
  - Android back
  - popup close
  - IME/keyboard
  - tap dismiss
  - WebView popup
  - joint certificate input
- Joint certificate-specific expected behavior in the checklist:
  - popup `window.open` opens normally
  - popup back uses WebView history when present
  - popup close does not leave the main screen non-interactive
  - repeated entry/exit should not regress
- Evidence:
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md:6`
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md:29`
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md:37`
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md:40`
  - `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md:43`

## 6. Planning-document references for manual context

- The G10 planning doc explicitly records the current app package, WebView-centered architecture, and the role split between `SplashActivity`, `HklifeHybrid`, `GateActivity`, `Config.kt`, and `SignActivity`.
- Evidence:
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:17`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:22`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:25`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:92`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:93`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md:94`
- The analysis report records the AS-IS auth matrix, confirming that:
  - 공동인증서 uses native KoreaMint
  - Kakao/Naver/PASS use app-scheme return flow
  - KCB uses SubWebView
- Evidence:
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md:58`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md:60`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md:61`
  - `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md:64`

## 7. Blockers

- No hard blocker for documentation support.
- Text encoding is degraded in several legacy markdown files when viewed from the current terminal, so Korean prose should be written from validated behavior/path references rather than copied verbatim from those files.

## 8. Residual risk

- The main active workspace `D:\WorkSpace\HeungKukLife` is not equivalent to the popup-safe baseline because it has local uncommitted changes in:
  - `app/src/main/AndroidManifest.xml`
  - `app/src/main/java/kr/co/heungkuklife/hklifem/activity/SplashActivity.kt`
  - `app/src/main/java/kr/co/heungkuklife/hklifem/activity/scraping/LonsScrapResultActivity.kt`
  - `app/src/main/java/kr/co/heungkuklife/hklifem/config/Config.kt`
  - `app/src/main/java/kr/co/heungkuklife/hklifem/di/ApiModule.kt`
- `Config.SERVER_BASE_URL` currently points to `https://10.90.139.85:8443`, which is test-like and should be called out in any handover as environment-specific evidence, not assumed production truth.
- Popup stability logic is concentrated in `SplashActivity.kt`; any further IME/input or popup edits should be compared against `b2826b2` before release claims.

## 9. Next action

- Use this note as the technical evidence appendix for the Korean manual.
- Draft the manual sections in this order:
  1. 사용자 인증 흐름 요약: Kakao/Naver/PASS/Toss, 공동인증서, KCB.
  2. 운영/개발 소스 위치와 기준 브랜치.
  3. 빌드 산출물과 확인 포인트.
  4. 팝업/IME/뒤로가기 회귀 테스트 체크리스트.
