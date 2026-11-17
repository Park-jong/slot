# M1 전투 데이터·규칙 명세

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 |
| 날짜 | 2026-11-17 |
| 대상 독자 | Tech(구현), QA(테스트 케이스 작성) |
| 상위 문서 | [`docs/game-design.md`](../game-design.md) v0.3 (충돌 시 GDD가 우선, 단 M1 수치는 본 문서가 우선) |
| 실행 가능한 기준 | [`tools/sim/combat-sim.mjs`](../../tools/sim/combat-sim.mjs) (규칙·몬테카를로), [`tools/sim/examples.mjs`](../../tools/sim/examples.mjs) (3장 예시 검증) |

> **원칙: 모든 수치(HP, 계수, 배율, 패턴, 릴 구성)는 코드가 아니라 데이터에 둔다.** 코드에는 숫자 리터럴을 박지 않는다. 난수 생성기 `rng(): number`(0 이상 1 미만)는 반드시 주입받는다.
> 규칙 해석이 이 문서와 스크립트 사이에서 갈리면 구현하지 말고 설계 담당에게 보고한다.

---

## 1. 데이터 표

### 1.1 등급

| 등급 id | 이름 | 등급 값 |
|---|---|---|
| 1 | 일반 | 1 |
| 2 | 고급 | 2 |
| 3 | 희귀 | 3 |
| 4 | 영웅 | 4 |

### 1.2 동작 (Action)

| actionId | 이름 | 기본 계수 | 산출 |
|---|---|---|---|
| `attack` | 공격 | 2 | 등급 합당 피해 2 |
| `guard` | 방어 | 2 | 등급 합당 방어도 2 |
| `shield_bash` | 방패 강타 (견습 기사 스킬) | 피해 1, 방어도 1 | 등급 합당 피해 1 **그리고** 방어도 1. 두 값은 같은 (등급 합 x 배율)에서 각각 계산 |

- `shield_bash`는 `attack`/`guard`와 다른 동작이다. 서로 줄을 이루지 못한다.
- (참고: 스크립트는 `shield_bash`를 `skill`이라는 id로 쓴다. 7장 불일치 1 참고. 구현은 `shield_bash`를 쓴다.)

### 1.3 중복 단계 (같은 동작 라인 수 n, 단계 계산에는 min(n, 4) 사용)

| n | 단계 | 배율 | 배율 분자 (÷2 표현) |
|---|---|---|---|
| 1 | 기본 | x1.0 | 2 |
| 2 | 강화 | x1.5 | 3 |
| 3 | 상급 | x2.0 | 4 |
| 4~8 | 궁극 | x3.0 | 6 |

### 1.4 추가 효과 (`effects[]`)

| 동작 | 단계(n) | 효과 | M1 구현 | 비고 |
|---|---|---|---|---|
| attack | n>=2 | `ignore_guard` 방어도 무시 | **구현** | 합산된 공격 피해 전체에 적용. 적 방어도를 소모·감소시키지 않음 |
| attack | n>=3 | `weaken` 약화 부여 | 보류 (M3) | M1은 배율만 적용 |
| attack | n>=4 | `double_hit` 연속 2회 타격 | 보류 (M3) | M1은 배율만 적용 |
| guard | n>=2 | `reflect` 30% (n>=3은 50%) | 보류 (M3) | M1은 배율만 적용 |
| guard | n>=4 | `guard_keep` 다음 턴까지 방어도 유지 | 보류 (M3) | M1은 배율만 적용 (방어도는 매 턴 0으로 초기화) |
| shield_bash | n>=2 | `stun` 기절 | 보류 (M3) | M1은 배율만 적용 |

- 데이터에는 `effects: [{ id, minLines, params, deferred: boolean }]`로 전부 기재하고, `deferred: true`인 효과는 실행기가 **무시**한다(오류 아님). `ignore_guard`만 `deferred: false`.
- 단계별 배율도 데이터: `tiers: [{ lineCount, multiplierNum, effects }]`, 배율은 `multiplierNum / 2`.

### 1.5 캐릭터

| 항목 | 값 |
|---|---|
| id | `apprentice_knight` (견습 기사) |
| 최대 HP | 50 (M1은 전투마다 시작 시 50. 전투 간 이월 없음) |
| 스킬 | `shield_bash` |
| 시작 릴 (릴 0, 1, 2 모두 동일) | `attack(1)` x3, `guard(1)` x2, `shield_bash(1)` x1 (6개, 전부 일반) |

### 1.6 적

| enemyId | 이름 | HP | 패턴 (순서 반복) | 마일스톤 |
|---|---|---|---|---|
| `slime` | 슬라임 | 24 | attack 5 -> attack 5 -> guard 5 | **M1** |
| `goblin` | 고블린 | 34 | attack 5 -> attack 9 -> attack 5 | **M1** |
| `skeleton` | 해골 병사 | 40 | guard 6 -> attack 10 | M2 |
| `ogre` | 보스: 오우거 | 90 | attack 8 -> charge -> attack 16 -> guard 10 | M2 |

- 의도(Intent) 종류: M1 구현 = `attack`, `guard`. `charge`("다음 공격 x2" 상태효과)는 M2 대상이며 처리 방식은 미결(5장).
- 패턴 인덱스는 0부터. **1턴의 의도 = `pattern[0]`**. 현재 의도 = `pattern[enemyActionIndex % pattern.length]`.
- 적은 선공하지 않는다. 항상 플레이어 행동 이후에 행동한다.

---

## 2. 알고리즘

### 2.1 좌표와 라인

- 격자 `board[reel][row]`, reel 0..2, row 0..2 (row 0이 위).
- 칸 번호 n(1..9) -> `reel = (n-1) % 3`, `row = floor((n-1) / 3)`. (GDD 2.3 번호판 그대로: 1 2 3 / 4 5 6 / 7 8 9 가 위에서 아래 행)
- 라인 8개 (각 `[reel,row]` 3개, 이 순서 고정):

| id | 칸 번호 | `[reel,row]` |
|---|---|---|
| H1 | 1-2-3 | [0,0] [1,0] [2,0] |
| H2 | 4-5-6 | [0,1] [1,1] [2,1] |
| H3 | 7-8-9 | [0,2] [1,2] [2,2] |
| V1 | 1-4-7 | [0,0] [0,1] [0,2] |
| V2 | 2-5-8 | [1,0] [1,1] [1,2] |
| V3 | 3-6-9 | [2,0] [2,1] [2,2] |
| D1 | 1-5-9 | [0,0] [1,1] [2,2] |
| D2 | 7-5-3 | [0,2] [1,1] [2,0] |

### 2.2 스핀 `spin(reels, rng) -> board`

1. reel 0, 1, 2 순서로 처리.
2. 각 릴: 심볼 목록을 **복사**(원본 불변). 남은 개수 `k`일 때 `index = floor(rng() * k)`로 하나를 뽑아 목록에서 제거(비복원). 3번 반복. 뽑힌 순서가 row 0, 1, 2.
3. rng 호출 순서는 reel 0의 3회, reel 1의 3회, reel 2의 3회(총 9회). 테스트가 시드 재현에 의존하므로 이 순서를 바꾸지 않는다.
4. 릴 크기가 3 미만이면 오류(릴 최소 3).

### 2.3 판정 `judge(board) -> JudgeResult` (스핀과 별도 함수. M3 조작 단계가 둘 사이에 들어감)

1. 8라인을 위 순서로 검사. 3칸의 `actionId`가 모두 같으면 성립. 등급은 무관.
2. 성립한 라인의 등급 합 = 3칸 등급 값 합(3~12).
3. `actionId`별로 묶어 `lineCount`(성립 라인 수)와 `gradeSumTotal`(등급 합의 총합)을 구한다.
4. 반환: `{ [actionId]: { lineCount, gradeSumTotal } }` (성립한 동작만 포함).

### 2.4 위력 계산 `power(basePower, gradeSumTotal, lineCount)`

```
tierN   = min(lineCount, 4)
num     = multiplierNum[tierN]            // 2, 3, 4, 6
value   = floor( basePower * gradeSumTotal * num / 2 )   // 정수 연산
```

- **floor는 최종값에 한 번만** 적용한다. 라인별로 floor 하지 않는다(라인별 위력을 먼저 합산하지 않고, 등급 합 총합에 배율을 곱한다).
- 구현은 정수만 사용: `Math.floor(basePower * sum * num / 2)` (또는 `(basePower*sum*num) >> 1`). 부동소수 배율(1.5)을 쓰지 않는다.
- 분수가 생길 수 있는 경우는 `shield_bash`뿐(기본 계수 1 x 홀수 합 x 1.5). attack/guard는 계수 2라서 항상 정수.
- `shield_bash`는 `damage = power(1, sum, n)`, `guard = power(1, sum, n)` (같은 값).
- 공격 `ignoreGuard = (attack.lineCount >= 2)` (효과 데이터에서 읽는다).

### 2.5 전투 상태

```
BattleState {
  turn: number,              // 1부터
  playerHp, playerGuard,
  enemyHp, enemyGuard,
  enemyActionIndex: number,  // 0부터, 적이 행동할 때마다 +1 (패턴 길이로 나눈 나머지로 사용)
  phase: 'ongoing' | 'victory' | 'defeat'
}
```

초기: `turn=1, playerHp=50, playerGuard=0, enemyHp=enemy.hp, enemyGuard=0, enemyActionIndex=0`.

### 2.6 턴 흐름

| 단계 | 처리 |
|---|---|
| 1. 턴 시작 | `playerGuard = 0`. 적 의도 `pattern[enemyActionIndex % len]`를 표시 |
| 2. 스핀 | `spin` |
| 3. (M3 조작 슬롯) | M1은 비어 있음. 스핀과 판정을 별도 함수로 유지 |
| 4. 판정 | `judge` |
| 5. 실행 | 아래 순서: **방어 -> 스킬 -> 공격** |
| 6. 승리 체크 | `enemyHp <= 0`이면 `phase = victory`, 전투 즉시 종료. **적은 행동하지 않는다** |
| 7. 적 행동 | 아래 |
| 8. 패배 체크 | `playerHp <= 0`이면 `defeat`. 아니면 `turn++` |

**5. 실행 순서**
1. `guard` 성립 시: `playerGuard += guardValue`.
2. `shield_bash` 성립 시: 먼저 `damage`를 적에게 **일반 피해**(아래 피해 규칙, 방어도 무시 아님)로 입히고, 그다음 `playerGuard += shieldBashGuard`.
3. `attack` 성립 시: 합산 피해를 적에게 입힘. `ignoreGuard`이면 방어도 무시.

**적에게 피해 `dealToEnemy(d, ignoreGuard)`**
- `ignoreGuard`: `enemyHp -= d`. `enemyGuard`는 건드리지 않는다.
- 아니면: `absorbed = min(enemyGuard, d)`; `enemyGuard -= absorbed`; `enemyHp -= (d - absorbed)`.
- 오버킬 허용(`enemyHp`가 음수가 될 수 있음). 화면 표시만 `max(0, hp)`로 보정.

**7. 적 행동**
1. `enemyGuard = 0` (이전에 얻은 방어도는 이 행동 직전에 소멸).
2. 의도가 `guard v`: `enemyGuard = v` (덮어쓰기, 누적 아님).
3. 의도가 `attack v`: `absorbed = min(playerGuard, v)`; `playerGuard -= absorbed`; `playerHp -= (v - absorbed)`.
4. `enemyActionIndex++`.

### 2.7 방어도 수명

| 대상 | 얻는 시점 | 유효 구간 | 소멸 시점 |
|---|---|---|---|
| 플레이어 방어도 | 자기 턴의 실행 단계 | 같은 턴의 적 행동까지 | **다음 턴 시작(단계 1)에 0**. 이월 없음 |
| 적 방어도 | 적의 guard 행동 | **바로 다음 플레이어 턴 동안만** | 적의 **다음 행동 직전** (단계 7-1) |

### 2.8 엣지 케이스

- **빈 턴**(성립 라인 0): 실행 단계에서 아무 일도 없고, 보상·대체 행동 없음. 적은 정상 행동.
- 9칸이 모두 같은 동작이면 라인 8개 성립 가능. 단계는 4로 상한(x3.0).
- `shield_bash`의 방어도와 `guard`의 방어도는 모두 `playerGuard`에 더해진다.
- 턴 수 제한 없음. M1에 회복 없음. HP 상한 초과 처리 불필요.
- 전투 종료(victory/defeat) 후에는 입력(스핀 등)을 잠근다. 종료 상태에서 `turn` 함수 호출은 무시하거나 오류.
- 적이 `attack` 의도일 때 플레이어 방어도가 남아도 이월하지 않는다(다음 턴 시작에 0).
- 적이 `guard` 의도로 행동하는 턴에는 플레이어 HP 변화 없음.

---

## 3. 계산 예시 (QA 테스트 케이스로 그대로 사용)

표기: A=attack, G=guard, S=shield_bash, 숫자=등급. 아래 보드는 행(row)으로 그렸고 각 행은 `(릴0 릴1 릴2)`. 코드에서는 `board[reel][row]`.

### 예시 1: 라인 1개 공격

```
        릴0 릴1 릴2
row0:   A1  A3  A1
row1:   G1  S1  G1
row2:   S1  G1  S1
```

- `board[0] = [A1, G1, S1]`, `board[1] = [A3, S1, G1]`, `board[2] = [A1, G1, S1]`.
- 성립: H1만 (A1 A3 A1). 다른 라인은 모두 불일치.
- 공격: lineCount 1, 등급 합 1+3+1 = 5. `floor(2 x 5 x 2 / 2) = 10`. ignoreGuard 없음.
- 결과: 피해 10, 방어도 0.

### 예시 2: 공격 2라인(방어도 무시) + 방어 1라인

```
        릴0 릴1 릴2
row0:   A1  A1  G1
row1:   A2  A1  G1
row2:   A1  A3  G2
```

- 성립: V1 = 릴0 세로 A1 A2 A1 -> 합 4 (공격), V2 = 릴1 세로 A1 A1 A3 -> 합 5 (공격), V3 = 릴2 세로 G1 G1 G2 -> 합 4 (방어). 가로·대각선은 불일치.
- 공격: lineCount 2, 합 4+5 = 9, `floor(2 x 9 x 3 / 2) = 27`, `ignoreGuard = true`.
- 방어: lineCount 1, 합 4, `floor(2 x 4 x 2 / 2) = 8`.
- 적 방어도가 5라도 27 전부가 HP에 들어가고 **적 방어도는 5 그대로**.

### 예시 3: 방어 + 스킬 + 공격 (슬라임 4턴, 전체 상태 전이)

```
        릴0 릴1 릴2
row0:   G1  S1  A1
row1:   G1  S2  A1
row2:   G2  S1  A1
```

- 성립: V1 방어 합 4, V2 스킬 합 4 (1+2+1), V3 공격 합 3. 그 외 라인 없음.
- 값: 방어 `floor(2x4x2/2) = 8`. 스킬 피해 `floor(1x4x2/2) = 4`, 스킬 방어도 4. 공격 `floor(2x3x2/2) = 6`.
- 시작 상태(슬라임 4턴): `playerHp 50, playerGuard 0, enemyHp 24, enemyGuard 5, enemyActionIndex 3` (의도 = `pattern[3 % 3] = attack 5`).

| 단계 | 처리 | playerHp | playerGuard | enemyHp | enemyGuard |
|---|---|---|---|---|---|
| 시작 | 턴 시작(방어도 0) | 50 | 0 | 24 | 5 |
| 방어 | playerGuard += 8 | 50 | 8 | 24 | 5 |
| 스킬 | 피해 4: 적 방어도 5가 4 흡수 -> 방어도 1, HP 변화 없음. 이후 playerGuard += 4 | 50 | 12 | 24 | 1 |
| 공격 | 피해 6: 방어도 1이 1 흡수 -> 방어도 0, HP -5 | 50 | 12 | 19 | 0 |
| 적 행동 | enemyGuard = 0 리셋. attack 5: 흡수 min(12,5)=5, playerGuard 12 -> 7, HP 피해 0. enemyActionIndex 3 -> 4 | 50 | 7 | 19 | 0 |

최종: `playerHp 50, playerGuard 7, enemyHp 19, enemyGuard 0, enemyActionIndex 4`.

### 예시 4: 위력 함수 단독 (보드 없음)

| 입력 | 계산 | 결과 |
|---|---|---|
| shield_bash, 2라인, 등급 합 총합 7 | 피해 `floor(1x7x3/2) = floor(10.5) = 10`, 방어도도 10 | 피해 10 / 방어도 10 |
| attack, 3라인, 합 10 | `floor(2x10x4/2) = 40` | 40 |
| attack, 8라인 (9칸 모두 attack(일반), 합 8x3 = 24) | 단계 상한 4, `floor(2x24x6/2) = 144` | 144, ignoreGuard true |

### 예시 5: 적 방어도 수명 (슬라임 1~4턴, 패턴 인덱스 순환)

가정: 플레이어는 1~3턴 빈 턴, 4턴에 방어도 무시 없는 공격 피해 3 하나가 성립. 플레이어 HP 50 시작.

| 턴 | 시작 시 enemyGuard / actionIdx | 표시 의도 | 플레이어 실행 | 적 행동 후 enemyGuard / actionIdx | playerHp | enemyHp |
|---|---|---|---|---|---|---|
| 1 | 0 / 0 | attack 5 | 빈 턴 | 0 / 1 | 45 | 24 |
| 2 | 0 / 1 | attack 5 | 빈 턴 | 0 / 2 | 40 | 24 |
| 3 | 0 / 2 | guard 5 | 빈 턴 | **5** / 3 | 40 | 24 |
| 4 | **5** / 3 | attack 5 (`3 % 3 = 0`) | 피해 3 -> 방어도 5 중 3 흡수, enemyGuard 2, HP 변화 없음 | enemyGuard 리셋 0, attack 5 / 4 | 35 | 24 |

- 3턴의 방어도 5는 4턴 플레이어 실행 중에만 유효하고, 4턴 적 행동 직전에 사라진다(남은 2도 소멸).

### 검증 실행

`node tools/sim/examples.mjs` 실제 출력(2026-11-17):

```
ex1 {"attack":[5]} {"guard":0,"skillDmg":0,"skillGuard":0,"attack":10,"ignoreGuard":false}
ex2 {"attack":[4,5],"guard":[4]} {"guard":8,"skillDmg":0,"skillGuard":0,"attack":27,"ignoreGuard":true}
ex3 {"guard":[4],"skill":[4],"attack":[3]} {"guard":8,"skillDmg":4,"skillGuard":4,"attack":6,"ignoreGuard":false}
```

예시 1~3의 라인 합과 위력이 위 값과 일치. 예시 4, 5는 스크립트가 직접 검증하지 않으므로 손계산 결과이며(예시 4는 `playerOutput` 공식과 동일), Tech가 단위 테스트로 고정한다. 예시 3의 적 방어도 흡수와 적 행동 이후 상태는 `combat-sim.mjs`의 `battle()` 로직과 같은 규칙을 손으로 따라간 값이다.

---

## 4. 밸런스 확인

`node tools/sim/combat-sim.mjs 200000` 실제 출력 (시작 릴 AAAGGS x3, 플레이어 HP 50):

| 적 | HP | 패턴 | 승률 | 평균 턴 | 중앙값 | p90 | 승리 시 평균 받은 피해 | 평균 빈 턴 |
|---|---|---|---|---|---|---|---|---|
| 슬라임 | 24 | 5/5/g5 | 99.5% | 5.46 | 5 | 10 | 13.1 | 1.78 |
| 고블린 | 34 | 5/9/5 | 84.2% | 5.70 | 6 | 9 | 24.1 | 1.58 |
| 해골 병사 (M2) | 40 | g6/10 | 74.3% | 6.89 | 7 | 11 | 23.3 | 1.95 |

(평균 턴, 받은 피해, 빈 턴은 승리한 전투만 집계. 승률 분모는 전체 시행)

**GDD v0.2 대비 수치 변경과 이유**

| 항목 | v0.2 | v0.3 | 이유 |
|---|---|---|---|
| 슬라임 HP | 20 | 24 | 전투가 너무 빨리 끝남 |
| 고블린 HP / 패턴 | 28 / 4-8-4 | 34 / 5-9-5 | v0.2 수치에서 승률 약 96%, 받은 피해 약 20으로 너무 쉬움 |
| 해골 병사 HP | 35 | 40 | 같은 이유 (M2 수치) |

**전제와 한계**
- 시뮬레이터는 **플레이어 선택이 없다**(스핀 결과만으로 자동 실행). 조작(M3), 릴 편집(M2) 없음.
- 승률은 HP 50 시작 기준. 이월 HP 규칙이 생기면 다시 본다.
- 보스(오우거)는 시뮬레이터 대상 아님.
- Tech 구현은 위 표와 같은 분포가 나오는지 동일 조건(20만 회)의 회귀 테스트로 확인한다. 허용 오차는 QA가 정한다(제안: 승률 +-1%p).

---

## 5. 미결 사항

| # | 항목 | 내용 | 영향 |
|---|---|---|---|
| 1 | 전투 간 HP 이월 (M2) | 이월하면 고블린 이후 전투가 훨씬 어려워짐 | 고블린 수치 재조정 필요 |
| 2 | 방패 강타 체감 | 릴당 1/6 비율에서 한 턴에 발동할 확률이 약 2%. 스킬이 거의 안 보임 | 시작 릴 비율 또는 스킬 위력 재검토 (GDD 8.1과 연동) |
| 3 | 오우거 `charge` 처리 | "다음 공격 x2"를 상태효과로 둘지 패턴 확장으로 처리할지 | M2 결정 |
| 4 | 방어도 무시의 방어도 소모 여부 | 현재 **소모하지 않음**(적 방어도 그대로) | 바꾸면 예시 2, 3과 시뮬레이터 갱신 필요 |
| 5 | 보류 효과 구조 | `effects[]` 확장형, `deferred` 표시로 M3에서 코드 변경 최소화 | 1.4절 참고 |

---

## 6. 구현 체크리스트 (QA 인수 기준)

| # | 기준 | 검증 방법 |
|---|---|---|
| 1 | 시드 고정 rng로 스핀 결과가 재현된다 (호출 순서 2.2절) | 단위 테스트 |
| 2 | 스핀은 릴 원본 목록을 변경하지 않고, 한 릴에서 같은 인덱스 심볼이 중복 뽑히지 않는다 | 단위 테스트 |
| 3 | `judge`는 보드만 입력으로 받고 rng를 쓰지 않는다 | 단위 테스트 |
| 4 | 예시 1~5의 값이 모두 일치 | 단위 테스트 |
| 5 | floor가 최종값에 한 번만 적용된다 (예: shield_bash 2라인, 라인 합 3과 3: `floor(1x6x3/2)=9`이며 라인별 floor 합 `4+4=8`과 다름) | 단위 테스트 |
| 6 | 적 방어도: guard 행동 후 다음 플레이어 턴에만 유효, 적 다음 행동 직전 0 | 예시 5 |
| 7 | 공격 2라인 이상이면 방어도 무시, 적 방어도 변화 없음 | 예시 2 |
| 8 | 적 HP 0 이하가 되면 적이 행동하지 않고 승리 | 단위 테스트 |
| 9 | 빈 턴에 플레이어 행동 없음, 적은 정상 행동 | 단위 테스트 |
| 10 | 전투 종료 후 입력 잠금 | UI/통합 테스트 |
| 11 | 모든 수치가 데이터 파일에서 로드된다 (코드에 HP, 계수, 패턴 리터럴 없음) | 코드 리뷰 |

---

## 7. 스크립트와의 불일치 (설계 담당 확인용)

1. 스크립트는 스킬 동작 id를 `skill`로 쓴다. 이 명세와 구현은 `shield_bash`. 동작 규칙은 같으므로 숫자 영향 없음.
2. 스크립트는 배율을 부동소수(1.5)로 곱한 뒤 floor한다. 이 명세는 정수 연산(`num/2`)을 요구한다. 결과는 동일(0.5 단위는 부동소수로 정확히 표현됨).
3. 스크립트 상단 주석이 이 문서를 구현 대상으로 적고 있으나 스크립트는 `enemyActionIndex` 대신 `(turn-1) % len`을 쓴다. 동작이 모두 매 턴 1회이므로 결과는 같다.
4. 스크립트는 승리 시 적이 행동하지 않는 것, 적 방어도 소멸 시점을 `eg = 0` 후 행동하는 것으로 이미 이 명세와 같게 구현했다. 그 외 불일치 없음.
