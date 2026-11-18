import './ui/styles.css';
import { App } from './ui/app';
import { RunController } from './ui/run-controller';
import { createLiveSeed, isDebugEnabled } from './ui/seed';
import { INSTANT_REELS, REDUCED_MOTION_QUERY, REEL_ANIMATION } from './ui/ui-config';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('main: #app root element is missing from index.html');
}

const prefersReducedMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
const controller = new RunController(createLiveSeed);
const reelTiming = prefersReducedMotion ? INSTANT_REELS : REEL_ANIMATION;
new App(root, controller, reelTiming, isDebugEnabled(window.location.search, import.meta.env.DEV)).mount();
