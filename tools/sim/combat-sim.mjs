// M1 combat Monte Carlo. Usage: node combat-sim.mjs [runs]
// Implements docs/specs/m1-combat-spec.md resolution rules.
const COEF = { attack: 2, guard: 2 };            // per grade-sum
const SKILL = { dmg: 1, guard: 1 };              // shield_bash per grade-sum
const MULT = [0, 1, 1.5, 2, 3];                  // index = line count (cap 4)
const LINES = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[7,5,3]]
  .map(l => l.map(n => [(n - 1) % 3, Math.floor((n - 1) / 3)])); // [reel,row]

export function resolveBoard(b) { // b[reel][row] = {a, g}
  const by = {};
  for (const l of LINES) {
    const c = l.map(([r, w]) => b[r][w]);
    if (c[0].a === c[1].a && c[1].a === c[2].a) {
      (by[c[0].a] ??= []).push(c[0].g + c[1].g + c[2].g);
    }
  }
  return by; // action -> [gradeSums]
}
export function playerOutput(by) {
  const o = { guard: 0, skillDmg: 0, skillGuard: 0, attack: 0, ignoreGuard: false };
  const f = (a) => { const s = by[a]; if (!s) return null;
    const n = Math.min(s.length, 4); return { sum: s.reduce((x, y) => x + y, 0), m: MULT[n], n }; };
  let x;
  if ((x = f('guard'))) o.guard = Math.floor(COEF.guard * x.sum * x.m);
  if ((x = f('skill'))) { o.skillDmg = Math.floor(SKILL.dmg * x.sum * x.m); o.skillGuard = Math.floor(SKILL.guard * x.sum * x.m); }
  if ((x = f('attack'))) { o.attack = Math.floor(COEF.attack * x.sum * x.m); o.ignoreGuard = x.n >= 2; }
  return o;
}
export const ENEMIES = {
  slime:  { hp: 24, pattern: [['attack',5],['attack',5],['guard',5]] },
  goblin: { hp: 34, pattern: [['attack',5],['attack',9],['attack',5]] },
  skeleton: { hp: 40, pattern: [['guard',6],['attack',10]] },
};
const rng = Math.random;
function spin(reels) {
  return reels.map(r => { const p = r.slice(); const out = [];
    for (let i = 0; i < 3; i++) out.push(p.splice(Math.floor(rng() * p.length), 1)[0]); return out; });
}
export function battle(reels, e, php = 50) {
  let ehp = e.hp, eg = 0, t = 0, taken = 0, empty = 0;
  while (true) {
    const pg0 = 0; let pg = pg0; t++;
    const o = playerOutput(resolveBoard(spin(reels)));
    if (!o.guard && !o.skillDmg && !o.attack) empty++;
    pg += o.guard;
    const hit = (d, ign) => { if (ign) { ehp -= d; } else { const ab = Math.min(eg, d); eg -= ab; ehp -= d - ab; } };
    if (o.skillDmg) { hit(o.skillDmg, false); pg += o.skillGuard; }
    if (o.attack) hit(o.attack, o.ignoreGuard);
    if (ehp <= 0) return { win: true, t, taken, empty };
    const [ty, v] = e.pattern[(t - 1) % e.pattern.length];
    eg = 0;
    if (ty === 'guard') eg = v; else { const d = Math.max(0, v - pg); taken += d; php -= d; }
    if (php <= 0) return { win: false, t, taken, empty };
  }
}
if (process.argv[1].endsWith('combat-sim.mjs')) {
  const N = +process.argv[2] || 100000;
  const A = { attack: 'attack', g: 1 }, mk = (a) => ({ a, g: 1 });
  const reel = [...Array(3).fill(mk('attack')), ...Array(2).fill(mk('guard')), mk('skill')];
  const reels = [reel, reel, reel];
  const hp = +process.argv[3] || 50;
  for (const [name, e] of Object.entries(ENEMIES)) {
    let w = 0, T = 0, D = 0, E = 0; const hist = {};
    for (let i = 0; i < N; i++) { const r = battle(reels, e, hp); if (r.win) { w++; T += r.t; D += r.taken; E += r.empty; hist[r.t] = (hist[r.t] || 0) + 1; } }
    const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
    let c = 0, p50 = 0, p90 = 0; for (const k of ks) { c += hist[k]; if (!p50 && c >= w * .5) p50 = k; if (!p90 && c >= w * .9) p90 = k; }
    console.log(name, 'hp', e.hp, 'win%', (100 * w / N).toFixed(1), 'avgTurns', (T / w).toFixed(2), 'median', p50, 'p90', p90, 'avgDmgTaken', (D / w).toFixed(1), 'avgEmpty', (E / w).toFixed(2));
  }
}
