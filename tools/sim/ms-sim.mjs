// M2.5 multi-spin full-run Monte Carlo (5 battles + boss, heal, reward add each stage, delete/enhance every N).
// Usage:
//   node ms-sim.mjs [runs=2000] [stop=smart|max|once|all] [edit=greedy|takeall|none] [set=report] [key=value ...]
//   set=report runs the 5 report policies: smart+greedy, max+greedy, once+greedy, smart+takeall, smart+none.
//   stop=all runs smart, max, once with the chosen editor.
// Overrides (all optional; defaults come from ms-config.mjs):
//   seed=1 chunks=40 samples=<editor samples> json=1 (one JSON line per policy, for sweeps) reels=<stage index 0..5> (dump most common reels at the start of that battle)
//   maxSpins=3 spinAdd=0 spinMulPct=100 dmgPct=0 pool=1|0 tiers=2,3,4 ign=3
//   mode=focus|guard|bank|token|none focus=50 guardPer=4 bankCap=2 token=0
//   hp=40,46,54,62,72,150   pat1..pat6=a6/a6/g6/c2 (a=attack g=guard c=charge)   hpPct=100 atkPct=100 gPct=100 (scale enemy HP / attack / guard values)
//   healAfter=8 healBoss=50 N=3 start=312 (A3 G1 S2) maxHp=50
//   lethalBonus deathPenalty pguardW s1 s2 bankSize bankSpinValue (smart policy internals)
// Determinism: runs are split into `chunks` with fixed per-chunk seeds, so results do not depend on core count.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MS } from './ms-config.mjs';
import { prepare, battleMS, newBattleStats, makeU, evalReels, mulberry32, offers } from './ms-engine.mjs';

export function parseArgs(argv) {
  const kv = {}; let runs = 2000;
  for (const a of argv) { if (/^\d+$/.test(a)) runs = +a; else if (a.includes('=')) { const i = a.indexOf('='); kv[a.slice(0, i)] = a.slice(i + 1); } }
  return { runs, kv };
}
const parsePat = s => s.split('/').map(x => ({ type: { a: 'attack', g: 'guard', c: 'charge' }[x[0]], value: +x.slice(1) }));
/** Deep-copied config with overrides applied. */
export function buildConfig(kv) {
  const C = structuredClone(MS);
  const num = k => (kv[k] !== undefined ? +kv[k] : undefined);
  if (kv.maxSpins !== undefined) C.spins.base = +kv.maxSpins;
  if (kv.spinAdd !== undefined) C.spins.add = +kv.spinAdd;
  if (kv.spinMulPct !== undefined) C.spins.mulPct = +kv.spinMulPct;
  if (kv.dmgPct !== undefined) C.dmgPct = +kv.dmgPct;
  if (kv.pool !== undefined) C.pool = kv.pool === '1' || kv.pool === 'true';
  if (kv.tiers) C.tiers = kv.tiers.split(',').map((v, i) => ({ n: i + 1, num: +v }));
  if (kv.ign !== undefined) C.ignoreGuardAt = +kv.ign;
  if (kv.mode) C.unused.mode = kv.mode;
  if (kv.focus !== undefined) C.unused.focusPct = +kv.focus;
  if (kv.guardPer !== undefined) C.unused.guardPer = +kv.guardPer;
  if (kv.bankCap !== undefined) C.unused.bankCap = +kv.bankCap;
  if (kv.token !== undefined) C.unused.tokenValue = +kv.token;
  if (kv.hp) kv.hp.split(',').forEach((v, i) => { C.stages[i].hp = +v; });
  for (let i = 1; i <= 6; i++) if (kv['pat' + i]) C.stages[i - 1].pattern = parsePat(kv['pat' + i]);
  if (num('hpPct')) C.stages.forEach(s => { s.hp = Math.round(s.hp * num('hpPct') / 100); });
  if (num('atkPct')) C.stages.forEach(s => s.pattern.forEach(p => { if (p.type !== 'charge') p.value = Math.round(p.value * num('atkPct') / 100); }));
  if (num('gPct')) C.stages.forEach(s => s.pattern.forEach(p => { if (p.type === 'guard') p.value = Math.round(p.value * num('gPct') / 100); }));
  if (num('healAfter') !== undefined) C.heal.afterBattle = num('healAfter');
  if (num('healBoss') !== undefined) C.heal.beforeBoss = num('healBoss');
  if (num('N') !== undefined) C.N = num('N');
  if (num('maxHp') !== undefined) C.maxHp = num('maxHp');
  if (kv.start) { const [A, G, Sk] = String(kv.start).split('').map(Number); C.startReel = [...Array(A).fill({ a: 'attack', g: 1 }), ...Array(G).fill({ a: 'guard', g: 1 }), ...Array(Sk).fill({ a: 'shield_bash', g: 1 })]; }
  for (const k of ['lethalBonus', 'deathPenalty', 's1', 's2', 'bankSize', 'bankSpinValue']) if (num(k) !== undefined) C.policy[k] = num(k);
  if (num('pguardW') !== undefined) C.policy.guardW = num('pguardW');
  if (num('samples') !== undefined) C.editor.samples = num('samples');
  return prepare(C);
}

// ---- reel editing policies -----------------------------------------------------------------------------
const clone = reels => reels.map(r => r.slice());
const key = s => s.a + s.g;
const reelKey = reels => reels.map(r => r.map(key).sort().join(',')).join('|');
function makeEditors(C, U) {
  const cache = new Map();
  const score = reels => { const k = reelKey(reels); let v = cache.get(k); if (v === undefined) { if (cache.size > 300000) cache.clear(); v = evalReels(reels, U, C.editor.samples, C, C.editor.guardW); cache.set(k, v); } return v; };
  return {
    none: { add: () => null, edit: () => null },
    takeall: {
      add: (reels, of, rng) => { const s = of[Math.floor(rng() * 3)]; const ok = reels.map((r, i) => (r.length < C.reelMax ? i : -1)).filter(i => i >= 0);
        return ok.length ? { s, ri: ok[Math.floor(rng() * ok.length)] } : null; },
      edit: () => null,
    },
    greedy: {
      add: (reels, of) => {
        let bs = score(reels) + 1e-9, best = null;
        of.forEach((s, oi) => reels.forEach((r, ri) => { if (r.length >= C.reelMax) return; const nr = clone(reels); nr[ri].push(s); const v = score(nr); if (v > bs) { bs = v; best = { s: of[oi], ri }; } }));
        return best;
      },
      edit: reels => {
        let bs = score(reels) + 1e-9, best = null;
        reels.forEach((r, ri) => { const seen = new Set(); r.forEach((s, si) => { if (seen.has(key(s))) return; seen.add(key(s));
          if (r.length > C.reelMin) { const nr = clone(reels); nr[ri].splice(si, 1); const v = score(nr); if (v > bs) { bs = v; best = nr; } }
          if (s.g < 4) { const nr = clone(reels); nr[ri][si] = { a: s.a, g: s.g + 1 }; const v = score(nr); if (v > bs) { bs = v; best = nr; } } }); });
        return best;
      },
    },
  };
}

function newStats(C) {
  return { runs: 0, wins: 0, died: C.stages.map(() => 0), hpB5: 0, nB5: 0, bossEnd: 0, nBossWin: 0,
    stage: C.stages.map(() => ({ n: 0, won: 0, start: 0, end: 0, ...newBattleStats() })), reels: {} };
}
function runChunk({ kv, runs, seed, stop, edit }) {
  const C = buildConfig(kv), stat = newStats(C);
  // Pairing across policies: per run one seed -> its own offer/takeall stream and one spin stream per battle.
  const master = mulberry32(seed), lrng = mulberry32(seed ^ 0x5bd1e995);
  const U = makeU(C.editor.samples, C._max, mulberry32(+(kv.seed ?? 1) + 99)); // same editor CRN in every chunk
  const pol = makeEditors(C, U)[edit];
  for (let i = 0; i < runs; i++) {
    stat.runs++;
    const runSeed = Math.floor(master() * 4294967296), rng = mulberry32(runSeed ^ 0xa5a5a5a5);
    let reels = [0, 1, 2].map(() => C.startReel.map(s => ({ ...s }))), hp = C.maxHp;
    for (let st = 0; st < C.stages.length; st++) {
      const boss = st === C.stages.length - 1, es = stat.stage[st];
      es.n++; es.start += hp;
      if (kv.reels && st === +kv.reels) { const k = reelKey(reels); stat.reels[k] = (stat.reels[k] ?? 0) + 1; }
      const r = battleMS(reels, C.stages[st], hp, C, mulberry32((runSeed + (st + 1) * 0x9e3779b9) >>> 0), lrng, stop, es);
      if (!r.win) { stat.died[st]++; break; }
      hp = r.hp; es.won++; es.end += hp;
      if (boss) { stat.wins++; stat.bossEnd += hp; stat.nBossWin++; break; }
      const k = st + 1;
      if (k === C.stages.length - 1) { stat.hpB5 += hp; stat.nB5++; }
      hp = Math.min(C.maxHp, hp + C.heal.afterBattle + (k === C.stages.length - 1 ? C.heal.beforeBoss : 0));
      const pick = pol.add(reels, offers(k, rng, C), rng);
      if (pick) reels[pick.ri].push(pick.s);
      if (k % C.N === 0) { const e = pol.edit(reels, rng); if (e) reels = e; }
    }
  }
  return stat;
}
function merge(a, b) {
  for (const k of ['runs', 'wins', 'hpB5', 'nB5', 'bossEnd', 'nBossWin']) a[k] += b[k];
  b.died.forEach((d, i) => { a.died[i] += d; });
  b.stage.forEach((s, i) => { const t = a.stage[i];
    for (const k of Object.keys(s)) { if (typeof s[k] === 'number') t[k] = k === 'maxTurns' ? Math.max(t[k], s[k]) : t[k] + s[k];
      else if (Array.isArray(s[k])) s[k].forEach((v, j) => { t[k][j] += v; }); else for (const r of Object.keys(s[k])) t[k][r] += s[k][r]; } });
  for (const [k, v] of Object.entries(b.reels)) a.reels[k] = (a.reels[k] ?? 0) + v;
  return a;
}

export async function simulate(kv, runs, stop, edit) {
  const chunks = +(kv.chunks ?? 40), seed = +(kv.seed ?? 1), per = Math.ceil(runs / chunks);
  const jobs = []; for (let c = 0; c < chunks; c++) { const n = Math.min(per, runs - c * per); if (n > 0) jobs.push({ kv, runs: n, seed: (seed * 1000003 + c * 7919) >>> 0, stop, edit }); }
  const C = buildConfig(kv); let total = newStats(C);
  const conc = Math.min(jobs.length, Math.max(1, cpus().length - 1));
  let next = 0;
  await Promise.all(Array.from({ length: conc }, () => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: null });
    const feed = () => { if (next >= jobs.length) { w.terminate(); res(); return; } w.postMessage(jobs[next++]); };
    w.on('message', m => { total = merge(total, m); feed(); }); w.on('error', rej); feed();
  })));
  return { C, stat: total };
}

export function summarize(C, s) {
  const T = s.stage.reduce((a, x) => ({ turns: a.turns + x.turns, early: a.early + x.early, spins: a.spins + x.spins, empty: a.empty + x.empty,
    g: a.g + x.fired[0], k: a.k + x.fired[1], at: a.at + x.fired[2], ign: a.ign + x.ign, e1: a.e1 + x.earlyAt[1], e2: a.e2 + x.earlyAt[2],
    se: a.se + x.spinEmpty, gu: a.gu + x.guardUsed, tk: a.tk + x.taken, rl: a.rl + x.reason.lethal, rg: a.rg + x.reason.guard, rv: a.rv + x.reason.value }), { se: 0, gu: 0, tk: 0, turns: 0, early: 0, spins: 0, empty: 0, g: 0, k: 0, at: 0, ign: 0, e1: 0, e2: 0, rl: 0, rg: 0, rv: 0 });
  return {
    win: 100 * s.wins / s.runs, early: 100 * T.early / T.turns, spinsPerTurn: T.spins / T.turns, empty: 100 * T.empty / T.turns,
    guardFire: 100 * T.g / T.turns, skillFire: 100 * T.k / T.turns, attackFire: 100 * T.at / T.turns, ignore: 100 * T.ign / T.turns,
    spinEmpty: 100 * T.se / T.spins, absorbed: 100 * T.gu / Math.max(1, T.gu + T.tk),
    reasonAt: Object.fromEntries(['l1', 'l2', 'g1', 'g2', 'v1', 'v2'].map(k => [k, 100 * s.stage.reduce((x, y) => x + y.reasonAt[k], 0) / T.turns])),
    earlyAfter1: 100 * T.e1 / T.turns, earlyAfter2: 100 * T.e2 / T.turns,
    reason: T.early ? { lethal: 100 * T.rl / T.early, guard: 100 * T.rg / T.early, value: 100 * T.rv / T.early } : null,
    hpB5: s.nB5 ? s.hpB5 / s.nB5 : 0, bossEnd: s.nBossWin ? s.bossEnd / s.nBossWin : 0,
    died: s.died.map(d => 100 * d / s.runs),
    stages: s.stage.map((x, i) => ({ id: C.stages[i].id, reached: x.n, win: x.n ? 100 * x.won / x.n : 0, hpStart: x.n ? x.start / x.n : 0, hpEnd: x.won ? x.end / x.won : 0,
      turns: x.n ? x.turns / x.n : 0, empty: x.turns ? 100 * x.empty / x.turns : 0, spt: x.turns ? x.spins / x.turns : 0, early: x.turns ? 100 * x.early / x.turns : 0,
      spinEmpty: x.spins ? 100 * x.spinEmpty / x.spins : 0, absorbed: 100 * x.guardUsed / Math.max(1, x.guardUsed + x.taken), guardFire: x.turns ? 100 * x.fired[0] / x.turns : 0, skillFire: x.turns ? 100 * x.fired[1] / x.turns : 0, ign: x.turns ? 100 * x.ign / x.turns : 0 })),
  };
}
const f1 = v => v.toFixed(1);
export function printSummary(name, C, R, runs, kv) {
  console.log(`\n== ${name}  runs=${runs} seed=${kv.seed ?? 1} maxSpins=${C._max} pool=${C.pool} tiers=${C.tiers.map(t => t.num).join('/')} ign=${C.ignoreGuardAt} mode=${C.unused.mode} focus=${C.unused.focusPct} dmgPct=${C.dmgPct} N=${C.N} heal=${C.heal.afterBattle}`);
  console.log(`run win ${f1(R.win)}%  stop-early ${f1(R.early)}% (after spin1 ${f1(R.earlyAfter1)}%, spin2 ${f1(R.earlyAfter2)}%)  spins/turn ${R.spinsPerTurn.toFixed(2)}  empty ${f1(R.empty)}%`);
  if (R.reason) console.log(`early-stop reasons: lethal ${f1(R.reason.lethal)}%  guard-covers ${f1(R.reason.guard)}%  value ${f1(R.reason.value)}%`);
  if (R.reasonAt) console.log(`early stops as % of all turns: after spin 1 = lethal ${f1(R.reasonAt.l1)} guard ${f1(R.reasonAt.g1)} value ${f1(R.reasonAt.v1)} | after spin 2+ = lethal ${f1(R.reasonAt.l2)} guard ${f1(R.reasonAt.g2)} value ${f1(R.reasonAt.v2)}`);
  console.log(`fire per turn: attack ${f1(R.attackFire)}%  guard ${f1(R.guardFire)}%  skill ${f1(R.skillFire)}%  ignore_guard ${f1(R.ignore)}%   guard absorbed ${f1(R.absorbed)}% of incoming  empty spins ${f1(R.spinEmpty)}%
HP after b5 (pre-heal) ${f1(R.hpB5)}  HP at boss end ${f1(R.bossEnd)}`);
  console.log(`deaths by stage: ${R.died.map((d, i) => `${C.stages[i].id}:${f1(d)}%`).join(' ')}`);
  console.log('#  enemy             reached  win%cond  hpStart  hpEnd  turns  empty%  spins/t  early%  guard%  skill%  ign%  spinEmpty%  absorbed%');
  R.stages.forEach((x, i) => console.log(String(i + 1).padEnd(3), x.id.padEnd(17), String(x.reached).padStart(7), f1(x.win).padStart(9), f1(x.hpStart).padStart(8), f1(x.hpEnd).padStart(6),
    f1(x.turns).padStart(6), f1(x.empty).padStart(7), x.spt.toFixed(2).padStart(8), f1(x.early).padStart(7), f1(x.guardFire).padStart(7), f1(x.skillFire).padStart(7), f1(x.ign).padStart(5), f1(x.spinEmpty).padStart(11), f1(x.absorbed).padStart(10)));
}

if (!isMainThread) parentPort.on('message', job => parentPort.postMessage(runChunk(job)));
else if (process.argv[1]?.endsWith('ms-sim.mjs')) {
  const { runs, kv } = parseArgs(process.argv.slice(2));
  const edit = kv.edit ?? 'greedy', stop = kv.stop ?? 'smart';
  const combos = kv.set === 'report' ? [['smart', 'greedy'], ['max', 'greedy'], ['once', 'greedy'], ['smart', 'takeall'], ['smart', 'none']]
    : stop === 'all' ? [['smart', edit], ['max', edit], ['once', edit]] : [[stop, edit]];
  for (const [s, e] of combos) {
    const t0 = Date.now(); const { C, stat } = await simulate(kv, runs, s, e); const R = summarize(C, stat);
    if (kv.json) console.log(JSON.stringify({ stop: s, edit: e, kv, win: +R.win.toFixed(2), early: +R.early.toFixed(1), spt: +R.spinsPerTurn.toFixed(2), e1: +R.earlyAfter1.toFixed(1), reason: R.reason, died: R.died.map(d => +d.toFixed(1)), hpB5: +R.hpB5.toFixed(1), bossEnd: +R.bossEnd.toFixed(1), g: +R.guardFire.toFixed(1), k: +R.skillFire.toFixed(1), abs: +R.absorbed.toFixed(1), se: +R.spinEmpty.toFixed(1), ign: +R.ignore.toFixed(1), st: R.stages.map(x => [+x.win.toFixed(1), +x.turns.toFixed(1), +x.empty.toFixed(1), +x.early.toFixed(1)]) }));
    else { printSummary(`${s}-stop + ${e}`, C, R, runs, kv); console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
    if (kv.reels) Object.entries(stat.reels).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(`  reels ${v}x  ${k}`));
  }
}
