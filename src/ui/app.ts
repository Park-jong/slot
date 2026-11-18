// Composes the run header and the run screens around the RunController and wires user input.
// Holds no game rules: which screen is shown follows the run phase, every choice goes to the engine.
import type { RunTurnResult } from '../core';
import { createElement } from './dom';
import type { RunController, Screen } from './run-controller';
import { formatRunEvents, formatRunStepLog } from './run-format';
import { CONTINUE_LABELS } from './ui-config';
import { BattleScreen } from './views/battle-screen';
import type { ReelTiming } from './views/board-view';
import { EditScreen } from './views/edit-screen';
import { RewardScreen } from './views/reward-screen';
import { RunEndScreen } from './views/run-end-screen';
import { RunHeaderView } from './views/run-header-view';
import type { ScreenView } from './views/screen';

export class App {
  private readonly header: RunHeaderView;
  private readonly battleScreen: BattleScreen;
  private readonly screens: Readonly<Record<Screen, ScreenView>>;
  private readonly screenContainer = createElement('div', 'screens');

  constructor(
    private readonly root: HTMLElement,
    private readonly controller: RunController,
    reelTiming: ReelTiming,
    showSeed = false,
  ) {
    this.header = new RunHeaderView(showSeed);
    this.battleScreen = new BattleScreen(reelTiming, controller, {
      onSpin: () => this.spin(),
      onStop: () => this.stop(),
      onContinue: () => this.showCurrentScreen(),
    });
    this.screens = {
      battle: this.battleScreen,
      reward: new RewardScreen({
        onChoose: (offerIndex, reelIndex) => this.step(() => controller.chooseOffer(offerIndex, reelIndex)),
        onSkip: () => this.step(() => controller.skipOffer()),
      }),
      edit: new EditScreen({
        onDelete: (reelIndex, symbolIndex) => this.step(() => controller.deleteSymbol(reelIndex, symbolIndex)),
        onEnhance: (reelIndex, symbolIndex) => this.step(() => controller.enhanceSymbol(reelIndex, symbolIndex)),
        onPass: () => this.step(() => controller.passEdit()),
      }),
      end: new RunEndScreen(() => this.restart()),
    };
  }

  mount(): void {
    this.screenContainer.replaceChildren(...Object.values(this.screens).map((screen) => screen.element));
    this.root.replaceChildren(this.header.element, this.screenContainer);
    this.showCurrentScreen();
  }

  /** Shows the screen of the run's current phase. */
  private showCurrentScreen(): void {
    const current = this.screens[this.controller.screen];
    current.show(this.controller.run);
    for (const screen of Object.values(this.screens)) {
      screen.element.hidden = screen !== current;
    }
    this.renderHeader();
    window.scrollTo({ top: 0 });
    current.element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }

  private renderHeader(): void {
    this.header.update({
      run: this.controller.run,
      playerHp: this.controller.playerHp,
      recent: formatRunEvents(this.controller.lastEvents, this.controller.run.definition),
      seed: this.controller.seed,
    });
  }

  /** A reward or edit choice: the engine moves the run on, the app shows where it went. */
  private step(choose: () => void): void {
    choose();
    this.showCurrentScreen();
  }

  private restart(): void {
    this.controller.restart();
    this.showCurrentScreen();
  }

  /** One spin; reaching the max spins settles the turn without further input (U9). */
  private spin(): void {
    if (this.battleScreen.isBusy) {
      return;
    }
    const step = this.controller.spin();
    if (!step) {
      return;
    }
    const { result } = step;
    this.battleScreen.playSpin(step.spin, () => (result ? this.finishTurn(result) : this.battleScreen.showSpinning()));
  }

  private stop(): void {
    if (this.battleScreen.isBusy) {
      return;
    }
    const result = this.controller.stop();
    if (result) {
      this.finishTurn(result);
    }
  }

  /** The turn is already resolved; the settlement, run outcome and the way forward are revealed together. */
  private finishTurn(result: RunTurnResult): void {
    this.battleScreen.showSettlement(result.report);
    const { definition } = this.controller.run;
    const log = formatRunStepLog(result.events, definition);
    if (log) {
      this.battleScreen.addLog(log);
    }
    this.renderHeader();
    if (result.report.after.phase !== 'ongoing') {
      this.battleScreen.showOutcome(formatRunEvents(result.events, definition), CONTINUE_LABELS[this.controller.screen]);
    }
  }
}
