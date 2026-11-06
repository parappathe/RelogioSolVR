// Liga as regras e a IA à cena, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { N, PLAYER, CPU, HOURS, DAYS, HOUR_LABEL, LAYOUTS, Match, applyMove, legalMoves, isLegal, preview, nextShadow, shadowMap, shadowMargin, casters, sunAt, sunLerp, reach, frozen, cx, cy } from './rules.js';
import { OPPONENTS, ROBOT, rng, chooseMoveGen } from './ai.js';
import { CHALLENGES, setupChallenge, bestChallengeGen, measure, starsFor, goalText, metricName } from './challenges.js';
import { buildWorld, TABLE, S, BOARD_Y, cellPos, cellAtXZ, sunVector } from './scene.js';
import { createShell } from './shell.js';
import { setTheme, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

setTheme({
  bg: 'rgba(252,246,230,0.97)', edge: '#d8841a', text: '#3a2a1a', dim: '#7a6a52', btn: '#f2e2c0', btnHover: '#ffd88a',
  btnOn: '#d8841a', btnOnText: '#ffffff', lock: '#e8dcc6', star: '#f0a020', labelBg: 'rgba(252,246,230,0.92)',
  title: 'bold 58px Georgia, serif',
});

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GRAB_DIST = 0.07;
const SUN_T = 1.6;
const STAND = { x: TABLE.x, z: TABLE.z + 0.6 };
const BOARD_CENTER = new THREE.Vector3(TABLE.x, BOARD_Y, TABLE.z);

const world = buildWorld();
const { scene } = world;
const shell = createShell({ scene, sfx, save, storeSave, stand: STAND, shadows: true, exposure: 1.0, statusPos: new THREE.Vector3(TABLE.x, 1.92, TABLE.z - 0.6), hooks: {} });
const { renderer, camera, panel } = shell;
shell.orbit.target.copy(BOARD_CENTER).add(new THREE.Vector3(0, 0.12, -0.16));
shell.orbit.dist = 1.2; shell.orbit.pitch = 0.95; shell.orbit.keys = 'wasd';
const menuCam = (t) => ({ pos: new THREE.Vector3(TABLE.x + Math.sin(t * 0.1) * 1.2, 1.7, TABLE.z + 1.6), look: new THREE.Vector3(TABLE.x, 1.2, TABLE.z - 4) });
const previewLabel = new Label(0.34, 768, 160);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);

// ---------- Estado ----------
let app = 'menu', mode = 'match', match = null, ch = null, oppIndex = 0;
let phase = 'idle';          // 'intro' | 'turn' | 'think' | 'anim' | 'sun' | 'roundEnd' | 'over'
let time = 0, msg = null, random = rng((Date.now() % 100000) + 1);
let thinker = null, thinkT = 0, timerAuto = 0, chResult = null;
let sel = null;              // { kind: 'piece', id } | { kind: 'totem' }
let held = null;             // VR: { entry, sel, cell }
let hoverCell = -1;
let sunAnim = null;          // { h0, h1, t }
const opponent = () => OPPONENTS[oppIndex];
const cur = () => (mode === 'match' ? match?.round : ch?.st);
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const pieceMeshes = new Map();
const movers = [];

function clearAll() {
  for (const m of pieceMeshes.values()) scene.remove(m);
  pieceMeshes.clear();
  timers.length = 0; movers.length = 0; sunAnim = null; sel = null; held = null;
  world.showReach(null); world.selMark.visible = false; world.hoverMark.visible = false;
  hidePreview();
}
function syncPieces(st, snap = false) {
  const ids = new Set(st.pieces.map(p => p.id));
  for (const [id, m] of pieceMeshes) if (!ids.has(id)) { scene.remove(m); pieceMeshes.delete(id); }
  for (const p of st.pieces) {
    let m = pieceMeshes.get(p.id);
    if (!m) { m = world.makePiece(p.owner); scene.add(m); pieceMeshes.set(p.id, m); snap = true; }
    if (snap || !movers.some(v => v.mesh === m)) cellPos(p.cell, m.position);
    m.rotation.y = p.owner === PLAYER ? 0 : Math.PI;
  }
  if (st.totem >= 0) { world.totem.visible = true; if (snap || !movers.some(v => v.mesh === world.totem)) cellPos(st.totem, world.totem.position); }
  else world.totem.visible = false;
}
function setupBoard(st) {
  world.setBoard(st);
  world.setTowers(st);
  world.setSun(sunAt(st.hour));
  syncPieces(st, true);
  for (const p of st.pieces) world.setDroop(pieceMeshes.get(p.id), st.shadow[p.cell] ? 1 : 0);
}

// ---------- Partidas e desafios ----------
function pickLayouts() { const a = Math.floor(random() * LAYOUTS.length); let b = Math.floor(random() * (LAYOUTS.length - 1)); if (b >= a) b++; return [a, b]; }
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU, layouts: pickLayouts() });
  ch = null;
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${o.name} começa.`, t: 3.5 };
}
function startRound() {
  app = 'play'; shell.hidePanel();
  clearAll();
  setupBoard(cur());
  placeForPlay();
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k, st: setupChallenge(CHALLENGES[k]), plan: null };
  match = null;
  world.avatar.setStyle('master', 0x8a7a6a);
  app = 'play';
  clearAll();
  setupBoard(ch.st);
  msg = null; chResult = null;
  placeForPlay();
  if (skipIntro || dev.autoplay) { shell.hidePanel(); beginTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function beginTurn() {
  const st = cur();
  thinker = null; sel = null; world.showReach(null); world.selMark.visible = false;
  if (st.over) { endOfRound(); return; }
  if (st.turn === PLAYER) { phase = 'turn'; thinkT = 0; }
  else {
    phase = 'think'; thinkT = 0;
    world.avatar.state.thinking = true;
    thinker = { gen: chooseMoveGen(st, CPU, opponent(), random), done: false, result: null };
  }
  updateHint();
}
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do { const x = thinker.gen.next(); if (x.done) { thinker.done = true; thinker.result = x.value; return; } } while (performance.now() - t0 < budgetMs);
}

// Faz a jogada e anima: a peça anda casa por casa (ou o totem desliza); se a hora fechou, pontua e o sol anda.
function doMove(m, from = null) {
  const st = cur();
  if (!st || (phase !== 'turn' && phase !== 'think') || !isLegal(st, m)) return false;
  const who = st.turn;
  const before = st;
  let r;
  if (mode === 'match') r = match.play(m);
  else { r = applyMove(ch.st, m); ch.st = r.st; }
  phase = 'anim';
  hidePreview();
  sel = null; held = null; world.showReach(null); world.selMark.visible = false; world.hoverMark.visible = false;
  if (who === CPU) world.avatar.state.thinking = false;
  let dur = 0.25;
  if (m.type === 'walk') {
    const mesh = pieceMeshes.get(m.id);
    const p0 = before.pieces.find(p => p.id === m.id);
    const path = pathTo(before, p0.cell, m.to).map(c => cellPos(c));
    if (from) path[0] = from.clone();
    dur = 0.25 * (path.length - 1) + 0.05;
    movers.push({ mesh, path, t0: time, dur, hop: !from });
    later(dur, () => sfx.step());
  } else if (m.type === 'totem') {
    const a = from ? from.clone() : cellPos(before.totem), b = cellPos(m.to);
    dur = 0.4;
    movers.push({ mesh: world.totem, path: [a, b], t0: time, dur, hop: false });
    sfx.slide();
  } else { sfx.pass(); }
  const name = who === PLAYER ? 'Você' : mode === 'match' ? opponent().name : '';
  msg = { text: m.type === 'pass' ? `${name} passou a vez.` : m.type === 'totem' ? `${name} empurrou o totem.` : `${name} andou.`, t: 2 };
  later(dur + 0.15, () => afterMove(r, before));
  return true;
}
function pathTo(st, from, to) {
  // menor caminho por casas livres (até 2 passos)
  const prev = new Map([[from, -1]]);
  let fr = [from];
  for (let k = 0; k < 3 && !prev.has(to); k++) {
    const nx = [];
    for (const c of fr) for (const n of reach(st, c, 1)) if (!prev.has(n)) { prev.set(n, c); nx.push(n); }
    fr = nx;
  }
  const out = [to];
  let c = to;
  while (prev.get(c) !== -1 && prev.has(c)) { c = prev.get(c); out.unshift(c); }
  if (out[0] !== from) out.unshift(from);
  return out;
}
function afterMove(r, before) {
  const st = cur();
  syncPieces(st);
  if (r.closed) {
    const [a, b] = r.closed;
    const other = mode === 'match' ? opponent().name : 'azuis';
    msg = { text: `Fim das ${HOUR_LABEL[before.hour]}: você +${a}, ${other} +${b}.`, t: 3.5 };
    if (a > b) sfx.good(); else if (b > a) sfx.bad(); else sfx.click();
    if (mode === 'match') { if (b > a + 2) world.avatar.react(1, 1.5); else if (a > b + 2) world.avatar.react(-1, 1.5); }
    if (st.over) { later(0.6, () => endOfRound()); return; }
    phase = 'sun';
    sunAnim = { h0: before.hour, h1: st.hour, t: 0 };
    sfx.sunMove();
    return;
  }
  beginTurn();
}
function updateSun(dt) {
  if (!sunAnim) return;
  sunAnim.t += dt;
  const k = clamp(sunAnim.t / SUN_T, 0, 1);
  const e = k * k * (3 - 2 * k);
  world.setSun(sunLerp(sunAnim.h0, sunAnim.h1, e));
  if (k >= 1) { sunAnim = null; world.setSun(sunAt(cur().hour)); beginTurn(); }
}
function updateMovers() {
  for (let i = movers.length - 1; i >= 0; i--) {
    const v = movers[i];
    const k = clamp((time - v.t0) / v.dur, 0, 1);
    const segs = v.path.length - 1;
    const f = k * segs, j = Math.min(segs - 1, Math.floor(f)), u = f - j;
    v.mesh.position.lerpVectors(v.path[j], v.path[j + 1], u);
    if (v.hop) v.mesh.position.y += Math.sin(Math.PI * u) * 0.02;
    if (k >= 1) { v.mesh.position.copy(v.path[segs]); movers.splice(i, 1); }
  }
}
// girassóis murcham na sombra (pela regra) — durante a troca de hora seguem a sombra da hora nova
function updateDroop(dt) {
  const st = cur();
  if (!st) return;
  const shadow = sunAnim ? null : st.shadow;
  for (const p of st.pieces) {
    const m = pieceMeshes.get(p.id);
    if (!m) continue;
    let target = shadow ? shadow[p.cell] : m.userData.droop > 0.5 ? 1 : 0;
    if (sunAnim && sunAnim.t / SUN_T > 0.6) target = st.shadow[p.cell];
    const v = m.userData.droop + (target - m.userData.droop) * Math.min(1, dt * 5);
    world.setDroop(m, v);
  }
}

function endOfRound() {
  if (mode === 'challenge') { finishChallenge(); return; }
  match.closeRound();
  phase = match.over ? 'over' : 'roundEnd';
  const r = match.results[match.results.length - 1].score;
  if (match.over) {
    save.games[oppIndex]++;
    if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1, 3); }
    else if (match.winner === CPU) { sfx.bad(); world.avatar.react(1, 3); }
    storeSave(save);
    showScreen('over');
  } else {
    if (r[0] > r[1]) { sfx.good(); world.avatar.react(-1, 2); } else if (r[1] > r[0]) { sfx.bad(); world.avatar.react(1, 2); }
    showScreen('roundEnd');
  }
  timerAuto = 2.5;
  updateHint();
}
function nextRound() {
  match.nextRound();
  startRound();
  msg = { text: `Dia 2: vocês trocaram de lado. ${match.round.starter === PLAYER ? 'Você começa.' : `${opponent().name} começa.`}`, t: 3.5 };
}
function finishChallenge() {
  phase = 'over';
  const c = CHALLENGES[ch.i];
  const value = measure(c, ch.st);
  const stars = starsFor(c, value);
  chResult = { stars, value };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu'; phase = 'idle';
  shell.orbit.menu = menuCam; shell.orbit.snap = true;
  match = null; ch = null;
  clearAll();
  const demo = setupChallenge(CHALLENGES[6]);
  setupBoard(demo);
  world.avatar.setStyle('careful', OPPONENTS[0].color);
  world.avatar.state.thinking = false;
  if (shell.vr) shell.recenter();
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; shell.hidePanel(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = shell.vr;
  shell.showPanel((p) => {
    if (name === 'main') {
      p.title('Relógio de Sol', 72);
      p.text('O sol anda, as torres fazem sombra: girassol na sombra não anda nem pontua', 512, 130, { size: 25, color: '#7a6a52' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Prévia: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#d8841a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#7a6a52' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` }));
      p.text(`${DAYS} dias de ${HOURS} horas. No segundo dia vocês trocam de lado.`, 512, 600, { size: 24, color: '#7a6a52' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#7a6a52' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        `Cada um tem 3 girassóis. O dia tem ${HOURS} horas; em cada hora cada um faz 1 jogada:`,
        'andar um girassol até 2 casas, empurrar o totem 1 casa ou passar.',
        'Girassol na sombra murcha: não anda e não pontua naquela hora.',
        'Fim da hora: cada girassol no sol ganha o valor da casa (1, 2 ou 3 sóis).',
        'Depois o sol anda e as sombras mudam. As listras mostram a sombra da próxima hora.',
        'O totem também faz sombra: empurre para apagar os do outro (1 vez por hora).',
        vr ? 'VR: aperto pega o girassol ou o totem; solte na casa. A ou X: passar.' : 'PC: clique no girassol (ou totem) e na casa verde. Espaço: passar.',
        vr ? 'De longe: aponte e gatilho na peça e depois na casa. B ou Y: pausa.' : 'Botão direito ou A/D/W/S: girar a câmera. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 40, 124 + i * 54, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · Dia ${match.index + 1} de ${DAYS}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#7a6a52' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); shell.recenter(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'roundEnd') {
      const r = match.results[match.results.length - 1];
      p.title('Fim do dia 1', 66);
      p.text(`Você ${r.score[0]} x ${r.score[1]} ${opponent().name}`, 512, 150, { size: 40, bold: true, color: r.score[0] > r.score[1] ? '#d8641a' : r.score[1] > r.score[0] ? '#2a6ad8' : '#3a2a1a' });
      p.text('No dia 2 vocês trocam de lado: quem estava no sul vai para o norte.', 512, 212, { size: 26, color: '#7a6a52' });
      p.text(`Tabuleiro do dia 2: ${LAYOUTS[match.layouts[1]].name}`, 512, 262, { size: 26, color: '#7a6a52' });
      p.button('Próximo dia', () => nextRound(), 262, 320, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 450, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Dias: ${match.results.map(r => `${r.score[0]}-${r.score[1]}`).join('   ')}`, 512, 210, { size: 28, color: '#7a6a52' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#7a6a52' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66);
      p.text(c.desc, 512, 150, { size: 27 });
      p.text(`Das ${HOUR_LABEL[c.start]}, por ${c.hours} hora(s), uma jogada por hora. Os azuis não andam.`, 512, 200, { size: 25, color: '#7a6a52' });
      p.text(goalText(c), 512, 252, { size: 23, color: '#d8841a' });
      p.button('Começar', () => { shell.hidePanel(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(`${metricName(c)}: ${chResult.value}`, 512, 232, { size: 30, bold: true });
      p.text(goalText(c), 512, 276, { size: 22, color: '#7a6a52' });
      p.text(`Melhor: ${save.ch[ch.i] || 0} estrela(s)`, 512, 314, { size: 24 });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 350, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 350, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 454, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 554, 500, 80);
    }
  });
  hidePreview();
  updateHint();
}
function placeForPlay() {
  shell.orbit.menu = null;
  if (shell.vr && !rigPlaced) { shell.recenter(); rigPlaced = true; }
  shell.orbit.snap = true;
}
let rigPlaced = false;

// ---------- Seleção, destinos e prévia ----------
function destsFor(st, s) {
  if (!s) return [];
  return legalMoves(st).filter(m => (s.kind === 'piece' ? m.type === 'walk' && m.id === s.id : m.type === 'totem')).map(m => m.to);
}
function moveFor(s, to) { return s.kind === 'piece' ? { type: 'walk', id: s.id, to } : { type: 'totem', to }; }
function selectAt(cell) {
  const st = cur();
  const p = st.pieces.find(q => q.cell === cell && q.owner === PLAYER && !q.fixed);
  if (p) {
    if (frozen(st, p)) { msg = { text: 'Esse girassol está na sombra: não anda nesta hora.', t: 2.5 }; sfx.bad(); return null; }
    return { kind: 'piece', id: p.id };
  }
  if (st.totem === cell) {
    if (st.totemMoved) { msg = { text: 'O totem já foi empurrado nesta hora.', t: 2.5 }; return null; }
    return { kind: 'totem' };
  }
  return null;
}
function setSel(s) {
  sel = s;
  const st = cur();
  if (!s) { world.showReach(null); world.selMark.visible = false; hidePreview(); return; }
  sfx.pick();
  world.showReach(destsFor(st, s));
  const cell = s.kind === 'piece' ? st.pieces.find(p => p.id === s.id).cell : st.totem;
  cellPos(cell, world.selMark.position).y += 0.003;
  world.selMark.visible = true;
}
let previewKey = '', previewInfo = null;
const previewEl = document.getElementById('preview');
function hidePreview() {
  previewLabel.mesh.visible = false; previewEl.style.display = 'none'; previewInfo = null; previewKey = '';
  world.hoverMark.visible = false;
}
function showPreview(s, to) {
  const st = cur();
  const m = moveFor(s, to);
  if (!isLegal(st, m)) { world.hoverMark.visible = false; previewInfo = null; previewKey = ''; previewEl.style.display = 'none'; previewLabel.mesh.visible = false; return; }
  cellPos(to, world.hoverMark.position).y += 0.003;
  world.hoverMark.visible = true;
  const key = `${JSON.stringify(m)}:${st.moved}:${st.hour}`;
  if (key !== previewKey) { previewKey = key; previewInfo = preview(st, m); }
  const [l1, l2, good] = previewLines(previewInfo, m);
  const color = good ? '#2a8a3a' : '#c03a2a';
  if (shell.vr) {
    previewLabel.set([{ text: l1, size: 0.36, color: '#d8841a' }, { text: l2, size: 0.38, color }]);
    previewLabel.mesh.visible = true;
    cellPos(to, previewLabel.mesh.position).y += 0.22;
    const head = camera.getWorldPosition(new THREE.Vector3());
    previewLabel.mesh.lookAt(head.x, previewLabel.mesh.position.y, head.z);
  } else {
    previewEl.style.display = 'block';
    const html = `<div class="txt">${l1}</div><div class="txt big" style="color:${color}">${l2}</div>`;
    if (previewEl.dataset.last !== html) { previewEl.innerHTML = html; previewEl.dataset.last = html; }
  }
}
function previewLines(info, m) {
  const other = mode === 'match' ? opponent().name : 'Azuis';
  const pts = info.points;
  const l1 = `Se a hora fechasse agora: você +${pts[0]}, ${other} +${pts[1]}`;
  let l2;
  if (m.type === 'walk') {
    const now = info.shadowNow[m.to], next = info.shadowNext ? info.shadowNext[m.to] : 0;
    l2 = now ? 'Aí é sombra agora: não pontua' : !info.shadowNext ? 'Sol até o fim do dia' : next ? 'Sol agora, mas na próxima hora fica na sombra' : 'Sol agora e na próxima hora';
    return [l1, l2, !now && !next];
  }
  const hit = info.st.pieces.filter(p => p.owner !== PLAYER && info.shadowNow[p.cell]).length;
  const mine = info.st.pieces.filter(p => p.owner === PLAYER && info.shadowNow[p.cell]).length;
  l2 = `Totem aqui: ${hit} do outro e ${mine} seus na sombra`;
  return [l1, l2, hit > mine];
}
function updateNextMarks() {
  const st = cur();
  if (!st || !save.preview || app !== 'play' || sunAnim) { world.showNext(null); return; }
  world.showNext(previewInfo ? previewInfo.shadowNext : nextShadow(st));
}

// ---------- Entrada ----------
let lastEntry = null;
const _v = new THREE.Vector3();
function canAct() { return app === 'play' && phase === 'turn' && !panel.visible && !dev.autoplay && cur()?.turn === PLAYER; }
function pcCell() {
  if (shell.vr) return -1;
  const hit = shell.mouseRay().intersectObject(world.boardHit)[0];
  return hit ? cellAtXZ(hit.point.x, hit.point.z) : -1;
}
function clickCell(cell) {
  if (!canAct() || cell < 0) return;
  const st = cur();
  if (sel && destsFor(st, sel).includes(cell)) { doMove(moveFor(sel, cell)); return; }
  const s = selectAt(cell);
  setSel(s && !(sel && sel.kind === s.kind && sel.id === s.id) ? s : null);
}
function doPass() { if (canAct()) doMove({ type: 'pass' }); }
function tryGrab(e) {
  if (!canAct() || held) return false;
  const p = shell.grabPoint(e);
  const st = cur();
  let best = null, bd = GRAB_DIST;
  for (const q of st.pieces) {
    if (q.owner !== PLAYER || q.fixed) continue;
    pieceMeshes.get(q.id).getWorldPosition(_v); _v.y += 0.05;
    const d = _v.distanceTo(p);
    if (d < bd) { bd = d; best = { kind: 'piece', id: q.id, cell: q.cell }; }
  }
  if (st.totem >= 0) { world.totem.getWorldPosition(_v); _v.y += 0.06; const d = _v.distanceTo(p); if (d < bd) { bd = d; best = { kind: 'totem', cell: st.totem }; } }
  if (!best) return false;
  const s = selectAt(best.cell);
  if (!s) return true;
  setSel(s);
  held = { entry: e, sel: s, cell: -1, mesh: s.kind === 'piece' ? pieceMeshes.get(s.id) : world.totem, home: (s.kind === 'piece' ? pieceMeshes.get(s.id) : world.totem).position.clone() };
  lastEntry = e;
  shell.pulse(e, 0.3, 25);
  return true;
}
function updateHeld() {
  if (!held) return;
  const p = shell.grabPoint(held.entry);
  held.mesh.position.copy(p).add(new THREE.Vector3(0, held.sel.kind === 'piece' ? -0.035 : -0.07, 0));
  let cell = -1;
  if (p.y > BOARD_Y - 0.03 && p.y < BOARD_Y + 0.18) cell = cellAtXZ(p.x, p.z);
  if (cell < 0) { const hit = shell.entryRay(held.entry).intersectObject(world.boardHit)[0]; if (hit) { cell = cellAtXZ(hit.point.x, hit.point.z); held.entry.laserLen = hit.distance; } }
  if (cell !== held.cell) { held.cell = cell; if (cell >= 0) shell.pulse(held.entry, 0.1, 10); }
  hoverCell = cell;
  if (cell >= 0 && destsFor(cur(), held.sel).includes(cell)) showPreview(held.sel, cell); else hidePreview();
}
function releaseHeld() {
  if (!held) return;
  const h = held;
  held = null;
  const st = cur();
  if (h.cell >= 0 && canAct() && destsFor(st, h.sel).includes(h.cell)) doMove(moveFor(h.sel, h.cell), h.mesh.position.clone());
  else { h.mesh.position.copy(h.home); setSel(null); }
}
function dropHeld() { if (held) { held.mesh.position.copy(held.home); held = null; setSel(null); } }
function rayCell(e) { const hit = shell.entryRay(e).intersectObject(world.boardHit)[0]; return hit ? { cell: cellAtXZ(hit.point.x, hit.point.z), dist: hit.distance } : { cell: -1, dist: 0 }; }
function updateAim() {
  if (!canAct()) { if (previewKey) hidePreview(); return; }
  if (held) return;
  let cell = -1;
  if (shell.vr) {
    for (const e of shell.ctrls) { if (!e.source) continue; const r = rayCell(e); if (r.cell >= 0) { e.laserLen = r.dist; if (cell < 0 || e === lastEntry) cell = r.cell; } }
  } else cell = pcCell();
  hoverCell = cell;
  if (sel && cell >= 0 && destsFor(cur(), sel).includes(cell)) showPreview(sel, cell);
  else if (previewKey) hidePreview();
}
const hooks = {
  tick,
  pause: () => togglePause(),
  squeezeStart: (e) => { if (!e.isHand) tryGrab(e); },
  squeezeEnd: (e) => { if (held?.entry === e) releaseHeld(); },
  selectStart: (e) => {
    if (e.isHand && tryGrab(e)) return;
    lastEntry = e;
    const r = rayCell(e);
    if (r.cell >= 0) clickCell(r.cell);
  },
  selectEnd: (e) => { if (e.isHand && held?.entry === e) releaseHeld(); },
  button: (e, k) => { if (k === 4) doPass(); },
  disconnected: (e) => { if (held?.entry === e) dropHeld(); },
  sessionStart: () => { rigPlaced = false; hidePreview(); updateHint(); },
  sessionEnd: () => { dropHeld(); updateHint(); },
  pointerDown: () => clickCell(pcCell()),
  key: (k) => {
    if (k === ' ' || k === 'enter') { doPass(); return true; }
    if (k === 'escape' && sel && app === 'play' && !panel.visible) { setSel(null); return true; }
    return false;
  },
};
Object.assign(shell.hooks, hooks);

// ---------- HUD ----------
function updateHint() {
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'turn') t = sel ? 'Clique numa casa verde · Esc: cancelar · Espaço: passar a vez' : 'Clique num girassol seu (laranja) ou no totem · Espaço: passar · botão direito ou A/D/W/S: câmera · Esc: pausa';
  else t = 'Botão direito ou A/D/W/S: girar a câmera · Esc: pausa';
  shell.setHint(t);
}
function statusLines() {
  const st = cur();
  const fz = st.pieces.filter(p => p.owner === PLAYER && st.shadow[p.cell]).length;
  const hourTxt = `${HOUR_LABEL[Math.min(st.hour, HOURS - 1)]} (hora ${Math.min(st.hour, st.hours - 1) + 1})`;
  if (mode === 'challenge') {
    const c = CHALLENGES[ch.i];
    return { a: `Desafio ${ch.i + 1}: ${c.name} · ${hourTxt} · você ${st.scores[0]} x ${st.scores[1]} azuis`, b: goalText(c) };
  }
  const o = opponent();
  const prev = match.results.reduce((a, r) => [a[0] + r.score[0], a[1] + r.score[1]], [0, 0]);
  const head = `Dia ${match.index + 1} de ${DAYS} · ${hourTxt} · você ${prev[0] + st.scores[0]} x ${prev[1] + st.scores[1]} ${o.name}${fz ? ` · ${fz} seu(s) na sombra` : ''}`;
  let line = '';
  if (phase === 'turn') line = `Sua vez${st.totemMoved ? ' (o totem já mexeu nesta hora)' : ''}.`;
  else if (phase === 'think') line = `${o.name} está pensando...`;
  else if (phase === 'sun') line = 'O sol está andando...';
  return { a: head, b: line };
}
let boardKey = '';
function updateScoreboard() {
  const st = cur();
  let data;
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: '', footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') data = { names: ['Você', 'Azuis'], scores: st.scores, round: HOUR_LABEL[Math.min(st.hour, HOURS - 1)], footer: CHALLENGES[ch.i].name };
  else { const prev = match.results.reduce((a, r) => [a[0] + r.score[0], a[1] + r.score[1]], [0, 0]); const live = match.roundOver ? [0, 0] : st.scores; data = { names: ['Você', opponent().name], scores: [prev[0] + live[0], prev[1] + live[1]], round: `Dia ${match.index + 1} · ${HOUR_LABEL[Math.min(st.hour, HOURS - 1)]}`, footer: st.layout.name }; }
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}

// ---------- Laço ----------
function tick(dt) {
  const paused = app === 'paused';
  if (!paused) {
    time += dt;
    for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
    updateMovers();
    updateSun(dt);
  }
  if (app === 'play' && cur()) {
    if (phase === 'turn') { updateHeld(); updateAim(); if (dev.autoplay) robotTurn(dt); }
    else if (phase === 'think') {
      thinkT += dt;
      pumpThinker();
      if (thinkT >= opponent().think && thinker?.done) { const m = thinker.result; thinker = null; doMove(m); }
    } else if ((phase === 'roundEnd' || phase === 'over') && dev.autoplay) {
      timerAuto -= dt;
      if (timerAuto <= 0) { if (phase === 'roundEnd') nextRound(); else if (mode === 'match') newMatch(oppIndex); }
    }
  }
  updateDroop(dt);
  updateNextMarks();
  shell.showPinch = app === 'play' && phase === 'turn';
  const look = phase === 'think' ? BOARD_CENTER : held ? held.mesh.position : camera.getWorldPosition(_v);
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  shell.setStatus(app === 'play' && cur() ? { ...statusLines(), msg: msg?.text } : null);
  updateScoreboard();
}
let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (!thinker) {
    robotT = 0;
    if (mode === 'challenge') thinker = ch.plan ? { done: true, kind: 'ch' } : { gen: bestChallengeGen(CHALLENGES[ch.i]), done: false, kind: 'ch' };
    else thinker = { gen: chooseMoveGen(cur(), PLAYER, ROBOT, random), done: false };
  }
  pumpThinker(12);
  if (!thinker.done || robotT < ROBOT.think) return;
  let m;
  if (thinker.kind === 'ch') { if (!ch.plan) ch.plan = thinker.result.moves.slice(); m = ch.plan.shift(); }
  else m = thinker.result;
  thinker = null;
  if (m) doMove(m);
}

// Confere a sombra da regra contra a sombra da cena: um raio de cada centro de casa em direção ao
// sol, contra as torres e o totem desenhados. Devolve as casas que não batem (ignora as de borda).
const ray = new THREE.Raycaster();
function shadowCheck(st = cur(), h = st?.hour) {
  if (!st) return [];
  world.setTowers(st); syncPieces(st, true);
  scene.updateMatrixWorld(true);
  const sun = sunAt(h);
  const dir = sunVector(sun).normalize();
  const rule = shadowMap(st, h);
  const boxes = casters(st);
  const objs = [...world.towersGroup.children, ...(st.totem >= 0 ? [world.totem] : [])];
  const bad = [];
  for (let i = 0; i < N * N; i++) {
    if (boxes.some(b => b.cell === i)) continue;
    const margin = Math.max(...boxes.map(b => shadowMargin(cx(i), cy(i), b, sun)));
    if (Math.abs(margin) < 0.02) continue;   // bem na borda da sombra
    const o = cellPos(i).add(new THREE.Vector3(0, 0.0005, 0));
    ray.set(o, dir);
    const hit = ray.intersectObjects(objs, false).length > 0;
    if (hit !== (rule[i] === 1)) bad.push(i);
  }
  return bad;
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true   o robô joga por você      dev.advance(5)   avança 5 s na hora
// dev.state()           resumo do jogo            dev.loadLevel(3) abre o desafio 3 (1 a 10)
// dev.startMatch(2)     partida contra o 2 (1 a 3) dev.win()       ganha a partida/desafio na hora
// dev.cellScreen(i)     posição da casa na tela    dev.shadowCheck() casas onde a sombra da regra e a da cena não batem
// dev.resetSave()       apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); if (phase === 'turn') thinker = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, stepT = 1 / 60) {
    const frames = Math.round(sec / stepT);
    for (let i = 0; i < frames; i++) shell.step(stepT);
    shell.resetClock(); shell.render();
    return this.state();
  },
  win() {
    if (mode === 'challenge' && ch) {
      const g = bestChallengeGen(CHALLENGES[ch.i]); let x; do x = g.next(); while (!x.done);
      ch.st = setupChallenge(CHALLENGES[ch.i]);
      for (const m of x.value.moves) ch.st = applyMove(ch.st, m).st;
      clearAll(); setupBoard(ch.st); finishChallenge();
    } else if (mode === 'match' && match) {
      clearAll();
      while (!match.over) match.results.push({ score: [99, 0], layout: 'dev' });
      match.roundOver = true; phase = 'over';
      save.games[oppIndex]++; save.wins[oppIndex]++; storeSave(save);
      showScreen('over');
    }
    return this.state();
  },
  shadowCheck,
  cellScreen(i) { const p = cellPos(i).project(camera); return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight }; },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const st = cur();
    if (!st) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      dia: mode === 'match' ? match.index + 1 : null, hora: st.hour, tabuleiro: st.layout.name,
      vez: st.turn === PLAYER ? 'você' : 'computador',
      pontos: st.scores.slice(), total: mode === 'match' ? [match.total(0), match.total(1)] : null,
      pecas: st.pieces.map(p => `${p.owner ? 'A' : 'V'}${p.cell}${st.shadow[p.cell] ? '*' : ''}`).join(' '),
      totem: st.totem, emCena: pieceMeshes.size, torresEmCena: world.towersGroup.children.length,
      selecao: sel ? (sel.kind === 'piece' ? `peça ${sel.id}` : 'totem') : null, destinos: sel ? destsFor(st, sel).length : 0,
      previa: previewInfo ? previewLines(previewInfo, { type: sel?.kind === 'totem' ? 'totem' : 'walk', to: hoverCell }).slice(0, 2).join(' / ') : null,
      murchos: st.pieces.filter(p => pieceMeshes.get(p.id)?.userData.droop > 0.5).length,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && match.over && phase === 'over' ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.relogio = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world, shell };

goMenu();
shell.start();
