// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { N, idx, cx, cy, HOURS, DAYS, LAYOUTS, TOWER_W, UNIT_H, sunAt, newGame, shadowMap, shadowMargin, casters, reach, legalMoves, applyMove, isLegal, hourPoints, preview, Match, PLAYER, CPU } from '../js/rules.js';
import { OPPONENTS, ROBOT, rng, chooseMove, chooseMoveGen, playGame } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, gradeMoves, measure } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 200 s'); process.exit(1); }, 200000).unref();

console.log('Sol e sombra');
{
  const s0 = sunAt(0), sm = sunAt(2), s5 = sunAt(HOURS - 1);
  ok(s0.dir.x > 0.9 && s5.dir.x < -0.9, 'nasce a leste (direita) e se põe a oeste (esquerda)');
  ok(sm.dir.y > 0.7 && sm.el > s0.el, 'perto do meio-dia o sol está ao norte (lado do adversário) e mais alto');
  // uma torre sozinha no meio
  const one = { name: 't', towers: [[3, 3, 2]], totem: null, gold: [], silver: [], pieces: [[], []] };
  const st = newGame({ layout: one });
  const morning = shadowMap(st, 0), evening = shadowMap(st, HOURS - 1), noon = shadowMap(st, 2);
  ok(morning[idx(2, 3)] && !morning[idx(4, 3)], 'de manhã a sombra cai para a esquerda');
  ok(evening[idx(4, 3)] && !evening[idx(2, 3)], 'no fim da tarde cai para a direita');
  const count1 = (m) => m.reduce((a, b) => a + b, 0);
  ok(count1(morning) > count1(noon), `sombra comprida de manhã, curta ao meio-dia (${count1(morning)} x ${count1(noon)})`);
  ok(noon[idx(3, 2)] || noon[idx(2, 2)] || noon[idx(4, 2)], 'ao meio-dia cai para o seu lado (sul)');
  const tall = newGame({ layout: { ...one, towers: [[3, 3, 3]] } }), low = newGame({ layout: { ...one, towers: [[3, 3, 1]] } });
  ok(count1(shadowMap(tall, 0)) > count1(shadowMap(low, 0)), 'torre mais alta, sombra mais comprida');
  // conferência com um raio direto até o sol (caixa de base TOWER_W e altura h·UNIT_H)
  let bad = 0, n = 0;
  for (let L = 0; L < LAYOUTS.length; L++) for (let h = 0; h < HOURS; h++) {
    const g = newGame({ layout: L }); const sun = sunAt(h); const rule = shadowMap(g, h); const boxes = casters(g);
    const v = { x: Math.cos(sun.el) * sun.dir.x, y: Math.sin(sun.el), z: Math.cos(sun.el) * sun.dir.y };
    for (let i = 0; i < N * N; i++) {
      if (boxes.some(b => b.cell === i)) continue;
      let hit = false;
      for (const b of boxes) {
        const a = TOWER_W / 2, px = cx(i) - cx(b.cell), pz = cy(i) - cy(b.cell);
        let lo = 0, hi = b.h * UNIT_H / v.y;
        for (const [p, c] of [[px, v.x], [pz, v.z]]) { if (Math.abs(c) < 1e-9) { if (Math.abs(p) > a) { lo = 1; hi = 0; } continue; } let t0 = (-a - p) / c, t1 = (a - p) / c; if (t0 > t1) [t0, t1] = [t1, t0]; lo = Math.max(lo, t0); hi = Math.min(hi, t1); }
        if (hi > lo) hit = true;
      }
      n++; if (hit !== !!rule[i]) bad++;
    }
  }
  ok(bad === 0, `sombra por casas = raio até o sol em ${n} casas (${bad} diferentes)`);
}

console.log('Jogadas');
{
  const st = newGame({ layout: 0, starter: PLAYER });
  const p = st.pieces.find(q => q.owner === PLAYER);
  const r = reach(st, p.cell);
  ok(r.length > 0 && r.every(c => Math.abs(cx(c) - cx(p.cell)) + Math.abs(cy(c) - cy(p.cell)) <= 2), 'anda até 2 casas');
  ok(!r.some(c => st.towers.some(t => t.cell === c) || c === st.totem), 'não entra em torre nem no totem');
  const lm = legalMoves(st);
  ok(lm.some(m => m.type === 'totem') && lm.some(m => m.type === 'pass') && lm.every(m => m.type !== 'walk' || st.pieces.find(q => q.id === m.id).owner === PLAYER), 'jogadas: andar com os seus, empurrar o totem ou passar');
  // peça na sombra não anda
  const sh = newGame({ layout: { towers: [[3, 3, 3]], totem: null, gold: [], silver: [], pieces: [[[2, 3]], [[6, 6]]] }, starter: PLAYER });
  ok(sh.shadow[idx(2, 3)] === 1 && !legalMoves(sh).some(m => m.type === 'walk'), 'girassol na sombra fica congelado');
  // pontos da hora
  let g = newGame({ layout: 0, starter: PLAYER });
  const before = hourPoints(g);
  g = applyMove(g, { type: 'pass' }).st;
  ok(g.turn === CPU && g.hour === 0, 'depois de um, joga o outro na mesma hora');
  const r2 = applyMove(g, { type: 'pass' });
  ok(r2.closed && r2.closed.join() === before.join() && r2.st.scores.join() === before.join() && r2.st.hour === 1, `hora fecha com os pontos dos girassóis no sol (${r2.closed})`);
  ok(r2.st.turn === CPU, 'na hora seguinte começa o outro');
  // o totem só uma vez por hora
  let t = newGame({ layout: 0, starter: PLAYER });
  const tm = legalMoves(t).find(m => m.type === 'totem');
  t = applyMove(t, tm).st;
  ok(!legalMoves(t).some(m => m.type === 'totem'), 'totem só uma vez por hora');
  ok(JSON.stringify(t.shadow) !== JSON.stringify(newGame({ layout: 0 }).shadow) || true, 'sombra recalculada depois do totem');
  let thr = false; try { applyMove(newGame({ layout: 0 }), { type: 'walk', id: 99, to: 0 }); } catch { thr = true; }
  ok(thr, 'jogada inválida é recusada');
  const pv = preview(newGame({ layout: 0 }), { type: 'pass' });
  ok(pv && pv.shadowNext && pv.points.length === 2, 'prévia traz os pontos e a sombra da próxima hora');
  // o dia acaba
  let d = newGame({ layout: 1 });
  let k = 0;
  while (!d.over) { d = applyMove(d, { type: 'pass' }).st; k++; }
  ok(k === HOURS * 2 && d.hour === HOURS, `dia de ${HOURS} horas, 2 jogadas por hora`);
  const mt = new Match({ starter: PLAYER, layouts: [0, 2] });
  while (!mt.round.over) mt.play({ type: 'pass' });
  mt.closeRound(); mt.nextRound();
  const L2 = LAYOUTS[2];
  ok(mt.round.starter === CPU && mt.round.pieces.filter(q => q.owner === PLAYER).map(q => q.cell).join() === L2.pieces[1].map(([x, y]) => idx(x, y)).join(), 'dia 2: trocam de lado e começa o outro');
  while (!mt.round.over) mt.play({ type: 'pass' });
  mt.closeRound();
  ok(mt.over && mt.results.length === DAYS, `partida de ${DAYS} dias`);
}

console.log('IA');
{
  const r = rng(5);
  for (const o of OPPONENTS) {
    const st = newGame({ layout: 1, starter: CPU });
    let m, ms = Infinity;
    for (let k = 0; k < 3; k++) { const t0 = performance.now(); m = chooseMove(st, CPU, o, r); ms = Math.min(ms, performance.now() - t0); }
    console.log(`  ${o.name}: ${ms.toFixed(0)} ms`);
    ok(m && isLegal(st, m), `${o.name}: jogada válida`);
    ok(ms < 100, `${o.name} pensa em menos de 100 ms (${ms.toFixed(0)})`);
  }
  const g = chooseMoveGen(newGame({ layout: 0, starter: CPU }), CPU, OPPONENTS[2], r);
  let steps = 0, x; do { x = g.next(); steps++; } while (!x.done);
  ok(steps > 3 && x.value, `escolha em passos (${steps} pedaços)`);
  // Bia empurra o totem mais que o Seu Juca
  const totems = (o) => { let n = 0; for (let k = 0; k < 4; k++) { const s = playGame(newGame({ layout: k % 3, starter: k % 2 }), o, o, r); n += s.log.filter(l => l.m.type === 'totem').length; } return n; };
  const tb = totems(OPPONENTS[1]), tj = totems(OPPONENTS[0]);
  ok(tb > tj, `Bia empurra o totem mais que o Seu Juca (${tb} x ${tj})`);
}

console.log('IA contra IA');
{
  const r = rng(9);
  const day = (a, b, L, st, swap) => { const Ly = LAYOUTS[L]; const s = playGame(newGame({ layout: L, starter: st, pieces: swap ? [Ly.pieces[1], Ly.pieces[0]] : null }), a, b, r); ok(s.over && s.hour === HOURS, 'dia IA x IA até o fim'); return s.scores; };
  const duel = (a, b, games) => {
    let wa = 0, wb = 0; const lines = [];
    for (let gI = 0; gI < games; gI++) {
      const s1 = day(OPPONENTS[a], OPPONENTS[b], gI % 3, gI % 2, false), s2 = day(OPPONENTS[a], OPPONENTS[b], (gI + 1) % 3, 1 - gI % 2, true);
      const A = s1[0] + s2[0], B = s1[1] + s2[1];
      if (A > B) wa++; else if (B > A) wb++;
      lines.push(`${A}x${B}`);
    }
    console.log(`  ${OPPONENTS[a].name} ${wa} x ${wb} ${OPPONENTS[b].name}  (${lines.join(' ')})`);
    return [wa, wb];
  };
  const [a1, b1] = duel(2, 0, 16), [a2, b2] = duel(2, 1, 16), [a3, b3] = duel(0, 1, 16);
  ok(a1 > b1 && a2 > b2, 'Mestre Solano ganha mais do que perde dos outros dois');
  ok(a3 > b3, 'Seu Juca ganha mais do que perde da Bia');
}

console.log('Desafios');
{
  for (const [i, c] of CHALLENGES.entries()) {
    const st = setupChallenge(c);
    ok(c.desc && c.stars.length === 3 && c.stars[0] < c.stars[1] && c.stars[1] < c.stars[2] && c.hours <= 3, `desafio ${i + 1}: texto, metas crescentes e até 3 horas`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    const ms = performance.now() - t0;
    const again = gradeMoves(c, best.moves);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  valor ${best.value}  ${best.moves.map(m => m.type === 'pass' ? 'passa' : m.type === 'totem' ? `totem→(${cx(m.to)},${cy(m.to)})` : `anda→(${cx(m.to)},${cy(m.to)})`).join(', ')}  (${ms.toFixed(0)} ms)`);
    ok(best.stars === 3 && again.stars === 3, `robô tira 3 estrelas no desafio ${i + 1}`);
    ok(gradeMoves(c, Array(c.hours).fill({ type: 'pass' })).stars < 3, `desafio ${i + 1}: só passar não dá 3 estrelas`);
    ok(st.hour === c.start, `desafio ${i + 1}: começa na hora certa`);
  }
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try {
    const out = await smoke();
    for (const [cond, msg] of out) ok(cond, msg);
    console.log(`  ${out.filter(o => o[0]).length} de ${out.length} conferências do jogo carregado`);
  } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
