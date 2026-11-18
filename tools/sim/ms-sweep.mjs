// Calibrated comparisons for questions B / C / maxSpins sensitivity.
// For each candidate (a set of ms-sim overrides) an enemy scale (calKey = hpPct by default, or atkPct) is bisected until smart-stop + greedy
// reaches the target win rate; then always-max and always-once (same enemies, same editor) are run.
// value of choosing = smart - max(max, once) in win-rate points.
// Usage: node ms-sweep.mjs <suite> [runs=3000] [calRuns=1500] [target=60] [key=value base overrides]
//   suites: B (rule structure), C (focus sweep + alternatives), fixed (no calibration: run all candidates at the base config)
import { simulate, summarize, parseArgs } from './ms-sim.mjs';

const { runs: _r, kv: base } = parseArgs(process.argv.slice(3));
const suite = process.argv[2] ?? 'C';
const CALKEY = base.calKey ?? 'hpPct'; delete base.calKey;
const RUNS = +(base.runs ?? 3000), CAL = +(base.calRuns ?? 1500), TARGET = +(base.target ?? 60);
for (const k of ['runs', 'calRuns', 'target']) delete base[k];

const SUITES = {
  B: {
    'B1 capped 2/3/4 ign3': { pool: '1', tiers: '2,3,4', ign: '3' },
    'B1 M2 2/3/4/6 ign3': { pool: '1', tiers: '2,3,4,6', ign: '3', hpPct: String(Math.round(+(base.hpPct ?? 100) * 1.3)) },
    'B1 M2 2/3/4/6 ign4': { pool: '1', tiers: '2,3,4,6', ign: '4', hpPct: String(Math.round(+(base.hpPct ?? 100) * 1.3)) },
    'B2 M2 2/3/4/6 ign2': { pool: '0', tiers: '2,3,4,6', ign: '2', hpPct: String(Math.round(+(base.hpPct ?? 100) * 0.9)) },
    'B1=B2 flat 2 ign3': { pool: '1', tiers: '2', ign: '3', hpPct: String(Math.round(+(base.hpPct ?? 100) * 0.55)) },
  },
  C: {
    'none (F0)': { mode: 'none' },
    'focus 25': { focus: '25' }, 'focus 40': { focus: '40' }, 'focus 50': { focus: '50' }, 'focus 60': { focus: '60' }, 'focus 75': { focus: '75' }, 'focus 100': { focus: '100' },
    'guard +3/unused': { mode: 'guard', guardPer: '3' }, 'guard +6/unused': { mode: 'guard', guardPer: '6' }, 'guard +10/unused': { mode: 'guard', guardPer: '10' },
    'bank cap1': { mode: 'bank', bankCap: '1' }, 'bank cap2': { mode: 'bank', bankCap: '2' },
    'token v3 (M3 proxy)': { mode: 'token', token: '3' }, 'token v8 (M3 proxy)': { mode: 'token', token: '8' },
  },
};
const cands = suite === 'fixed' ? { base: {} } : SUITES[suite];
const run = async (kv, n, stop) => summarize(...Object.values(await simulate(kv, n, stop, kv.edit ?? 'greedy')));
const only = base.only ? base.only.split('|') : null; delete base.only;
console.log(`suite ${suite} runs=${RUNS} cal=${CAL} target=${TARGET} base=${JSON.stringify(base)}`);
console.log(`calibrated key: ${CALKEY}`);
console.log('candidate                 calPct  smart   max  once  choose  early% decision% after1% reasons(l/g/v)  turns b1..boss (smart)');
for (const [name, ov] of Object.entries(cands)) {
  if (only && !only.includes(name)) continue;
  const kv0 = { ...base, ...ov };
  let atk = +(kv0[CALKEY] ?? 100);
  if (suite !== 'fixed') { // bisection on the calibration key (higher = harder)
    let lo = 40, hi = 250;
    for (let i = 0; i < 7; i++) { const mid = Math.round((lo + hi) / 2); const r = await run({ ...kv0, [CALKEY]: String(mid) }, CAL, 'smart'); if (r.win > TARGET) lo = mid; else hi = mid; }
    atk = Math.round((lo + hi) / 2);
  }
  const kv = { ...kv0, [CALKEY]: String(atk) };
  const S = await run(kv, RUNS, 'smart'), M = await run(kv, RUNS, 'max'), O = await run(kv, RUNS, 'once');
  const dec = S.reason ? S.early * (1 - S.reason.lethal / 100) : 0;
  console.log(`${name.padEnd(25)} ${String(atk).padStart(6)} ${S.win.toFixed(1).padStart(6)} ${M.win.toFixed(1).padStart(5)} ${O.win.toFixed(1).padStart(5)} ${(S.win - Math.max(M.win, O.win)).toFixed(1).padStart(7)} ${S.early.toFixed(1).padStart(7)} ${dec.toFixed(1).padStart(9)} ${S.earlyAfter1.toFixed(1).padStart(7)}  ${S.reason ? [S.reason.lethal, S.reason.guard, S.reason.value].map(v => v.toFixed(0)).join('/') : '-'}`.padEnd(105) + ` ${S.stages.map(x => x.turns.toFixed(1)).join('/')}`);
}
