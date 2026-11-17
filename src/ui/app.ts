// Composes the views around the GameController and wires user input. Holds no game rules.
import { currentIntent, type TurnReport } from '../core';
import type { EnemyId } from '../data';
import { createElement } from './dom';
import { enemyOptions } from './enemy-options';
import { formatBattleResult, formatBattleStart, formatTurn } from './format';
import type { GameController } from './game-controller';
import { BoardView, type ReelTiming } from './views/board-view';
import { CombatantView } from './views/combatant-view';
import { EnemySelector } from './views/enemy-selector';
import { IntentView } from './views/intent-view';
import { LogView } from './views/log-view';
import { ResultView } from './views/result-view';

export class App {
  private readonly playerView = new CombatantView('player');
  private readonly enemyView = new CombatantView('enemy');
  private readonly intentView = new IntentView();
  private readonly boardView = new BoardView();
  private readonly logView = new LogView();
  private readonly resultView = new ResultView(() => this.startBattle());
  private readonly enemySelector: EnemySelector;
  private readonly spinButton = createElement('button', 'button button--primary spin-button', '🎰 스핀');
  private readonly seedLabel = createElement('span', 'seed');
  private isSpinning = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: GameController,
    private readonly reelTiming: ReelTiming,
  ) {
    this.enemySelector = new EnemySelector(enemyOptions(), (enemyId) => this.startBattle(enemyId));
    this.spinButton.type = 'button';
    this.spinButton.addEventListener('click', () => this.spin());
  }

  mount(): void {
    const header = createElement('header', 'app-header');
    header.append(createElement('h1', 'app-title', '슬롯 RPG - M1 전투'), this.enemySelector.element, this.seedLabel);

    this.enemyView.element.append(this.intentView.element);
    const combatants = createElement('div', 'combatants');
    combatants.append(this.enemyView.element, this.playerView.element);

    this.boardView.element.append(this.spinButton);
    const layout = createElement('main', 'layout');
    layout.append(combatants, this.boardView.element, this.logView.element);

    this.root.replaceChildren(header, layout, this.resultView.element);
    this.resetViews();
  }

  /** New battle against the given enemy, or a restart against the current one. */
  private startBattle(enemyId?: EnemyId): void {
    this.controller.start(enemyId);
    this.resetViews();
  }

  private resetViews(): void {
    this.isSpinning = false;
    this.boardView.reset();
    this.resultView.hide();
    this.logView.reset(formatBattleStart(this.controller.battle.config));
    this.enemySelector.setValue(this.controller.enemyId);
    this.seedLabel.textContent = `seed ${this.controller.seed}`;
    this.renderStatus();
  }

  private spin(): void {
    if (this.isSpinning) {
      return;
    }
    const report = this.controller.spin();
    if (!report) {
      return;
    }
    this.isSpinning = true;
    this.updateSpinButton();
    this.boardView.playSpin(report, this.controller.battle.config, this.reelTiming, () => this.finishSpin(report));
  }

  /** The turn is already resolved; status and log are revealed once the reels have stopped. */
  private finishSpin(report: TurnReport): void {
    this.isSpinning = false;
    this.logView.addTurn(formatTurn(report, this.controller.battle.config));
    this.renderStatus();
    this.showResultIfOver();
  }

  private renderStatus(): void {
    const { config, state } = this.controller.battle;
    this.playerView.update({
      name: config.character.name,
      hp: state.playerHp,
      maxHp: config.character.maxHp,
      guard: state.playerGuard,
    });
    this.enemyView.update({ name: config.enemy.name, hp: state.enemyHp, maxHp: config.enemy.hp, guard: state.enemyGuard });
    this.intentView.show(this.controller.isOver ? null : currentIntent(this.controller.battle));
    this.updateSpinButton();
  }

  private updateSpinButton(): void {
    this.spinButton.disabled = this.isSpinning || this.controller.isOver;
  }

  private showResultIfOver(): void {
    const result = formatBattleResult(this.controller.battle);
    if (result) {
      this.resultView.show(result);
    }
  }
}
