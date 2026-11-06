// Desafios do Relógio de Sol: só você joga (uma jogada por hora), por poucas horas. As peças azuis
// não andam, mas pontuam quando estão no sol. O robô faz busca completa. Sem navegador.
import { newGame, applyMove, legalMoves, PLAYER, CPU } from './rules.js';

// layout: towers [x,y,andares], totem [x,y] ou null, gold/silver, pieces: [[suas]], fixed: azuis paradas
// start: hora em que começa (0 = 7h), hours: quantas horas joga
export const CHALLENGES = [
  {
    name: 'Bom dia', start: 0, hours: 2, metric: 'mine', stars: [2, 3, 4],
    desc: 'Sol baixo, sombra comprida. Leve o girassol para o ouro no sol.',
    layout: { towers: [[4, 3, 3]], totem: null, gold: [[3, 3], [2, 5]], silver: [[2, 3]], pieces: [[[2, 1]]], fixed: [] },
  },
  {
    name: 'A sombra anda', start: 1, hours: 3, metric: 'mine', stars: [5, 7, 9],
    desc: 'A sombra da torre vai varrer o ouro. Olhe a prévia da próxima hora.',
    layout: { towers: [[3, 3, 3]], totem: null, gold: [[2, 3], [4, 3], [3, 1]], silver: [], pieces: [[[3, 0]]], fixed: [] },
  },
  {
    name: 'Meio-dia', start: 2, hours: 2, metric: 'mine', stars: [5, 6, 7],
    desc: 'Sombras curtas, mas bem embaixo do ouro. Dois girassóis, duas horas.',
    layout: { towers: [[2, 4, 3], [4, 4, 3]], totem: null, gold: [[2, 3], [4, 3], [3, 3]], silver: [[3, 2]], pieces: [[[2, 1], [4, 1]]], fixed: [] },
  },
  {
    name: 'Totem', start: 0, hours: 2, metric: 'diff', stars: [-5, -3, -1],
    desc: 'Empurre o totem para a sombra dele cobrir os azuis.',
    layout: { towers: [], totem: [4, 3], gold: [[2, 3], [1, 3]], silver: [], pieces: [[[5, 1]]], fixed: [[2, 3], [1, 3]] },
  },
  {
    name: 'Atravessar', start: 0, hours: 3, metric: 'mine', stars: [3, 4, 5],
    desc: 'O ouro está do outro lado das torres. Ande pelo sol da manhã.',
    layout: { towers: [[1, 3, 2], [3, 3, 3], [5, 3, 2]], totem: null, gold: [[2, 5], [4, 5]], silver: [[3, 5]], pieces: [[[3, 1]]], fixed: [] },
  },
  {
    name: 'Fim de tarde', start: 4, hours: 2, metric: 'mine', stars: [3, 4, 5],
    desc: 'Sol a oeste, sombras compridas para a direita. Dois girassóis.',
    layout: { towers: [[3, 2, 3], [3, 4, 3]], totem: null, gold: [[4, 2], [4, 4], [5, 3]], silver: [[4, 3]], pieces: [[[0, 3], [1, 1]]], fixed: [] },
  },
  {
    name: 'Três girassóis', start: 1, hours: 3, metric: 'mine', stars: [10, 12, 13],
    desc: 'Três peças e três horas: cada hora só uma anda.',
    layout: { towers: [[3, 3, 2], [1, 5, 3]], totem: [5, 4], gold: [[2, 3], [4, 3], [3, 4]], silver: [[3, 2], [2, 4], [4, 4]], pieces: [[[1, 1], [3, 1], [5, 1]]], fixed: [] },
  },
  {
    name: 'Sombra emprestada', start: 2, hours: 3, metric: 'diff', stars: [-10, -8, -6],
    desc: 'Use o totem para apagar o azul e ainda pontuar.',
    layout: { towers: [[1, 1, 2]], totem: [3, 3], gold: [[3, 4], [4, 1]], silver: [[2, 4]], pieces: [[[5, 1]]], fixed: [[3, 4], [2, 4]] },
  },
  {
    name: 'Cerca de pedra', start: 0, hours: 3, metric: 'mine', stars: [5, 7, 8],
    desc: 'Torres para todo lado. Ache o caminho de sol até o ouro.',
    layout: { towers: [[2, 1, 2], [4, 1, 2], [1, 3, 3], [5, 3, 3], [3, 4, 1]], totem: null, gold: [[3, 3], [3, 5]], silver: [[2, 3], [4, 3]], pieces: [[[3, 0], [0, 0]]], fixed: [] },
  },
  {
    name: 'Dia de sol', start: 3, hours: 3, metric: 'diff', stars: [-5, -3, -1],
    desc: 'Tarde inteira contra os azuis, que estão no ouro. Pontue e apague.',
    layout: { towers: [[2, 3, 3], [5, 5, 2]], totem: [3, 4], gold: [[3, 3], [4, 4], [3, 5]], silver: [[2, 5], [4, 3]], pieces: [[[1, 1], [3, 1], [5, 1]]], fixed: [[3, 5], [2, 5]] },
  },
];

export function setupChallenge(c) {
  const st = newGame({ layout: { name: c.name, solo: true, ...c.layout }, starter: PLAYER, hour: c.start, hours: c.start + c.hours });
  return st;
}
export function measure(c, st) {
  const s = st.scores;
  return c.metric === 'diff' ? s[PLAYER] - s[CPU] : s[PLAYER];
}
export function starsFor(c, v) { let n = 0; for (const t of c.stars) if (v >= t) n++; return n; }
export const metricName = (c) => (c.metric === 'diff' ? 'saldo (seus pontos menos os azuis)' : 'pontos');
export const goalText = (c) => `Estrelas por ${metricName(c)}: ${c.stars.map((t, i) => `${'★'.repeat(i + 1)} ${t}`).join('   ')}`;

export function gradeMoves(c, moves) {
  let st = setupChallenge(c);
  for (const m of moves) st = applyMove(st, m).st;
  return { value: measure(c, st), stars: starsFor(c, measure(c, st)), st };
}

// Busca completa (com memória por posição) — gerador para não travar o quadro
export function* bestChallengeGen(c) {
  const memo = new Map();
  let n = 0;
  const key = (st) => `${st.hour}|${st.totem}|${st.pieces.map(p => p.cell).join(',')}|${st.scores.join(',')}`;
  function* go(st) {
    if (st.over) return { v: measure(c, st), moves: [] };
    const k = key(st);
    if (memo.has(k)) return memo.get(k);
    let best = null;
    for (const m of legalMoves(st)) {
      const r = yield* go(applyMove(st, m).st);
      if (!best || r.v > best.v) best = { v: r.v, moves: [m, ...r.moves] };
      if (++n % 200 === 0) yield;
    }
    memo.set(k, best);
    return best;
  }
  const r = yield* go(setupChallenge(c));
  return { value: r.v, stars: starsFor(c, r.v), moves: r.moves };
}
export function solveChallenge(c) {
  const g = bestChallengeGen(c);
  let x; do x = g.next(); while (!x.done);
  return x.value;
}
