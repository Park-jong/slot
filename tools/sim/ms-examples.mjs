// Deterministic worked turns for QA (M2.5 spec), computed by the ms-engine code with the final ms-config.mjs numbers.
// Usage: node ms-examples.mjs
// Board notation: three rows top to bottom, each "X# X# X#" = reel 0, 1, 2 (A attack, G guard, S shield_bash, # grade).
import { MS } from './ms-config.mjs';
import { prepare, LINE_CELLS, ACT, AI, tallyBoard, turnOut, newOut, applyOut } from './ms-engine.mjs';

const C = prepare(structuredClone(MS));
const LINE_IDS = ['H1', 'H2', 'H3', 'V1', 'V2', 'V3', 'D1', 'D2'];
const parse = rows => Int32Array.from(rows.flatMap(r => r.split(' ')).map(t => AI[{ A: 'attack', G: 'guard', S: 'shield_bash' }[t[0]]] * 8 + +t[1]));
const sym = c => 'GSA'[c >> 3] + (c & 7);

export function workedTurn({ title, enemy, ehp, eg = 0, php, charge = 1, intentIndex = 0, spins, maxSpins = C._max }) {
  const it = enemy.pattern[intentIndex % enemy.pattern.length], incoming = it.type === 'attack' ? it.value * charge : 0;
  console.log(`\n### ${title}`);
  console.log(`state: enemy ${enemy.id} HP ${ehp} guard ${eg}; player HP ${php}; intent ${it.type} ${it.value}${charge > 1 && it.type === 'attack' ? ` x${charge} = ${incoming}` : ''}; maxSpins ${maxSpins}`);
  const tallies = [];
  spins.forEach((rows, i) => {
    const b = parse(rows), t = new Int32Array(6); tallyBoard(b, t); tallies.push(t);
    const fired = [];
    for (let l = 0; l < 8; l++) { const [x, y, z] = [b[LINE_CELLS[l * 3]], b[LINE_CELLS[l * 3 + 1]], b[LINE_CELLS[l * 3 + 2]]];
      if (x >> 3 === y >> 3 && y >> 3 === z >> 3) fired.push(`${LINE_IDS[l]} ${ACT[x >> 3]} ${(x & 7) + (y & 7) + (z & 7)}`); }
    console.log(`spin ${i + 1}: | ${[0, 1, 2].map(r => [0, 1, 2].map(c => sym(b[r * 3 + c])).join(' ')).join(' | ')} |  lines: ${fired.length ? fired.join(', ') : 'none (empty spin)'}`);
  });
  const used = spins.length, unused = maxSpins - used, focus = C.unused.mode === 'focus' ? C.unused.focusPct * unused : 0;
  const pool = new Int32Array(6); tallies.forEach(t => t.forEach((v, j) => { pool[j] += v; }));
  console.log(`stopped after ${used} of ${maxSpins} spins -> unused ${unused}, focus +${focus}%`);
  for (let a = 0; a < 3; a++) { if (!pool[a]) continue; const num = C._tier[pool[a]], P = C._pw[a];
    const d = Math.floor(P.dmg * pool[3 + a] * num * (100 + focus + C.dmgPct) / 200), g = Math.floor(P.guard * pool[3 + a] * num * (100 + focus) / 200);
    console.log(`  ${ACT[a].padEnd(11)} pooled lines ${pool[a]} gradeSum ${pool[3 + a]} tier x${num}/2 -> damage floor(${P.dmg}*${pool[3 + a]}*${num}*${100 + focus + C.dmgPct}/200) = ${d}, guard floor(${P.guard}*${pool[3 + a]}*${num}*${100 + focus}/200) = ${g}${a === 2 && pool[a] >= C.ignoreGuardAt ? ', ignore_guard' : ''}`); }
  const o = turnOut(tallies, used, C, unused, newOut());
  const after = applyOut(o, ehp, eg);
  console.log(`turn total: damage ${o.sk + o.atkN + o.atkI} (skill ${o.sk}, attack ${o.atkN + o.atkI}${o.ign ? ' ignoring guard' : ''}), player guard ${o.pg}${o.mask ? '' : '  [EMPTY TURN]'}`);
  console.log(`enemy HP ${ehp} -> ${after}${after <= 0 ? ' (defeated, enemy does not act)' : ''}`);
  if (after > 0) {
    if (it.type === 'attack') { const taken = Math.max(0, incoming - o.pg); console.log(`enemy attacks ${incoming}: guard absorbs ${Math.min(incoming, o.pg)}, player HP ${php} -> ${php - taken}`); }
    else console.log(`enemy ${it.type} ${it.value}${it.type === 'guard' ? ' (enemy guard for the next player turn)' : ' (next attack multiplied)'}; player guard ${o.pg} expires at next turn start`);
  }
  return { o, after };
}

if (process.argv[1]?.endsWith('ms-examples.mjs')) {
  const E = Object.fromEntries(C.stages.map(s => [s.id, s]));
  console.log(`config: maxSpins ${C._max}, pool ${C.pool}, tiers ${C.tiers.map(t => `${t.n}:${t.num}`).join(' ')}, ignoreGuardAt ${C.ignoreGuardAt}, focus ${C.unused.focusPct}%/unused`);
  // EXAMPLES are filled with the final numbers (see bottom of file)
  for (const ex of EXAMPLES(E)) workedTurn(ex);
}
function EXAMPLES(E) {
  return [
    { title: 'Example 1: lucky first spin, stop after spin 1 (focus x2 unused), guard covers the attack',
      enemy: E.slime, ehp: E.slime.hp, eg: 0, php: 50, intentIndex: 0,
      spins: [['A1 A1 A1', 'G1 G1 G1', 'S1 A1 S1']] },
    { title: 'Example 2: pooled tier across spins (2 + 1 attack lines = 3 -> x2 and ignore_guard), stop after spin 2',
      enemy: E.skeleton, ehp: 95, eg: E.skeleton.pattern[0].value, php: 30, intentIndex: 1,
      spins: [['A1 A1 A2', 'A1 S1 G1', 'A1 G1 S1'], ['S1 A1 G1', 'A1 A1 A1', 'G1 S1 S1']] },
    { title: 'Example 3: all 3 spins used (no focus), empty first spin, charged ogre attack',
      enemy: E.ogre, ehp: 200, eg: 0, php: 40, intentIndex: 2, charge: E.ogre.pattern[1].value,
      spins: [['A1 G1 S1', 'G1 S1 A1', 'A1 A1 G1'], ['S1 S1 S1', 'A1 G1 A1', 'A1 A1 A1'], ['G1 G1 G1', 'A2 A1 A1', 'S1 S1 G1']] },
    { title: 'Example 4: empty turn (3 empty spins): output stays 0, no fallback action',
      enemy: E.goblin_young, ehp: 50, eg: 0, php: 25, intentIndex: 1,
      spins: [['A1 G1 S1', 'G1 S1 A1', 'A1 A1 G1'], ['A1 G1 S1', 'G1 S1 A1', 'A1 A1 G1'], ['S1 A1 G1', 'G1 A1 S1', 'A1 G1 A1']] },
  ];
}
