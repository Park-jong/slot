// Starting-reel candidates: action fire rates and empty rate. Usage: node skill-rate.mjs [spins]
import { spin, judge, mulberry32 } from './run-engine.mjs';
const N = +process.argv[2] || 200000;
const mk = (A, G, S) => [...Array(A).fill({ a: 'attack', g: 1 }), ...Array(G).fill({ a: 'guard', g: 1 }), ...Array(S).fill({ a: 'shield_bash', g: 1 })];
const cands = { 'AAAGGS (M1)': [3,2,1], 'AAAGSS': [3,1,2], 'AAGGSS': [2,2,2], 'AAASSS': [3,0,3], 'AAAAGSS': [4,1,2], 'AAGSS(5)': [2,1,2], 'AAAGS(5)': [3,1,1], 'AAAGGSS(7)': [3,2,2], 'AAAAGGSSS': [4,2,3] };
for (const [name, [A, G, S]] of Object.entries(cands)) {
  const reel = mk(A, G, S), reels = [reel, reel, reel], rng = mulberry32(7);
  const c = { attack: 0, guard: 0, shield_bash: 0, empty: 0 };
  for (let i = 0; i < N; i++) { const by = judge(spin(reels, rng)); let any = false; for (const k in by) { c[k]++; any = true; } if (!any) c.empty++; }
  console.log(name.padEnd(14), 'atk', (100*c.attack/N).toFixed(1), 'grd', (100*c.guard/N).toFixed(1), 'skl', (100*c.shield_bash/N).toFixed(1), 'empty', (100*c.empty/N).toFixed(1));
}
