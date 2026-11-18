// Exact reel statistics (the numbers the reel-edit UI shows, spec m2-run-spec section 7).
// Per reel, enumerate ordered action triples (<= 27 patterns); combine 3 reels (<= 27^3 boards).
// Usage: node reel-stats.mjs   (prints worked examples used in the spec)
import { LINES, spin, judge, mulberry32 } from './run-engine.mjs';

export function reelPatterns(reel) {
  const n = reel.length, m = new Map(), p = 1 / (n * (n - 1) * (n - 2));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (j === i) continue;
    for (let k = 0; k < n; k++) { if (k === i || k === j) continue;
      const key = reel[i].a + '|' + reel[j].a + '|' + reel[k].a; m.set(key, (m.get(key) ?? 0) + p); } }
  return [...m].map(([k, pr]) => ({ acts: k.split('|'), pr }));
}
const ACTS = ['attack', 'guard', 'shield_bash'];
export function analyzeReels(reels) {
  const pats = reels.map(reelPatterns);
  const R = { empty: 0, actions: Object.fromEntries(ACTS.map(a => [a, { fire: 0, fire2: 0, expLines: 0 }])) };
  for (const a of pats[0]) for (const b of pats[1]) for (const c of pats[2]) {
    const pr = a.pr * b.pr * c.pr, bd = [a.acts, b.acts, c.acts], cnt = {};
    for (const l of LINES) { const x = bd[l[0][0]][l[0][1]], y = bd[l[1][0]][l[1][1]], z = bd[l[2][0]][l[2][1]]; if (x === y && y === z) cnt[x] = (cnt[x] ?? 0) + 1; }
    const ks = Object.keys(cnt); if (!ks.length) R.empty += pr;
    for (const k of ks) { const r = R.actions[k]; r.fire += pr; if (cnt[k] >= 2) r.fire2 += pr; r.expLines += pr * cnt[k]; }
  }
  return R;
}
const S = (a, g = 1) => ({ a, g });
const rep = (s, n) => Array.from({ length: n }, () => ({ ...s }));
const fmt = r => `empty ${(100 * r.empty).toFixed(2)}% | ` + ACTS.map(a => `${a} fire ${(100 * r.actions[a].fire).toFixed(2)}% (2+ ${(100 * r.actions[a].fire2).toFixed(2)}%)`).join(' | ');
if (process.argv[1].endsWith('reel-stats.mjs')) {
  const m1 = [...rep(S('attack'), 3), ...rep(S('guard'), 2), S('shield_bash')];
  const m2 = [...rep(S('attack'), 3), S('guard'), ...rep(S('shield_bash'), 2)];
  console.log('M1 start AAAGGS x3 :', fmt(analyzeReels([m1, m1, m1])));
  console.log('M2 start AAAGSS x3 :', fmt(analyzeReels([m2, m2, m2])));
  const add = [m2, m2, [...m2, S('attack', 2)]];
  console.log('ex add  A2->reel2  :', fmt(analyzeReels(add)));
  const del = [m2, [...m2.slice(0, 3), ...m2.slice(4)], m2]; // delete guard from reel 1
  console.log('ex del  G1 reel1   :', fmt(analyzeReels(del)));
  const enh = [m2, m2, [S('attack'), S('attack'), S('attack'), S('guard'), S('shield_bash', 2), S('shield_bash')]];
  console.log('ex enh  S1->S2 r2  :', fmt(analyzeReels(enh)));
  // MC cross-check of the exact numbers
  const rng = mulberry32(3), N = 400000, c = { empty: 0, attack: 0, guard: 0, shield_bash: 0 };
  const rs = [m2, m2, m2];
  for (let i = 0; i < N; i++) { const by = judge(spin(rs, rng)); const k = Object.keys(by); if (!k.length) c.empty++; for (const a of k) c[a]++; }
  console.log('MC check AAAGSS x3 :', `empty ${(100 * c.empty / N).toFixed(2)} atk ${(100 * c.attack / N).toFixed(2)} grd ${(100 * c.guard / N).toFixed(2)} skl ${(100 * c.shield_bash / N).toFixed(2)}`);
}
