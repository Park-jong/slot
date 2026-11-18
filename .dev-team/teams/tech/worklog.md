# 개발 팀 업무 기록

> 관리: 개발 팀장. 작업이 끝날 때마다 맨 아래에 추가한다.

## 2026-11-17 — M1 전투 프로토타입 구현 (셋업·엔진·UI)
- 지시: 디렉터 / 관련 마일스톤: M1 / 처리한 요청: 없음
- 참여 팀원: client-programmer (엔진+테스트, UI 두 차례 순차 호출)
- 산출물: package.json, tsconfig.json, vite.config.ts, index.html, src/core/*, src/data/*, src/ui/*, src/main.ts (테스트 55개: core 42 + ui 13)
- 결정 사항: 엔진은 불변 상태·순수 함수로 spin/judge/resolve를 분리(M3 조작 단계 삽입 가능). 효과는 데이터의 deferred 플래그로 제어. 종료된 전투에 playTurn을 호출하면 예외(UI는 isBattleOver로 잠금). judge가 등급표를 인자로 받고 결과 형태에 firedLines를 추가(UI 하이라이트용). 시뮬 대비 승률 일치(슬라임 99.53%, 고블린 84.23%).
- 남은 문제: 명세 예시 5의 4턴(피해 3, 방어도 획득 없음)은 M1 데이터로 재현 불가라 테스트 전용 액션으로 검증함(설계 확인 필요). 회귀 테스트는 2만 회·±3%p(명세 제안은 20만 회·±1%p). 등급 2~4는 M1 릴에 없어 화면 미확인. 방패 강타는 거의 발동하지 않음(명세 미결 2번).

## 2026-11-17 — QA 1차 수정 요청 반영 (M1)
- 지시: 디렉터(QA CHANGES REQUESTED 전달) / 관련 마일스톤: M1 / 처리한 요청: 없음
- 참여 팀원: client-programmer
- 산출물: src/core/balance.test.ts(허용오차 ±1%p), balance-sim.ts, balance.full.test.ts(20만 회, `npm run test:balance`), spin.ts(rng 0<=v<1 검증), outcome.ts(selectTier 순서 무관), battle.test.ts(예시 5 주석 수정 + 실제 데이터 방패 강타 케이스), vite.config.ts, package.json
- 결정 사항: 20만 회 테스트는 vitest `--mode balance`로 분리해 기본 `npm test`에서 제외(Windows에서 cross-env 불필요). 전체 테스트 72개 통과, 20만 회 승률 슬라임 99.53% / 고블린 84.23%.
- 남은 문제: QA의 보류 should-fix 항목들은 별도 요청으로 접수 예정.

## 2026-11-17 — M2 런·릴 편집 구현
- 지시: 디렉터 / 관련 마일스톤: M2 / 처리한 요청: REQ-003 (REQ-004는 백로그)
- 참여 팀원: client-programmer(엔진·데이터·REQ-003, 이후 UI), engine-engineer(정확 릴 분석)
- 산출물: src/core/{effects,offers,reel-edit,run,run-flow,run-validation,config-validation,reel-analysis}.ts, src/data/run.ts, enemies/character 갱신, src/test-support/*, src/ui/{run-controller,edit-candidates,reel-format,run-format}.ts 및 views/* (테스트 212개 + balance 2개)
- 결정 사항: core가 data를 import하지 않도록 `startRun(definition)`에 런 정의(M2_RUN)를 주입(명세의 startRun(seed)와 다름, rng는 호출자가 하나 유지). `activeEffects`는 deferred 효과도 반환하고 실행기만 `executableEffects`로 거름(명세 예시 6 때문). 강화는 등급표의 다음 id. M1 단일 전투 모드/적 선택기 제거. 시드 표시는 `?debug`로만.
- 남은 문제: 뷰 DOM 테스트 없음(REQ-004). 퍼센트 변화량이 반올림 값 차와 0.1 다를 수 있음. 명세 12장 미결(주기, 보스 빈 턴 등)은 플레이테스트 후.

## 2026-11-18 — M2 QA 1차 수정 반영
- 지시: 디렉터(QA CHANGES REQUESTED 전달) / 관련 마일스톤: M2 / 처리한 요청: 없음
- 참여 팀원: client-programmer(1·6번 일부 선작업 후 사용량 한도로 중단), 이후 팀장이 직접 마무리(팀원 호출이 조직 규칙으로 거부됨)
- 산출물: reel-edit.ts의 단일 nextGrade를 reel-analysis가 공유(ENHANCE_GRADE_STEP 삭제, 등급 간격 테스트 추가), grades 필수화, run-validation.ts 즉시 실패 검증(보스 포함 적·보상표), resolveRunTurn 비공개, 시드 표시는 DEV && ?debug, createStartingBattleConfig로 이름 변경, 퍼센트 변화량을 표시값 기준으로 계산
- 결정 사항: 변화량은 표시값 차이라 예시 1b 빈 턴이 -3.4%p(정확값 차 -3.34). '발동 불가'는 정확한 확률 0일 때만 표시. 테스트 252개 + balance 9개 통과, typecheck·build 통과.
- 남은 문제: 보류 항목(REWARD_GRADES 중복, 하드코딩 라벨 등)은 별도 요청 대기.
