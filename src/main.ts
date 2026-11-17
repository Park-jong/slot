import './ui/styles.css';
import { App } from './ui/app';
import { defaultEnemyId } from './ui/enemy-options';
import { GameController } from './ui/game-controller';
import { createLiveSeed } from './ui/seed';
import { REDUCED_MOTION_QUERY, REEL_ANIMATION } from './ui/ui-config';

const INSTANT_REELS = { firstStopMs: 0, stopIntervalMs: 0 } as const;

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('main: #app root element is missing from index.html');
}

const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
const controller = new GameController(createLiveSeed, defaultEnemyId());
new App(root, controller, prefersReducedMotion ? INSTANT_REELS : REEL_ANIMATION).mount();
