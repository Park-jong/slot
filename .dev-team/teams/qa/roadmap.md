# QA 팀 로드맵

> 관리: QA 팀장. 전체 로드맵(`../../roadmap.md`)의 현재 마일스톤을 따른다.

## 현재 마일스톤 목표
M2 리일 편집 루프와 한 판 완주: 스펙(`docs/specs/m2-run-spec.md`) 검증, 코드 규칙 리뷰, 런 단위 밸런스 회귀 기준 확정.

## 할 일 (우선순위 순)
| 우선순위 | 항목 | 출처 (디렉터 / REQ-번호) | 담당 | 상태 |
| --- | --- | --- | --- | --- |
| P0 | 강화 규칙 불일치 해결 재검증 | 디렉터 | QA 팀장 | 완료 (2026-11-18) |
| P1 | formatDelta 반올림 불일치, startRun 데이터 조기 검증 등 should fix 반영 확인 | 디렉터 | code-reviewer | 대기 |
| P2 | M3 이전 UI DOM 테스트(jsdom) 도입 시 입력 잠금/편집 화면 테스트 | 디렉터 | tester | 대기 |

## 완료
- M1: 스펙 §6 체크리스트 검증, 코드 리뷰, 밸런스 회귀(±1pp, 20k + 200k opt-in)
- M2 검증: typecheck/test(243)/test:balance/build 통과, 스펙 §9 예시 및 §1.4 엣지 케이스 매핑, `src/core/m2-spec-gaps.test.ts` 31건 추가, 헤드리스 300판 스모크
- M2 밸런스: 실제 엔진 대 디자인 sim 200k 동일 시드 완전 일치(승률 59.04%, 보스 빈 턴 14.67%, 무편집 1.60%). `run-balance-sim.ts`, `run-balance.test.ts`(3000판, npm test), `balance.run.full.test.ts`(200k, test:balance) 추가
- M2 코드 리뷰: must fix 1건, should fix 10건. REQ-003 12항목 모두 완료 확인
