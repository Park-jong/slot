import { createElement } from '../dom';
import type { TurnProgress } from '../turn-progress';
import { spinAgainLabel, stopLabel } from '../turn-format';
import { LABELS } from '../ui-config';

export interface SpinControlHandlers {
  /** Spin (turn start) and spin again (spinning) are both the engine's next spin. */
  readonly onSpin: () => void;
  readonly onStop: () => void;
}

/**
 * Spin phase buttons (U8): [스핀] at turn start; [한 번 더 (남은 k)] and [멈춤 (+Z%)] while spinning; none once
 * the battle is over. Reaching the max settles by itself, so there is never a button for it.
 */
export class SpinControlsView {
  readonly element = createElement('div', 'spin-controls');
  private readonly spinButton = createButton('button button--primary spin-button', LABELS.spin);
  private readonly againButton = createButton('button button--primary spin-button');
  private readonly stopButton = createButton('button spin-button spin-button--stop');

  constructor(handlers: SpinControlHandlers) {
    this.spinButton.addEventListener('click', handlers.onSpin);
    this.againButton.addEventListener('click', handlers.onSpin);
    this.stopButton.addEventListener('click', handlers.onStop);
    this.element.append(this.spinButton, this.againButton, this.stopButton);
  }

  update(progress: TurnProgress, busy: boolean): void {
    this.spinButton.hidden = progress.kind !== 'turn_start';
    this.againButton.hidden = progress.kind !== 'spinning';
    this.stopButton.hidden = progress.kind !== 'spinning';
    if (progress.kind === 'spinning') {
      this.againButton.textContent = spinAgainLabel(progress.remainingSpins);
      this.stopButton.textContent = stopLabel(progress.preview.focusPct);
    }
    this.lock(busy);
  }

  /** Disables every button (reels are spinning) or re-enables them. */
  lock(busy: boolean): void {
    for (const button of [this.spinButton, this.againButton, this.stopButton]) {
      button.disabled = busy;
    }
  }

  /** Keeps keyboard focus on the controls after the buttons changed. */
  focusFirst(): void {
    this.element.querySelector<HTMLButtonElement>('button:not([hidden]):not(:disabled)')?.focus({ preventScroll: true });
  }
}

function createButton(className: string, text?: string): HTMLButtonElement {
  const button = createElement('button', className, text);
  button.type = 'button';
  return button;
}
