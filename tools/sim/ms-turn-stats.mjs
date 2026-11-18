// Turn-level evidence for question B (pooled B1 vs independent B2), no enemy context.
// Usage: node ms-turn-stats.mjs [turns=400000] [luckN=20000] [focus=50,100] [ign=3]
// For each reel set x tier table x pooling: E[damage], E[guard], SD(damage), empty% (whole turn zero), ratio vs 1 spin
// (value = damage + 0.7 x guard), ignore_guard% at k = 1, 2, 3 spins (common random numbers: k=2 reuses spin 1 etc.).
// "lucky" columns: with Focus F, how often a myopic EV player (value = dmg + 0.7 guard, open loop) stops after spin 1 / 2,
// and the EV gain of that choice over always spinning 3 times.
import { buildConfig, parseArgs } from './ms-sim.mjs';
import { compile, spinBoard, tallyBoard, turnOut, newOut, mulberry32 } from './ms-engine.mjs';

const { kv } = parseArgs(process.argv.slice(2));
const TURNS = +(process.argv[2] ?? 400000) || 400000, LUCK = +(process.argv[3] ?? 20000) || 20000;
const FOCI = (kv.focus ?? '50,100').split(',').map(Number), IGN = kv.ign ?? '3';
const R = s => s.split(' ').map(t => ({ a: { A: 'attack', G: 'guard', S: 'shield_bash' }[t[0]], g: +(t[1] ?? 1) }));
const REELS = {
  'start AAAGSS x3': [R('A A A G S S'), R('A A A G S S'), R('A A A G S S')],
  'mid (battle 3)': [R('A A A G S S'), R('A A A A G S S'), R('A A A A2 G S S')],
  'late (boss)': [R('A A A A A2 S S'), R('A A A A G S S'), R('A A A A A2 G S S')],
  // M2.5 start reel and the most common greedy reels it grows into (ms-sim reels=2 / reels=5, always-max)
  'start AAAGGSS x3': [R('A A A G G S S'), R('A A A G G S S'), R('A A A G G S S')],
  'mid322 (battle 3)': [R('A A A A G G S S'), R('A A A A G G S S'), R('A A A G G S S')],
  'late322 (boss)': [R('A A A A A2 G G S S'), R('A A A A G S S'), R('A A A A A2 G G S S')],
};
const ONLY = kv.reels ? kv.reels.split('|') : null; // e.g. reels="start AAAGGSS x3|late322 (boss)"
const TIERS = { 'M2 x1/1.5/2/3': '2,3,4,6', 'capped x1/1.5/2': '2,3,4', 'flat x1': '2' };
const val = o => o.sk + o.atkN + o.atkI + 0.7 * o.pg;

for (const [rn, reels] of Object.entries(REELS)) { if (ONLY && !ONLY.includes(rn)) continue;
  const cr = compile(reels);
  console.log(`\n### ${rn}`);
  console.log('tiers              pool | k  E[dmg]  E[grd]  SD(dmg) empty%  ign%  value  ratio  marginal | ' + FOCI.map(f => `F${f}: stop@1% stop@2% EVgain%`).join(' | '));
  for (const [tn, tiers] of Object.entries(TIERS)) for (const pool of ['1', '0']) {
    const C = buildConfig({ tiers, pool, ign: IGN, focus: '0' });
    const rng = mulberry32(11), b = new Int32Array(9), T = [0, 1, 2].map(() => new Int32Array(6)), o = newOut();
    const acc = [1, 2, 3].map(() => ({ d: 0, d2: 0, g: 0, e: 0, ig: 0, v: 0 }));
    for (let i = 0; i < TURNS; i++) {
      for (let k = 0; k < 3; k++) { T[k].fill(0); tallyBoard(spinBoard(cr, rng, b), T[k]); }
      for (let k = 1; k <= 3; k++) { turnOut(T, k, C, 0, o); const d = o.sk + o.atkN + o.atkI, a = acc[k - 1];
        a.d += d; a.d2 += d * d; a.g += o.pg; a.e += o.mask ? 0 : 1; a.ig += o.ign ? 1 : 0; a.v += val(o); }
    }
    // lucky-stop analysis with a bank of single-spin tallies
    const bank = []; const lr = mulberry32(5); for (let i = 0; i < 1024; i++) { const t = new Int32Array(6); tallyBoard(spinBoard(cr, lr, b), t); bank.push(t); }
    const luck = FOCI.map(F => {
      const CF = buildConfig({ tiers, pool, ign: IGN, focus: String(F) });
      const v = (tl, k, unused) => val(turnOut(tl, k, CF, unused, o));
      const r2 = mulberry32(17); let s1 = 0, s2 = 0, evChoose = 0, evMax = 0; const tl = [null, null, null];
      for (let i = 0; i < LUCK; i++) {
        const a = new Int32Array(6), c = new Int32Array(6), d = new Int32Array(6);
        tallyBoard(spinBoard(cr, r2, b), a); tallyBoard(spinBoard(cr, r2, b), c); tallyBoard(spinBoard(cr, r2, b), d);
        tl[0] = a; tl[1] = c; tl[2] = d; evMax += v(tl, 3, 0);
        const stop1 = v(tl, 1, 2);
        let e2 = 0, e3 = 0; for (let j = 0; j < 128; j++) { tl[1] = bank[(j * 7 + i) & 1023]; e2 += v(tl, 2, 1); tl[2] = bank[(j * 13 + i * 3 + 5) & 1023]; e3 += v(tl, 3, 0); }
        tl[1] = c; tl[2] = d;
        if (stop1 >= Math.max(e2, e3) / 128) { s1++; evChoose += stop1; continue; }
        const stop2 = v(tl, 2, 1); let e = 0; for (const x of bank) { tl[2] = x; e += v(tl, 3, 0); } tl[2] = d;
        if (stop2 >= e / bank.length) { s2++; evChoose += stop2; } else evChoose += v(tl, 3, 0);
      }
      return `${(100 * s1 / LUCK).toFixed(1).padStart(13)} ${(100 * s2 / LUCK).toFixed(1).padStart(7)} ${(100 * (evChoose / evMax - 1)).toFixed(1).padStart(7)}`;
    });
    acc.forEach((a, k) => {
      const n = TURNS, m = a.d / n, sd = Math.sqrt(a.d2 / n - m * m), base = acc[0].v / n, prev = k ? acc[k - 1].v / n : 0;
      console.log(`${(k ? '' : tn).padEnd(18)} ${(k ? '' : pool === '1' ? 'B1' : 'B2').padStart(4)} | ${k + 1}  ${m.toFixed(2).padStart(6)}  ${(a.g / n).toFixed(2).padStart(6)}  ${sd.toFixed(2).padStart(7)} ${(100 * a.e / n).toFixed(2).padStart(6)} ${(100 * a.ig / n).toFixed(1).padStart(5)} ${(a.v / n).toFixed(2).padStart(6)} ${(a.v / n / base).toFixed(2).padStart(6)} ${(a.v / n - prev).toFixed(2).padStart(9)} | ${k === 0 ? luck.join(' | ') : ''}`);
    });
  }
}
