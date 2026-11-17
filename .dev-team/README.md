# dev-team 기록

| 파일 | 내용 | 관리 |
| --- | --- | --- |
| `roadmap.md` | 전체 로드맵 | 총괄 디렉터 |
| `teams/<팀>/roadmap.md` | 팀 로드맵 | 각 팀장 |
| `teams/<팀>/worklog.md` | 팀 업무 기록 | 각 팀장 |
| `teams/<팀>/inbox.md` | 팀이 받은 요청 | 자동 생성 (직접 수정 금지) |
| `requests.md`, `requests.json` | 전체 요청 대장 | 자동 생성 (직접 수정 금지) |

팀 폴더: `design` 기획 · `tech` 개발 · `content` 콘텐츠 · `qa` QA

## 다른 팀에 보내는 요청
팀장 보고 → `[Cross-team requests]` → 메인 세션이 우선순위를 정해 `route_request`로 기록 → 받는 팀장이 `update_request`로 수락·처리·완료

## 우선순위
- P0: 현재 마일스톤 진행을 막는 문제(블로커, 진행 불가 버그). 받는 팀이 다음 작업에 반드시 포함
- P1: 현재 마일스톤 안에 처리해야 하는 것
- P2: 다음 마일스톤에 처리할 것
- P3: 개선 제안·아이디어(백로그)
