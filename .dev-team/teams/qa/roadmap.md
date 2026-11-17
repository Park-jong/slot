# QA 팀 로드맵

> 관리: QA 팀장. 전체 로드맵(`../../roadmap.md`)의 현재 마일스톤을 따른다.

## 현재 마일스톤 목표
M1 코어 전투 프로토타입: 스펙(`docs/specs/m1-combat-spec.md`) §6 인수 체크리스트 검증, 코드 규칙 리뷰, 밸런스 회귀 기준 확정.

## 할 일 (우선순위 순)
| 우선순위 | 항목 | 출처 (디렉터 / REQ-번호) | 담당 | 상태 |
| --- | --- | --- | --- | --- |
| P1 | Tech 수정 후 재검증: balance.test.ts 허용오차 ±1pp(20k) 반영 확인 | 디렉터 | tester | 대기 |
| P2 | opt-in 200k 밸런스 스크립트(`npm run test:balance`) 추가 후 확인 | 디렉터 | tester | 대기 |
| P3 | jsdom devDependency 도입 시 UI 입력 잠금 테스트 커밋 (체크리스트 10) | 디렉터 | tester | 대기 |

## 완료
- M1 스펙 §6 체크리스트 11항목 검증 (전부 통과), 예시 1~5 수치 대조, 빌드 UI 스모크(슬라임 승리/재시작/고블린 패배)
- 테스트 추가: `src/core/spec-gaps.test.ts` (7건, 총 62건 통과)
- M1 src 코드 리뷰 (must fix 1건, should fix 10건)
