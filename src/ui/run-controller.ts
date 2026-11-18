// Holds the live run session: the Run value, its single seeded rng (M2 spec 1.4: one rng per run) and the
// events of the last step. No DOM, so it is unit-testable. Every rule decision is the engine's.
import {
  chooseOffer,
  createRng,
  deleteSymbol,
  enhanceSymbol,
  passEdit,
  playRunTurn,
  skipOffer,
  startRun,
  type Rng,
  type Run,
  type RunDefinition,
  type RunEvent,
  type RunPhase,
  type RunStepResult,
  type RunTurnResult,
} from '../core';
import { M2_RUN } from '../data';

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
}

export class RunController {
  private session: Session;

  constructor(
    private readonly nextSeed: SeedSource,
    private readonly definition: RunDefinition = M2_RUN,
  ) {
    this.session = this.createSession();
  }

  get run(): Run {
    return this.session.run;
  }

  get seed(): number {
    return this.session.seed;
  }

  /** Run events of the most recent step (spin, reward or edit choice); empty right after a (re)start. */
  get lastEvents(): readonly RunEvent[] {
    return this.session.lastEvents;
  }

  get screen(): Screen {
    return screenForPhase(this.session.run.state.phase);
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

  /** Plays one battle turn. Returns null outside the battle phase (input lock). */
  spin(): RunTurnResult | null {
    if (this.session.run.state.phase !== 'battle') {
      return null;
    }
    const result = playRunTurn(this.session.run, this.session.rng);
    this.apply(result);
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
    return { seed, rng: createRng(seed), run: startRun(this.definition), lastEvents: [] };
  }
}
