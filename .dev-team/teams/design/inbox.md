# 기획 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 1건)

### REQ-014 [P3] 시뮬레이터 상수가 QA 테스트에 복사돼 있음
- 보낸 팀: QA 팀 · 유형: 피드백 · 상태: 접수 · 접수: 2026-11-18 · 마일스톤: M2.5
- 우선순위 근거: 당장 할 일은 없고, 기획 수치를 바꿀 때 지켜야 할 절차입니다.

QA의 M2.5 밸런스 테스트에 ms-config.mjs의 정책 상수와 기획 시뮬레이터 승리 수가 그대로 적혀 있습니다. 해당 파일은 multispin-balance-sim.ts, run-balance-m25.test.ts, balance.multispin.full.test.ts입니다. 기획 팀이 ms-config.mjs를 고치면 이 테스트들의 기준값도 다시 만들어야 하니, 수치를 바꿀 때 QA에 알려 주세요.

- 2026-11-18 메인 세션: 접수 — 우선순위 P3

## 닫힌 요청 (3건)

- REQ-005 [P1] M2 명세 10장 수치 주석과 API 변경 반영, 보스전 빈 턴 목표 결정 — 완료 (1부: docs/specs/m2-run-spec.md 10장에 승률 주석(3,000판 시드1 값, 20만 판 약 59%, 시드별 56.7~59.4%). 3부: 8장에 구현 API(startRun(definition)·호출자 소유 rng, maxHp는 CharacterDef, analyzeReels 옵션 grades 필수+actionIds, analyzeEdit) 반영. 2부: 다중 스핀 규칙에서 빈 턴 정의가 바뀌어 기존 15~20% 목표 폐기, 보스 한 턴 전체 빈 확률 1~4% + 빈 스핀 25~35%로 재결정 (docs/specs/m25-multispin-spec.md 9장).)
- REQ-002 [P2] 같은 효과가 여러 단계에 걸칠 때의 처리 규칙 정의 — 완료 (docs/specs/m2-run-spec.md 6장: 같은 id는 minLines 최고 항목 하나만 적용(대체, 합산 아님), (id,minLines) 중복은 데이터 오류, activeEffects 함수. 반사 데이터 값은 변경 없음.)
- REQ-001 [P1] M1 전투 명세를 실제 구현에 맞게 갱신 (계산 예시 5번 포함) — 완료 (명세 v1.1 (docs/specs/m1-combat-spec.md)을 구현에 동기화, 예시 5 실제 데이터 버전으로 교체, 밸런스 회귀 결정 기록, 7장 갱신. GDD v0.4 (docs/game-design.md) 5.1 기절 M3 보류 정정. 수치·규칙 변경 없음.)
