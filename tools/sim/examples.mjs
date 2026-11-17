import { resolveBoard, playerOutput } from './combat-sim.mjs';
const P = (s) => s.split(' ').map(t => ({ a: {A:'attack',G:'guard',S:'skill'}[t[0]], g: +t[1] }));
// rows -> board[reel][row]
const fromRows = (rows) => [0,1,2].map(r => rows.map(row => P(row)[r]));
const ex = {
 ex1: ['A1 A3 A1','G1 S1 G1','S1 G1 S1'],
 ex2: ['A1 A1 G1','A2 A1 G1','A1 A3 G2'],
 ex3: ['G1 S1 A1','G1 S2 A1','G2 S1 A1'],
};
for (const [k, rows] of Object.entries(ex)) { const by = resolveBoard(fromRows(rows)); console.log(k, JSON.stringify(by), JSON.stringify(playerOutput(by))); }
