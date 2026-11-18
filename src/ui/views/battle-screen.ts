import {
  currentIntentPreview,
  isBattleOver,
  type Battle,
  type BattleView,
  type Run,
  type SpinReport,
  type TurnReport,
} from '../../core';
import { createElement } from '../dom';
import { formatBattleResult, formatBattleStart, type TurnLog } from '../format';
import { BATTLE_OVER, type TurnProgress } from '../turn-progress';
import { formatSpinCounter, formatTurn } from '../turn-format';
import { LABELS, RESULT_ICONS } from '../ui-config';
import { BoardView, type BoardSpin, type ReelTiming } from './board-view';
import { CombatantView } from './combatant-view';
import { IntentView } from './intent-view';
import { LogView } from './log-view';
import { createReelComposition } from './reel-composition-view';
import type { ScreenView } from './screen';
import { SpinControlsView } from './spin-controls-view';
import { SpinHistoryView } from './spin-history-view';
import { TurnPanelView } from './turn-panel-view';

/** Live battle and turn progress (the RunController satisfies it). */
export interface TurnSource {
  readonly battle: Battle | null;
  readonly turn: TurnProgress;
}

export interface BattleScreenHandlers {
  readonly onSpin: () => void;
  readonly onStop: () => void;
  readonly onContinue: () => void;
}

/**
 * Battle views for the current run battle (M2.5 spec 7.1): combatants with the always visible intent (U7), the
 * latest board large and the earlier spins small (U1, U2), the spin counter (U4), the spin/stop buttons (U8),
 * the turn panel (U3, U5, U6, U10-U12), the log and the end-of-battle panel. Renders engine values only.
 */
export class BattleScreen implements ScreenView {
  readonly element = createElement('main', 'layout');
  private readonly playerView = new CombatantView('player');
  private readonly enemyView = new CombatantView('enemy');
  private readonly intentView = new IntentView();
  private readonly boardView = new BoardView();
  private readonly history = new SpinHistoryView();
  private readonly counter = createElement('p', 'spin-counter');
  private readonly controls: SpinControlsView;
  private readonly turnPanel = new TurnPanelView();
  private readonly logView = new LogView();
  private readonly reelsPanel = createElement('details', 'panel reels-panel');
  private readonly outcome = createElement('div', 'outcome');
  private readonly continueButton = createElement('button', 'button button--primary outcome__continue');
  /** What is on screen; lags behind the engine while reels animate. */
  private shown: BattleView | null = null;
  /** Spins of the turn on screen, oldest first; the last one is the large board. */
  private spins: BoardSpin[] = [];
  private isAnimating = false;

  constructor(
    private readonly reelTiming: ReelTiming,
    private readonly source: TurnSource,
    handlers: BattleScreenHandlers,
  ) {
    this.controls = new SpinControlsView({ onSpin: handlers.onSpin, onStop: handlers.onStop });
    this.continueButton.type = 'button';
    this.continueButton.addEventListener('click', handlers.onContinue);

    this.enemyView.element.append(this.intentView.element);
    const combatants = createElement('div', 'combatants');
    combatants.append(this.enemyView.element, this.playerView.element, this.reelsPanel);
    const boardPanel = createElement('section', 'panel board-panel');
    boardPanel.append(this.counter, this.boardView.element, this.controls.element, this.outcome, this.history.element);
    const center = createElement('div', 'battle-center');
    center.append(boardPanel, this.turnPanel.element);
    this.element.append(combatants, center, this.logView.element);
  }

  get isBusy(): boolean {
    return this.isAnimating;
  }

  /** Starts showing the run's current battle (mid-turn spins are shown without animation). */
  show(run: Run): void {
    const { battle } = run.state;
    if (!battle) {
      throw new Error('BattleScreen: the run has no battle to show');
    }
    this.shown = battle;
    this.isAnimating = false;
    this.outcome.hidden = true;
    this.logView.reset(formatBattleStart(battle));
    const summary = createElement('summary', 'panel__title', LABELS.myReels);
    this.reelsPanel.replaceChildren(summary, createReelComposition(battle.config.reels, battle.config));
    const progress = this.source.turn;
    this.spins = progress.kind === 'spinning' ? [...progress.spins] : [];
    this.renderSpinsAtOnce(battle);
    this.renderTurn(progress);
  }

  /** Animates the newest spin; onDone runs once its reels stopped. Spin 1 clears the previous turn's boards. */
  playSpin(spin: SpinReport, onDone: () => void): void {
    const { config } = this.currentBattle();
    if (spin.index === 1) {
      this.spins = [];
    }
    this.history.show(this.spins, config);
    this.isAnimating = true;
    this.controls.lock(true);
    this.boardView.playSpin(spin, config, this.reelTiming, () => {
      this.isAnimating = false;
      this.spins.push(spin);
      onDone();
    });
  }

  /** After a spin that did not settle: the live spinning battle (player guard already expired, U12). */
  showSpinning(): void {
    const { battle } = this.source;
    if (battle) {
      this.shown = battle;
    }
    this.renderTurn(this.source.turn);
    this.controls.focusFirst();
  }

  /** The turn settled (stop or max reached): result state, settlement panel and log entry (U9-U11). */
  showSettlement(report: TurnReport): void {
    const { config } = this.currentBattle();
    this.shown = { config, state: report.after };
    const log = formatTurn(report, config);
    this.logView.addTurn(log);
    // After the final turn the source already moved on (reward phase or even the next battle): no more input here.
    const progress = report.after.phase === 'ongoing' ? this.source.turn : BATTLE_OVER;
    this.renderTurn(progress);
    this.turnPanel.showSettlement(log);
    this.controls.focusFirst();
  }

  addLog(entry: TurnLog): void {
    this.logView.addTurn(entry);
  }

  /** End-of-battle panel: the battle result, the run outcome lines and the button to move on. */
  showOutcome(lines: readonly string[], continueLabel: string): void {
    const result = formatBattleResult(this.currentBattle());
    if (!result) {
      return;
    }
    const items = createElement('ul', 'outcome__lines');
    items.append(...lines.map((line) => createElement('li', undefined, line)));
    this.outcome.dataset['phase'] = result.phase;
    this.continueButton.textContent = continueLabel;
    this.outcome.replaceChildren(
      createElement('h3', 'outcome__title', `${RESULT_ICONS[result.phase]} ${result.title}`),
      createElement('p', 'outcome__summary', result.summary),
      items,
      this.continueButton,
    );
    this.outcome.hidden = false;
    this.continueButton.focus();
  }

  private currentBattle(): BattleView {
    if (!this.shown) {
      throw new Error('BattleScreen: no battle shown yet');
    }
    return this.shown;
  }

  private renderSpinsAtOnce(battle: BattleView): void {
    const latest = this.spins.at(-1);
    if (latest) {
      this.boardView.showSpin(latest, battle.config);
    } else {
      this.boardView.reset(LABELS.boardIdle);
    }
    this.history.show(this.spins.slice(0, -1), battle.config);
  }

  /** Combatants, intent, counter, buttons and turn panel for the given progress. */
  private renderTurn(progress: TurnProgress): void {
    const battle = this.currentBattle();
    const { config, state } = battle;
    const pendingGuard = progress.kind === 'spinning' ? progress.preview.totalGuard : 0;
    this.playerView.update({
      name: config.character.name,
      hp: state.playerHp,
      maxHp: config.character.maxHp,
      guard: state.playerGuard,
      pendingGuard,
    });
    this.enemyView.update({ name: config.enemy.name, hp: state.enemyHp, maxHp: config.enemy.hp, guard: state.enemyGuard });
    this.intentView.show(isBattleOver(battle) ? null : currentIntentPreview(battle));
    this.history.show(this.spins.slice(0, -1), config);
    this.controls.update(progress, this.isAnimating);
    this.renderCounter(progress);
    if (progress.kind === 'turn_start') {
      this.turnPanel.showTurnStart(progress.stats);
    } else if (progress.kind === 'spinning') {
      this.turnPanel.showSpinning(progress, config);
    }
  }

  private renderCounter(progress: TurnProgress): void {
    this.counter.hidden = progress.kind === 'over';
    if (progress.kind === 'turn_start') {
      this.counter.textContent = formatSpinCounter(0, progress.stats.maxSpins, progress.stats.maxSpins);
    } else if (progress.kind === 'spinning') {
      this.counter.textContent = formatSpinCounter(progress.spinsUsed, progress.stats.maxSpins, progress.remainingSpins);
    }
  }
}
