// Shared M2 rules engine for the Monte Carlo scripts (mirrors docs/specs/m2-run-spec.md).
// Symbols are { a: actionId, g: grade }. All numbers live in CFG (run-config.mjs).
export const LINES = [[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[7,5,3]]
  .map(l => l.map(n => [(n - 1) % 3, Math.floor((n - 1) / 3)])); // [reel,row]
export const ACTS = ['guard', 'shield_bash', 'attack']; // resolution order

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function spin(reels, rng) {
  return reels.map(r => { const p = r.slice(); const out = [];
    for (let i = 0; i < 3; i++) out.push(p.splice(Math.floor(rng() * p.length), 1)[0]); return out; });
}
export function judge(b) { // -> { action: { n, sum } }
  const by = {};
  for (const l of LINES) {
    const c = l.map(([r, w]) => b[r][w]);
    if (c[0].a === c[1].a && c[1].a === c[2].a) {
      const e = (by[c[0].a] ??= { n: 0, sum: 0 }); e.n++; e.sum += c[0].g + c[1].g + c[2].g;
    }
  }
  return by;
}
export function tierNum(tiers, n) { let num = 0, best = 0; for (const t of tiers) if (t.n <= n && t.n >= best) { best = t.n; num = t.num; } return num; }
export function output(by, CFG) {
  const o = { guard: 0, dmg: 0, ignore: false, fired: {} };
  for (const a of ACTS) {
    const x = by[a]; if (!x) continue; o.fired[a] = x.n;
    const num = tierNum(CFG.tiers, x.n), P = CFG.actions[a];
    const dmg = Math.floor(P.dmg * x.sum * num / 2), gd = Math.floor(P.guard * x.sum * num / 2);
    o.guard += gd; o.dmg += dmg; // order matters only vs enemy guard; handled in battle()
    (o.parts ??= []).push({ a, dmg, gd, n: x.n });
    if (a === 'attack' && x.n >= CFG.ignoreGuardAt) o.ignore = true;
  }
  return o;
}

/** One battle. Returns { win, turns, empty, hpAfter, fired }. php = player HP at start. */
export function battle(reels, enemy, php, CFG, rng) {
  let ehp = enemy.hp, eg = 0, t = 0, empty = 0, ci = 0, charge = 1;
  const fired = { guard: 0, shield_bash: 0, attack: 0 };
  for (;;) {
    t++; let pg = 0;
    const o = output(judge(spin(reels, rng)), CFG);
    if (!o.parts) empty++;
    for (const p of o.parts ?? []) {
      fired[p.a]++;
      const hit = (d, ign) => { if (ign) ehp -= d; else { const ab = Math.min(eg, d); eg -= ab; ehp -= d - ab; } };
      if (p.a === 'guard') pg += p.gd;
      else if (p.a === 'shield_bash') { hit(p.dmg, false); pg += p.gd; }
      else hit(p.dmg, o.ignore);
    }
    if (ehp <= 0) return { win: true, turns: t, empty, hpAfter: php, fired };
    const it = enemy.pattern[ci++ % enemy.pattern.length]; eg = 0;
    if (it.type === 'guard') eg = it.value;
    else if (it.type === 'charge') charge = it.value;
    else { const v = it.value * charge; charge = 1; php -= Math.max(0, v - pg); }
    if (php <= 0) return { win: false, turns: t, empty, hpAfter: 0, fired };
  }
}

const ACT_IDS = ['attack', 'guard', 'shield_bash'];
/** Reward offers after clearing battle k (1..5): 3 distinct (action, grade) combos, weight = actionW * gradeW[k-1][grade-1], drawn without replacement. */
export function offers(k, rng, CFG) {
  const gw = CFG.poolGradeW[k - 1], items = [];
  for (const a of ACT_IDS) gw.forEach((w, i) => { const ww = w * CFG.poolActionW[a]; if (ww > 0) items.push({ a, g: i + 1, w: ww }); });
  const out = [];
  for (let n = 0; n < 3; n++) {
    const tot = items.reduce((x, y) => x + y.w, 0); let r = rng() * tot, idx = 0;
    for (; idx < items.length - 1; idx++) { r -= items[idx].w; if (r < 0) break; }
    out.push({ a: items[idx].a, g: items[idx].g }); items.splice(idx, 1);
  }
  return out;
}
