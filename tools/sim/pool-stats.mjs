// Reward-pool statistics per cleared-battle index. Usage: node pool-stats.mjs [samples]
import { CFG } from './run-config.mjs';
import { offers, mulberry32 } from './run-engine.mjs';
const N = +process.argv[2] || 100000, rng = mulberry32(5);
console.log('k  P(>=1 attack) P(>=1 guard) P(>=1 skill)  avg best grade  P(best>=3)  P(any grade4)  avg grade/offer');
for (let k = 1; k <= 5; k++) {
  let a = 0, g = 0, s = 0, best = 0, b3 = 0, g4 = 0, sum = 0;
  for (let i = 0; i < N; i++) { const o = offers(k, rng, CFG); if (o.some(x => x.a === 'attack')) a++; if (o.some(x => x.a === 'guard')) g++; if (o.some(x => x.a === 'shield_bash')) s++;
    const m = Math.max(...o.map(x => x.g)); best += m; if (m >= 3) b3++; if (m === 4) g4++; sum += o.reduce((x, y) => x + y.g, 0) / 3; }
  const p = x => (100 * x / N).toFixed(1).padStart(6);
  console.log(k, p(a), '      ', p(g), '     ', p(s), '       ', (best / N).toFixed(2), '      ', p(b3), '     ', p(g4), '      ', (sum / N).toFixed(2));
}
