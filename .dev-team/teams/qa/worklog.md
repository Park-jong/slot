# QA 팀 업무 기록

> 관리: QA 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 프로토타입 검증 (스펙 §6 + 코딩 규칙)
- 지시: 디렉터 / 관련 마일스톤: M1 코어 전투 프로토타입 / 처리한 요청: 없음 (Tech의 밸런스 허용오차 결정 요청 응답)
- 참여 팀원: tester, code-reviewer
- 산출물: `src/core/spec-gaps.test.ts` (신규 테스트 7건; 전체 8파일 62건 통과). typecheck/build 통과. 별도 보고서 파일 없음(보고서로 전달).
- 결정 사항:
  - 스펙 §6 11항목 모두 테스트/검증 가능한 동작으로 커버됨. 예시 5의 4턴은 M1 데이터로 불가능함을 전수 확인(공격 피해 최소 6, shield_bash 1줄 합3은 피해 3이나 방어 3 동반 -> HP 38). 테스트 전용 액션 사용 승인.
  - 밸런스 회귀: 20k 판 유지, 허용오차를 ±3pp에서 ±1pp로 강화(필수). 시드 고정이라 flaky 없음, 현재 시드 편차 고블린 -0.36pp / 슬라임 0pp. 200k ±1pp는 별도 opt-in 스크립트(약 5.5초)로 추가 권장.
  - 선언된 이탈 8건 모두 수용(7번은 횟수만 수용, 허용오차는 불가).
  - 판정: CHANGES REQUESTED (must fix 1건: balance.test.ts:9 허용오차).
- 남은 문제: should fix 10건(spin rng 범위검사, 티어 정렬 가정, 중복 효과 id 규칙, evaluateOutcomes 위치, validateConfig 분리 등) Tech로 전달. 스펙 §1.4/§2.3/§2.4 및 예시 5 문구 갱신을 Design에 요청. 시드 UI 노출은 M3 이전에 디버그 플래그로 숨길 것.

## 2026-11-17 — M1 재검증 (1차 CHANGES REQUESTED 후속)
- 지시: 디렉터 / 관련 마일스톤: M1 / 처리한 요청: 없음
- 참여 팀원: QA 팀장 직접 확인
- 산출물: 없음(확인만). typecheck/build 통과, `npm test` 72/72(8파일, 200k 테스트 미포함), `npm run test:balance` 2/2 통과(약 5초).
- 결정 사항: must-fix(balance.test.ts 허용오차 ±1pp, 20k) 반영 확인. spin.ts rng 범위 검사, selectTier 정렬 무관 선택, 예시 5 주석/실데이터 테스트 확인. 판정 APPROVED.
- 남은 문제: 보류된 should fix(4~11, 시드 디버그 플래그)는 Tech 요청으로 기록 예정.

## 2026-11-17 — M2 구현 검증 (스펙 + 코딩 규칙 + 런 밸런스)
- 지시: 디렉터 / 관련 마일스톤: M2 리일 편집 루프와 한 판 완주 / 처리한 요청: 없음 (REQ-003 정리 완료 여부 확인)
- 참여 팀원: tester(검증), tester(밸런스), code-reviewer
- 산출물: `src/core/m2-spec-gaps.test.ts`(31건), `src/test-support/run-balance-sim.ts`, `src/core/run-balance.test.ts`(3000판, npm test), `src/core/balance.run.full.test.ts`(200k, test:balance). typecheck/build 통과, npm test 247건 통과.
- 결정 사항:
  - 밸런스: 실제 엔진이 디자인 sim과 동일 시드에서 200k 기준 완전 일치(승률 59.04%, 보스 빈 턴 14.67%, 무편집 승률 1.60%). 3000판 시드 1은 스펙 §10과 일치(59.9/14.9). 허용오차: 디자인 대비 승률 4.5 SE(약 0.5pp), 빈 턴/무편집 0.3pp; 3000판 퀵 테스트는 ±0.1pp 회귀 가드. 퀵은 npm test, 200k는 test:balance.
  - 59.9%는 3000판 값이고 200k에서는 약 59%(정책 점수 표본에 따라 시드별 56.7~59.4%). 보스 빈 턴은 200k에서 14.5~14.9%로 목표 15% 미만이라 디자인 결정 필요.
  - 선언된 이탈 6건 중 5건 수용, 6번(UI 변화량을 반올림 전 값으로 계산)은 반려.
  - REQ-003 12항목 모두 완료. `.dev-team/roadmap.md:74`는 아직 미체크 상태(기록 갱신 필요).
  - 판정: CHANGES REQUESTED (must fix 1건: 강화 규칙 이중 구현).
- 남은 문제: must fix: `reel-analysis.ts:49,142-148`(grade+1)와 `reel-edit.ts:62-67`(nextGrade) 불일치. should fix 10건(formatDelta 반올림, startRun 데이터 조기 검증, resolveRunTurn export, 시드 DEV 게이트, grades 폴백, createM1BattleConfig 이름 등)은 Tech로 전달. 디자인에 스펙 §10 수치 주석 및 API 변경 반영 요청.

## 2026-11-18 — M2 재검증 (1차 CHANGES REQUESTED 후속)
- 지시: 디렉터 / 관련 마일스톤: M2 / 처리한 요청: 없음
- 참여 팀원: QA 팀장 직접 확인
- 산출물: 없음(확인만). typecheck 통과, `npm test` 21파일 252건, `npm run test:balance` 2파일 9건(약 45초), build 통과.
- 결정 사항: must fix(강화 규칙 이중 구현)는 `nextGrade` 단일 규칙으로 해결 확인(ENHANCE_GRADE_STEP 제거, 빈 등급 테이블/최상위 등급 테스트 존재). 항목 2~8 코드 확인. UI 변화량은 반올림 값 기준(-3.4%p), 발동 불가 표시는 정확 확률 0일 때만: 둘 다 수용. 판정 APPROVED.
- 남은 문제: 보류된 should fix(REWARD_GRADES 중복/`?? 0`, `as ReelSymbol` 캐스트, 소규모 중복, LABELS 밖 라벨, data-sim 동기화 테스트)는 Tech 요청으로 기록 예정. 디자인에 스펙 §10 수치 주석/API 변경 반영 요청, 보스 빈 턴 14.7%(목표 15% 미만) 결정 필요.

## 2026-11-18 — M2.5 다중 스핀 검증
- 지시: 디렉터 / 관련 마일스톤: M2.5 / 처리한 요청: REQ-009, REQ-010, REQ-011
- 참여 팀원: code-reviewer(UI 리뷰), tester(밸런스 시뮬레이터와 테스트)
- 산출물: src/test-support/multispin-balance-sim.ts, src/core/run-balance-m25.test.ts, src/core/balance.multispin.full.test.ts, run-balance-sim.ts 헤더 주석
- 결정 사항: 설계 sim과 같은 시드·청크 구조로 이식해 승수 완전 일치(max 910/2000, smart 1240/2000 등). 대형 smart는 12000판(판당 약 10ms, 훅 한도 때문). npm test 409건, test:balance 27건(315초), build 통과. 코어/데이터 must fix 없음, UI must fix 없음.
- 남은 문제: UI should fix 7건(turn-format 1회 최대 시 Focus 문구, nextMultiplierNum, runTurnStats 등). 760px 이하 시각 확인과 DOM 테스트(REQ-004)는 사람 확인 필요.
