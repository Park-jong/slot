import type { Run } from '../../core';
import { createElement } from '../dom';
import { createReelComposition } from './reel-composition-view';

/** Titled panel with the run's current reel composition. */
export function createReelPanel(run: Run, title: string): HTMLElement {
  const panel = createElement('section', 'panel');
  panel.append(createElement('h2', 'panel__title', title), createReelComposition(run.state.reels, run.definition));
  return panel;
}
