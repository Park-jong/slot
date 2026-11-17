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
