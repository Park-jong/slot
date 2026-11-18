# 개발 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 2건)

### REQ-006 [P2] M2 코드 리뷰에서 보류한 정리 항목과 데이터 동기화 테스트
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-18 · 마일스톤: M3
- 우선순위 근거: 동작에는 문제가 없고 QA 승인을 막지 않음. 다음 마일스톤(M3) 시작 시 정리. 밸런스 어긋남은 3,000판 회귀 테스트가 이미 감지함

src/data/run.ts의 REWARD_GRADES가 GRADES id를 중복하고 '?? 0'이 짧은 가중치 행을 숨김(5, 8행). run.ts 107, 117-118행의 'as ReelSymbol' 형변환 제거. 작은 중복 정리(FIRST_DISPLAY_NUMBER 두 곳 정의, stageIndex+1 재계산, 테스트 표기 파서 중복). reel-format.ts의 '평균 등급', '빈 턴', '2라인 이상' 문구를 LABELS로 이동. src/data 수치가 tools/sim/run-config.mjs와 어긋나지 않도록 데이터 동기화 테스트를 추가하거나 출처를 하나로 통합.

- 2026-11-18 메인 세션: 접수 — 우선순위 P2

### REQ-004 [P3] UI 테스트 환경과 저장 대비 난수 상태 노출
- 보낸 팀: QA 팀 · 유형: 요구사항 · 상태: 접수 · 접수: 2026-11-17
- 우선순위 근거: 현재 로드맵에 저장·서버 계획이 없고, UI 잠금은 수동 확인으로 검증됨. 개선 제안으로 백로그에 둠

(1) jsdom을 devDependency로 추가해, QA가 수동 확인한 '전투 종료 후 입력 잠금'(명세 §6 10번)을 커밋된 테스트로 만들기. (2) 이후 저장·불러오기나 서버 검증을 대비해 난수 상태(또는 뽑은 횟수)를 직렬화할 수 있게 노출. 서버를 둔다면 resolveTurn이 클라이언트가 보낸 격자를 받아들이면 안 됨.

- 2026-11-17 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (1건)

- REQ-003 [P2] M1 코드 리뷰에서 보류한 정리 항목 처리 — 완료 (전 항목 처리: 중복 정리(effects.ts), evaluateOutcomes 이동, validateConfig 분리+검사 추가, lineIds 제거, EFFECT_IGNORE_GUARD, test-support 이동, EndPhase/INSTANT_REELS 이동, balance 턴 상한, judge.length 검사 제거, index.ts 공개 API만 수출, 시드 표시 ?debug 뒤로. src/core, src/test-support, src/ui 참고.)
