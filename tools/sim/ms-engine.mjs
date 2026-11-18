// M2.5 multi-spin turn engine for the Monte Carlo scripts (mirrors docs/specs/m25-multispin-spec.md).
// Owned by Design (balance). All numbers live in ms-config.mjs; this file is rules only.
//
// Fast representation: a symbol is an int code = actionIndex * 8 + grade, actionIndex in ACT order
// (= resolution order guard -> shield_bash -> attack). A board is Int32Array(9), cell = row * 3 + reel
// (cell number - 1 in spec terms). A spin "tally" is Int32Array(6) = [lines g, s, a, gradeSum g, s, a].
//
// Turn rule (B1 pooled, the default): the tallies of all spins in the turn are added, then each fired action
// is evaluated ONCE with tier = total line count of that action and power = gradeSum total:
//   value = floor(basePower * gradeSum * tierNum * (100 + bonusPct) / 200)
//   bonusPct = focusPct * unusedSpins (+ dmgPct for damage only, an M4 modifier hook). floor applied once.
// B2 (independent, pool=false) evaluates every spin alone with the same formula and adds the final numbers.
import { mulberry32, offers } from './run-engine.mjs';
export { mulberry32, offers };

export const ACT = ['guard', 'shield_bash', 'attack'];
export const AI = { guard: 0, shield_bash: 1, attack: 2 };
export const LINE_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 3, 6, 1, 4, 7, 2, 5, 8, 0, 4, 8, 6, 4, 2];

/** Effective max spins per turn (spec: data-driven stat). mulPct is an integer percent (100 = x1). */
export function effectiveMaxSpins(C) {
  const raw = Math.floor(((C.spins.base + C.spins.add) * C.spins.mulPct) / 100);
  return Math.max(C.spins.min, Math.min(C.spins.hardCap, raw));
}

/** Precompute lookup tables on a config (idempotent). Call again after changing tiers/actions. */
export function prepare(C) {
  const tier = new Int32Array(80);
  for (let n = 1; n < 80; n++) { let best = 0, num = 0; for (const t of C.tiers) if (t.n <= n && t.n >= best) { best = t.n; num = t.num; } tier[n] = num; }
  C._tier = tier;
  C._pw = ACT.map(a => C.actions[a]);
  C._max = effectiveMaxSpins(C);
  return C;
}

export const compile = reels => reels.map(r => Int32Array.from(r, s => AI[s.a] * 8 + s.g));
export const decode = c => ({ a: ACT[c >> 3], g: c & 7 });

const scratch = new Int32Array(16);
/** Same semantics as src/core/spin.ts: per reel (0..2), 3 draws without replacement, splice order, row 0..2. */
export function spinBoard(cr, rand, board) {
  for (let r = 0; r < 3; r++) {
    const reel = cr[r]; let len = reel.length;
    for (let i = 0; i < len; i++) scratch[i] = reel[i];
    for (let row = 0; row < 3; row++) {
      const idx = Math.floor(rand() * len); board[row * 3 + r] = scratch[idx];
      for (let j = idx; j < len - 1; j++) scratch[j] = scratch[j + 1]; len--;
    }
  }
  return board;
}
/** Adds the board's fired lines into tally t (does not clear it). Returns number of lines fired. */
export function tallyBoard(b, t) {
  let fired = 0;
  for (let i = 0; i < 24; i += 3) {
    const x = b[LINE_CELLS[i]], y = b[LINE_CELLS[i + 1]], z = b[LINE_CELLS[i + 2]], a = x >> 3;
    if (a === (y >> 3) && a === (z >> 3)) { t[a]++; t[3 + a] += (x & 7) + (y & 7) + (z & 7); fired++; }
  }
  return fired;
}

/**
 * Output of a tally (one action evaluation per fired action).
 * o = { pg, sk, atkN, atkI, mask, n: [3], sum: [3], num: [3], val: [3] } (mutated and returned).
 * atkN = attack damage that enemy guard absorbs, atkI = ignore_guard attack damage.
 */
export function newOut() { return { pg: 0, sk: 0, atkN: 0, atkI: 0, mask: 0, ign: false }; }
export function clearOut(o) { o.pg = 0; o.sk = 0; o.atkN = 0; o.atkI = 0; o.mask = 0; o.ign = false; return o; }
export function addTallyOut(t, C, focus, dmgPct, o) {
  for (let a = 0; a < 3; a++) {
    const n = t[a]; if (!n) continue;
    const num = C._tier[n], s = t[3 + a], P = C._pw[a];
    const dmg = Math.floor((P.dmg * s * num * (100 + focus + dmgPct)) / 200);
    const gd = Math.floor((P.guard * s * num * (100 + focus)) / 200);
    o.mask |= 1 << a; o.pg += gd;
    if (a === 1) o.sk += dmg;
    else if (a === 2) { if (n >= C.ignoreGuardAt) { o.atkI += dmg; o.ign = true; } else o.atkN += dmg; }
  }
  return o;
}
const poolT = new Int32Array(6);
/** Turn output from the list of per-spin tallies. unused = spins left when the player stopped. */
export function turnOut(tallies, k, C, unused, o, extraGuard = 0) {
  clearOut(o);
  const focus = C.unused.mode === 'focus' ? C.unused.focusPct * unused : 0;
  if (C.pool) {
    poolT.fill(0);
    for (let i = 0; i < k; i++) { const t = tallies[i]; for (let j = 0; j < 6; j++) poolT[j] += t[j]; }
    addTallyOut(poolT, C, focus, C.dmgPct, o);
  } else for (let i = 0; i < k; i++) addTallyOut(tallies[i], C, focus, C.dmgPct, o);
  if (C.unused.mode === 'guard') o.pg += C.unused.guardPer * unused;
  o.pg += extraGuard;
  return o;
}
/** Enemy HP after the player's output (guard -> shield_bash -> attack; ignore_guard skips enemy guard). */
export function applyOut(o, ehp, eg) {
  let g = eg, ab = Math.min(g, o.sk); g -= ab; ehp -= o.sk - ab;
  ab = Math.min(g, o.atkN); g -= ab; ehp -= o.atkN - ab;
  return ehp - o.atkI;
}
export const totalDmg = o => o.sk + o.atkN + o.atkI;

// ---------------------------------------------------------------------------------------------------------
// Stop policies. ctx = { ehp, eg, incoming, php, bank (array of tallies sampled from the same reels),
//                        lrng (lookahead rng), keep (unused spins that would actually be kept, for bank mode) }
// Utility of a finished turn (smart policy): enemy HP removed + guardW x guard that absorbs the visible
// incoming attack - death penalty if the visible attack would kill; lethal = ehp + incoming + bonus (> any non-lethal).
// For unused.mode 'bank' / 'token' the stop value also gets unusedValue x kept-unused-spins.
// ---------------------------------------------------------------------------------------------------------
const tmpO = newOut();
function utility(o, ctx, P) {
  const hp = applyOut(o, ctx.ehp, ctx.eg);
  if (hp <= 0) return ctx.ehp + ctx.incoming + P.lethalBonus;
  const absorbed = Math.min(o.pg, ctx.incoming), taken = ctx.incoming - absorbed;
  let u = (ctx.ehp - hp) + P.guardW * absorbed;
  if (taken >= ctx.php) u -= P.deathPenalty;
  return u;
}
function stopBonus(C, ctx, unused) {
  const m = C.unused.mode;
  if (m === 'bank') return C.policy.bankSpinValue * ctx.spinValue * Math.min(unused, ctx.keepCap);
  if (m === 'token') return C.unused.tokenValue * unused;
  return 0;
}
/** Value of stopping now with `k` spins done out of `max`. */
function vStop(tl, k, max, C, ctx) {
  const left = max - k;
  return utility(turnOut(tl, k, C, left, tmpO), ctx, C.policy) + stopBonus(C, ctx, left);
}
function rndBank(ctx) { return ctx.bank[Math.floor(ctx.lrng() * ctx.bank.length)]; }
/** Expected value of continuing from k spins (closed loop for <= 2 spins left, open loop beyond). */
function vContinue(tl, k, max, C, ctx) {
  const left = max - k, P = C.policy;
  if (left === 1) {
    let s = 0; for (const x of ctx.bank) { tl[k] = x; s += vStop(tl, k + 1, max, C, ctx); } return s / ctx.bank.length;
  }
  if (left === 2) {
    let s = 0;
    for (let i = 0; i < P.s1; i++) {
      tl[k] = rndBank(ctx);
      const stop2 = vStop(tl, k + 1, max, C, ctx);
      let c = 0; for (let j = 0; j < P.s2; j++) { tl[k + 1] = rndBank(ctx); c += vStop(tl, k + 2, max, C, ctx); }
      s += Math.max(stop2, c / P.s2);
    }
    return s / P.s1;
  }
  let best = -Infinity; // open loop: best of "spin j more then stop"
  for (let j = 1; j <= left; j++) {
    let s = 0; for (let i = 0; i < P.s1; i++) { for (let q = 0; q < j; q++) tl[k + q] = rndBank(ctx); s += vStop(tl, k + j, max, C, ctx); }
    best = Math.max(best, s / P.s1);
  }
  return best;
}
export const STOP_POLICIES = {
  max: () => false,
  once: () => true,
  /** Returns true to stop. Lethal at stop = stop. */
  smart: (tl, k, max, C, ctx) => {
    if (applyOut(turnOut(tl, k, C, max - k, tmpO), ctx.ehp, ctx.eg) <= 0) return true;
    const la = ctx.la; for (let i = 0; i < k; i++) la[i] = tl[i]; // lookahead list: never write into the live buffer
    return vStop(la, k, max, C, ctx) >= vContinue(la, k, max, C, ctx);
  },
};

/** Classify an early stop for the report. */
function stopReason(tl, k, max, C, ctx) {
  turnOut(tl, k, C, max - k, tmpO);
  if (applyOut(tmpO, ctx.ehp, ctx.eg) <= 0) return 'lethal';
  if (ctx.incoming > 0 && tmpO.pg >= ctx.incoming) return 'guard';
  return 'value';
}

export function newBattleStats() {
  return { turns: 0, empty: 0, spins: 0, early: 0, earlyAt: [0, 0, 0, 0, 0, 0], reason: { lethal: 0, guard: 0, value: 0 }, reasonAt: { l1: 0, l2: 0, g1: 0, g2: 0, v1: 0, v2: 0 }, fired: [0, 0, 0], ign: 0, spinEmpty: 0, dmg: 0, guardGained: 0, guardUsed: 0, taken: 0, maxTurns: 0 };
}

/**
 * One battle. Returns { win, hp }. Accumulates into st (newBattleStats()).
 * reels: array of 3 symbol arrays. php: player HP at start.
 */
const tallyBuf = Array.from({ length: 16 }, () => new Int32Array(6));
const board = new Int32Array(9), outO = newOut(), fired = new Int32Array(16);
export function battleMS(reels, enemy, php, C, rng, lrng, policyName, st) {
  const cr = compile(reels), max = C._max, pol = STOP_POLICIES[policyName];
  const smart = policyName === 'smart';
  let ctx = null;
  if (smart) {
    const bank = [];
    for (let i = 0; i < C.policy.bankSize; i++) { const t = new Int32Array(6); tallyBoard(spinBoard(cr, lrng, board), t); bank.push(t); }
    ctx = { ehp: 0, eg: 0, incoming: 0, php: 0, bank, lrng, keepCap: 0, spinValue: 0, la: new Array(16) };
    if (C.unused.mode === 'bank') { // average single-spin utility vs a neutral target, used to value a banked spin
      let s = 0; const o = newOut(); for (const t of bank) { clearOut(o); addTallyOut(t, C, 0, C.dmgPct, o); s += totalDmg(o) + C.policy.guardW * o.pg * 0.5; }
      ctx.spinValue = s / bank.length;
    }
  }
  let ehp = enemy.hp, eg = 0, t = 0, ci = 0, charge = 1, banked = 0;
  for (;;) {
    t++;
    const it = enemy.pattern[ci % enemy.pattern.length];
    const incoming = it.type === 'attack' ? it.value * charge : 0;
    const avail = C.unused.mode === 'bank' ? max + banked : max;
    if (smart) { ctx.ehp = ehp; ctx.eg = eg; ctx.incoming = incoming; ctx.php = php; ctx.keepCap = C.unused.bankCap; }
    // Common random numbers: all `avail` boards of the turn are drawn up front, so every stop policy sees the same
    // boards (a stop only discards the unused ones). Empty spins are counted for the spins actually used.
    for (let q = 0; q < avail; q++) { const tt = tallyBuf[q]; tt.fill(0); fired[q] = tallyBoard(spinBoard(cr, rng, board), tt); }
    let k = 0;
    for (;;) {
      if (!fired[k]) st.spinEmpty++; k++;
      if (k >= avail) break;
      if (pol(tallyBuf, k, avail, C, ctx)) {
        st.early++; st.earlyAt[k]++;
        if (smart) { const why = stopReason(tallyBuf, k, avail, C, ctx); st.reason[why]++; st.reasonAt[why[0] + (k === 1 ? '1' : '2')]++; }
        break;
      }
    }
    const unused = avail - k;
    if (C.unused.mode === 'bank') banked = Math.min(C.unused.bankCap, unused);
    st.spins += k;
    // bank mode: unused spins are carried, not converted (focus/guard bonus 0)
    const o = turnOut(tallyBuf, k, C, C.unused.mode === 'bank' || C.unused.mode === 'token' ? 0 : unused, outO);
    if (!o.mask) st.empty++;
    for (let a = 0; a < 3; a++) if (o.mask & (1 << a)) st.fired[a]++;
    if (o.ign) st.ign++;
    st.guardGained += o.pg;
    const before = ehp; ehp = applyOut(o, ehp, eg); st.dmg += before - ehp;
    if (ehp <= 0) { st.turns += t; st.maxTurns = Math.max(st.maxTurns, t); return { win: true, hp: php, turns: t }; }
    ci++; eg = 0;
    if (it.type === 'guard') eg = it.value;
    else if (it.type === 'charge') charge = it.value;
    else { const taken = Math.max(0, incoming - o.pg); st.guardUsed += incoming - taken; st.taken += taken; php -= taken; charge = 1; }
    if (php <= 0) { st.turns += t; return { win: false, hp: 0, turns: t }; }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Reel scoring for the greedy editor: full-turn level, max spins, no focus, common random numbers.
// score = E[damage before enemy guard] + guardW x E[guard] per turn.
// ---------------------------------------------------------------------------------------------------------
export function makeU(n, spins, rand) { const U = new Float64Array(n * spins * 9); for (let i = 0; i < U.length; i++) U[i] = rand(); return U; }
export function evalReels(reels, U, n, C, guardW = 0.7) {
  const cr = compile(reels), spins = C._max; let o = 0, sc = 0;
  const rand = () => U[o++], out = newOut();
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < spins; k++) { const tt = tallyBuf[k]; tt.fill(0); tallyBoard(spinBoard(cr, rand, board), tt); }
    turnOut(tallyBuf, spins, C, 0, out);
    sc += totalDmg(out) + guardW * out.pg;
  }
  return sc / n;
}
