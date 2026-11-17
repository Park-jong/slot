# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 2건)

### REQ-003 [P2] M1 코드 리뷰에서 보류한 정리 항목 처리
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-17 · 마일스톤: M2
- 우선순위 근거: 동작에는 문제가 없고 QA 승인도 막지 않음. M2 작업 시작 시 함께 정리하는 것이 적절

QA 1회차 리뷰의 '권장 수정' 중 보류분: guard reflect 중복 항목 정리(src/data/actions.ts, outcome.ts activeEffects), evaluateOutcomes를 battle.ts에서 outcome.ts로 이동, validateConfig 분리 및 reels.length === GRID_SIZE·skillActionId 존재 검사 추가, judge.ts의 미사용 lineIds 제거, 'ignore_guard' 문자열 대신 EFFECT_IGNORE_GUARD 사용, test-helpers.ts를 src/test-support/로 이동(core→data 의존 역전 해소), EndPhase 타입을 core/types.ts로 이동, INSTANT_REELS를 ui-config.ts로 이동, balance 테스트 루프에 턴 상한, judge.test.ts의 judge.length 검사 제거, core/index.ts의 내부 함수 재수출 중단, 화면 상단 시드 표시를 디버그 옵션 뒤로 숨기기(M3 심볼 조작 전 필수: 시드로 모든 스핀을 예측 가능).

- 2026-11-17 메인 세션: 접수 — 우선순위 P2

### REQ-004 [P3] UI 테스트 환경과 저장 대비 난수 상태 노출
- 보낸 팀: QA 팀 · 유형: 요구사항 · 상태: 접수 · 접수: 2026-11-17
- 우선순위 근거: 현재 로드맵에 저장·서버 계획이 없고, UI 잠금은 수동 확인으로 검증됨. 개선 제안으로 백로그에 둠

(1) jsdom을 devDependency로 추가해, QA가 수동 확인한 '전투 종료 후 입력 잠금'(명세 §6 10번)을 커밋된 테스트로 만들기. (2) 이후 저장·불러오기나 서버 검증을 대비해 난수 상태(또는 뽑은 횟수)를 직렬화할 수 있게 노출. 서버를 둔다면 resolveTurn이 클라이언트가 보낸 격자를 받아들이면 안 됨.

- 2026-11-17 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (0건)

