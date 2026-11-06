// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), clique do PC com prévia e desafios funcionam.
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  await import('../js/main.js');
  const dev = window.dev;
  const G = window.relogio;
  const THREE = await import('../vendor/three/three.module.js');
  const R = await import('../js/rules.js');
  const { cellPos } = await import('../js/scene.js');
  ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
  let s = dev.advance(0.5);
  ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
  ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);

  // A sombra da regra bate com a sombra da cena (raio de cada casa até o sol, contra as torres desenhadas)
  let checked = 0, mism = 0;
  for (let L = 0; L < R.LAYOUTS.length; L++) for (let h = 0; h < R.HOURS; h++) {
    mism += dev.shadowCheck(R.newGame({ layout: L }), h).length; checked++;
  }
  const { CHALLENGES, setupChallenge } = await import('../js/challenges.js');
  for (const c of CHALLENGES) for (let h = c.start; h < c.start + c.hours; h++) { mism += dev.shadowCheck(setupChallenge(c), h).length; checked++; }
  ok(mism === 0, `sombra da regra = sombra da cena em ${checked} tabuleiros/horas (${mism} casas diferentes)`);

  const waitMine = () => { for (let i = 0; i < 80 && !(dev.state().fase === 'turn' && dev.state().vez === 'você'); i++) dev.advance(0.25); return dev.advance(0.3); };
  s = dev.startMatch(1);
  ok(s.tela === 'play' && s.adversario === 'Seu Juca' && s.emCena === 6 && s.torresEmCena === G.match.round.towers.length, `partida contra o Seu Juca montada (${s.emCena} girassóis, ${s.torresEmCena} torres)`);
  s = waitMine();
  ok(s.fase === 'turn', 'chega a sua vez');
  const canvasEl = G.renderer.domElement;
  const click = (cell) => { const p = dev.cellScreen(cell); canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y }); dev.advance(0.03); canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 }); win.dispatch('pointerup', {}); return dev.advance(0.03); };
  let st = G.match.round;
  const mine = st.pieces.find(p => p.owner === 0 && !st.shadow[p.cell] && R.reach(st, p.cell).length);
  s = click(mine.cell);
  ok(s.selecao && s.destinos > 0, `clicar no girassol seleciona e mostra ${s.destinos} casas`);
  const dest = R.reach(st, mine.cell)[0];
  const dp = dev.cellScreen(dest);
  canvasEl.dispatch('pointermove', { clientX: dp.x, clientY: dp.y });
  s = dev.advance(0.05);
  ok(s.previa && s.previa.startsWith('Se a hora'), `casa verde com o mouse mostra a prévia ("${s.previa}")`);
  click(dest);
  s = dev.advance(1.2);
  ok(G.match.round.pieces.find(p => p.id === mine.id).cell === dest, 'clicar na casa verde anda com o girassol');

  // Espaço passa a vez
  s = waitMine();
  const n0 = G.match.round.log.length;
  win.dispatch('keydown', { key: ' ' });
  s = dev.advance(0.6);
  ok(G.match.round.log.length > n0 && G.match.round.log[n0].m.type === 'pass', 'Espaço passa a vez');

  // VR (controle de mentira): aperto pega o girassol, solta numa casa
  s = waitMine();
  st = G.match.round;
  const vp = st.pieces.find(p => p.owner === 0 && !st.shadow[p.cell] && R.reach(st, p.cell).length);
  const entry = G.shell.ctrls[1];
  entry.source = { handedness: 'right', gamepad: { buttons: [], axes: [0, 0, 0, 0] } };
  entry.side = 'right';
  const rigInv = new THREE.Matrix4().copy(G.shell.rig.matrixWorld).invert();
  const setGrab = (p) => { entry.grip.position.copy(p.clone().add(new THREE.Vector3(0, 0.02, 0.04)).applyMatrix4(rigInv)); entry.ctrl.position.copy(entry.grip.position); G.shell.rig.updateMatrixWorld(true); };
  if (vp) {
    setGrab(cellPos(vp.cell).add(new THREE.Vector3(0, 0.04, 0)));
    G.shell.hooks.squeezeStart(entry);
    s = dev.state();
    ok(s.selecao, 'VR: aperto perto do girassol pega');
    const vdest = R.reach(st, vp.cell).at(-1);
    setGrab(cellPos(vdest).add(new THREE.Vector3(0, 0.06, 0)));
    dev.advance(0.05);
    G.shell.hooks.squeezeEnd(entry);
    s = dev.advance(1.2);
    ok(G.match.round.pieces.find(p => p.id === vp.id).cell === vdest, 'VR: soltar em cima da casa anda com o girassol');
  } else ok(false, 'VR: nenhum girassol livre para testar');
  entry.source = null; entry.side = null;

  // o resto da partida o robô joga (passa pelas horas, o sol andando e a troca de lado)
  dev.autoplay = true;
  let guard = 0, sawSun = false, sawDroop = false;
  while (!dev.state().vencedor && guard++ < 3000) { s = dev.advance(0.25); if (s.fase === 'sun') sawSun = true; if (s.murchos > 0) sawDroop = true; }
  s = dev.state();
  ok(s.vencedor, `partida terminou sozinha (${s.total?.join(' x ')}, vencedor: ${s.vencedor})`);
  ok(sawSun && sawDroop, 'o sol andou e girassóis murcharam na sombra');
  ok(G.match.results.length === 2 && G.match.results.every(r => r.score[0] + r.score[1] > 10), `2 dias com pontos (${G.match.results.map(r => r.score.join('-')).join(', ')})`);
  ok(JSON.parse(store.get('relogiosolvr.v1') || '{"games":[]}').games[0] === 1, 'resultado salvo no localStorage');

  // Desafios pelo mesmo caminho do menu
  let stars = [], loadedOk = true;
  for (let n = 1; n <= CHALLENGES.length; n++) {
    s = dev.loadLevel(n);
    const c = CHALLENGES[n - 1];
    if (s.hora !== c.start || s.emCena !== c.layout.pieces[0].length + c.layout.fixed.length || s.torresEmCena !== c.layout.towers.length) loadedOk = false;
    let g = 0;
    while (dev.state().estrelas == null && g++ < 600) dev.advance(0.25);
    stars.push(dev.state().estrelas);
  }
  ok(loadedOk, 'cada desafio aparece montado (hora, girassóis e torres certos)');
  ok(stars.every(x => x === 3), `robô tira 3 estrelas nos ${CHALLENGES.length} desafios dentro do jogo (${stars.join(' ')})`);
  ok(Object.keys(JSON.parse(store.get('relogiosolvr.v1') || '{"ch":{}}').ch).length === CHALLENGES.length, 'estrelas dos desafios salvas');

  dev.autoplay = false;
  dev.loadLevel(7);
  s = dev.win();
  ok(s.estrelas === 3, 'dev.win() resolve o desafio');
  dev.startMatch(2);
  s = dev.win();
  ok(s.vencedor === 'você', 'dev.win() ganha a partida');

  dev.startMatch(3);
  dev.advance(0.2);
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'paused', 'Esc pausa');
  win.dispatch('keydown', { key: 'Escape' });
  ok(dev.state().tela === 'play', 'Esc de novo continua');
  const loop = G.renderer._loop;
  for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
  ok(typeof loop === 'function', 'laço de animação ligado');
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
