import { currentIntentPreview, isBattleOver, type Battle, type Run, type TurnReport } from '../../core';
import { createElement } from '../dom';
import { formatBattleResult, formatBattleStart, formatTurn, type TurnLog } from '../format';
import { LABELS, RESULT_ICONS } from '../ui-config';
import { BoardView, type ReelTiming } from './board-view';
import { CombatantView } from './combatant-view';
import { IntentView } from './intent-view';
import { LogView } from './log-view';
import { createReelComposition } from './reel-composition-view';
import type { ScreenView } from './screen';

export interface BattleScreenHandlers {
  readonly onSpin: () => void;
  readonly onContinue: () => void;
}

/** M1 battle views (combatants, intent, board, log) for the current run battle, plus the end-of-battle panel. */
export class BattleScreen implements ScreenView {
  readonly element = createElement('main', 'layout');
  private readonly playerView = new CombatantView('player');
  private readonly enemyView = new CombatantView('enemy');
  private readonly intentView = new IntentView();
  private readonly boardView = new BoardView();
  private readonly logView = new LogView();
  private readonly reelsPanel = createElement('details', 'panel reels-panel');
  private readonly spinButton = createElement('button', 'button button--primary spin-button', LABELS.spin);
  private readonly outcome = createElement('div', 'outcome');
  private readonly continueButton = createElement('button', 'button button--primary outcome__continue');
  private battle: Battle | null = null;
  private isSpinning = false;

  constructor(
    private readonly reelTiming: ReelTiming,
    handlers: BattleScreenHandlers,
  ) {
    this.spinButton.type = 'button';
    this.spinButton.addEventListener('click', handlers.onSpin);
    this.continueButton.type = 'button';
    this.continueButton.addEventListener('click', handlers.onContinue);

    this.enemyView.element.append(this.intentView.element);
    const combatants = createElement('div', 'combatants');
    combatants.append(this.enemyView.element, this.playerView.element, this.reelsPanel);
    this.boardView.element.append(this.spinButton, this.outcome);
    this.element.append(combatants, this.boardView.element, this.logView.element);
  }

  get isBusy(): boolean {
    return this.isSpinning;
  }

  /** Starts showing the run's current battle. */
  show(run: Run): void {
    const { battle } = run.state;
    if (!battle) {
      throw new Error('BattleScreen: the run has no battle to show');
    }
    this.battle = battle;
    this.isSpinning = false;
    this.boardView.reset();
    this.logView.reset(formatBattleStart(battle));
    this.outcome.hidden = true;
    const summary = createElement('summary', 'panel__title', LABELS.myReels);
    this.reelsPanel.replaceChildren(summary, createReelComposition(battle.config.reels, battle.config));
    this.render();
  }

  /** Animates an already resolved turn; onDone runs once the reels stopped and the turn is logged. */
  playTurn(report: TurnReport, onDone: () => void): void {
    const { config } = this.currentBattle();
    this.isSpinning = true;
    this.updateSpinButton();
    this.boardView.playSpin(report, config, this.reelTiming, () => {
      this.isSpinning = false;
      this.battle = { config, state: report.after };
      this.logView.addTurn(formatTurn(report, config));
      this.render();
      onDone();
    });
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

  private currentBattle(): Battle {
    if (!this.battle) {
      throw new Error('BattleScreen: no battle shown yet');
    }
    return this.battle;
  }

  private render(): void {
    const battle = this.currentBattle();
    const { config, state } = battle;
    this.playerView.update({
      name: config.character.name,
      hp: state.playerHp,
      maxHp: config.character.maxHp,
      guard: state.playerGuard,
    });
    this.enemyView.update({ name: config.enemy.name, hp: state.enemyHp, maxHp: config.enemy.hp, guard: state.enemyGuard });
    this.intentView.show(isBattleOver(battle) ? null : currentIntentPreview(battle));
    this.updateSpinButton();
  }

  private updateSpinButton(): void {
    this.spinButton.disabled = this.isSpinning || isBattleOver(this.currentBattle());
  }
}
