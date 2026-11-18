# M2.5 턴당 다중 스핀 명세

| 항목 | 내용 |
|---|---|
| 버전 | v1.0 |
| 날짜 | 2026-11-18 |
| 대상 독자 | Tech(구현), QA(테스트 케이스 작성), UI(화면 요구) |
| 상위 문서 | [`docs/game-design.md`](../game-design.md) v0.6, [`docs/specs/m1-combat-spec.md`](m1-combat-spec.md) v1.1, [`docs/specs/m2-run-spec.md`](m2-run-spec.md) v1.0 (전투·런 규칙은 M1/M2 명세를 따른다. **충돌 시 이 문서의 규칙·수치가 우선**: 턴 흐름, 단계 배율, 방어도 무시 임계, 시작 릴, 적 수치, 보스 빈 턴 목표) |
| 실행 가능한 기준 | `tools/sim/ms-config.mjs` (수치 단일 출처), `ms-engine.mjs` (규칙), `ms-sim.mjs` (런 몬테카를로), `ms-sweep.mjs`, `ms-turn-stats.mjs`, `ms-reel-stats.mjs` (정확 확률), `ms-examples.mjs` (계산 예시). 명령은 11.6 |
| 처리한 요청 | REQ-005 2부 (보스 빈 턴 목표, 9장) |
| 상태 | **잠정**: 사용자는 "한 턴 최대 3스핀, 결과 합산, 남기면 이득, 횟수는 아이템으로 변경 가능"까지 결정했다. 합산 방식(B1), 남은 횟수 이득(Focus +50%), 모든 수치는 기획 팀이 시뮬레이션으로 정했고 **사용자 확정 전**이다. M2의 잠정 결정(런 구조, 주기, 회복 등)도 여전히 미확정이다(12장 끝) |

> **원칙은 M1/M2와 같다.** 모든 수치는 코드가 아니라 데이터(`src/data/`)에 둔다. 난수 생성기는 주입받는다. 규칙 해석이 이 문서와 스크립트 사이에서 갈리면 구현하지 말고 설계 담당에게 보고한다.
> **바꾸지 않는 규칙**: 줄은 3칸이 모두 같은 동작일 때만 성립 / 줄의 세기 = 등급 합 / 가운데 칸 불균형 유지 / 적은 고정 패턴과 보이는 의도 / 릴마다 자기 심볼 목록 / 빈 턴에 대체 행동 없음.
> 표기는 M1/M2 명세와 같다: A=attack, G=guard, S=shield_bash, 숫자=등급. 보드는 위에서 아래로 행 3개, 각 행은 `릴0 릴1 릴2`. 라인 id는 `src/core/lines.ts`의 `H1~H3`(행), `V1~V3`(릴), `D1`(1-5-9), `D2`(7-5-3).

---

## 1. 규칙 요약

| # | 규칙 | 근거 |
|---|---|---|
| 1 | 한 턴에 슬롯을 **최대 `maxSpins`회(기본 3)** 돌린다. 1회는 필수. 매 스핀 뒤 보드를 보고 "한 번 더" 또는 "멈춤"을 고른다. 최대에 도달하면 자동으로 스핀 단계가 끝난다 | 사용자 규칙 1 |
| 2 | 턴은 **마지막에 한 번만** 정산한다: 모든 스핀의 성립 라인을 동작별로 합쳐(풀링) 단계·위력을 정하고, 방어 -> 스킬 -> 공격 순으로 실행한 뒤 적이 한 번 행동한다. 적 의도는 스핀 내내 보인다 | 결정 A, B |
| 3 | 단계는 **합산 라인 수**로 정한다: `{1:x1, 2:x1.5, 3+:x2}`(3줄 이상은 마지막 단계). `ignore_guard`는 공격 합산 3줄부터 | 결정 B, D |
| 4 | **남은 스핀 1회당 Focus +50%**: 그 턴의 총 피해와 방어도에 곱한다. 1회만 돌리고 멈추면 x2, 2회면 x1.5, 3회 다 쓰면 x1 | 사용자 규칙 2, 결정 C |
| 5 | `maxSpins`는 캐릭터 기본값 + **수정치(`TurnModifier`)**로 정해지는 데이터 스탯이다. 스핀 +1 아이템, 스핀 -1 / 피해 + 아이템 등이 코드 변경 없이 들어간다 | 사용자 규칙 3, 5장 |
| 6 | 시작 릴을 `AAAGGSS`(릴당 7개)로, 적 HP·공격을 약 3배로 재조정했다. 목표 승률 55~70%에 대해 smart 정책 61.8% | 결정 D, E, F |
| 7 | 보스 빈 턴 목표를 "턴 전체의 합산 출력이 0"으로 재정의: 보스 1~4%, 전투 1 7~11% | 결정 G, 9장 |

---

## 2. 턴 상태 기계

### 2.1 상태

한 전투(`Battle`)는 스칼라 상태(`BattleState`: HP, 방어도, 의도 인덱스 등. M2와 같음)와 **턴 진행 상태 `TurnSession`**을 가진다.

```
TurnSession =
  | { kind: 'turn_start', stats: TurnStats }
  | { kind: 'spinning',   stats: TurnStats, spins: SpinRecord[] }    // spins.length = spinsUsed, 1..maxSpins-1
  (null = 전투 종료)

TurnStats  = { maxSpins, focusPctPerUnused, damagePct }              // 턴 시작 시 한 번 계산해 턴 동안 고정 (5장)
SpinRecord = { index (1..), board, judgement: JudgeResult }          // 그 스핀 한 번의 보드와 성립 라인
```

```
 turn_start --spin(1)--> spinning(1) --spin(2)--> spinning(2) --spin(3)--> [max 도달: 자동 정산]
                             |                        |
                           stop                     stop
                             v                        v
                          resolve -> enemy_act -> (다음 턴 turn_start | 전투 종료)
```

- `spinning(n)`에서 보이는 것: 지금까지의 모든 보드, 스핀별 성립 라인, 동작별 합산 현황, 적 의도. 플레이어 HP/방어도/적 HP는 **아직 변하지 않는다**(정산 전).
- `resolve`와 `enemy_act`는 **관찰 가능한 상태가 아니다.** 스핀 단계를 끝내는 호출(`stopSpinning`, 또는 최대에 도달한 `spinOnce`)이 한 번에 실행하고 결과로 다음 `turn_start`(또는 전투 종료)를 돌려준다.
- 따라서 `spinning` 상태의 `spinsUsed`는 항상 `1 <= spinsUsed < maxSpins`다. `spinsUsed == maxSpins`인 `spinning` 값은 만들어지지 않는다(엔진 입력 검증에서 예외, 2.4).
- 유효 최대가 1이면 스핀 1회로 곧바로 정산된다: 선택 단계가 없고 `unusedSpins = 0`.
- **턴 시작 처리**(플레이어 방어도 만료 `player_guard_expired`)는 M1/M2와 같은 규칙이지만 실행 시점은 `spinOnce`의 첫 호출(스핀 1) 안이다. 그래서 스핀 중 화면의 플레이어 방어도는 0이다.

### 2.2 호출별 합법 상태

| 호출 | `turn_start` | `spinning` | 전투 종료 |
|---|---|---|---|
| `spinOnce(battle, rng)` / `submitSpin(battle, board)` | 합법 (스핀 1) | 합법 (스핀 2..) | **예외** |
| `stopSpinning(battle)` | **예외** (스핀 0회로 멈출 수 없다) | 합법 | **예외** |
| `previewStop(battle)` | **예외** (미리볼 보드가 없다) | 합법 | **예외** |
| `playTurn(battle, rng, policy?)` | 합법 | **예외** (턴 도중) | **예외** |
| `resolveTurn(battle, board)` | 합법 | **예외** | **예외** |
| `currentIntent`, `currentIntentPreview`, `isBattleOver` | 항상 합법 | 항상 합법 | 합법 |

런 단계 호출(M2 `Run`): `spinRun`, `stopRun`, `playRunTurn`, `resolveRunTurn`은 `run.state.phase === 'battle'`이고 위 표의 전투 상태가 맞을 때만 합법이다. 스핀 도중(`spinning`)의 `chooseOffer`, `skipOffer`, `deleteSymbol`, `enhanceSymbol`, `passEdit`는 `phase`가 `battle`이므로 M2 규칙대로 예외다. `startRun`은 언제나 합법(새 런).

### 2.3 호출의 효과

| 호출 | 효과 |
|---|---|
| `spinOnce` | rng 9회로 보드를 뽑는다(`spin()`과 동일). `turn_start`이면 먼저 턴 시작 처리. 보드를 판정해 `SpinRecord`를 추가. `spinsUsed == maxSpins`가 되면 같은 호출 안에서 정산(`stopSpinning`과 동일)하고 `result`를 채운다 |
| `submitSpin` | `spinOnce`와 같지만 보드를 직접 받는다(테스트, M3 조작 이후 보드). rng를 쓰지 않는다. 보드는 `spin()` 결과와 같은 모양(3릴 x 3행)이어야 하며 모르는 동작이 있으면 예외 |
| `stopSpinning` | 스핀 단계를 끝내고 정산: 합산 -> 단계 -> Focus 적용 위력 -> 방어, 스킬, 공격 실행 -> 적 HP 0이면 승리 -> 아니면 적 행동 -> 플레이어 HP 0이면 패배, 아니면 다음 턴 `turn_start`(스탯 재계산). rng를 쓰지 않는다 |
| `previewStop` | 순수 함수. "지금 멈추면" 결과(2.5). 상태를 바꾸지 않고 rng를 쓰지 않는다 |
| `playTurn(battle, rng, policy?)` | 편의 함수: `policy`가 "한 번 더"라고 하는 동안 `spinOnce`, 아니면 `stopSpinning`. 생략하면 **스핀 1회 후 멈춤**(남은 횟수는 계산에 들어간다) |
| `resolveTurn(battle, board)` | 편의 함수: `submitSpin(board)` 후 필요하면 `stopSpinning`. 즉 "보드 1장으로 스핀 1회 후 멈춤, 남은 횟수 반영". 유효 최대가 1이면 M2와 완전히 같은 결과 |

### 2.4 예외(던지는 경우)와 입력 검증

- 2.2표의 **예외** 칸 전부. 메시지에 호출 이름과 상태(`turn_start`/`spinning`/전투 종료)를 넣는다.
- `submitSpin`: 보드가 3릴 x 3행이 아님, 모르는 동작/등급.
- `createBattleFromState(config, state, session?)`: `session`이 `spinning`인데 `spinsUsed < 1` 또는 `>= stats.maxSpins`, `spins[i].index`가 1..n 연속이 아님, 전투가 이미 끝났는데 `session`이 null이 아님, 진행 중인데 null. -> 예외.
- `BattleConfig` 검증(`validateBattleConfig`): `character.spinsPerTurn`이 정수이고 `[spinsPerTurnMin, spinsPerTurnHardCap]` 안, `spinsPerTurnMin >= 1`, `HardCap >= Min`, `focusPercentPerUnusedSpin >= 0` 정수, 모든 `TurnModifier` 필드가 정수(`spinsPerTurnMulPct >= 0`), 단계 표의 `lineCount`가 1부터 시작하고 중복이 없음(기존 검증).
- 정산 중간에 어떤 단계가 예외를 던져도 입력 `Battle` 값은 바뀌지 않는다(불변 값, M1 규칙 그대로).

### 2.5 보고서와 이벤트

`SpinResult { battle, spin: SpinReport, result: TurnResult | null, events }` — `result`는 이 호출로 정산됐을 때(= 최대 도달)만 채워진다.

```
SpinReport { index, maxSpins, board, judgement /*이 스핀 1회의 성립 라인*/, empty: boolean /*이 스핀에 성립 라인 없음*/ }
```

`TurnReport` (M1/M2 필드 유지 + 확장):

| 필드 | 내용 |
|---|---|
| `turn`, `intent`, `before`, `after`, `events`, `outcomes` | M1과 같다. `outcomes`는 정산 결과(합산 기준, Focus 적용 후), 해결 순서 |
| `spins: SpinReport[]` | **스핀별 보드와 성립 라인.** 길이 = `spinsUsed` |
| `pooled: PooledJudgement` | 모든 스핀의 성립 라인(각 줄에 `spinIndex`)과 동작별 합산(`lineCount`, `gradeSumTotal`) |
| `maxSpins`, `spinsUsed`, `unusedSpins` | `unusedSpins = maxSpins - spinsUsed` |
| `focusPct` | 실제 적용된 Focus % = `focusPctPerUnused x unusedSpins` |
| `damagePct` | 적용된 `damagePct` 수정치(기본 0) |
| `stopReason` | `'player_stop'` 또는 `'max_reached'` |
| `empty: boolean` | 합산 출력이 0 (성립 라인이 하나도 없음). 빈 턴 정의는 9장 |
| `board`, `judgement` (호환용) | `board` = 마지막 스핀의 보드, `judgement` = `pooled`와 같은 모양의 합산 결과. 스핀 1회짜리 턴에서는 M2와 값이 같다 |

`ActionOutcome`에는 `focusPct`와 `damagePct`가 추가된다(적용 값 기록용).

이벤트(순서대로, 기존 `enemy_damaged`, `player_guard_gained`, `enemy_attacked`, `enemy_guarded`, `enemy_charged`, `enemy_guard_expired`, `victory`, `defeat`는 그대로이며 값에 Focus가 반영된다):

| 이벤트 | 시점 | 필드 |
|---|---|---|
| `turn_started` | 스핀 1 호출의 첫 이벤트 | `turn`, `maxSpins`, `focusPctPerUnused`, `damagePct` |
| `player_guard_expired` | 스핀 1 호출 (`turn_started` 다음). 기존 이벤트 | `amount` |
| `spun` | 스핀마다 | `spinIndex`, `maxSpins`, `firedLines: { lineId, actionId, gradeSum }[]`, `empty` |
| `spin_phase_ended` | 정산 직전 | `spinsUsed`, `unusedSpins`, `focusPct`, `reason` |
| (기존) `enemy_damaged` ... `defeat` | 정산 | 값은 합산, Focus 반영 후 |

### 2.6 `previewStop(battle)`: "지금 멈추면"

`spinning` 상태에서만 합법. 반환:

```
StopPreview {
  spinsUsed, maxSpins, unusedSpins, focusPct, damagePct,
  pooled: PooledJudgement,                       // 지금까지의 합산 현황
  actions: {                                     // 성립한 동작만, 해결 순서
    actionId, lineCount, gradeSumTotal, multiplierNum,
    nextTierAt: number | null,                   // 다음 단계가 시작되는 합산 라인 수. 마지막 단계면 null
    nextEffects: { id, minLines }[],             // 아직 못 미친, 엔진이 실행하는(deferred 아님) 효과의 임계
    damage, guard, ignoreGuard
  }[],
  totalDamage, totalGuard, empty,
  incoming: number,                              // 이번 적 행동의 유효 공격값 (공격 의도가 아니면 0, 힘 모으기 반영)
  lethal: boolean,                               // 지금 멈추면 적이 죽는가 (적 방어도, 방어도 무시 반영)
  playerHpAfterEnemy: number                     // 안 죽었을 때 적 행동까지 반영한 플레이어 HP
}
```

- 모든 값은 `stopSpinning`이 실제로 내는 값과 **같아야 한다**(같은 함수를 호출해 계산. 별도 구현 금지).
- 선택 보조(P2, 선택): `estimateContinue(battle, { rng, samples })` — "한 번 더 돌리고 멈추면"의 평균 총 피해/방어도/치명 확률. **전투 rng를 쓰지 않고 별도 rng를 받는다**(결과 재현 보호). 최적 연속이 아니라 "정확히 한 번 더 후 멈춤"의 기대값이다. UI 문구는 "한 번 더 돌리면(평균)".

### 2.7 인수 기준

| # | 기준 |
|---|---|
| AC-2.1 | `createBattle` 직후 `session.kind == 'turn_start'`, `stats.maxSpins == 3`(견습 기사, 수정치 없음) |
| AC-2.2 | 2.2표의 각 (호출, 상태) 조합이 표대로 동작/예외. 예외 후에도 입력 `Battle`은 불변 |
| AC-2.3 | `spinOnce` 3번째 호출은 `result != null`이고 `stopReason == 'max_reached'`, `unusedSpins == 0`. 1, 2번째 호출은 `result == null`이고 적 HP/플레이어 HP/방어도는 호출 전과 같다 |
| AC-2.4 | `stopSpinning`은 rng를 호출하지 않는다(스크립트 rng의 호출 수로 확인). `spinOnce` 1회는 정확히 9회 호출 |
| AC-2.5 | 유효 최대 1인 구성: `spinOnce` 1회로 정산, `unusedSpins == 0`, `focusPct == 0`, `spin_phase_ended.reason == 'max_reached'` |
| AC-2.6 | `previewStop` 값 = 같은 상태에서 `stopSpinning`을 불렀을 때의 `outcomes`/HP 결과 (10장 모든 예시에 대해) |
| AC-2.7 | 이벤트 순서: `turn_started`, (`player_guard_expired`), `spun` 반복, `spin_phase_ended`, 정산 이벤트 |
| AC-2.8 | 빈 턴(합산 0): 행동 이벤트 없이 적 행동만 진행. 대체 행동 없음 |

---

## 3. 합산 규칙 (B1 풀링)

### 3.1 규칙

1. 턴의 **모든 스핀**에서 성립한 라인을 한데 모은다. 같은 라인 id(예: `H1`)가 서로 다른 스핀에서 성립하면 **각각** 센다.
2. 동작별로 묶는다: `lineCount`(합산 라인 수), `gradeSumTotal`(등급 합의 총합).
3. 단계는 **합산 `lineCount`**로 고른다. 위력은 `gradeSumTotal`로 한 번 계산한다(4.2의 식, floor는 마지막에 한 번만).
4. 효과 임계(`activeEffects(action, lineCount)`)도 합산 라인 수로 판정한다. 함수 시그니처는 M2 그대로.
5. 단계 표는 **상한이 있다**: `{1:x1, 2:x1.5, 3:x2}`(`multiplierNum` 2/3/4, 분모 2 그대로). **3줄 이상은 마지막 단계(x2)를 쓴다.** 기존 `selectTier`가 "`lineCount` 이하 중 가장 큰 단계"를 고르므로 코드 변경 없이 상한이 걸린다(4단계 x3 항목은 삭제).
6. `ignore_guard`(공격)는 합산 **3줄부터**(M2는 2줄).
7. 한 턴의 실행 순서는 M1과 같다: 방어 -> 스킬 -> 공격. 정산은 한 번이므로 "스핀 1의 방어가 스핀 2의 공격보다 먼저"가 아니라 합산 후 순서다.

### 3.2 채택 근거: B1(풀링)과 B2(스핀별 독립)

| 안 | 내용 | 평가 |
|---|---|---|
| **B1 풀링 (채택)** | 라인을 모아 합산 라인 수로 단계 결정 | 사용자의 "합산" 문구에 맞고, 스핀에 걸쳐 같은 동작 라인을 모으려는 동기(집중)가 생긴다 |
| B2 독립 | 스핀마다 따로 정산해 결과 숫자만 더함. 스핀 간 단계 누적 없음 | "합산" 문구와 어긋나고, 여러 스핀에 걸친 라인 집중의 이득이 없다. 멈추기 선택의 가치는 B1과 비슷 |
| B1 + M2 단계표 (x1/1.5/2/3) | 풀링에 4단계 x3 유지 | **기각**: 1 -> 3스핀에서 기대 피해가 4.35배(볼록). 3번째 스핀의 가치가 14.4로 첫 스핀 7.5의 약 2배라 항상 최대로 돌리는 것이 거의 지배 전략. 사려 깊은 멈춤(비치명)이 4.6%로 줄어든다 |

턴 수준 근거 (시작 릴 `AAAGSS` x3, 40만 턴. `E[dmg]` = 턴당 기대 피해, 1/2/3스핀, `node tools/sim/ms-turn-stats.mjs`로 재현):

| 단계표 | 합산 | k=1 | k=2 | k=3 | 3스핀/1스핀 |
|---|---|---|---|---|---|
| M2 (x1/1.5/2/3) | B1 풀링 | 7.49 | 18.77 | 33.06 | **x4.35** |
| M2 | B2 독립 | 7.49 | 14.97 | 22.44 | x3.00 |
| **상한 (x1/1.5/2)** | **B1 풀링** | 7.07 | 16.46 | 26.99 | **x3.79** |
| 상한 | B2 독립 | 7.07 | 14.15 | 21.21 | x3.00 |
| flat x1 | B1/B2 | 5.20 | 10.41 | 15.61 | x3.00 |

채택 시작 릴 `AAAGGSS`, 상한 풀링: E[dmg] 4.06/9.20/15.10 (x3.65), 방어도 1.09/2.31/3.64, SD 7.2/11.8/15.7. 같은 릴 독립(B2) 4.06/8.12/12.17 (x2.99). 보스 릴(참고) 상한 풀링 13.5/30.9/49.1.

런 수준 근거 (적 HP를 비율로 조정해 smart 정책 승률이 약 60%가 되게 맞춤, 4000판, 공통 난수):

| 구성 | smart | max (항상 최대) | once (항상 1회) | 선택의 가치 (smart - max) | 일찍 멈춤 | 비치명 멈춤 |
|---|---|---|---|---|---|---|
| **B1 상한 단계, ign 3 (채택)** | **58.3** | 42.1 | 0.1 | **+16.1** | 28.2% | 12.8% |
| B1 M2 단계, ign 3 | 58.4 | 49.0 | 0.1 | +9.3 | 18.9% | 4.6% |
| B1 M2 단계, ign 4 | - | - | - | +9.1 | - | - |
| B2 M2 단계, ign 2 | 57.5 | 38.9 | 0.9 | +18.6 | 34.8% | 17.9% |
| flat (단계 없음) | 56.9 | 39.5 | 0.4 | +17.4 | 39.3% | 22.5% |

해석: B2/flat은 "멈추기 선택" 가치가 B1 상한과 비슷하다. B1 상한은 거기에 더해 스핀에 걸친 집중 동기를 유지한다. B1 + M2 단계는 선택의 가치가 +9.3으로 줄어 항상 최대 정책에 가깝다.

### 3.3 인수 기준

| # | 기준 |
|---|---|
| AC-3.1 | 같은 라인 id가 서로 다른 스핀에서 성립하면 `lineCount`가 둘로 센다 (예시 2) |
| AC-3.2 | 합산 공격 1/2/3/4/5줄의 `multiplierNum` = 2/3/4/4/4. 합산 라인 수 4 이상에서 `selectTier`가 예외 없이 마지막 단계를 고른다 |
| AC-3.3 | `ignore_guard`: 합산 공격 2줄이면 비활성, 3줄이면 활성 (예시 2와 예시 10) |
| AC-3.4 | 위력의 floor는 한 번만 (예시 8: 21이고 20이 아니다) |
| AC-3.5 | 한 턴에 같은 동작의 라인 위력을 스핀별로 따로 floor하지 않는다 |
| AC-3.6 | `activeEffects`의 `(id, minLines)` 중복 검증과 같은 id 대체 규칙(M2 6장)은 그대로 통과 |

---

## 4. 남은 스핀 이득: Focus

### 4.1 규칙

```
unusedSpins = maxSpins - spinsUsed                       (정수, 0 이상)
focusPct    = focusPctPerUnused x unusedSpins            (기본 focusPctPerUnused = 50)
value       = floor( basePower x gradeSumTotal x multiplierNum x (100 + focusPct + damagePct) / 200 )
```

- 피해: `basePower = basePower.damage`, 분자에 `damagePct`를 더한다. 방어도: `basePower = basePower.guard`, **`damagePct`는 방어도에 적용하지 않는다**(`100 + focusPct`만). `damagePct`의 기본값은 0이고 5장의 아이템 수정치로만 바뀐다.
- **floor는 마지막에 한 번.** 분모는 `MULTIPLIER_DENOMINATOR(2) x 100`.
- Focus는 **스킬(방패 강타)의 피해와 방어도 둘 다**, 공격 피해, 방어 방어도 모두에 곱한다. 효과 임계/단계 선택에는 영향이 없다.
- 합이 음수가 되지 않게 `max(0, 100 + focusPct + damagePct)`로 자른다(`damagePct`가 -100 아래인 수정치 대비).
- **합산 출력이 0이면 Focus를 받아도 0이다.** 빈 턴에 대체 행동은 없다.
- 남은 스핀이 늘수록 이득이 커지는 구조이며 **스핀에는 위험이 없다**(스핀한다고 불리해지는 요소 없음). 계속 도는 비용은 "포기하는 Focus"뿐이다.

| 유효 최대 3일 때 | 사용 | 남음 | Focus | 배율 |
|---|---|---|---|---|
| 1회 후 멈춤 | 1 | 2 | +100% | x2.0 |
| 2회 후 멈춤 | 2 | 1 | +50% | x1.5 |
| 3회 다 사용 | 3 | 0 | +0% | x1.0 |

### 4.2 후보 평가와 채택 이유

적 HP를 행마다 맞춰 smart 정책 승률이 약 60%가 되게 한 뒤(4000판, 공통 난수) 비교했다. `HP%` = 채택 적 HP 대비 비율. `once`는 "항상 1회". `선택의 가치` = smart - max. `이유` = 일찍 멈춘 턴의 사유 분포 (치명 / 방어도가 막아줌 / 가치).

| 후보 | HP% | smart | max | once | 선택의 가치 | 일찍 멈춤 | 비치명 멈춤 | 1회 후 멈춤 | 이유 (치명/방어/가치 %) |
|---|---|---|---|---|---|---|---|---|---|
| 없음 (대조군) | 91 | 59.2 | 59.2 | 0.0 | 0.0 | 11.4 | 0.0 | 4.6 | 100/0/0 |
| Focus 25 | 94 | 58.2 | 53.6 | 0.0 | +4.6 | 18.2 | 4.6 | 6.9 | 75/1/25 |
| Focus 40 | 98 | 57.8 | 47.0 | 0.0 | +10.7 | 24.5 | 9.8 | 8.6 | 60/1/39 |
| **Focus 50 (채택)** | 101 | 58.3 | 42.1 | 0.1 | **+16.1** | 28.2 | 12.8 | 9.8 | 55/2/43 |
| Focus 60 | 104 | 58.9 | 39.1 | 0.2 | +19.8 | 30.1 | 14.3 | 10.6 | 53/3/45 |
| Focus 75 | 109 | 61.0 | 32.4 | 0.5 | +28.6 | 35.4 | 18.5 | 11.9 | 48/5/47 |
| Focus 100 | 122 | 61.0 | 17.6 | 1.1 | +43.5 | 44.8 | 27.1 | 13.4 | 40/13/48 |
| 방어도 +3 / 남은 1회 | 98 | 60.3 | 47.0 | 0.9 | +13.2 | 15.6 | 5.1 | 6.8 | 67/13/20 |
| 방어도 +6 / 남은 1회 | 143 | 57.7 | 4.5 | 46.4 | +11.3 (항상 1회가 거의 이김) | 28.0 | 20.2 | 10.3 | 28/52/20 |
| 방어도 +10 / 남은 1회 | 탐색 상한 250 | 90.4 | 0.0 | 100 | -9.6 (항상 1회가 지배) | 39.5 | 34.5 | 6.1 | 13/77/10 |
| 저금 상한 1 | 91 | 59.9 | 59.2 | 0.0 | +0.6 | 17.7 | 5.7 | 4.7 | 68/5/28 |
| 저금 상한 2 | 91 | 59.7 | 59.2 | 0.0 | +0.4 | 20.4 | 8.0 | 9.8 | 61/4/35 |
| M3 토큰 (피해 3 상당) | 90 | 58.1 | 60.2 | 0.0 | -2.1 | 15.3 | 3.9 | 6.6 | 74/5/21 |
| M3 토큰 (피해 8 상당) | 50 | 62.4 | 97.8 | 0.1 | -35.4 | 62.9 | 49.0 | 49.3 | 22/8/70 |

**기각/보류 이유**
- **스핀당 방어도 고정치**: +6 ~ +10에서 "항상 1회"로 퇴화한다. 값이 작으면 효과가 약하고, 크면 지배 전략이다. 구간이 좁다.
- **저금(Bank)**: 남긴 스핀을 다음 턴으로 넘긴다. 가치 +0.4~0.6으로 사실상 무의미(스핀을 뒤 턴으로 옮길 뿐). 저금을 쓰면 "한 턴 최대 3회" 규칙도 깨진다.
- **M3 심볼 조작 토큰**: 멈춤 비율이 토큰 가치에 전적으로 좌우된다(3 -> 3.9%, 8 -> 49%; 남은 스핀 하나당 피해 5 상당이면 15~40%). 기각이 아니라 **M3에서의 깔끔한 확장 후보**다: 조작이 남은 스핀 칸을 소모하게 할 수 있다(12장 미결).
- **Focus 50 채택 이유**: "항상 최대"가 분명히 나쁘고(-16%p) 무너지지는 않는 가장 작은 값이다. 읽기 쉽다(x2 / x1.5). Focus 25~40은 선택의 가치가 5~11%p로 약하고, 75~100은 최대 정책이 지나치게 무너진다.

**위험(risk) 논의**: 사용자 규칙 2는 "남기면 이득"이지 "돌리면 위험"이 아니다. 스핀에 위험(예: 스핀할수록 불리한 요소, 실패 확률)을 별도로 두지 않는다. 대신 선택의 긴장은 "x2/x1.5 포기"에서 나온다. 수치는 선택이 의미 있음을 보인다: smart는 항상 최대보다 16%p, 항상 1회보다 61%p 높다.

### 4.3 smart 정책이 멈추는 때 (채택 설정, 전체 턴 대비 %)

| 시점 | 합계 | 치명 | 방어도가 막아줌 | 가치 |
|---|---|---|---|---|
| 스핀 1 후 | 9.8% | 8.1 | 0.0 | 1.6 |
| 스핀 2 후 | 18.4% | 7.6 | 0.4 | 10.4 |
| 합계 | 28.1% | 15.7 | 0.4 | 12.0 |

- "치명 멈춤"은 이미 이기는 상태에서 그만 돌리는 것(무해하나 UI 가치는 보인다). 사려 깊은 **비치명 멈춤은 12.4%**로 목표 약 15%보다 약간 낮다(12장 미결).
- "방어도가 막아줌" 멈춤은 일찍 멈춘 턴의 1.8%뿐이다.

### 4.4 인수 기준

| # | 기준 |
|---|---|
| AC-4.1 | 유효 최대 3에서 공격 한 줄(등급 합 3, 합산 1줄)의 피해는 스핀 1회 후 멈춤 12, 2회 후 멈춤 9, 3회 6 (5.2표, 예시 13) |
| AC-4.2 | 같은 입력에서 방어도도 같은 배율(방어 한 줄 12/9/6) |
| AC-4.3 | `damagePct`는 피해에만 적용: `damagePct +130`, 최대 2, 1회 후 멈춤이면 공격 한 줄 피해 16, 방어 한 줄 방어도 9 |
| AC-4.4 | 합산 출력이 0이면 `unusedSpins`가 몇이든 `outcomes`가 비고 HP 변화 없음 |
| AC-4.5 | floor는 한 번: 예시 8 (21, 방어도 21) |
| AC-4.6 | `focusPct`는 `focusPctPerUnused x unusedSpins`이고 `TurnReport.focusPct`에 기록된다 |

---

## 5. 스핀 횟수 모델과 수정치 (아이템 대비)

### 5.1 데이터와 계산

```
CharacterDef.spinsPerTurn = 3                    // 기본 최대 스핀 (정수)
TurnRules {                                      // RunRules/BattleConfig가 가짐
  focusPercentPerUnusedSpin = 50
  spinsPerTurnMin = 1
  spinsPerTurnHardCap = 5
}
TurnModifier {                                   // 모든 필드 선택, 정수, 기본값은 항등
  id: string,
  spinsPerTurnAdd?: number       // 더하기 (음수 가능)
  spinsPerTurnMulPct?: number    // 정수 퍼센트 (100 = 변화 없음)
  damagePct?: number             // 피해에만 더하기 (방어도 제외). 기본 게임은 0
  focusPctAdd?: number           // focusPercentPerUnusedSpin에 더하기
}
TurnStats { maxSpins, focusPctPerUnused, damagePct }

resolveTurnStats(baseSpins, rules, modifiers[]): TurnStats
  add      = sum(spinsPerTurnAdd)
  mulPct   = 앞에서부터 acc = floor(acc x m / 100), 초기값 100 (m = spinsPerTurnMulPct ?? 100)
  maxSpins = clamp( floor( (baseSpins + add) x mulPct / 100 ), spinsPerTurnMin, spinsPerTurnHardCap )
  focusPctPerUnused = max(0, focusPercentPerUnusedSpin + sum(focusPctAdd))
  damagePct = sum(damagePct)
```

- 위치: `src/core/turn-stats.ts`(신규, 순수 함수). 수치는 모두 데이터에서 온다.
- **평가 시점**: 전투 생성 시(첫 턴)와 매 턴이 끝나 다음 `turn_start`가 될 때, 그 시점의 `BattleConfig.modifiers`로 계산해 `session.stats`에 넣는다. **턴 도중에는 바뀌지 않는다**(스핀 도중 `maxSpins`가 바뀌지 않음). M2.5의 `modifiers`는 항상 `[]`이다(데이터 후크만). 전투 중 수정치 변경(M4 소비 아이템 등)이 필요해지면 `turn_start` 상태에서만 허용하는 별도 호출을 그때 추가한다(12장 미결).
- **런**: `RunState.modifiers: readonly TurnModifier[]`(M2.5는 `[]`)를 두고 전투 시작 시 `BattleConfig.modifiers`로 복사한다. M4의 아이템 획득은 이 배열에 항목을 추가하는 것으로 끝난다.
- 엣지 케이스:
  - 유효 최대 1: 선택 없음, 스핀 1회에 자동 정산, `unusedSpins` 0, Focus 0.
  - 계산 결과가 `HardCap` 초과: `HardCap`으로 자른다. `Min` 미만(0, 음수 포함): 1로 올린다.
  - `focusPctAdd`가 음수라 합이 0 미만: 0으로 자른다.
  - 빈 턴: 유효 최대가 몇이든 합산이 0이면 출력 0, 대체 행동 없음.
  - 수정치 배열이 비면 `maxSpins = clamp(base)`.

클램프 표 (`base 3`, 한도 [1, 5]; `ms-engine.mjs`의 `effectiveMaxSpins`로 확인):

| base | 더하기 | 곱 % | 계산 | 유효 최대 |
|---|---|---|---|---|
| 3 | 0 | 100 | 3 | 3 |
| 3 | +3 | 100 | 6 -> 한도 | 5 |
| 3 | -1 | 100 | 2 | 2 |
| 3 | -5 | 100 | -2 -> 하한 | 1 |
| 3 | 0 | 150 | floor(4.5) | 4 |
| 3 | +1 | 150 | floor(6) -> 한도 | 5 |
| 3 | -1 | 50 | floor(1) | 1 |
| 3 | +2 | 100 | 5 | 5 |
| 4 | 0 | 100 | 4 | 4 |
| 1 | 0 | 200 | 2 | 2 |

### 5.2 예시 아이템 3종 (이름은 임시, 아이템 설계가 아니라 모델이 맞는지 보이기 위한 데이터)

| 임시 이름 | 수정치 데이터 | 유효 최대 |
|---|---|---|
| 여분의 손 | `{ spinsPerTurnAdd: 1 }` | 4 |
| 무거운 망치 | `{ spinsPerTurnAdd: -1, damagePct: 130 }` | 2 |
| 고요한 눈 | `{ focusPctAdd: 25 }` | 3 (Focus 단계당 75%) |

공격 한 줄(등급 합 3, 합산 1줄, 식의 `basePower x 합 x multiplierNum` = 2 x 3 x 2 = 12)이 성립했을 때의 피해 (`ms-engine.mjs`의 `turnOut`으로 계산):

| 구성 | 1회 사용 | 2회 | 3회 | 4회 |
|---|---|---|---|---|
| 기본 (최대 3) | 12 | 9 | 6 | - |
| 여분의 손 (최대 4) | 15 | 12 | 9 | 6 |
| 무거운 망치 (최대 2, 방어 한 줄 방어도는 1회 9 / 2회 6) | 16 | 13 | - | - |
| 고요한 눈 (최대 3, 단계당 75%) | 15 | 10 | 6 | - |

- 모두 새 코드 없이 `TurnModifier` 데이터만으로 표현된다. 무거운 망치의 `damagePct`는 Focus와 같은 식 안에서 **더해진다**(1회 후 멈춤: `100 + 50 + 130 = 280`).

### 5.3 민감도 (같은 적 수치, 6000판, smart 정책)

| 최대 스핀 | smart / max / once 승률 % | 일찍 멈춤 % (비치명) | 보스 평균 턴 |
|---|---|---|---|
| 1 | 0.0 / 0.0 / 0.0 (81.6%가 슬라임에서 패배) | - | - |
| 2 | 0.7 / 0.4 / 0.0 | 7.5 (2.7) | 7.5 |
| **3** | **61.8 / 45.8 / 0.1** | 28.1 (12.4) | 6.2 |
| 4 | 98.4 / 95.6 / 0.9 | 48.9 (21.8) | 4.6 |
| 5 | 99.9 / 99.9 / 3.4 | 65.2 (26.8) | 3.5 |

최대 스핀 2에서 `damagePct` (smart): +30 -> 5.8, +50 -> 17.0, +70 -> 28.1, +100 -> 49.8, +110 -> 52.3, +120 -> 58.0, **+130 -> 61.8**, +140 -> 67.7 (%). 최대 2에서 항상 최대 정책 +50%: 14.9%. 최대 4에서 `damagePct` -30 / -40 / -50 -> 91.9 / 86.1 / 79.5%.

### 5.4 M4 아이템 가격 지침

- **스핀 1회는 어떤 현실적인 피해 %보다 훨씬 가치가 크다.** 최대 4에서 피해 -50%를 물려도 승률이 79.5%로 최대 3의 61.8%보다 높다.
- "스핀 -1" 아이템이 기본 구성(3스핀)과 같은 승률을 내려면 약 **+130% 피해**가 필요하다(최대 2, 승률 61.8%, 손익분기). 그 아래는 손해, 위는 이득.
- "스핀 +1" 아이템은 매우 강하다(61.8% -> 98.4%). 무거운 대가(HP 감소, 피해 감소 + 적 강화 등)나 높은 희귀도를 붙이거나 효과를 줄여야 한다(예: 최대 스핀 4에서 적 HP 대폭 상향이 전제).
- **하드캡을 4로 낮추는 안**을 검토한다(12장). 5스핀에서는 항상 최대 정책도 99.9%라 선택의 가치가 사라진다.
- 가격 계산은 `node ms-sim.mjs 6000 stop=smart maxSpins=K [dmgPct=D]`로 재현한다.

### 5.5 인수 기준

| # | 기준 |
|---|---|
| AC-5.1 | `resolveTurnStats`가 5.1 클램프 표의 모든 행과 일치 |
| AC-5.2 | 수정치 `{ spinsPerTurnAdd: 1 }`만 준 전투에서 `session.stats.maxSpins == 4`이고 스핀 4회에서 자동 정산 |
| AC-5.3 | `{ spinsPerTurnAdd: -1, damagePct: 130 }`: 최대 2. 5.2표의 16/13 |
| AC-5.4 | `{ focusPctAdd: 25 }`: 1회 후 멈춤 15, 2회 후 10 |
| AC-5.5 | 한 턴 도중 `config.modifiers`를 바꿔도(테스트에서 새 `Battle`을 만들어) 진행 중인 `session.stats`는 고정. 다음 `turn_start`에서만 반영 |
| AC-5.6 | `damagePct`는 방어도에 적용되지 않는다 |
| AC-5.7 | 모든 정수 검증: 정수가 아닌 수정치 필드는 `validateBattleConfig`가 예외 |

---

## 6. 데이터 표 (이전 -> 새 값, 제품 파일 대응)

### 6.1 값

| 항목 | M2 | **M2.5** | 제품 파일 |
|---|---|---|---|
| 단계표 | x1 / x1.5 / x2 / x3 (4단계, `{1:2},{2:3},{3:4},{4:6}`) | **x1 / x1.5 / x2 (`{1:2},{2:3},{3:4}`)**, 3줄 이상 마지막 단계 | `src/data/tiers.ts` `STANDARD_TIERS` |
| 공격 `ignore_guard` | `minLines 2` | **`minLines 3`** | `src/data/actions.ts` |
| 동작 `basePower` | attack 2/0, guard 0/2, shield_bash 1/1 | 변경 없음 | `actions.ts` |
| 그 외 지연(deferred) 효과 임계 (`reflect 2/3`, `guard_keep 4`, `weaken 3`, `double_hit 4`, `stun 2`) | M2 값 | 변경 없음 (**M3 전에 재조정 필요**, 12장) | `actions.ts` |
| 시작 릴 (세 릴 동일, 등급 1) | A x3, G x1, S x2 (릴당 6개) | **A x3, G x2, S x2 (릴당 7개)** = `AAAGGSS` | `src/data/character.ts` `startingReels` |
| 기본 최대 스핀 | (1회) | **`spinsPerTurn: 3`** | `character.ts` (신규 필드) |
| 최대 HP | 50 | 50 | `character.ts` |
| Focus | - | **`focusPercentPerUnusedSpin: 50`** | `src/data/run.ts` (신규 필드) |
| 스핀 한도 | - | **`spinsPerTurnMin: 1`, `spinsPerTurnHardCap: 5`** | `run.ts` (신규 필드) |
| 전투 후 회복 | +8 / 보스 직전 전량 | 변경 없음 (`healAfterBattle 8`, `healBeforeBoss 'full'`) | `run.ts` |
| 삭제/강화 주기 | 3 | 변경 없음 (`editEveryNBattles 3`) | `run.ts` |
| 릴 크기 | 3~12 | 변경 없음 (`reelMin 3`, `reelMax 12`) | `run.ts` |
| 제시 수, 동작/등급 가중치 | 3, 40/30/30, k별 표 | 변경 없음 (`offerCount 3`) | `run.ts` |

**적** (`src/data/enemies.ts`, `STAGES` 순서 그대로):

| stageIndex | enemyId | 이름 | M2 HP | **M2.5 HP** | M2 패턴 | **M2.5 패턴** |
|---|---|---|---|---|---|---|
| 0 | `slime` | 슬라임 | 24 | **72** | attack 5 -> attack 5 -> guard 5 | **attack 6 -> attack 6 -> guard 15** |
| 1 | `goblin_young` | 어린 고블린 | 27 | **81** | attack 4 -> 8 -> 4 | **attack 5 -> 10 -> 5** |
| 2 | `skeleton_recruit` | 해골 졸병 | 32 | **96** | guard 5 -> attack 8 | **guard 15 -> attack 10** |
| 3 | `goblin` | 고블린 | 34 | **102** | attack 5 -> 9 -> 5 | **attack 6 -> 10 -> 6** |
| 4 | `skeleton` | 해골 병사 | 40 | **120** | guard 6 -> attack 10 | **guard 18 -> attack 12** |
| 5 | `ogre` | 오우거 | 90 | **310** | attack 10 -> charge x2 -> attack 10 -> guard 10 | **attack 9 -> charge x2 -> attack 9 -> guard 30** (강화된 공격 = 18) |

- 적 HP는 3배(오우거는 약 3.4배), 적 공격은 약 1.1~1.25배(오우거 일반 공격만 10 -> 9로 낮아짐, 힘 모으기 공격은 20 -> 18), 적 방어도(guard)는 3배다. 한 턴 기대 피해가 시작 릴 기준 1스핀 약 4 -> 3스핀 약 15(`AAAGGSS`, 3장)로 늘었기 때문.
- 릴이 시작 7개이므로 5번 추가하면 한 릴이 12개(`reelMax`)에 도달할 수 있다. M2 명세 1.4의 "릴은 최대 11개" 문장은 **12개까지 가능**으로 바뀐다(12개가 되면 그 릴만 추가 불가. 세 릴 모두 12개는 불가능하므로 자동 건너뛰기는 여전히 도달하지 않는다). M2 예시 5의 "심볼 18개"는 **21개**로 바뀐다.
- `ogre.attack 9 x2 = 18`. 보스 한 번의 힘 모으기 공격이 플레이어 방어도로 막지 못하면 18이 들어간다.

### 6.2 회귀용 상수 (M2 값 보존)

M1/M2 회귀 테스트와 밸런스 테스트의 기준값을 지키기 위해 **M2 값을 이름 있는 상수로 남긴다**(M1의 `M1_STARTING_REEL` 방식과 같다).

| 상수 | 내용 |
|---|---|
| `M2_TIERS` | `{1:2},{2:3},{3:4},{4:6}` |
| `M2_ACTIONS` | `M2_TIERS` + 공격 `ignore_guard minLines 2` (나머지 동일) |
| `M2_STARTING_REEL` | A1 x3, G1 x1, S1 x2 (`M1_STARTING_REEL`은 유지) |
| `M2_ENEMIES` / `M2_STAGES` | 24 / 27 / 32 / 34 / 40 / 90 과 M2 패턴 |
| `M2_CHARACTER` | `APPRENTICE_KNIGHT`에 `startingReels: M2 릴`, `spinsPerTurn: 1` |
| `M2_RUN` | 위 상수를 쓴 `RunDefinition` (회귀 테스트와 구 밸런스 테스트용; 새 `M25_RUN`을 제품 정의로) |

- 제품이 쓰는 정의는 새 값이다(`APPRENTICE_KNIGHT`, `STAGES`, `ACTIONS`, 제품 `RunDefinition`). `createStartingBattleConfig(enemyId)`도 새 값. 구 회귀용은 `createM2BattleConfig(enemyId)` 같은 이름으로 따로 둔다.
- `spinsPerTurn: 1`인 구성에서는 Focus가 0이므로 `resolveTurn(battle, board)`와 `playTurn`이 M2와 **완전히 같은 결과**를 낸다(2.3). 이것이 기존 M1/M2 단위 테스트의 호환 경로다.

### 6.3 인수 기준

| # | 기준 |
|---|---|
| AC-6.1 | `data.test.ts`가 6.1표(시작 릴, 단계표, 공격 효과, 적 6종, 런 규칙 신규 필드)를 그대로 검증 |
| AC-6.2 | `M2_*` 상수가 M2 표(M2 명세 5, 7장)와 일치하고 `spinsPerTurn: 1` 구성에서 M2 예시 4(오우거 힘 모으기)가 그대로 재현 |
| AC-6.3 | 시작 릴 3개 모두 `A1 A1 A1 G1 G1 S1 S1`, 총 21개 |
| AC-6.4 | 설정 검증: 단계표 `lineCount`는 1부터 중복 없음. 3줄 이상에서 `selectTier`가 `{3:4}` |

---

## 7. UI 요구 (전투 화면 + 릴 편집 화면)

숫자와 정보만 정의한다(시각 표현은 UI 담당).

### 7.1 전투 화면

| # | 요구 | 인수 기준 |
|---|---|---|
| U1 | **스핀 이력**: 이번 턴의 지금까지의 보드를 모두 보여 준다(최신 보드는 크게, 이전 보드는 작게/탭). 새 스핀이 시작되면 이전 보드는 사라지지 않는다 | `TurnReport.spins.length` 개의 보드가 화면에 있다 |
| U2 | **스핀별 성립 라인**: 각 보드 아래/옆에 그 스핀에서 성립한 라인을 `H1 공격 3`처럼 표시. 빈 스핀은 "빈 스핀" | `spun.firedLines`와 일치 |
| U3 | **합산 현황**: 동작별로 `줄 수`, `등급 합`, **현재 단계(x1/x1.5/x2)**, **다음 단계 힌트**("1줄 더 -> x1.5", "3줄 -> 방어도 무시"), 지금 멈췄을 때 이 동작의 피해/방어도 | `previewStop().actions`와 일치. 마지막 단계(`nextTierAt == null`)에서는 단계 힌트 대신 "최대 단계" |
| U4 | **스핀 횟수**: "사용 n / 최대 m", 남은 횟수 | `session.stats.maxSpins`, `spins.length` |
| U5 | **지금 멈추면 미리보기**: 피해 X, 방어도 Y, **Focus +Z%**(남은 횟수 x 단계당 %), 적 처치 여부(`lethal`), 적 행동 후 내 HP(`playerHpAfterEnemy`) | `previewStop`과 같은 값. 빈 합산이면 "지금 멈추면 아무 일도 없음" |
| U6 | **비교** (선택, P2): "지금 멈추면 X / 한 번 더 돌리면(평균) Y" (`estimateContinue`). 평균임을 문구로 명시 | 표본 수와 별도 rng로 재현 가능 |
| U7 | **적 의도는 스핀 내내 보인다**(힘 모으기 후의 유효 공격값 포함, 기존 `currentIntentPreview`) | 어느 상태에서도 의도 표시가 사라지지 않음 |
| U8 | **버튼**: `turn_start`에는 [스핀]만. `spinning`에는 [한 번 더 (남은 k)]와 [멈춤 (+Z%)]. 최대 도달 시 버튼 없이 자동 정산 | 2.2표 불법 조합의 버튼이 비활성/없음 |
| U9 | **자동 정산**: 최대 스핀에 도달하면 사용자 입력 없이 정산 결과 화면. 유효 최대 1이면 [스핀] 한 번으로 정산(선택 UI 없음) | AC-2.3, AC-2.5 |
| U10 | **빈 턴 표시**: 합산이 0이면 "아무 줄도 없음 - 행동 없음"을 명시. 빈 스핀(턴은 아님)과 구분 | `report.empty` |
| U11 | **정산 표시**: 스핀 단계 종료 후 사용 횟수, 남은 횟수, 적용된 Focus %, 동작별 최종 위력, 적 행동 순서대로 `events`를 보여 준다 | 이벤트 순서 AC-2.7 |
| U12 | 플레이어 방어도는 정산 때 올라간다. 스핀 도중에는 0이고, "지금 멈추면 방어도 Y"로 미리 보인다 | 2.1 |

### 7.2 릴 편집 화면

- 릴별 구성과 **편집 전/후 동작별 발동 확률**은 M2 8장과 같은 정보를 보이되, **기준을 "한 턴"으로 한다**: 캐릭터의 유효 최대 스핀(`resolveTurnStats(...).maxSpins`) 횟수만큼 돌렸을 때 합산 기준 확률(8.5절 `analyzeReels(..., { spins })`).
- 표시 항목: 빈 턴 확률, 동작별 `P(합산 >= 1줄)`, `>= 2줄`, `>= 3줄`(단계 상한과 방어도 무시 임계가 3줄이므로), 기대 줄 수. 편집 전/후를 나란히.
- **권고 = 턴 단위 (유효 최대 스핀)**: 편집은 한 턴 전체의 결과를 바꾸고, 플레이어가 판단하는 것도 "한 턴에 얼마나 터지나"다. 한 번의 스핀 기준 수치(예: 스킬 1줄 11.2%)는 합산 3스핀에서 29.97%가 되어 직관과 크게 다르다. 일찍 멈추는 경우의 확률은 화면에 표시하지 않는다(필요하면 `spins: 1` 옵션으로 계산 가능).
- 인수 기준: 시작 릴 `AAAGGSS`에서 `spins: 3` 결과가 8.5절 표와 일치.

---

## 8. 엔진 API 변경 (Tech용)

### 8.1 타입

`src/core/types.ts`:

```
CharacterDef  += spinsPerTurn: number
TurnRules     =  { focusPercentPerUnusedSpin, spinsPerTurnMin, spinsPerTurnHardCap }
TurnModifier  =  { id, spinsPerTurnAdd?, spinsPerTurnMulPct?, damagePct?, focusPctAdd? }
TurnStats     =  { maxSpins, focusPctPerUnused, damagePct }
RunRules      extends TurnRules
BattleConfig  += turnRules: TurnRules,  modifiers?: readonly TurnModifier[]   // 생략 = []
```

`src/core/run-flow.ts`: `RunState += modifiers: readonly TurnModifier[]` (M2.5는 `[]`). `beginStage`가 `BattleConfig.turnRules = definition.rules`(세 필드)와 `modifiers`를 채운다. `RunPhase`는 그대로(`'battle'`).

`src/core/battle.ts`:

```
Battle        =  { config, state, session: TurnSession | null }     // 전투 종료 시 null
TurnSession   =  { kind: 'turn_start', stats } | { kind: 'spinning', stats, spins: SpinRecord[] }
SpinRecord    =  { index, board, judgement }
SpinReport    =  { index, maxSpins, board, judgement, empty }
SpinResult    =  { battle, spin: SpinReport, result: TurnResult | null, events }
StopPolicy    =  (preview: StopPreview, battle: Battle) => boolean        // true = 한 번 더
TurnReport    += spins, pooled, maxSpins, spinsUsed, unusedSpins, focusPct, damagePct, stopReason, empty   (2.5)
```

`BattleState`는 변경 없음. 전투 종료 시 `session == null`.

### 8.2 함수

| 함수 | 시그니처 | 변경 |
|---|---|---|
| `createBattle(config)` | 동일 | `session = { kind: 'turn_start', stats: resolveTurnStats(...) }` |
| `createBattleFromState(config, state, session?)` | **인자 추가** | `session` 생략 시 `turn_start`. 검증 2.4 |
| `spinOnce(battle, rng): SpinResult` | **신규** | 2.2~2.3 |
| `submitSpin(battle, board): SpinResult` | **신규** | |
| `stopSpinning(battle): TurnResult` | **신규** | |
| `previewStop(battle): StopPreview` | **신규** | 2.6 |
| `estimateContinue(battle, { rng, samples })` | 신규 (P2, 선택) | |
| `playTurn(battle, rng, policy?): TurnResult` | **인자 추가** | 생략하면 1회 후 멈춤 |
| `resolveTurn(battle, board): TurnResult` | **의미 변경** | "보드 1장으로 스핀 1회 후 멈춤"(남은 횟수 반영) |
| `resolveTurnStats(base, rules, modifiers): TurnStats` | **신규** (`turn-stats.ts`) | 5.1 |
| `poolJudgements(spins): PooledJudgement` | **신규** (`judge.ts`) | 3.1 |
| `power(basePower, gradeSumTotal, multiplierNum, bonusPct = 0)` | **인자 추가** | `floor(basePower x gradeSumTotal x multiplierNum x max(0, 100 + bonusPct) / (MULTIPLIER_DENOMINATOR x 100))`. 생략 시 M2 값과 같음 |
| `evaluateAction(action, tally, bonus?)` / `evaluateOutcomes(judgement, actions, bonus?)` | **인자 추가** | `bonus = { focusPct, damagePct }`(기본 0). 피해에는 `focusPct + damagePct`, 방어도에는 `focusPct`만 |
| `ActionOutcome` | 필드 추가 | `focusPct`, `damagePct` |
| `playRunTurn(run, rng, policy?)`, `resolveRunTurn(run, board, rng)` | **인자 추가 / 의미 변경** | 전투 함수와 같은 편의 의미. 승리 시 제시 3개 뽑기(rng 3회) |
| `spinRun(run, rng): RunSpinResult` | **신규** | `spinOnce` + 정산되면 M2의 승리/패배 전이 (`RunSpinResult = { run, events, spin, result: RunTurnResult | null }`) |
| `stopRun(run, rng): RunTurnResult` | **신규** | `stopSpinning` + 전이. 승리 시 rng 3회(제시) |
| `analyzeReels(reels, options)` | `options.spins?: number` 추가 | 8.5 |

**Tech 권고**: UI와 시뮬레이터는 새 단계 API(`spinRun`/`stopRun`, 전투 단독은 `spinOnce`/`stopSpinning`)를 쓴다. `playTurn`/`resolveTurn`/`playRunTurn`/`resolveRunTurn`은 **삭제하지 말고 편의 함수로 유지**한다(기존 단위 테스트, 한 보드로 정산하는 테스트, 밸런스 테스트용). 기존 테스트는 `spinsPerTurn: 1`인 구성(6.2의 `M2_*` 상수)을 쓰면 값이 바뀌지 않는다.

### 8.3 rng 호출 순서

- 스핀 1회 = **정확히 9회** (`spin()` 그대로: 릴 0부터, 행 0, 1, 2).
- 스핀 k는 **플레이어가 요청했을 때만** 일어난다. 미리 뽑아 두지 않는다. 멈추면 그 뒤 스핀 몫의 rng는 소비되지 않는다.
- `stopSpinning`은 rng를 쓰지 않는다. 승리 시 제시 뽑기 3회(`drawOffers`, M2 2.1 그대로)는 승리를 정산하는 호출(`stopRun` 또는 최대 도달한 `spinRun`) 안에서 일어난다.
- 런 전체 소비 순서: (스핀 9회 x 사용 스핀 수) -> 정산 -> (승리 시 제시 3회) -> 다음 전투 .... **시드 + 입력 기록(매 스핀 뒤 "스핀/멈춤" 결정)**만으로 런이 재현되어야 한다.
- 시뮬레이터/정책이 "미리 보기"를 위해 별도로 뽑는 난수(`estimateContinue`, smart 정책의 표본)는 **런 rng와 다른 rng**를 쓴다.

### 8.4 Tech 변경 목록

| # | 파일 | 변경 |
|---|---|---|
| 1 | `src/data/tiers.ts` | `STANDARD_TIERS` = `{1:2},{2:3},{3:4}`. M2 4단계는 `M2_TIERS`로 보존 |
| 2 | `src/data/actions.ts` | 공격 `ignore_guard minLines 3`. 나머지 동일. `M2_ACTIONS` 보존. (단계표와 임계를 받는 팩토리 함수로 두 벌을 만드는 것을 권장) |
| 3 | `src/data/character.ts` | `startingReels` = A1 x3, G1 x2, S1 x2 (릴당 7개). `spinsPerTurn: 3`. `M2_STARTING_REEL` 보존, `M1_STARTING_REEL` 유지. `M2_CHARACTER`(`spinsPerTurn: 1`) |
| 4 | `src/data/enemies.ts` | 6.1표의 새 HP/패턴. `M2_ENEMIES`, `M2_STAGES` 보존 |
| 5 | `src/data/run.ts` | `focusPercentPerUnusedSpin 50`, `spinsPerTurnMin 1`, `spinsPerTurnHardCap 5` 추가. 나머지(회복 8, 보스 직전 전량, 주기 3, 릴 3~12, 제시 3, 가중치) 불변 |
| 6 | `src/data/index.ts` | 새 정의(`M25_RUN` 등)와 `M2_RUN`(회귀용) 내보내기, `createStartingBattleConfig` 새 값 + `createM2BattleConfig` |
| 7 | `src/core/types.ts` | 8.1의 타입 추가 |
| 8 | `src/core/turn-stats.ts` (신규) | `resolveTurnStats` + 정수 검증 |
| 9 | `src/core/outcome.ts` | `power`에 `bonusPct`, `evaluateAction/Outcomes`에 `bonus`. `ActionOutcome`에 `focusPct`/`damagePct` |
| 10 | `src/core/judge.ts` | `PooledJudgement`, `poolJudgements`(각 줄에 `spinIndex`) |
| 11 | `src/core/battle.ts` | `session`, `spinOnce`, `submitSpin`, `stopSpinning`, `previewStop`, 편의 함수 재정의, `TurnReport` 확장 |
| 12 | `src/core/events.ts` | `turn_started`, `spun`, `spin_phase_ended` 이벤트 추가 |
| 13 | `src/core/config-validation.ts` | 2.4의 설정 검증(스핀 필드, 수정치 정수, 한도) |
| 14 | `src/core/run.ts`, `run-flow.ts` | `spinRun`, `stopRun`, `RunState.modifiers`, 편의 함수 의미 갱신, `beginStage`의 `turnRules`/`modifiers` 전달 |
| 15 | `src/core/reel-analysis.ts` | `options.spins` (8.5), `fire3plus`, `emptySpin` |
| 16 | `src/core/index.ts` | 새 함수/타입 내보내기 |
| 17 | `src/ui/*` (`app.ts`, `run-controller.ts`, `views/battle-screen.ts`, 릴 편집 화면) | 7장. `format.ts`에 단계/Focus 문구 |
| 18 | 테스트 영향 (아래 8.6) | |

### 8.5 `analyzeReels`의 다중 스핀 확장

현재 `analyzeReels`는 **스핀 1회**의 확률을 낸다(M2 8장). 확장:

```
analyzeReels(reels, { grades, actionIds?, spins? = 1 })
  ActionAnalysis += fire3plus: number            // P(합산 라인 >= 3)
  ReelAnalysis   += emptySpin: number            // 스핀 1회 빈 확률 (spins와 무관)
  empty        = 한 턴 합산이 0일 확률 = emptySpin ^ spins
  fire, fire2plus, fire3plus, expectedLines      // 합산 기준 (spins 번 풀링)
  avgGradeValue                                  // 변경 없음
```

- 방법: 스핀은 서로 독립이므로, 1회 스핀의 (동작별 라인 수) 결합 분포를 M2 8장 방법으로 구하고 `spins`번 합성곱한다. `spins = 1`이면 M2와 같은 값(회귀 호환). 참조 구현: `tools/sim/ms-reel-stats.mjs`의 `spinJoint`, `turnJoint`, `fireStats`.
- `spins`는 정수 1..`spinsPerTurnHardCap`. 범위 밖이면 예외.
- 정확도: 예시값 대비 허용 오차 `1e-9`(부동소수 합성곱), 표(%)와 비교할 때 `0.01%p`.
- `previewEdit`/`analyzeEdit`도 같은 `options.spins`를 받는다.
- 릴 편집 UI는 `spins = 유효 최대 스핀`을 넘긴다(7.2).

턴 단위 정확 확률 (`node tools/sim/ms-reel-stats.mjs 3 400000`, 시작 릴 x3, 합산 기준 %):

| 릴 | k | 빈 턴 | 방어 >=1 / >=2 / >=3 | 스킬 >=1 / >=2 / >=3 | 공격 >=1 / >=2 / >=3 / >=4 / >=5 |
|---|---|---|---|---|---|
| AAAGSS (M2) | 1 | 32.96 | 2.31 / 0.00 / 0.00 | 17.45 / 1.01 / 0.06 | 52.40 / 17.38 / 5.53 / 1.55 / 0.46 |
| | 2 | 10.86 | 4.58 / 0.05 / 0.00 | 31.86 / 4.71 / 0.44 | 77.34 / 44.00 / 20.45 / 8.36 / 3.14 |
| | 3 | 3.58 | 6.78 / 0.16 / 0.00 | 43.75 / 10.13 / 1.50 | 89.21 / 65.41 / 39.83 / 20.98 / 9.90 |
| **AAAGGSS (채택)** | 1 | 44.86 | 11.20 / 0.44 / 0.02 | 11.20 / 0.44 / 0.02 | 36.52 / 8.59 / 2.15 / 0.49 / 0.13 |
| | 2 | 20.12 | 21.14 / 2.04 / 0.14 | 21.14 / 2.04 / 0.14 | 59.71 / 24.24 / 8.27 / 2.57 / 0.76 |
| | **3** | **9.03** | **29.97 / 4.53 / 0.45** | **29.97 / 4.53 / 0.45** | **74.42 / 40.66 / 18.02 / 6.98 / 2.48** |

다른 시작 릴 후보 (k=3: 방어 >=1 / 빈 턴): AAGGSS 43.75% / 13.79%, AAAGGS (M1) 43.75% / 3.58% (스킬 6.78), AAAAGGS 29.97% / 1.24%, AAAAGGSS 21.07% / 4.43%.

**시작 릴을 바꾼 이유**: `AAAGSS`에서는 방어 발동이 턴당 1/2/3스핀에서 2.31/4.58/6.78%뿐이라, 다중 스핀이 방어 부족을 자연히 해결하지 못한다. 실제로 M2 릴로 새 적을 상대하면 smart 99.0~99.1%로 너무 쉽고, 방어는 전체 턴의 2.5~2.6%만 발동하며 탐욕 편집기가 4번째 전투 전에 유일한 방어를 삭제한다. `AAAGGSS`는 방어/스킬이 1/2/3스핀에서 11.20/21.14/29.97%, 공격은 3스핀에서 74.42%, 빈 턴은 3스핀 9.03%다.

### 8.6 테스트와 밸런스 테스트 영향

| 대상 | 영향 | 조치 |
|---|---|---|
| `src/data/data.test.ts` | 시작 릴, `STAGES`, `RUN_RULES` 기대값이 바뀐다 | 6.1표 값으로 갱신. `M2_*` 상수 동기화 테스트 추가 |
| `battle.test.ts`, `enemy.test.ts`, `spec-gaps.test.ts`, `m2-spec-gaps.test.ts`, `run.test.ts`, `outcome`/`judge` 테스트 중 `createStartingBattleConfig`/적 수치/단계표를 쓰는 것 | 새 기본값에서는 Focus와 새 수치로 값이 달라진다 | `createM2BattleConfig`(스핀 1회, M2 상수) 또는 테스트 지원 `singleSpinConfig`로 돌리면 값이 그대로. 새 규칙 테스트는 새 파일(`multispin.test.ts` 등) |
| `balance.test.ts`, `balance.full.test.ts` (M1 승률: 슬라임 99.5%, 고블린 84.2%) | M1 릴 + M1 적 + M2 단계표/임계 + `spinsPerTurn: 1`이어야 값이 유지 | `m1BalanceConfig`가 `M2_ACTIONS`, `M2_ENEMIES`, `spinsPerTurn: 1`을 쓰도록 변경 |
| `run-balance.test.ts`, `balance.run.full.test.ts` (M2 한 판 약 59%, 보스 빈 턴 약 14.7%) | 구 규칙 회귀로 **유지**(M2 상수 + 스핀 1회) + **새 M2.5 테스트 추가** | 새 테스트의 기준: smart 정책 승률 설계값 61.8%, 허용 +-3%p(시드별 59.8~62.5와 정책 구현 차이를 포괄, **제안값**), max 정책 45.8%(+-3%p), once <= 1%, takeall 약 5.6%(+-2%p), none <= 1%. 20만 판 마감 검증은 +-1%p 목표를 쓰되 정책 포팅 차이로 벗어나면 설계에 보고 |
| `src/test-support/run-balance-sim.ts` (QA의 탐욕 정책 포팅) | **전체 턴 단위 점수**로 바꾸고(편집기는 한 턴 = 유효 최대 스핀 풀링 결과의 기대 피해 + 0.7 x 기대 방어도로 후보를 비교) **정지 정책**(smart/max/once)을 추가한다. **런마다 자체 rng**(`createRng(seed + 런 번호)`)를 쓰고, 정책의 미리 보기/점수 표본은 **별도 rng**를 써서 공통 난수 비교가 가능하게 한다(Focus 없는 대조군에서 smart == max가 정확히 같아야 함) | 아래 정책 정의 |
| `run-helpers.ts`의 `winBattle`/`loseBattle` | HP를 조작해 한 턴에 끝내는 헬퍼. 새 `session`을 고려 | 필요하면 `withBattleState`가 `session`을 유지하도록 갱신 |
| 새 단위 테스트 | 2.7, 3.3, 4.4, 5.5, 6.3의 AC 전부, 10장 예시 전부 | |

정책 정의 (시뮬레이터 `ms-sim.mjs`와 같다): **smart** = 스핀마다 "지금 멈춤"의 효용(실제 입힌 피해 + 0.8 x 보이는 공격을 막는 방어도, 치명은 항상 선택)과 샘플링한 연속 결과 중 최선을 비교. **max** = 멈추지 않음. **once** = 스핀 1회 후 멈춤. **takeall** = 제시를 매번 무작위로 받고 편집 없음. **none** = 릴 편집 없음. 모두 편집기는 같은 탐욕(전체 턴 점수)을 쓴다(특기하지 않는 한).

---

## 9. 보스 빈 턴 목표 (REQ-005 2부 해결, M2 목표를 대체)

**결정**: 빈 턴의 정의를 **"턴의 합산 출력이 0"(모든 스핀이 빔)**으로 바꾼다. M2 명세 12장 3번의 "목표 15~20%, 보스 14.9%"는 **폐기(superseded)**한다. 새 목표(smart + 탐욕 정책 기준):

| 지표 | 목표 | 시뮬레이션 |
|---|---|---|
| 보스 전투의 빈 턴 (턴 전체) | **1~4%** | **2.3%** |
| 전투 1의 빈 턴 (턴 전체) | **7~11%** | **9.0%** |
| 신규 지표 **빈 스핀 비율** (사용한 스핀 중 성립 라인이 없는 스핀의 비율), 보스 | **25~35%** | **28.4%** |
| 빈 스핀 비율, 전투 1 | (참고) | 44.8% |

**이유**: 이제 빈 턴이 되려면 사용한 모든 스핀이 비어야 하므로 드물고 기억에 남는 사건이어야 한다. 일상적인 "비었다"의 긴장은 스핀 단위로 옮겨 갔다(빈 스핀은 Focus 한 단계를 깎고 다시 돌리게 만든다). 옛 15~20% 목표는 스핀 1회를 기준으로 한 값이며 그 의미는 "빈 스핀 비율" 지표가 이어받는다. 유효 최대가 1인 아이템 구성에서는 빈 턴 비율이 다시 빈 스핀 비율과 같아진다(M2 의미).

단계별 빈 턴 % (smart + 탐욕, 20000판, 시드 1): 전투 1~6 = 9.0 / 7.5 / 6.1 / 4.0 / 3.0 / 2.3. 단계별 빈 스핀 %: 44.8 / 42.1 / 39.4 / 33.8 / 30.9 / 28.4. (11.2표와 같은 실행)

| # | 인수 기준 |
|---|---|
| AC-9.1 | `TurnReport.empty`는 `outcomes.length == 0`과 동치. 모든 스핀이 비었을 때만 true |
| AC-9.2 | 밸런스 테스트가 보스 빈 턴 비율(턴 전체)과 빈 스핀 비율을 따로 측정하고 위 목표 범위를 확인한다 |
| AC-9.3 | 일부 스핀만 비고 합산이 0이 아니면 `empty == false` |

---

## 10. 계산 예시 (QA 테스트 케이스로 그대로 사용)

`node tools/sim/ms-examples.mjs`로 예시 1~4를 재현하고, 예시 5~12는 같은 엔진 코드(`workedTurn`)로 계산해 확인했다. 모든 값은 유효 최대 3(예시 6, 7은 명시), `maxHp 50`, 단계표 `{1:2},{2:3},{3:4}`, `ignore_guard` 3줄, `focusPct 50`/남은 스핀이다. 보드는 행 3개(위 -> 아래), 각 행은 `릴0 릴1 릴2`. 적 의도의 값은 그 턴의 유효 공격값이다.

### 예시 1: 첫 스핀에서 멈춤 (남은 2회, Focus +100%), 방어도가 공격을 막는다

- 입력: 슬라임 HP 72, 방어도 0. 플레이어 HP 50. 의도 attack 6. 유효 최대 3.
- 스핀 1: `A1 A1 A1 | G1 G1 G1 | S1 A1 S1` -> `H1` 공격 3, `H2` 방어 3. 멈춤.
- 합산: 방어 1줄/등급 합 3, 공격 1줄/등급 합 3. `usedSpins 1`, `unused 2`, Focus +100%.
- 방어도 `floor(2x3x2x200/200) = 12`. 공격 피해 `floor(2x3x2x200/200) = 12`.
- 결과: 슬라임 HP 72 -> 60. 적 공격 6을 방어도 12가 전부 흡수(`absorbed 6`, `hpLoss 0`). 플레이어 HP 50. 남은 방어도 6(다음 턴 시작에 소멸).

### 예시 2: 스핀을 넘나드는 합산 단계 + `ignore_guard`

- 입력: 해골 병사 HP 95, **적 방어도 18**(직전 행동의 방어), 플레이어 HP 30, 의도 attack 12. 유효 최대 3.
- 스핀 1: `A1 A1 A2 | A1 S1 G1 | A1 G1 S1` -> `H1` 공격 4, `V1` 공격 3.
- 스핀 2: `S1 A1 G1 | A1 A1 A1 | G1 S1 S1` -> `H2` 공격 3. 멈춤 (`unused 1`, Focus +50%).
- 합산: 공격 **3줄**, 등급 합 10. 단계 x2(`multiplierNum 4`). `ignore_guard` 활성.
- 공격 피해 `floor(2x10x4x150/200) = 60`. 방어도 무시라 적 방어도 18은 그대로(`absorbed 0`).
- 결과: 해골 HP 95 -> 35. 적이 공격 12: 플레이어 방어도 0이라 HP 30 -> 18.

### 예시 3: 3스핀 모두 사용, 첫 스핀 빔, 오우거 강화 공격

- 입력: 오우거 HP 200, 방어도 0. 플레이어 HP 40. 의도 attack 9 x 힘 모으기 2 = **18**(`baseValue 9`). 유효 최대 3.
- 스핀 1: `A1 G1 S1 | G1 S1 A1 | A1 A1 G1` -> 성립 라인 없음 (빈 스핀).
- 스핀 2: `S1 S1 S1 | A1 G1 A1 | A1 A1 A1` -> `H1` 스킬 3, `H3` 공격 3.
- 스핀 3: `G1 G1 G1 | A2 A1 A1 | S1 S1 G1` -> `H1` 방어 3, `H2` 공격 4. 3스핀 모두 사용 (`unused 0`, Focus 0%, `stopReason max_reached`).
- 합산: 방어 1줄/3 -> 방어도 `floor(2x3x2x100/200) = 6`. 스킬 1줄/3 -> 피해 3, 방어도 3. 공격 2줄/등급 합 7 -> x1.5 -> `floor(2x7x3x100/200) = 21`.
- 총 피해 24 (스킬 3 + 공격 21), 총 방어도 9 (방어 6 + 스킬 3).
- 결과: 오우거 HP 200 -> 176. 적 공격 18: `absorbed 9`, `hpLoss 9`. 플레이어 HP 40 -> 31.

### 예시 4: 빈 턴 (스핀 3회 모두 빔), 대체 행동 없음

- 입력: 어린 고블린 HP 50, 플레이어 HP 25, 의도 attack 10.
- 스핀 1: `A1 G1 S1 | G1 S1 A1 | A1 A1 G1`, 스핀 2: 같은 보드, 스핀 3: `S1 A1 G1 | G1 A1 S1 | A1 G1 A1` -> 모두 성립 라인 없음. 3스핀 사용.
- 합산 출력 0. `report.empty == true`, `outcomes` 비어 있음.
- 결과: 어린 고블린 HP 50 그대로. 적 공격 10: 방어도 0이라 플레이어 HP 25 -> 15.
- 변형 4b: 스핀 1이 비었을 때 플레이어가 멈추는 것도 합법이다(`unused 2`지만 0에 Focus는 0). 같은 결과, `stopReason player_stop`.

### 예시 5: 치명 조기 멈춤 (적이 죽으면 적은 행동하지 않는다)

- 입력: 슬라임 HP 30, 방어도 0. 플레이어 HP 50. 의도 attack 6.
- 스핀 1: `A1 A1 A1 | G1 S1 G1 | A1 A1 A2` -> `H1` 공격 3, `H3` 공격 4. `previewStop`: `lethal == true`. 멈춤 (`unused 2`, +100%).
- 합산: 공격 2줄/등급 합 7 -> x1.5 -> `floor(2x7x3x200/200) = 42`.
- 결과: 슬라임 HP 30 -> -12 (`phase victory`). 적 행동 없음, 플레이어 HP 50 그대로. 이벤트 끝: `victory`.

### 예시 6: 유효 최대 1 (선택 없음)

- 입력: 어린 고블린 HP 81, 플레이어 HP 40, 의도 attack 5. **유효 최대 1** (`spinsPerTurn 1` 또는 수정치).
- 스핀 1: `A1 A1 A1 | G1 S1 G1 | S1 G1 S1` -> `H1` 공격 3. `spinOnce`가 즉시 정산 (`result != null`, `stopReason max_reached`, `unused 0`, Focus 0).
- 피해 `floor(2x3x2x100/200) = 6`. 어린 고블린 HP 81 -> 75. 적 공격 5: 플레이어 HP 40 -> 35.
- 이 구성에서 결과는 M2 한 스핀 규칙과 같다.

### 예시 7: 유효 최대 4 (`{ spinsPerTurnAdd: 1 }`), 3회 후 멈춤

- 입력: 고블린 HP 102, 플레이어 HP 40, 의도 attack 10. 유효 최대 4.
- 스핀 1: `A1 A1 A1 | G1 S1 G1 | S1 G1 S1` -> `H1` 공격 3.
- 스핀 2: `G1 G1 G1 | A1 S1 A1 | S1 A1 S1` -> `H1` 방어 3.
- 스핀 3: `A1 G1 S1 | G1 S1 A1 | A1 A1 G1` -> 빈 스핀. 멈춤 (`unused 1`, Focus +50%).
- 합산: 방어 1줄/3 -> 방어도 `floor(2x3x2x150/200) = 9`. 공격 1줄/3 -> 피해 `floor(2x3x2x150/200) = 9`.
- 결과: 고블린 HP 102 -> 93. 적 공격 10: `absorbed 9`, `hpLoss 1`. 플레이어 HP 40 -> 39.

### 예시 8: Focus와 floor는 마지막에 한 번

- 입력: 고블린 HP 102, 플레이어 HP 40, 의도 attack 6. 유효 최대 3.
- 스핀 1: `S1 S1 S2 | A1 G1 A1 | S1 S1 S1` -> `H1` 스킬 4, `H3` 스킬 3. 멈춤 (`unused 2`, +100%).
- 합산: 스킬 2줄/등급 합 7 -> x1.5. 피해 `floor(1x7x3x200/200) = 21`, 방어도 `floor(1x7x3x200/200) = 21`. (단계 위력을 먼저 floor하면 `floor(10.5) = 10`, x2 = 20이 되어 **틀린다**.)
- 결과: 고블린 HP 102 -> 81. 적 공격 6을 방어도 21이 흡수. 플레이어 HP 40.

### 예시 9: 방어도로 충분해서 멈춤

- 입력: 고블린 HP 102, 플레이어 HP 20, 의도 attack 10. 유효 최대 3.
- 스핀 1: `G1 G1 G1 | A1 S1 A1 | S1 A1 S1` -> `H1` 방어 3. 멈춤 (`unused 2`, +100%).
- 방어도 `floor(2x3x2x200/200) = 12`. 피해 0.
- 결과: 고블린 HP 102 그대로. 적 공격 10 전부 흡수(`absorbed 10`, `hpLoss 0`). 플레이어 HP 20. 이 멈춤은 "방어도가 막아줌" 사유.

### 예시 10: 합산 공격 2줄 (임계 미만) -> 적 방어도가 흡수

- 입력: 해골 병사 HP 95, 적 방어도 18, 플레이어 HP 30, 의도 attack 12. 유효 최대 3.
- 스핀 1: `A1 A1 A1 | G1 S1 G1 | S1 G1 S1` -> `H1` 공격 3.
- 스핀 2: `G1 S1 G1 | A1 A1 A1 | S1 G1 S1` -> `H2` 공격 3.
- 스핀 3: `A1 G1 S1 | G1 S1 A1 | A1 A1 G1` -> 빈 스핀. 3스핀 모두 사용 (Focus 0%).
- 합산: 공격 **2줄**/등급 합 6 -> x1.5 -> 피해 `floor(2x6x3x100/200) = 18`. `ignore_guard` **비활성**(3줄 미만).
- 결과: 적 방어도 18이 피해 18을 전부 흡수 (`enemy_damaged`: `damage 18`, `absorbed 18`, `hpLoss 0`, `ignoreGuard false`, `enemyGuard 0`). 해골 HP 95 그대로. 적 공격 12: 플레이어 HP 30 -> 18. (예시 2와 대비: 합산 3줄이면 방어도 무시.)

### 예시 11: 스핀 횟수 클램프 (`resolveTurnStats`)

5.1 클램프 표의 모든 행을 그대로 테스트 케이스로 쓴다. 예: `base 3, add +3` -> 5, `base 3, add -5` -> 1, `base 3, mulPct 150` -> 4, `base 3, add +1, mulPct 150` -> 5.

### 예시 12: 불법 호출

| 호출 | 상태 | 결과 |
|---|---|---|
| `stopSpinning` | `turn_start` (스핀 전) | 예외 |
| `previewStop` | `turn_start` | 예외 |
| `spinOnce` | 전투 종료 | 예외 |
| `stopSpinning` | 전투 종료 | 예외 |
| `resolveTurn(battle, board)` | `spinning` (턴 도중) | 예외 |
| `createBattleFromState(config, state, { kind: 'spinning', spins: 3개 })` | 유효 최대 3 (`spinsUsed == maxSpins`) | 예외 |
| `spinOnce` 3회 연속 | 유효 최대 3 | 3번째 호출에서 자동 정산. 4번째 `spinOnce`는 **다음 턴의 스핀 1**이라 합법 (이전 턴이 정산된 새 `Battle`에서) |

### 예시 13: 아이템 수정치 (5.2표)

공격 한 줄(등급 합 3)만 성립했을 때 피해: 기본 12/9/6 (1/2/3회), 여분의 손 15/12/9/6 (최대 4), 무거운 망치(최대 2) 16/13, 고요한 눈 15/10/6. 방어 한 줄(등급 합 3) 방어도: 기본 12/9/6, 무거운 망치 9/6(`damagePct`는 방어도에 적용되지 않는다).

---

## 11. 시뮬레이션 결과

### 11.1 기준 설정과 최종 결과

`ms-config.mjs`: 시작 릴 `AAAGGSS` x3, 단계표 x1/1.5/2 풀링, `ignore_guard` 3줄, Focus 50, 최대 스핀 3, 회복 8/전량, N = 3, 적 6.1표. 20000판, 시드 1 (대괄호는 시드 2, 3). `node ms-sim.mjs 20000 set=report seed=1` (`tools/sim`에서). 이번 작업에서 시드 1~3 모두 재실행해 아래 값이 정확히 재현됨을 확인했다.

| 정책 | 승률 % | 일찍 멈춤 % | 스핀/턴 | 빈 턴 % 전투 1..6 | 전투 5 후 HP (회복 전) | 보스 종료 HP | 패배 % 전투 1..6 |
|---|---|---|---|---|---|---|---|
| **smart + greedy** | **61.8** [59.8, 62.5] | 28.1 (비치명 12.4) | 2.62 | 9.0/7.5/6.1/4.0/3.0/2.3 | 22.9 | 19.9 | 0.1/2.3/6.6/9.8/8.0/11.6 |
| max + greedy | 45.8 [44.5, 47.4] | 0 | 3.00 | 9.0/7.5/6.0/4.0/3.0/2.3 | 19.6 | 18.1 | 0.1/3.5/11.2/14.3/11.6/13.5 |
| once + greedy | 0.1 [0.1, 0.1] | 100 | 1.00 | 44.7/41.7/39.5/31.9/29.9/29.3 | 15.2 | 16.3 | 27.1/52.1/15.7/3.7/0.9/0.3 |
| smart + takeall | 5.6 [5.5, 5.5] | 21.5 | 2.72 | 9.0/8.8/8.6/8.3/7.6/6.6 | 15.1 | 12.4 | 0.0/4.0/21.9/28.5/24.8/15.2 |
| smart + none | 0.1 [0.2, 0.2] | 21.5 | 2.72 | 9.0/9.1/9.0/9.1/9.1/9.1 | 11.0 | 7.7 | 0.0/4.4/24.7/36.0/26.2/8.6 |

### 11.2 전투별 (smart + greedy, 시드 1)

| # | 적 | 도달 | 조건부 승률 % | 시작 HP | 종료 HP | 평균 턴 | 빈 턴 % | 스핀/턴 | 일찍 멈춤 % | 방어 발동 % | 스킬 발동 % | 방어도 무시 % | 빈 스핀 % | 방어도 흡수 % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 슬라임 | 20000 | 100.0 | 50.0 | 38.1 | 5.8 | 9.0 | 2.72 | 20.5 | 27.4 | 27.4 | 13.5 | 44.8 | 44.2 |
| 2 | 어린 고블린 | 19990 | 97.7 | 44.7 | 29.5 | 4.7 | 7.5 | 2.67 | 23.2 | 24.3 | 24.1 | 20.5 | 42.1 | 35.5 |
| 3 | 해골 졸병 | 19537 | 93.3 | 37.1 | 25.8 | 5.0 | 6.1 | 2.68 | 22.9 | 22.0 | 21.9 | 29.2 | 39.4 | 26.6 |
| 4 | 고블린 | 18221 | 89.3 | 33.4 | 22.7 | 3.3 | 4.0 | 2.52 | 34.4 | 11.6 | 21.2 | 41.9 | 33.8 | 23.2 |
| 5 | 해골 병사 | 16270 | 90.2 | 30.5 | 22.9 | 3.4 | 3.0 | 2.51 | 36.8 | 10.5 | 18.9 | 51.3 | 30.9 | 15.4 |
| 6 | 오우거 | 14677 | 84.2 | 50.0 | 19.9 | 6.2 | 2.3 | 2.51 | 39.1 | 9.3 | 17.0 | 60.1 | 28.4 | 10.9 |

전체 런: 방어가 발동한 턴 18.9%, 스킬 22.3%, 방어도가 받는 공격의 26.5%를 흡수.

### 11.3 목표 대비 (정직한 평가)

| 목표 | 결과 |
|---|---|
| 헤드라인 승률 55~70% | **충족** 61.8% |
| max/once/takeall/none이 분명히 낮음 | **충족** 45.8 / 0.1 / 5.6 / 0.1 |
| 일찍 멈춤 비율 | 28.1% **충족**. 단, 비치명 멈춤 12.4%로 목표 약 15%에 **약간 미달** |
| 슬라임 | 조건부 승률 100%: 사실상 튜토리얼 (자명한 승리) |
| takeall 5.6% / none 0.1% 바닥 | 낮다. M2 미결 4번이 더 선명해졌다 |
| 승률의 민감도 | 가파르다: 적 HP 3% 또는 Focus 10%p당 약 3%p |
| 스핀 1회의 가치 | 매우 크다 (5.3, 5.4) |
| 방어도 무시 | 보스 턴의 약 60%에서 발동: 적 방어 의도의 비중이 낮아진다. "공격 3줄 모으기"라는 목표를 주려는 의도 |
| 탐욕 편집기 | Focus를 모르므로 방어를 얇게 한다 (방어 발동 27% -> 9%) |
| smart 정책 | 사람의 대리 지표일 뿐이다 |

### 11.4 시작 릴 비교 (smart)

`AAAGSS`(M2 릴)로 새 적을 상대하면 smart 승률 약 99%, 방어 발동 약 2.5%로 쉽고 방어 심볼이 죽는다(이번 작업에서 3000판으로 확인: 승률 99.0%, 방어 발동 2.5%, 설계 값 99.1% / 2.6%와 일치 범위). `AAAGGSS`로 바꾸면 61.8%, 방어 발동 18.9%. 정확 확률은 8.5절 표.

### 11.5 방법 메모

공통 난수 방식: 같은 런 시드로 정책만 바꿔 비교한다. 효과가 없는 대조군에서는 smart와 max가 정확히 같다.

### 11.6 재현 명령 (`tools/sim`에서 실행)

```
node ms-examples.mjs                                   # 예시 1~4
node ms-reel-stats.mjs 3 400000                        # 릴별 정확 확률, 8.5절
node ms-turn-stats.mjs 400000 20000 focus=50,100 ign=3 # 턴 수준, 3장 표
node ms-sim.mjs 20000 set=report seed=1                # 11.1, 11.2 (seed=2, 3도)
node ms-sim.mjs 6000 stop=all maxSpins=K               # 5.3 민감도
node ms-sim.mjs 6000 stop=smart maxSpins=2 dmgPct=D    # 5.3 피해 보정
node ms-sweep.mjs B runs=4000 calRuns=1500             # 3장 런 수준 비교 (약 10분)
node ms-sweep.mjs C runs=4000 calRuns=1500             # 4.2 후보 평가 (약 10분)
```

`ms-sweep.mjs`(약 10분씩)는 이번 작업에서 재실행하지 않고 설계 담당의 결과를 옮겼다. 나머지 명령은 모두 재실행해 일치를 확인했다.

---

## 12. 미결 사항

| # | 항목 | 내용 |
|---|---|---|
| 1 | 비치명 멈춤 12.4% (목표 약 15%) | Focus 60이면 14.3%이지만 적이 약 3% 더 어려워진다(적 HP를 올려야 승률 유지). 조정 손잡이로 남겨 둔다. 플레이테스트 후 결정 |
| 2 | 승률이 가파름 | 적 HP 3% 또는 Focus 10%p당 승률 약 3%p. 사람의 플레이는 정책과 다르므로 실제 승률은 크게 흔들릴 수 있다. 플레이 후 재조정 |
| 3 | **M3 효과 임계** | `reflect 2/3`, `guard_keep 4`, `weaken 3`, `double_hit 4`, `stun 2`는 지연(deferred) 상태다. 합산 라인 수는 이 임계에 훨씬 자주 닿는다(M2 릴 3스핀: 공격 합산 4줄 이상 21%, 5줄 이상 9.9%). **M3가 켜기 전에 반드시 재조정**한다 |
| 4 | takeall/none 바닥 | takeall 5.6%, none 0.1%. M2 미결 4번(건너뛰기 보상, 제시 4개, 초반 완화)이 더 중요해졌다 |
| 5 | 탐욕 편집기가 방어를 얇게 함 | 방어 발동 27% -> 9%. 편집기가 Focus를 모른다. 사람은 다르게 고를 수 있다. 정책에 방어 가중치를 올리는 안 검토 |
| 6 | M3 조작이 남은 스핀 칸을 소모? | 심볼 조작을 "남은 스핀 하나를 써서 한다"로 하면 4.2의 토큰 후보가 깔끔하게 들어간다. 조작 1회의 가치는 피해 약 5 상당일 때 일찍 멈춤 15~40%. M3 설계 때 결정 |
| 7 | 하드캡 4 vs 5 | 5스핀에서는 항상 최대 정책도 99.9%라 선택의 가치가 사라진다. M2.5는 5로 두지만 M4 전에 4로 내리는 안 검토 (5.4) |
| 8 | 릴 편집 UI 통계 | 턴 단위(유효 최대 스핀) 권고. 필요하면 1스핀 기준을 토글로 추가할지는 UI 팀 판단 |
| 9 | 튜토리얼 | 슬라임은 100% 승리. 첫 전투에서 "스핀 후 멈추기"와 Focus를 가르치는 안내가 필요하다 |
| 10 | 전투 중 수정치 변경 | M4에서 전투 중 소비 아이템이 `maxSpins`를 바꾸려면 `turn_start`에서만 허용하는 호출이 필요. M2.5는 지원하지 않는다 |
| 11 | `estimateContinue`의 정의 | "한 번 더 후 멈춤"의 평균은 최적 연속보다 낮다. 비교 문구를 어떻게 보일지(평균, 확률) UI 팀과 조율 |
| 12 | `maxSpins` 계산 시 곱의 반올림 | 곱 % 누적을 단계마다 floor한다(5.1). 105% x 105% 같은 값은 110%가 된다. M4 아이템 설계 때 정수 % 값만 쓰는 규칙으로 충분한지 확인 |
| 13 | QA 허용 오차 | 8.6의 +-3%p는 제안값이다. 시드별 59.8~62.5의 흩어짐과 정책 구현 차이를 포괄하려는 값이며 QA가 20만 판 결과로 확정 |
| 14 | 사용자 확정 | M2의 잠정 결정 + M2.5의 합산 방식(B1), Focus +50%, 시작 릴, 적 수치는 모두 기획 팀 시뮬레이션 기반의 잠정안이다. 사용자가 바꾸면 3, 4, 6, 9, 11장을 `tools/sim`으로 다시 생성해야 한다 |

**가정(명시)**: (a) Focus는 모든 동작의 피해와 방어도에 곱한다(스킬 포함). (b) `damagePct`는 모든 동작의 피해에만 적용한다. (c) 턴 시작 처리(플레이어 방어도 만료)는 스핀 1 호출 안에서 한다. (d) `focusPctAdd` 합이 음수면 0으로 자른다. (e) `100 + focus + damagePct`는 0 미만이면 0으로 자른다. (f) 스핀 한도 `Min 1`/`HardCap 5`는 데이터 규칙이다. (g) `spinning` 값에서 `spinsUsed == maxSpins`는 존재하지 않는다(자동 정산).
