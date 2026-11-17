// Holds the live battle session (battle value, seeded rng, turn history). No DOM, so it is unit-testable.
import { createBattle, createRng, isBattleOver, playTurn, type Battle, type Rng, type TurnReport } from '../core';
import { createM1BattleConfig, type EnemyId } from '../data';

export type SeedSource = () => number;

interface Session {
  readonly enemyId: EnemyId;
  readonly seed: number;
  readonly rng: Rng;
  battle: Battle;
  readonly reports: TurnReport[];
}

export class GameController {
  private session: Session;

  constructor(
    private readonly nextSeed: SeedSource,
    enemyId: EnemyId,
  ) {
    this.session = this.createSession(enemyId);
  }

  get battle(): Battle {
    return this.session.battle;
  }

  get enemyId(): EnemyId {
    return this.session.enemyId;
  }

  get seed(): number {
    return this.session.seed;
  }

  get reports(): readonly TurnReport[] {
    return this.session.reports;
  }

  get isOver(): boolean {
    return isBattleOver(this.session.battle);
  }

  /** Starts a fresh battle with a new seed; defaults to the current enemy (restart). */
  start(enemyId: EnemyId = this.session.enemyId): void {
    this.session = this.createSession(enemyId);
  }

  /** Plays one turn. Returns null once the battle is over (input lock, spec checklist 10). */
  spin(): TurnReport | null {
    if (this.isOver) {
      return null;
    }
    const { battle, report } = playTurn(this.session.battle, this.session.rng);
    this.session.battle = battle;
    this.session.reports.push(report);
    return report;
  }

  private createSession(enemyId: EnemyId): Session {
    const seed = this.nextSeed();
    return {
      enemyId,
      seed,
      rng: createRng(seed),
      battle: createBattle(createM1BattleConfig(enemyId)),
      reports: [],
    };
  }
}
