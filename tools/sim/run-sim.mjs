// M2 full-run Monte Carlo. Usage:
//   node run-sim.mjs [runs=2000] [policy=greedy|takeall|none|all] [key=value ...]
// Overridable keys (numbers): N, healAfter, healBoss, ogreHp, seed, samples, start (e.g. start=312 = A3 G1 S2)
// Policies: greedy (reel-quality greedy), takeall (take a random offer every time, never edit), none (no edits at all).
import { CFG } from './run-config.mjs';
import { mulberry32, battle, LINES, offers as drawOffers } from './run-engine.mjs';
const offers = (k, rng) => drawOffers(k, rng, CFG);

const args = process.argv.slice(2);
const runs = +(args.find(a => /^\d+$/.test(a)) ?? 2000);
const policyArg = args.find(a => ['greedy', 'takeall', 'none', 'all'].includes(a)) ?? 'all';
const kv = Object.fromEntries(args.filter(a => a.includes('=') && !a.startsWith('stages=')).map(a => a.split('=')).map(([k, v]) => [k, +v]));
const O = { N: CFG.N, healAfter: CFG.heal.afterBattle, healBoss: CFG.heal.beforeBoss, seed: 1, samples: 700, ...kv };
if (kv.ogreHp) CFG.stages[CFG.stages.length - 1].hp = kv.ogreHp;
if (kv.start) { const [A, G, S] = String(kv.start).split('').map(Number); CFG.startReel = [...Array(A).fill({ a: 'attack', g: 1 }), ...Array(G).fill({ a: 'guard', g: 1 }), ...Array(S).fill({ a: 'shield_bash', g: 1 })]; }

const ACT_IDS = ['attack', 'guard', 'shield_bash'];
const key = s => s.a + s.g;

// ---- fast reel scoring (common random numbers) ----------------------------------------------
function makeU(n, rng) { const U = new Float64Array(n * 9); for (let i = 0; i < U.length; i++) U[i] = rng(); return U; }
const MULT = n => { let num = 0, best = 0; for (const t of CFG.tiers) if (t.n <= n && t.n >= best) { best = t.n; num = t.num; } return num; };
export function evalReels(reels, U, n, wG = 0.7) { // expected damage + wG * guard per turn, plus fire stats
  let dmg = 0, grd = 0, empty = 0; const fire = { attack: 0, guard: 0, shield_bash: 0 };
  const cnt = {}, sum = {}; let o = 0;
  for (let i = 0; i < n; i++) {
    const b = reels.map(r => { const p = r.slice(); const c = []; for (let k = 0; k < 3; k++) c.push(p.splice(Math.floor(U[o++] * p.length), 1)[0]); return c; });
    cnt.attack = cnt.guard = cnt.shield_bash = 0; sum.attack = sum.guard = sum.shield_bash = 0;
    for (const l of LINES) { const a = b[l[0][0]][l[0][1]], c1 = b[l[1][0]][l[1][1]], c2 = b[l[2][0]][l[2][1]];
      if (a.a === c1.a && c1.a === c2.a) { cnt[a.a]++; sum[a.a] += a.g + c1.g + c2.g; } }
    let any = false;
    for (const a of ACT_IDS) if (cnt[a]) { any = true; fire[a]++; const f = CFG.actions[a], m = MULT(cnt[a]);
      dmg += Math.floor(f.dmg * sum[a] * m / 2); grd += Math.floor(f.guard * sum[a] * m / 2); }
    if (!any) empty++;
  }
  return { score: (dmg + wG * grd) / n, empty: empty / n, fire: { attack: fire.attack / n, guard: fire.guard / n, shield_bash: fire.shield_bash / n } };
}

const clone = reels => reels.map(r => r.slice());
function addCandidates(reels, offerList) {
  const c = [];
  offerList.forEach((s, oi) => reels.forEach((r, ri) => { if (r.length < CFG.reelMax) { const nr = clone(reels); nr[ri].push(s); c.push({ oi, ri, reels: nr }); } }));
  return c;
}
function editCandidates(reels) {
  const c = [];
  reels.forEach((r, ri) => {
    const seen = new Set();
    r.forEach((s, si) => { if (seen.has(key(s))) return; seen.add(key(s));
      if (r.length > CFG.reelMin) { const nr = clone(reels); nr[ri].splice(si, 1); c.push({ kind: 'delete', reels: nr }); }
      if (s.g < 4) { const nr = clone(reels); nr[ri][si] = { a: s.a, g: s.g + 1 }; c.push({ kind: 'enhance', reels: nr }); } });
  });
  return c;
}

// ---- policies ----------------------------------------------------------------------------------
const policies = {
  none: { add: () => null, edit: () => null },
  takeall: {
    add: (reels, offerList, rng) => { const s = offerList[Math.floor(rng() * 3)]; const ok = reels.map((r, i) => r.length < CFG.reelMax ? i : -1).filter(i => i >= 0);
      return ok.length ? { s, ri: ok[Math.floor(rng() * ok.length)] } : null; },
    edit: () => null,
  },
  greedy: {
    add: (reels, offerList, rng, U) => {
      const base = evalReels(reels, U, O.samples).score; let best = null, bs = base + 1e-9;
      for (const c of addCandidates(reels, offerList)) { const s = evalReels(c.reels, U, O.samples).score; if (s > bs) { bs = s; best = c; } }
      return best ? { s: offerList[best.oi], ri: best.ri } : null;
    },
    edit: (reels, rng, U) => {
      let bs = evalReels(reels, U, O.samples).score + 1e-9, best = null;
      for (const c of editCandidates(reels)) { const s = evalReels(c.reels, U, O.samples).score; if (s > bs) { bs = s; best = c; } }
      return best;
    },
  },
};

const enemyFor = st => CFG.stages[st];
function runOnce(pol, rng, U, stat) {
  let reels = [CFG.startReel, CFG.startReel, CFG.startReel].map(r => r.map(s => ({ ...s })));
  let hp = CFG.maxHp;
  for (let st = 0; st < CFG.stages.length; st++) {
    const boss = st === CFG.stages.length - 1, es = stat.stage[st];
    es.start += hp; es.n++;
    const r = battle(reels, enemyFor(st), hp, CFG, rng);
    es.turns += r.turns; es.empty += r.empty; es.sk += r.fired.shield_bash > 0 ? 1 : 0; es.skTurns += r.fired.shield_bash; es.gd += r.fired.guard; es.at += r.fired.attack;
    if (!r.win) return { win: false, died: st };
    hp = r.hpAfter; es.won++; es.endHp += hp;
    if (boss) return { win: true };
    const k = st + 1;
    hp = Math.min(CFG.maxHp, hp + O.healAfter + (k === CFG.stages.length - 1 ? O.healBoss : 0));
    const pick = pol.add(reels, offers(k, rng), rng, U);
    if (pick) reels[pick.ri].push(pick.s);
    if (k % O.N === 0) { const e = pol.edit(reels, rng, U); if (e) reels = e.reels; }
  }
}

function runPolicy(name) {
  const pol = policies[name], rng = mulberry32(O.seed), U = makeU(O.samples, mulberry32(O.seed + 99));
  const stat = { stage: CFG.stages.map(() => ({ n: 0, won: 0, start: 0, endHp: 0, turns: 0, empty: 0, sk: 0, skTurns: 0, gd: 0, at: 0 })) };
  let wins = 0; const died = Array(CFG.stages.length).fill(0);
  for (let i = 0; i < runs; i++) { const r = runOnce(pol, rng, U, stat); if (r.win) wins++; else died[r.died]++; }
  console.log(`\n== ${name}  runs=${runs} N=${O.N} healAfter=${O.healAfter} healBoss=${O.healBoss} ogreHp=${CFG.stages[CFG.stages.length - 1].hp}`);
  console.log(`run win rate ${(100 * wins / runs).toFixed(1)}%   deaths by stage: ${died.map((d, i) => `${CFG.stages[i].id}#${i + 1}:${(100 * d / runs).toFixed(1)}%`).join(' ')}`);
  console.log('stage enemy     reached  winRate(cond)  hpStart  hpEnd  turns  empty%  skillBattle%  skill/turn%');
  stat.stage.forEach((s, i) => { if (!s.n) return;
    console.log(String(i + 1).padEnd(6), CFG.stages[i].id.padEnd(9), String(s.n).padStart(7), (100 * s.won / s.n).toFixed(1).padStart(13), (s.start / s.n).toFixed(1).padStart(9),
      (s.won ? s.endHp / s.won : 0).toFixed(1).padStart(6), (s.turns / s.n).toFixed(1).padStart(6), (100 * s.empty / s.turns).toFixed(1).padStart(7), (100 * s.sk / s.n).toFixed(1).padStart(12), (100 * s.skTurns / s.turns).toFixed(1).padStart(11)); });
}
for (const p of (policyArg === 'all' ? ['greedy', 'takeall', 'none'] : [policyArg])) runPolicy(p);
