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
