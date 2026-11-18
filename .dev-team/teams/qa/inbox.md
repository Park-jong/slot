# QA 팀이 받은 요청

> dev-team이 자동 생성하는 파일입니다. 직접 고치지 말고 `update_request` 도구로 상태를 바꾸세요.

## 열린 요청 (우선순위 순, 0건)

없음

## 닫힌 요청 (3건)

- REQ-011 [P1] REQ-009 인계 메모 (M2.5 밸런스 시뮬레이션용 새 API) — 완료 (spinRun/stopRun/previewStop, 별도 rng, M25_RUN을 쓰는 시뮬레이터로 반영(multispin-balance-sim.ts). 스핀당 rng 9회 계약을 시뮬레이터가 매번 단언.)
- REQ-010 [P1] M2.5 전투 화면(U1~U12) 수동·시각 점검 — 완료 (코드 리뷰로 U1~U12와 4개 수동 케이스 확인(must fix 없음). DOM 테스트 도구가 없어 760px 이하 시각, 클릭 타이밍은 사람이 확인해야 함. 목록은 QA 보고서 참고.)
- REQ-009 [P1] M2.5 테스트와 밸런스 검증 계획 — 완료 (실제 엔진 M2.5 밸런스 시뮬레이터 src/test-support/multispin-balance-sim.ts, 빠른 테스트 src/core/run-balance-m25.test.ts, 대형 테스트 src/core/balance.multispin.full.test.ts 추가. 설계 sim과 동일 시드에서 승수 완전 일치. 명세 §10 예시는 multispin.test.ts에 이미 전부 존재.)
