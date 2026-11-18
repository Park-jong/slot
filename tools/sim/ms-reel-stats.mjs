// Exact turn-level fire probabilities at k spins (pooled lines), question E of the M2.5 spec.
// Per spin: exact joint distribution of (guard, shield_bash, attack) line counts by enumerating ordered action triples
// per reel (reel-stats.mjs method); a k-spin turn is the k-fold convolution (spins are independent).
// Usage: node ms-reel-stats.mjs [maxK=3] [mc=400000]   (mc > 0 adds a Monte Carlo cross-check of the first reel at k=3)
import { LINES } from './run-engine.mjs';
import { compile, spinBoard, tallyBoard, mulberry32 } from './ms-engine.mjs';

// Same enumeration as reel-stats.mjs reelPatterns (inlined: importing reel-stats.mjs runs its demo block).
function reelPatterns(reel) {
  const n = reel.length, m = new Map(), p = 1 / (n * (n - 1) * (n - 2));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (j === i) continue;
    for (let k = 0; k < n; k++) { if (k === i || k === j) continue; const key = reel[i].a + '|' + reel[j].a + '|' + reel[k].a; m.set(key, (m.get(key) ?? 0) + p); } }
  return [...m].map(([k, pr]) => ({ acts: k.split('|'), pr }));
}
const ACTS = ['guard', 'shield_bash', 'attack'], D = 25; // pooled line count cap per action for k <= 3 (8 lines x 3)
const mk = s => s.split('').map(c => ({ a: { A: 'attack', G: 'guard', S: 'shield_bash' }[c], g: 1 }));
/** Joint per-spin distribution as Map key "g,s,a" -> probability. */
export function spinJoint(reels) {
  const pats = reels.map(reelPatterns), m = new Map();
  for (const a of pats[0]) for (const b of pats[1]) for (const c of pats[2]) {
    const bd = [a.acts, b.acts, c.acts], cnt = [0, 0, 0];
    for (const l of LINES) { const x = bd[l[0][0]][l[0][1]], y = bd[l[1][0]][l[1][1]], z = bd[l[2][0]][l[2][1]]; if (x === y && y === z) cnt[ACTS.indexOf(x)]++; }
    const k = cnt.join(','); m.set(k, (m.get(k) ?? 0) + a.pr * b.pr * c.pr);
  }
  return [...m].map(([k, p]) => ({ n: k.split(',').map(Number), p }));
}
/** k-fold convolution -> Float64Array over (g, s, a) in [0, D)^3. */
export function turnJoint(single, k) {
  let cur = new Float64Array(D * D * D); cur[0] = 1;
  for (let step = 0; step < k; step++) {
    const nx = new Float64Array(D * D * D);
    for (let i = 0; i < cur.length; i++) { const p = cur[i]; if (!p) continue; const g = Math.floor(i / (D * D)), s = Math.floor(i / D) % D, a = i % D;
      for (const x of single) nx[(g + x.n[0]) * D * D + (s + x.n[1]) * D + (a + x.n[2])] += p * x.p; }
    cur = nx;
  }
  return cur;
}
export function fireStats(joint) {
  const r = { empty: 0, act: ACTS.map(() => ({ ge1: 0, ge2: 0, ge3: 0, ge4: 0, ge5: 0, exp: 0 })) };
  for (let i = 0; i < joint.length; i++) { const p = joint[i]; if (!p) continue; const n = [Math.floor(i / (D * D)), Math.floor(i / D) % D, i % D];
    if (!n[0] && !n[1] && !n[2]) r.empty += p;
    n.forEach((c, j) => { const x = r.act[j]; x.exp += p * c; if (c >= 1) x.ge1 += p; if (c >= 2) x.ge2 += p; if (c >= 3) x.ge3 += p; if (c >= 4) x.ge4 += p; if (c >= 5) x.ge5 += p; }); }
  return r;
}
if (process.argv[1]?.endsWith('ms-reel-stats.mjs')) {
  const maxK = +(process.argv[2] ?? 3), MC = +(process.argv[3] ?? 400000);
  const CANDS = ['AAAGSS', 'AAGGSS', 'AAGSSS', 'AAAGGS', 'AAAAGGS', 'AAAGGSS', 'AAAAGGSS', 'AAAAGSS', 'AAGGS'];
  const pc = v => (100 * v).toFixed(2).padStart(6);
  console.log('reel x3    k | empty% | guard >=1  >=2  >=3   E[lines] | skill >=1  >=2  >=3   E[lines] | attack >=1  >=2  >=3  >=4  >=5  E[lines]');
  for (const c of CANDS) {
    const reel = mk(c), single = spinJoint([reel, reel, reel]);
    for (let k = 1; k <= maxK; k++) {
      const r = fireStats(turnJoint(single, k)), [g, s, a] = r.act;
      console.log(`${(k === 1 ? c : '').padEnd(9)} ${k}  | ${pc(r.empty)} | ${pc(g.ge1)} ${pc(g.ge2)} ${pc(g.ge3)} ${g.exp.toFixed(3).padStart(7)} | ${pc(s.ge1)} ${pc(s.ge2)} ${pc(s.ge3)} ${s.exp.toFixed(3).padStart(7)} | ${pc(a.ge1)} ${pc(a.ge2)} ${pc(a.ge3)} ${pc(a.ge4)} ${pc(a.ge5)} ${a.exp.toFixed(3).padStart(7)}`);
    }
  }
  if (MC > 0) { // Monte Carlo cross-check of AAAGSS at k = 3 with the engine's spin/tally code
    const reel = mk(CANDS[0]), cr = compile([reel, reel, reel]), rng = mulberry32(3), b = new Int32Array(9), t = new Int32Array(6);
    let e = 0, g = 0, s = 0, a = 0, a3 = 0;
    for (let i = 0; i < MC; i++) { t.fill(0); for (let k = 0; k < 3; k++) tallyBoard(spinBoard(cr, rng, b), t); if (!t[0] && !t[1] && !t[2]) e++; if (t[0]) g++; if (t[1]) s++; if (t[2]) a++; if (t[2] >= 3) a3++; }
    console.log(`MC ${MC} AAAGSS k=3: empty ${pc(e / MC)} guard>=1 ${pc(g / MC)} skill>=1 ${pc(s / MC)} attack>=1 ${pc(a / MC)} attack>=3 ${pc(a3 / MC)}`);
  }
}
