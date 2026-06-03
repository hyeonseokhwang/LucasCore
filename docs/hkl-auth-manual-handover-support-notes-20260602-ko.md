# Heungkuk Life 통합인증 매뉴얼/인수인계 지원 메모

작성일: 2026-06-02  
작성 역할: `hkl-tf-4` 최종 편집/누락 점검  
대상 ledger item: `hkl-auth-manual-handover-20260602`

## 1. 이번 메모의 목적

이 문서는 최종 매뉴얼 본문 자체가 아니라, 최종 한국어 매뉴얼과 인수인계 패키지를 마감하기 전에 반드시 반영하거나 확인해야 할 편집 포인트, 누락 질문, 경로 근거, 잔여 리스크를 정리한 지원 메모다.

## 2. 최종 매뉴얼에 반드시 들어가야 할 핵심 구조

최종 매뉴얼 본문은 아래 6개 장으로 정리하는 편이 가장 안전하다.

1. 기능 범위
2. 현재 인증 진입 구조
3. Android 네이티브 소스 기준 동작 지점
4. 운영/QA 체크리스트
5. 알려진 이슈와 우회 불가 항목
6. 인수인계 패키지 목록

현재 확인된 근거상, 설명의 중심은 `SplashActivity.kt`가 되어야 한다. 공동인증서 팝업, Android back, WebView popup close, 파일 chooser, 일부 입력 보정 로직이 모두 이 파일에 집중되어 있다.

## 3. 편집 기준이 되는 실제 소스 경로

아래 경로들은 매뉴얼 본문에 그대로 인용 가능한 실제 근거 경로다.

- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\activity\SplashActivity.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\activity\auth\SignActivity.kt`
- `D:\WorkSpace\HeungKukLife\app\src\main\java\kr\co\heungkuklife\hklifem\bridge\HklifeHybrid.kt`
- `D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md`
- `D:\WorkSpace\HeungKukLife\공동인증서_Android_입력오류_ITO_보고.md`
- `D:\WorkSpace\HeungKukLife\안드로이드 수정사항.txt`
- `D:\WorkSpace\HeungKukLife-popup-stable\안드로이드 수정사항.txt`
- `D:\WorkSpace\HeungKukLife-popup-final\안드로이드 수정사항.txt`
- `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_G10_최종개발계획서_v2.md`
- `D:\WorkSpace\HeungKukLife_0516_Final\doc\HeungKukLife_WizVera_분석보고서.md`

## 4. 매뉴얼 본문에 반영해야 할 확인 사실

### 4-1. Android 인증 진입과 팝업 제어 중심 파일

- `SplashActivity.kt`는 메인 WebView, popup WebView, Android back 처리, file chooser, 공동인증서 관련 popup close fallback까지 함께 담당한다.
- `SplashActivity.kt` 안에 `/crtcnt/crtmth/jntMng/regist.do` URL 판별이 들어가 있으며, 공동인증서 등록 화면 특화 로직이 이 URL 기준으로 걸린다.
- 같은 파일에 `AndroidPlainInputBridge`, `injectJntMngAndroidInputFix(...)`가 존재해 입력 보정 실험 흔적이 남아 있다.
- `CustomWebChromeClient.onCreateWindow(...)` 안에서 인증 popup dialog를 만들고, `window.close()` fallback과 `onCloseWindow` 정리까지 처리한다.

### 4-2. 공동인증서 전자서명/관리 네이티브 셸

- `SignActivity.kt`는 `KoreaMintLibImpl`을 통해 `SIGN`, `SIGN_VID`, `DELETE`, `CHANGE_PW`, `IMPORT`, `EXPORT`, `MANAGER`를 실행한다.
- 따라서 최종 매뉴얼에서는 "공동인증서 엔진 진입 Activity"를 `SignActivity.kt`로 명시하는 것이 맞다.

### 4-3. 웹에서 네이티브 인증으로 넘어가는 브리지

- `HklifeHybrid.kt`는 `Config.SIGN`, `Config.SIGN_VID`, `Config.DELETE`, `Config.EXPORT`, `Config.IMPORT`, `Config.CHANGE_PW`, `Config.MANAGER`를 `SignActivity`로 라우팅한다.
- 같은 파일은 `Config.START_CERT`, `Config.NAVER_CERT`, `Config.PASS_CERT`, `Config.TOSS_CERT` 등 외부 인증 앱 브리지도 같이 가진다.
- 즉 최종 문서에서 "웹 호출 -> 네이티브 bridge -> Activity/외부 앱" 흐름도는 `HklifeHybrid.kt` 기준으로 써야 한다.

## 5. 현재 문서 세트에서 확인된 누락 질문

최종 매뉴얼 제출 전에 아래 질문은 답을 받거나, 미확정으로 명시해야 한다.

1. 최종 handover 대상 기준 저장소는 `D:\WorkSpace\HeungKukLife`인지, `D:\WorkSpace\HeungKukLife-popup-final`인지, 아니면 popup-safe 기준인 `D:\WorkSpace\HeungKukLife-popup-stable`인지.
2. 인수인계 패키지에 포함할 기준 APK/빌드 산출물 파일명이 무엇인지.
3. 공동인증서 입력 보정 로직을 "실서비스 활성 기능"으로 설명할지, "실험 흔적/feature flag off"로 설명할지.
4. WizVera G10 관련 계획 문서를 본 handover 범위에 포함할지, 별도 차기 과제로 분리할지.
5. 외부 파트너/ITO에 넘길 때 인코딩 깨짐 문서(`공동인증서_Android_입력오류_ITO_보고.md`, `Android_final_release_gate_checklist.md`)를 재정리본으로 교체할지 여부.

## 6. 최종 매뉴얼에서 빠지면 안 되는 운영/QA 항목

`D:\WorkSpace\HeungKukLife\Android_final_release_gate_checklist.md` 기준으로 아래 항목은 handover 체크리스트 본문에 살아 있어야 한다.

- 메인 back, sub WebView back, popup back 우선순위
- `window.open` popup 생성과 `window.close()` 종료 흐름
- 공동인증서 등록 화면 재진입 후 이름/생년월일 입력 재시도
- keyboard hide/show 이후 CTA 가림 여부
- popup 종료 후 메인 WebView 입력 복귀 여부
- white screen, blank WebView, 무한 로딩 발생 시 release block 판단

## 7. 편집 관점에서 바로 수정해야 할 표현 리스크

- 현재 근거 문서들 다수가 인코딩 깨짐 상태로 열려 한국어 본문 그대로 재사용하기 어렵다.
- 따라서 최종 매뉴얼은 "기존 문구 복사"가 아니라 "실제 코드/경로 기준 재서술" 방식으로 써야 한다.
- `안드로이드 수정사항.txt` 계열은 변경 이력 단서로는 유효하지만, 최종 사용자용 설명문으로는 부족하다.
- WizVera 계획 문서는 설계 자료로는 유효하지만, 현재 HKL integrated-auth manual의 즉시 운영 가이드로 넣기에는 범위가 넓다.

## 8. 권장 인수인계 패키지 인덱스

최종 전달 묶음은 아래 순서가 가장 명확하다.

1. 메인 매뉴얼: 기능 범위, 화면 흐름, 장애 포인트, 운영 주의사항
2. QA 체크리스트: Android back/popup/IME 중심
3. 소스 근거표: 파일 경로, 책임 위치, 관련 기능
4. 변경 이력 메모: `안드로이드 수정사항.txt` 3종 비교
5. 알려진 이슈 메모: 공동인증서 입력 오류, popup 안정화, 인코딩 문제

## 9. blocker

- 일부 핵심 참고 문서가 현재 콘솔에서 인코딩 깨짐 상태로 읽혀 문장 단위 재사용이 어렵다.
- TF1~TF3의 실제 본문 산출물은 이 턴에서 확인되지 않았고, `data/terminal-logs/hkl-tf-1.ansi.log` 등은 ANSI 노이즈가 커서 본문 인용 근거로 쓰기 어렵다.
- 최종 기준 브랜치/패키지 선택이 아직 명시적으로 잠기지 않았다.

## 10. residual risk

- 잘못된 기준 워크스페이스를 매뉴얼 기준본으로 잡으면 popup-safe 설명과 final 수정 설명이 충돌할 수 있다.
- feature flag 또는 실험 코드 상태를 오기재하면, 운영 측이 "현재 활성 기능"과 "잔존 실험 코드"를 혼동할 수 있다.
- 인코딩 깨진 기존 문서를 그대로 전달하면 외부 인수자 신뢰도가 떨어질 수 있다.

## 11. next action

추천 다음 액션은 아래 순서다.

1. 최종 기준 워크스페이스를 1개로 고정한다.
2. TF1 본문 초안에 본 메모의 3, 4, 5, 6절을 반영한다.
3. 인코딩 깨진 QA/ITO 문서는 한국어 정상 인코딩 재정리본으로 별첨한다.
4. 최종 전달 패키지에 "실제 기준 파일 경로 표"를 반드시 넣는다.
