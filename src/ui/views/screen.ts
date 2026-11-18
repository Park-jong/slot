import type { Run } from '../../core';

/** A full-page view for one run screen; shown by the app when the run enters the matching phase. */
export interface ScreenView {
  readonly element: HTMLElement;
  show(run: Run): void;
}
