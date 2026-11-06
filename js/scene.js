// Cenário do Relógio de Sol: mirante de pedra no alto de um morro, campo de girassóis e morros ao
// longe, um relógio de sol antigo de enfeite. Na mesa de pedra, o tabuleiro com as torres (caixas de
// pedra) e o totem de madeira. Só as torres e o totem fazem sombra, com a luz do sol na mesma direção
// da regra (rules.sunAt): a sombra que se vê é a sombra que vale.
import * as THREE from '../vendor/three/three.module.js';
import { N, TOWER_W, UNIT_H, TOTEM_H, PLAYER, CPU } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { x: 0, z: -0.5, top: 0.86, w: 0.9, d: 0.84 };
export const S = 0.08;
export const BOARD_Y = TABLE.top + 0.014;
export const TEAM = [0xe8742a, 0x2a6ad8];

export function cellPos(i, out = new THREE.Vector3()) {
  const x = i % N, y = Math.floor(i / N);
  return out.set(TABLE.x + (x - (N - 1) / 2) * S, BOARD_Y, TABLE.z - (y - (N - 1) / 2) * S);
}
export function cellAtXZ(x, z) {
  const gx = Math.round((x - TABLE.x) / S + (N - 1) / 2), gy = Math.round(-(z - TABLE.z) / S + (N - 1) / 2);
  if (gx < 0 || gy < 0 || gx >= N || gy >= N) return -1;
  return gy * N + gx;
}
// vetor para o sol, no mundo (x direita, y para cima, -z para longe = norte)
export function sunVector(sun, out = new THREE.Vector3()) {
  return out.set(Math.cos(sun.el) * sun.dir.x, Math.sin(sun.el), -Math.cos(sun.el) * sun.dir.y);
}
// geometria exata da torre (a mesma da regra)
export const towerSize = (h) => ({ w: TOWER_W * S, h: h * UNIT_H * S });

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function stoneCanvas(w, h, base, seed) {
  const c = canvas(w, h), g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h / 40; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
  return c;
}

export function buildWorld() {
  const scene = new THREE.Scene();
  const skyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, side: THREE.BackSide, fog: false });
  const skyGeo = new THREE.SphereGeometry(48, 24, 12);
  const skyCols = new Float32Array(skyGeo.attributes.position.count * 3);
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCols, 3));
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(0xdfeaf2, 18, 46);
  scene.background = new THREE.Color(0xbfe0f6);

  const hemi = new THREE.HemisphereLight(0xd8ecff, 0x9a8a5a, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -0.75; sun.shadow.camera.right = 0.75; sun.shadow.camera.top = 0.75; sun.shadow.camera.bottom = -0.75;
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 8;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.004;
  sun.target.position.set(TABLE.x, BOARD_Y, TABLE.z);
  scene.add(sun, sun.target);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false }));
  scene.add(sunBall);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(3.2, 20, 12), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.25, fog: false, depthWrite: false }));
  scene.add(halo);

  // céu muda de cor com a altura do sol (manhã e fim de tarde mais dourados, mas sempre claro)
  const low = new THREE.Color(0xffd8a0), high = new THREE.Color(0x8cc8f4), zen = new THREE.Color(0x5aa6ea), tmp = new THREE.Color();
  function setSun(sunInfo) {
    const v = sunVector(sunInfo);
    sun.position.copy(sun.target.position).addScaledVector(v, 4);
    sunBall.position.copy(v).multiplyScalar(40); halo.position.copy(sunBall.position);
    const k = THREE.MathUtils.clamp(sunInfo.el / (64 * Math.PI / 180), 0, 1);
    sun.color.setRGB(1, 0.86 + 0.14 * k, 0.72 + 0.26 * k);
    sun.intensity = 2.0 + 0.8 * k;
    const p = skyGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = THREE.MathUtils.clamp(p.getY(i) / 40, -0.2, 1);
      const horizon = tmp.copy(low).lerp(high, 0.35 + 0.65 * k);
      const c = y < 0.2 ? horizon : horizon.clone().lerp(zen, Math.min(1, (y - 0.2) * 1.4));
      skyCols[i * 3] = c.r; skyCols[i * 3 + 1] = c.g; skyCols[i * 3 + 2] = c.b;
    }
    skyGeo.attributes.color.needsUpdate = true;
    scene.fog.color.copy(low).lerp(high, 0.5 + 0.5 * k);
  }

  // Chão do mirante (pedra), grama, morros e girassóis
  const grassC = canvas(256, 256), gg = grassC.getContext('2d'), gr = rand(3);
  gg.fillStyle = '#8ab84a'; gg.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2000; i++) { gg.fillStyle = ['#7aa83a', '#9ac85a', '#6a9834'][i % 3]; gg.fillRect(gr() * 256, gr() * 256, 2, 3); }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(grassC, { repeat: [40, 40] }) }));
  scene.add(ground);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(stoneCanvas(512, 512, '#d8ccb4', 5), { repeat: [4, 4] }) }));
  plaza.position.set(0, 0.01, -0.6); scene.add(plaza);
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xb8a888 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.12, 6, 64).rotateX(Math.PI / 2), ringMat); ring.position.set(0, 0.06, -0.6); scene.add(ring);
  // morros
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x7aa860 });
  const hillMat2 = new THREE.MeshLambertMaterial({ color: 0x9ab878 });
  const hr = rand(9);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2, d = 26 + hr() * 10;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(6 + hr() * 6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), k % 2 ? hillMat : hillMat2);
    hill.scale.y = 0.35 + hr() * 0.3; hill.position.set(Math.cos(a) * d, -0.5, Math.sin(a) * d); scene.add(hill);
  }
  // campo de girassóis em volta (instanciado, sem sombra)
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 1, 5).translate(0, 0.5, 0);
  const headGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 10).rotateX(Math.PI / 2);
  const centerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 8).rotateX(Math.PI / 2);
  const nF = 260;
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshLambertMaterial({ color: 0x4a8a2a }), nF);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffc81a }), nF);
  const cents = new THREE.InstancedMesh(centerGeo, new THREE.MeshLambertMaterial({ color: 0x5a3a1a }), nF);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), fr = rand(13);
  for (let k = 0; k < nF; k++) {
    const a = fr() * Math.PI * 2, d = 4.2 + fr() * 6;
    const x = Math.cos(a) * d, z = -0.6 + Math.sin(a) * d, h = 1.0 + fr() * 0.6;
    m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(1, h, 1)); stems.setMatrixAt(k, m4);
    q.setFromEuler(new THREE.Euler(-0.2, Math.atan2(-x, -z - 0.6) + Math.PI, 0));
    m4.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(1, 1, 1)); heads.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(1, 1, 1)); cents.setMatrixAt(k, m4);
  }
  scene.add(stems, heads, cents);
  // relógio de sol antigo de enfeite, à esquerda
  const dialMat = new THREE.MeshLambertMaterial({ map: tex(stoneCanvas(256, 256, '#cfc4a8', 7)) });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.9, 16), dialMat); ped.position.set(-2.1, 0.45, -1.8); scene.add(ped);
  const dialC = canvas(256, 256), dg = dialC.getContext('2d');
  dg.fillStyle = '#e8dcc0'; dg.beginPath(); dg.arc(128, 128, 126, 0, Math.PI * 2); dg.fill();
  dg.strokeStyle = '#5a4a3a'; dg.lineWidth = 3; dg.fillStyle = '#5a4a3a'; dg.font = 'bold 18px Georgia'; dg.textAlign = 'center'; dg.textBaseline = 'middle';
  const roman = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
  for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; dg.beginPath(); dg.moveTo(128 + Math.cos(a) * 70, 128 + Math.sin(a) * 70); dg.lineTo(128 + Math.cos(a) * 110, 128 + Math.sin(a) * 110); dg.stroke(); dg.fillText(roman[k], 128 + Math.cos(a) * 92 + 0, 128 + Math.sin(a) * 92 - 10); }
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(dialC) }));
  dial.position.set(-2.1, 0.91, -1.8); scene.add(dial);
  const gnomon = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0.25, -0.05), new THREE.Vector3(0, 0, -0.05)]), new THREE.MeshLambertMaterial({ color: 0x8a6a3a, side: THREE.DoubleSide }));
  gnomon.geometry.computeVertexNormals(); gnomon.position.set(-2.1, 0.91, -1.8); scene.add(gnomon);
  // muretas e pilares de pedra do mirante
  const pillarMat = new THREE.MeshLambertMaterial({ map: tex(stoneCanvas(128, 256, '#c8bca0', 11)) });
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 0.9 + k / 7 * Math.PI * 1.2;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), pillarMat); p.position.set(Math.cos(a) * 3.2, 0.55, -0.6 + Math.sin(a) * 3.2); scene.add(p);
    const vase = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc8704a })); vase.position.set(p.position.x, 1.22, p.position.z); scene.add(vase);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshLambertMaterial({ color: k % 2 ? 0xff7a9a : 0xffd23a })); fl.position.set(p.position.x, 1.38, p.position.z); scene.add(fl);
  }

  // ---------- Mesa e tabuleiro ----------
  const stoneMat = new THREE.MeshStandardMaterial({ map: tex(stoneCanvas(512, 512, '#bfb39a', 17)), roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.06, TABLE.d), stoneMat);
  top.position.set(TABLE.x, TABLE.top - 0.03, TABLE.z); scene.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, TABLE.top - 0.06, 12), stoneMat);
  leg.position.set(TABLE.x, (TABLE.top - 0.06) / 2, TABLE.z); scene.add(leg);
  // tampo do tabuleiro: casas de terra clara com sóis pintados (1, 2 ou 3 raios = valor)
  const boardC = canvas(N * 64 + 64, N * 64 + 64);
  const boardTex = tex(boardC);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.8 });
  const full = (N * 64 + 64) / 64 * S;
  const board = new THREE.Mesh(new THREE.BoxGeometry(full, 0.014, full), [stoneMat, stoneMat, boardMat, stoneMat, stoneMat, stoneMat]);
  board.position.set(TABLE.x, BOARD_Y - 0.007, TABLE.z); board.receiveShadow = true; scene.add(board);
  function setBoard(st) {
    const g = boardC.getContext('2d'), P = 64, M = 32;
    g.fillStyle = '#8a7a5a'; g.fillRect(0, 0, boardC.width, boardC.height);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, px = M + x * P, py = M + (N - 1 - y) * P, v = st.val[i];
      g.fillStyle = (x + y) % 2 ? '#f2e6c8' : '#ead9b4'; g.fillRect(px + 2, py + 2, P - 4, P - 4);
      if (v > 1) {
        g.fillStyle = v === 3 ? '#f0a020' : '#f6c85a';
        g.beginPath(); g.arc(px + P / 2, py + P / 2, v === 3 ? 13 : 10, 0, Math.PI * 2); g.fill();
        g.strokeStyle = g.fillStyle; g.lineWidth = 3;
        const rays = v === 3 ? 12 : 8;
        for (let k = 0; k < rays; k++) { const a = k / rays * Math.PI * 2; g.beginPath(); g.moveTo(px + P / 2 + Math.cos(a) * 16, py + P / 2 + Math.sin(a) * 16); g.lineTo(px + P / 2 + Math.cos(a) * (v === 3 ? 26 : 22), py + P / 2 + Math.sin(a) * (v === 3 ? 26 : 22)); g.stroke(); }
        g.fillStyle = '#7a4a10'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), px + P / 2, py + P / 2 + 1);
      }
    }
    boardTex.needsUpdate = true;
  }
  const boardHit = new THREE.Mesh(new THREE.PlaneGeometry(N * S, N * S).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  boardHit.position.set(TABLE.x, BOARD_Y + 0.001, TABLE.z); scene.add(boardHit);

  // torres de pedra (caixas com a medida exata) e o totem de madeira
  const towerMat = new THREE.MeshStandardMaterial({ map: tex(stoneCanvas(128, 256, '#a89a80', 21)), roughness: 0.9 });
  const totemC = canvas(128, 256), tg = totemC.getContext('2d');
  tg.fillStyle = '#9a6a3a'; tg.fillRect(0, 0, 128, 256);
  tg.fillStyle = '#6a4220'; for (let y = 0; y < 256; y += 18) tg.fillRect(0, y, 128, 3);
  tg.fillStyle = '#f0c040'; tg.beginPath(); tg.arc(64, 70, 26, 0, Math.PI * 2); tg.fill();
  tg.fillStyle = '#3a2410'; tg.fillRect(48, 62, 8, 8); tg.fillRect(72, 62, 8, 8); tg.fillRect(52, 80, 24, 5);
  const totemMat = new THREE.MeshStandardMaterial({ map: tex(totemC), roughness: 0.7 });
  const towersGroup = new THREE.Group(); scene.add(towersGroup);
  const boxGeos = {};
  const boxGeo = (h) => (boxGeos[h] ||= new THREE.BoxGeometry(towerSize(h).w, towerSize(h).h, towerSize(h).w).translate(0, towerSize(h).h / 2, 0));
  function setTowers(st) {
    while (towersGroup.children.length) towersGroup.remove(towersGroup.children[0]);
    for (const t of st.towers) {
      const m = new THREE.Mesh(boxGeo(t.h), towerMat); cellPos(t.cell, m.position); m.castShadow = true; m.receiveShadow = true; m.userData = { kind: 'tower', h: t.h };
      towersGroup.add(m);
    }
  }
  const totem = new THREE.Mesh(boxGeo(TOTEM_H), totemMat);
  totem.castShadow = true; totem.receiveShadow = true; totem.userData = { kind: 'totem', h: TOTEM_H };
  scene.add(totem);

  // peças: girassol num vaso (cor do dono). Na sombra ele murcha (cabeça cai e escurece).
  const potGeo = new THREE.CylinderGeometry(0.017, 0.012, 0.024, 14).translate(0, 0.012, 0);
  const potMats = TEAM.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x3a8a2a });
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xffc81a, roughness: 0.6 });
  const petalSad = new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 0.8 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.8 });
  const pStem = new THREE.CylinderGeometry(0.0025, 0.0025, 0.04, 5).translate(0, 0.02, 0);
  const pPetal = new THREE.CylinderGeometry(0.016, 0.016, 0.005, 12).rotateX(Math.PI / 2);
  const pDisc = new THREE.CylinderGeometry(0.008, 0.008, 0.007, 10).rotateX(Math.PI / 2);
  function makePiece(owner, ghost = false) {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(potGeo, ghost ? new THREE.MeshBasicMaterial({ color: TEAM[owner], transparent: true, opacity: 0.45 }) : potMats[owner]); pot.receiveShadow = true; g.add(pot);
    const stemG = new THREE.Group(); stemG.position.y = 0.024; g.add(stemG);
    const stem = new THREE.Mesh(pStem, stemMat); stemG.add(stem);
    const head = new THREE.Group(); head.position.y = 0.04; stemG.add(head);
    const petals = new THREE.Mesh(pPetal, petalMat); petals.receiveShadow = true; head.add(petals);
    const disc = new THREE.Mesh(pDisc, discMat); disc.position.z = 0.002; head.add(disc);
    g.scale.setScalar(1.5);
    g.userData = { owner, stemG, head, petals, droop: 0 };
    return g;
  }
  function setDroop(p, k) {   // 0 = feliz no sol, 1 = murcho
    p.userData.droop = k;
    p.userData.stemG.rotation.x = 0.9 * k;
    p.userData.head.rotation.x = -0.35 + 1.1 * k;
    p.userData.petals.material = k > 0.5 ? petalSad : petalMat;
  }

  // marcas: casa escolhida, casas alcançáveis e a prévia da sombra da próxima hora
  const markGeo = new THREE.RingGeometry(S * 0.34, S * 0.44, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
  const selMark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
  selMark.visible = false; selMark.renderOrder = 4; scene.add(selMark);
  const hoverMark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0x3aaa3a, transparent: true, opacity: 0.95, depthWrite: false }));
  hoverMark.visible = false; hoverMark.renderOrder = 4; scene.add(hoverMark);
  const dotGeo = new THREE.CircleGeometry(S * 0.1, 12).rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0x2a9a3a, transparent: true, opacity: 0.85, depthWrite: false });
  const dots = [];
  for (let i = 0; i < N * N; i++) { const d = new THREE.Mesh(dotGeo, dotMat); cellPos(i, d.position).y += 0.002; d.visible = false; d.renderOrder = 3; scene.add(d); dots.push(d); }
  const nextGeo = new THREE.PlaneGeometry(S * 0.8, S * 0.8).rotateX(-Math.PI / 2);
  const nextMat = new THREE.MeshBasicMaterial({ map: tex((() => { const c = canvas(64, 64), g = c.getContext('2d'); g.strokeStyle = 'rgba(40,40,120,0.9)'; g.lineWidth = 5; for (let k = -64; k < 128; k += 14) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); } g.strokeRect(2, 2, 60, 60); return c; })()), transparent: true, opacity: 0.55, depthWrite: false });
  const nextMarks = [];
  for (let i = 0; i < N * N; i++) { const d = new THREE.Mesh(nextGeo, nextMat); cellPos(i, d.position).y += 0.0015; d.visible = false; d.renderOrder = 2; scene.add(d); nextMarks.push(d); }
  function showReach(cells) { dots.forEach((d, i) => { d.visible = cells ? cells.includes(i) : false; }); }
  function showNext(map) { nextMarks.forEach((d, i) => { d.visible = !!map && map[i] === 1; }); }

  // placa com a hora (num cavalete de ferro, à direita) e o placar
  const boardCv = canvas(1024, 512), lt = tex(boardCv);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshBasicMaterial({ map: lt }));
  sign.position.set(TABLE.x + 1.3, 1.6, TABLE.z - 1.3); sign.rotation.y = -0.5; scene.add(sign);
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x4a3a2a })); signPost.position.set(TABLE.x + 1.3, 0.7, TABLE.z - 1.32); scene.add(signPost);
  function drawBoard({ names, scores, round, footer }) {
    const g = boardCv.getContext('2d');
    g.fillStyle = '#f6ecd0'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = '#a07a3a'; g.lineWidth = 14; g.strokeRect(7, 7, 1010, 498);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#8a5a1a'; g.font = 'bold 54px Georgia, serif'; g.fillText('RELÓGIO DE SOL', 512, 64);
    const cols = ['#d8641a', '#2a6ad8'];
    for (const k of [0, 1]) { const x = k ? 770 : 254; g.fillStyle = cols[k]; g.font = 'bold 42px sans-serif'; g.fillText(names[k], x, 150); g.font = 'bold 140px Georgia, serif'; g.fillText(String(scores[k]), x, 285); }
    g.fillStyle = '#5a4a3a'; g.font = '38px sans-serif'; g.fillText(round || '', 512, 285);
    g.font = '32px sans-serif'; g.fillText(footer || '', 512, 450);
    lt.needsUpdate = true;
  }

  // adversário
  const styles = {
    careful: () => {
      const g = new THREE.Group();
      const straw = new THREE.MeshLambertMaterial({ color: 0xe8c878 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 24), straw); brim.position.y = 0.09; g.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 18), straw); crown.position.y = 0.14; g.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.02, 18), new THREE.MeshLambertMaterial({ color: 0xa03a2a })); band.position.y = 0.11; g.add(band);
      return g;
    },
    risky: () => {
      const g = new THREE.Group();
      const hair = new THREE.MeshLambertMaterial({ color: 0x5a2a10 });
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair); top.position.y = 0.02; g.add(top);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 8), hair); tail.position.set(0, 0.02, -0.15); tail.rotation.x = 0.5; g.add(tail);
      const glass = new THREE.MeshBasicMaterial({ color: 0x1a1a2a });
      for (const x of [-0.045, 0.045]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), glass); l.position.set(x, 0.02, 0.137); g.add(l); }
      return g;
    },
    master: () => {
      const g = new THREE.Group();
      const gold = new THREE.MeshLambertMaterial({ color: 0xe8b020 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.135, 0.05, 20), gold); crown.position.y = 0.1; g.add(crown);
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const r = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 6), gold); r.position.set(Math.cos(a) * 0.13, 0.15, Math.sin(a) * 0.13); g.add(r); }
      const beard = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd8d8d8 })); beard.position.set(0, -0.04, 0.05); beard.scale.set(1, 1.2, 1); g.add(beard);
      return g;
    },
  };
  const avatar = makeAvatar({ styles, headY: 1.55, handZ: 0.3, standing: true, pants: 0x6a5a4a });
  avatar.group.position.set(TABLE.x, 0, TABLE.z - 0.8);
  avatar.hands.forEach(h => { h.position.y = TABLE.top + 0.04; });
  avatar.arms.forEach(a => { a.position.y = TABLE.top + 0.13; });
  scene.add(avatar.group);

  function animate(dt, time) { halo.material.opacity = 0.22 + 0.04 * Math.sin(time * 1.3); }

  return {
    scene, sun, setSun, boardHit, setBoard, setTowers, towersGroup, totem, makePiece, setDroop,
    selMark, hoverMark, showReach, showNext, drawBoard, avatar, animate,
  };
}
