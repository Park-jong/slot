// Pure text formatting of engine output. Every number shown here comes from the engine's report;
// nothing is recomputed, only described.
import {
  MULTIPLIER_DENOMINATOR,
  type ActionDef,
  type ActionId,
  type ActionOutcome,
  type BattleView,
  type BattleConfig,
  type BattleEvent,
  type EndPhase,
  type GradeId,
  type GradeTable,
  type IntentPreview,
  type IntentType,
} from '../core';
import { ACTION_ICONS, FALLBACK_ACTION_ICON } from './ui-config';

const INTENT_LABELS: Readonly<Record<IntentType, string>> = {
  attack: '공격',
  guard: '방어',
  charge: '힘 모으기',
};

/** Anything that names actions: a BattleConfig or a RunDefinition. */
export interface ActionNames {
  readonly actions: readonly ActionDef[];
}

/** Anything that names grades: a BattleConfig or a RunDefinition. */
export interface GradeNames {
  readonly grades: GradeTable;
}

export interface LogSection {
  readonly label: string;
  readonly items: readonly string[];
}

export interface TurnLog {
  readonly title: string;
  readonly sections: readonly LogSection[];
}

/** HP may go negative on overkill (spec 2.5); only the display is clamped. */
export function displayHp(hp: number): number {
  return Math.max(0, hp);
}

export function actionName(names: ActionNames, actionId: ActionId): string {
  return names.actions.find((action) => action.id === actionId)?.name ?? actionId;
}

export function gradeName(names: GradeNames, gradeId: GradeId): string {
  return names.grades[gradeId]?.name ?? String(gradeId);
}

export function actionIcon(actionId: ActionId): string {
  return ACTION_ICONS[actionId] ?? FALLBACK_ACTION_ICON;
}

function intentText(preview: IntentPreview): string {
  return `${INTENT_LABELS[preview.type]} ${preview.value}`;
}

// One entry per intent type (M2 spec 7.2); the mapped type makes a missing entry a compile error.
const INTENT_PREVIEW_FORMATTERS: { readonly [T in IntentType]: (preview: IntentPreview) => string } = {
  attack: (preview) =>
    preview.charged ? `${intentText(preview)} (강화됨 · 기본 ${preview.baseValue})` : intentText(preview),
  guard: intentText,
  charge: (preview) => {
    const next = preview.next ? ` (다음: ${intentText(preview.next)})` : '';
    return `${INTENT_LABELS.charge} — 다음 공격 x${preview.value}${next}`;
  },
};

export function formatIntentPreview(preview: IntentPreview): string {
  return INTENT_PREVIEW_FORMATTERS[preview.type](preview);
}

export function formatMultiplier(multiplierNum: number): string {
  return `x${multiplierNum / MULTIPLIER_DENOMINATOR}`;
}

/** "+50%" / "-20%": a signed percent bonus. */
export function formatSignedPercent(percent: number): string {
  return `${percent < 0 ? '-' : '+'}${Math.abs(percent)}%`;
}

/** The engine values of what an action does (an outcome or a stop-preview action). */
export interface PowerValues {
  readonly damage: number;
  readonly guard: number;
  readonly ignoreGuard: boolean;
}

/** "피해 13, 방어도 무시"; "효과 없음" when the action produces nothing. */
export function formatPowerSummary(values: PowerValues): string {
  const results = [
    values.damage > 0 ? `피해 ${values.damage}` : null,
    values.guard > 0 ? `방어도 ${values.guard}` : null,
    values.ignoreGuard ? '방어도 무시' : null,
  ].filter((text): text is string => text !== null);
  return results.length > 0 ? results.join(', ') : '효과 없음';
}

/** Percent bonuses in effect for an outcome; none for a turn without unused spins or modifiers. */
function bonusTexts(outcome: ActionOutcome): string[] {
  return [
    outcome.focusPct !== 0 ? `집중 ${formatSignedPercent(outcome.focusPct)}` : null,
    outcome.damagePct !== 0 ? `피해 보정 ${formatSignedPercent(outcome.damagePct)}` : null,
  ].filter((text): text is string => text !== null);
}

/** Final power of one action: "공격: 2줄, 등급 합 6, 배율 x1.5, 집중 +50% → 피해 13". */
export function formatOutcome(outcome: ActionOutcome, names: ActionNames): string {
  const factors = [
    `${outcome.lineCount}줄`,
    `등급 합 ${outcome.gradeSumTotal}`,
    `배율 ${formatMultiplier(outcome.multiplierNum)}`,
    ...bonusTexts(outcome),
  ];
  return `${actionName(names, outcome.actionId)}: ${factors.join(', ')} → ${formatPowerSummary(outcome)}`;
}

function describeHit(amount: number, absorbed: number, hpLoss: number): string {
  if (absorbed === 0) {
    return `${amount} 피해: HP -${hpLoss}`;
  }
  return `${amount} 피해: 방어도가 ${absorbed} 흡수, HP -${hpLoss}`;
}

type EventType = BattleEvent['type'];
type EventOf<T extends EventType> = Extract<BattleEvent, { readonly type: T }>;
type EventFormatter<T extends EventType> = (event: EventOf<T>, config: BattleConfig) => string;

// One entry per event type; the mapped type makes a missing entry a compile error.
const EVENT_FORMATTERS: { readonly [T in EventType]: EventFormatter<T> } = {
  player_guard_expired: (event) => `지난 턴의 내 방어도 ${event.amount} 소멸`,
  enemy_damaged: (event, config) => {
    const name = actionName(config, event.actionId);
    const enemyStatus = `${config.enemy.name} HP ${displayHp(event.enemyHp)}, 방어도 ${event.enemyGuard}`;
    if (event.ignoreGuard) {
      return `${name} 방어도 무시 ${event.damage} 피해: HP -${event.hpLoss} (${enemyStatus})`;
    }
    return `${name} ${describeHit(event.damage, event.absorbed, event.hpLoss)} (${enemyStatus})`;
  },
  player_guard_gained: (event, config) =>
    `${actionName(config, event.actionId)} 방어도 +${event.amount} (내 방어도 ${event.playerGuard})`,
  enemy_guard_expired: (event, config) => `${config.enemy.name}의 방어도 ${event.amount} 소멸`,
  enemy_attacked: (event, config) =>
    `${config.enemy.name}의 공격 ${describeHit(event.value, event.absorbed, event.hpLoss)} ` +
    `(내 HP ${displayHp(event.playerHp)}, 방어도 ${event.playerGuard})`,
  enemy_guarded: (event, config) => `${config.enemy.name} 방어 태세: 방어도 ${event.enemyGuard}`,
  enemy_charged: (event, config) => `${config.enemy.name} 힘 모으기: 다음 공격 x${event.multiplier}`,
  victory: (_event, config) => `${config.enemy.name} 쓰러짐 - 승리!`,
  defeat: (_event, config) => `${config.character.name} 쓰러짐 - 패배`,
};

export function formatEvent(event: BattleEvent, config: BattleConfig): string {
  // TypeScript cannot correlate event.type with the matching formatter's parameter type, hence the cast.
  const formatter = EVENT_FORMATTERS[event.type] as EventFormatter<EventType>;
  return formatter(event, config);
}

/** Uses the battle's starting HP, which is carried over between run battles. */
export function formatBattleStart(battle: BattleView): string {
  const { config, state } = battle;
  return (
    `전투 시작: ${config.character.name} (HP ${state.playerHp}/${config.character.maxHp}) ` +
    `vs ${config.enemy.name} (HP ${config.enemy.hp})`
  );
}

const RESULT_TITLES = { victory: '승리!', defeat: '패배' } as const;

export interface BattleResultText {
  readonly phase: EndPhase;
  readonly title: string;
  readonly summary: string;
}

/** Null while the battle is still going. */
export function formatBattleResult(battle: BattleView): BattleResultText | null {
  const { state, config } = battle;
  if (state.phase === 'ongoing') {
    return null;
  }
  return {
    phase: state.phase,
    title: RESULT_TITLES[state.phase],
    summary:
      `${state.turn}턴 · ${config.enemy.name} HP ${displayHp(state.enemyHp)}/${config.enemy.hp} · ` +
      `내 HP ${displayHp(state.playerHp)}/${config.character.maxHp}`,
  };
}
