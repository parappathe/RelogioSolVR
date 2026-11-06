// Adversários do Relógio de Sol. Todos usam a sombra de verdade (rules.shadowMap). Sem navegador.
import { legalMoves, applyMove, shadowMap, hourPoints, reach, cloneSt, PLAYER, CPU } from './rules.js';

export const OPPONENTS = [
  {
    id: 'juca', name: 'Seu Juca', title: 'o cauteloso', style: 'careful',
    desc: 'Deixa as peças onde o sol vai bater na próxima hora', color: 0x6a8a4a,
    think: 1.0, noise: 0.6, next: 1.0, attack: 0.3, depth: 1,
  },
  {
    id: 'bia', name: 'Bia', title: 'a arriscada', style: 'risky',
    desc: 'Corre para as casas de ouro e empurra o totem em cima de você', color: 0xe0603a,
    think: 0.8, noise: 1.6, next: 0.25, attack: 1.3, depth: 1,
  },
  {
    id: 'solano', name: 'Mestre Solano', title: 'pensa à frente', style: 'master',
    desc: 'Olha a sua resposta e a sombra da próxima hora', color: 0xd8a020,
    think: 1.4, noise: 0.1, next: 1, attack: 0.3, depth: 3,
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', think: 0.3, noise: 0, next: 1, attack: 0.3, depth: 3 };

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Quanto cada peça pode ganhar na próxima hora: o melhor valor ao sol que ela alcança
// (se estiver na sombra da próxima hora, fica parada onde está e não ganha nada).
function potential(st, owner, nextShadow) {
  let v = 0;
  for (const p of st.pieces) {
    if (p.owner !== owner) continue;
    if (nextShadow[p.cell]) continue;
    let best = st.val[p.cell];
    if (!p.fixed) for (const c of reach(st, p.cell)) if (!nextShadow[c] && st.val[c] > best) best = st.val[c];
    v += best;
  }
  return v;
}

// Valor para "me" de um estado: placar + o que está para pontuar nesta hora (se a hora não fechou)
// + potencial da próxima hora.
export function evaluate(st, me, o) {
  const them = 1 - me;
  let v = st.scores[me] - o.attack * st.scores[them];
  if (!st.over) {
    if (st.moved > 0) { const pts = hourPoints(st); v += pts[me] - o.attack * pts[them]; }
    if (o.next) {
      const h = st.moved > 0 ? st.hour + 1 : st.hour;
      const sh = h < st.hours ? (h === st.hour ? st.shadow : shadowMap(st, h)) : null;
      if (sh) v += o.next * (potential(st, me, sh) - o.attack * potential(st, them, sh)) * 0.5;
    }
  }
  return v;
}

export function* chooseMoveGen(st, who, o, random = Math.random) {
  const moves = legalMoves(st);
  if (!moves.length) return null;
  const scored = [];
  let n = 0;
  for (const m of moves) {
    const s2 = applyMove(st, m).st;
    scored.push({ m, s2, v: evaluate(s2, who, o) });
    if (++n % 20 === 0) yield;
  }
  if (o.depth >= 2) {
    // busca: as melhores jogadas minhas, a melhor resposta dele, e (profundidade 3) a minha de novo
    scored.sort((a, b) => b.v - a.v);
    const K = o.depth >= 3 ? 8 : 12;
    for (const c of scored.slice(0, K)) {
      const it = search(c.s2, who, o, o.depth - 1);
      let x; do { x = it.next(); if (!x.done && ++n % 4 === 0) yield; } while (!x.done);
      c.v = x.value;
    }
    scored.splice(K);
  }
  let best = null, bv = -Infinity;
  for (const c of scored) {
    const v = c.v + (o.noise ? (random() - 0.5) * o.noise : 0) - (c.m.type === 'pass' ? 0.05 : 0);
    if (v > bv) { bv = v; best = c.m; }
  }
  return best;
}
// valor do estado para "me", olhando d jogadas à frente (cada lado escolhe o melhor para si)
function* search(st, me, o, d) {
  if (d <= 0 || st.over) return evaluate(st, me, o);
  const moves = legalMoves(st);
  const mine = st.turn === me;
  const kids = moves.map(m => { const s2 = applyMove(st, m).st; return { s2, v: evaluate(s2, me, o) }; });
  yield;
  kids.sort((a, b) => (mine ? b.v - a.v : a.v - b.v));
  if (d === 1) return kids[0].v;
  let best = mine ? -Infinity : Infinity;
  for (const k of kids.slice(0, 6)) {
    const v = yield* search(k.s2, me, o, d - 1);
    if (mine ? v > best : v < best) best = v;
  }
  return best;
}
export function chooseMove(st, who, o, random = Math.random) {
  const g = chooseMoveGen(st, who, o, random);
  let x; do x = g.next(); while (!x.done);
  return x.value;
}
export function playGame(st, a, b, random) {
  let s = st, guard = 0;
  while (!s.over && guard++ < 100) s = applyMove(s, chooseMove(s, s.turn, s.turn === PLAYER ? a : b, random)).st;
  return s;
}
export { CPU, cloneSt };
