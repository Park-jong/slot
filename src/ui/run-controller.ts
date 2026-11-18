// Holds the live run session: the Run value, its single seeded rng (M2 spec 1.4, M2.5 spec 8.3: one rng per
// run, consumed only by the spins actually taken) and the outcome of the last step. No DOM, so it is
// unit-testable. Every rule decision is the engine's.
import {
  chooseOffer,
  createRng,
  deleteSymbol,
  enhanceSymbol,
  passEdit,
  skipOffer,
  spinRun,
  startRun,
  stopRun,
  type Battle,
  type Rng,
  type Run,
  type RunDefinition,
  type RunEvent,
  type RunPhase,
  type RunSpinResult,
  type RunStepResult,
  type RunTurnResult,
  type TurnReport,
} from '../core';
import { M25_RUN } from '../data';
import { turnProgress, type EstimateSettings, type TurnProgress } from './turn-progress';
import { CONTINUE_ESTIMATE } from './ui-config';

export type SeedSource = () => number;

/** What the app shows for a run phase. */
export type Screen = 'battle' | 'reward' | 'edit' | 'end';

const SCREEN_BY_PHASE: Readonly<Record<RunPhase, Screen>> = {
  battle: 'battle',
  reward_add: 'reward',
  reward_edit: 'edit',
  victory: 'end',
  defeat: 'end',
};

export function screenForPhase(phase: RunPhase): Screen {
  return SCREEN_BY_PHASE[phase];
}

interface Session {
  readonly seed: number;
  readonly rng: Rng;
  run: Run;
  lastEvents: readonly RunEvent[];
  lastTurn: TurnReport | null;
}

interface CachedProgress {
  readonly run: Run;
  readonly progress: TurnProgress;
}

export class RunController {
  private session: Session;
  private cachedProgress: CachedProgress | null = null;

  constructor(
    private readonly nextSeed: SeedSource,
    private readonly definition: RunDefinition = M25_RUN,
    private readonly estimate: EstimateSettings | null = CONTINUE_ESTIMATE,
  ) {
    this.session = this.createSession();
  }

  get run(): Run {
    return this.session.run;
  }

  get seed(): number {
    return this.session.seed;
  }

  /** Run events of the most recent step (a settled turn, reward or edit choice); empty after a mere spin. */
  get lastEvents(): readonly RunEvent[] {
    return this.session.lastEvents;
  }

  /** Report of the most recently settled turn of this run; null until the first turn settles. */
  get lastTurn(): TurnReport | null {
    return this.session.lastTurn;
  }

  get screen(): Screen {
    return screenForPhase(this.session.run.state.phase);
  }

  /** The battle being fought; null outside the battle phase. */
  get battle(): Battle | null {
    const { phase, battle } = this.session.run.state;
    return phase === 'battle' ? battle : null;
  }

  /** Spin phase of the current turn with the stop preview while spinning (computed once per run value). */
  get turn(): TurnProgress {
    const { run } = this.session;
    if (this.cachedProgress?.run !== run) {
      this.cachedProgress = { run, progress: turnProgress(this.battle, this.estimate) };
    }
    return this.cachedProgress.progress;
  }

  /** Live HP: the battle's value while fighting (and on defeat/victory), otherwise the carried value. */
  get playerHp(): number {
    const { battle, playerHp } = this.session.run.state;
    return battle ? battle.state.playerHp : playerHp;
  }

  /** New run with a new seed (spec 1.4: nothing carries over). */
  restart(): void {
    this.session = this.createSession();
  }

  /**
   * Spins once (spin 1 starts the turn). Reaching the max spins settles the turn in the same call (`result`).
   * Returns null when no spin is possible (input lock outside an ongoing battle).
   */
  spin(): RunSpinResult | null {
    if (this.turn.kind === 'over') {
      return null;
    }
    const step = this.apply(spinRun(this.session.run, this.session.rng));
    if (step.result) {
      this.session.lastTurn = step.result.report;
    }
    return step;
  }

  /** Stops spinning and settles the turn. Returns null unless at least one spin was taken this turn. */
  stop(): RunTurnResult | null {
    if (this.turn.kind !== 'spinning') {
      return null;
    }
    const result = this.apply(stopRun(this.session.run, this.session.rng));
    this.session.lastTurn = result.report;
    return result;
  }

  chooseOffer(offerIndex: number, reelIndex: number): RunStepResult {
    return this.apply(chooseOffer(this.session.run, offerIndex, reelIndex));
  }

  skipOffer(): RunStepResult {
    return this.apply(skipOffer(this.session.run));
  }

  deleteSymbol(reelIndex: number, symbolIndex: number): RunStepResult {
    return this.apply(deleteSymbol(this.session.run, reelIndex, symbolIndex));
  }

  enhanceSymbol(reelIndex: number, symbolIndex: number): RunStepResult {
    return this.apply(enhanceSymbol(this.session.run, reelIndex, symbolIndex));
  }

  passEdit(): RunStepResult {
    return this.apply(passEdit(this.session.run));
  }

  private apply<T extends RunStepResult>(step: T): T {
    this.session.run = step.run;
    this.session.lastEvents = step.events;
    return step;
  }

  private createSession(): Session {
    const seed = this.nextSeed();
    return { seed, rng: createRng(seed), run: startRun(this.definition), lastEvents: [], lastTurn: null };
  }
}
