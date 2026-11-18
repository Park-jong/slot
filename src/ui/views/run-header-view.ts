import type { Run } from '../../core';
import { createElement } from '../dom';
import { formatRunProgress, stageTrack } from '../run-format';
import { LABELS } from '../ui-config';
import { HpBarView } from './hp-bar-view';

export interface RunHeaderStatus {
  readonly run: Run;
  readonly playerHp: number;
  /** Already formatted outcome of the last step (battle result, heal, reward taken...). */
  readonly recent: readonly string[];
  readonly seed: number;
}

/** Run progress: stage track, carried HP and the latest run outcome. The seed is shown only in debug mode. */
export class RunHeaderView {
  readonly element = createElement('header', 'app-header run-header');
  private readonly progress = createElement('p', 'run-header__progress');
  private readonly track = createElement('ol', 'stage-track');
  private readonly hpBar = new HpBarView('player');
  private readonly recent = createElement('p', 'run-header__recent');
  private readonly seedLabel = createElement('span', 'seed');

  constructor(showSeed: boolean) {
    const titleRow = createElement('div', 'run-header__title-row');
    titleRow.append(createElement('h1', 'app-title', LABELS.appTitle), this.progress);
    if (showSeed) {
      titleRow.append(this.seedLabel);
    }
    const hp = createElement('div', 'run-header__hp');
    hp.append(this.hpBar.bar, this.hpBar.text);
    this.recent.setAttribute('aria-live', 'polite');
    this.element.append(titleRow, this.track, hp, this.recent);
  }

  update(status: RunHeaderStatus): void {
    const { run } = status;
    this.progress.textContent = formatRunProgress(run);
    this.track.replaceChildren(
      ...stageTrack(run).map((chip) => {
        const item = createElement('li', `stage-track__stage stage-track__stage--${chip.status}`, chip.label);
        item.classList.toggle('stage-track__stage--boss', chip.boss);
        return item;
      }),
    );
    this.hpBar.update(status.playerHp, run.state.maxHp);
    this.recent.textContent = status.recent.join(' · ');
    this.recent.hidden = status.recent.length === 0;
    this.seedLabel.textContent = `seed ${status.seed}`;
  }
}
