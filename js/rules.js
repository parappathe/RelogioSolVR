// Regras do Relógio de Sol. O sol anda pelo céu a cada hora; as torres de pedra (caixas) fazem
// sombra no tabuleiro. Peça na sombra fica congelada: não anda e não pontua naquela hora.
// A sombra é calculada pela mesma geometria das torres desenhadas (caixa de base TOWER_W e altura
// h * UNIT_H), então bate com a sombra que a luz do Three.js mostra. Sem navegador.

export const N = 7;
export const PLAYER = 0, CPU = 1;
export const HOURS = 6;
export const DAYS = 2;              // partida: 2 dias, trocando de lado no segundo (o sol passa pelo norte)
export const TOWER_W = 0.9;          // lado da base da torre, em casas
export const UNIT_H = 0.75;          // altura de um "andar" de torre, em casas
export const TOTEM_H = 2;            // o totem de madeira (que se empurra) tem 2 andares
export const WALK = 2;               // peça anda até 2 casas
export const idx = (x, y) => y * N + x;
export const cx = (i) => i % N, cy = (i) => Math.floor(i / N);
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const HOUR_LABEL = ['7h', '9h', '11h', '13h', '15h', '17h'];

// Sol da hora h (0..7): nasce a leste (direita), passa pelo norte (do lado do adversário, como no
// Brasil) e se põe a oeste. dir = direção horizontal para o sol, em casas (x direita, y para longe).
export function sunAt(h, hours = HOURS) {
  const u = (h + 0.5) / hours;
  const az = Math.PI * u;
  const el = (6 + 58 * Math.sin(Math.PI * u)) * Math.PI / 180;
  return { az, el, dir: { x: Math.cos(az), y: Math.sin(az) }, tan: Math.tan(el) };
}
// sol entre duas horas (para animar)
export function sunLerp(h0, h1, k, hours = HOURS) {
  const a = sunAt(h0, hours), b = sunAt(h1, hours);
  const az = a.az + (b.az - a.az) * k, el = a.el + (b.el - a.el) * k;
  return { az, el, dir: { x: Math.cos(az), y: Math.sin(az) }, tan: Math.tan(el) };
}

// Tabuleiros: torres [x, y, andares], totem [x, y], valor das casas e onde cada um começa.
export const LAYOUTS = [
  {
    name: 'Mirante', towers: [[1, 4, 3], [5, 4, 2], [3, 2, 1], [3, 5, 2]], totem: [3, 3],
    gold: [[2, 3], [4, 3], [3, 1], [3, 6]], silver: [[2, 2], [4, 2], [2, 4], [4, 4], [1, 2], [5, 2]],
    pieces: [[[1, 0], [3, 0], [5, 0]], [[1, 6], [5, 6], [2, 6]]],
  },
  {
    name: 'Obeliscos', towers: [[2, 2, 3], [4, 4, 3], [1, 5, 1], [5, 1, 1]], totem: [3, 3],
    gold: [[3, 2], [3, 4], [2, 4], [4, 2]], silver: [[2, 3], [4, 3], [3, 5], [3, 1], [1, 3], [5, 3]],
    pieces: [[[0, 0], [3, 0], [6, 0]], [[0, 6], [3, 6], [6, 6]]],
  },
  {
    name: 'Colunata', towers: [[1, 3, 2], [3, 3, 3], [5, 3, 2]], totem: [3, 1],
    gold: [[2, 2], [4, 2], [2, 4], [4, 4]], silver: [[0, 2], [6, 2], [0, 4], [6, 4], [3, 5], [3, 0]],
    pieces: [[[1, 0], [3, 0], [5, 0]], [[1, 6], [3, 6], [5, 6]]],
  },
];

export function newGame({ layout = 0, starter = PLAYER, hours = HOURS, pieces = null, scores = [0, 0], hour = 0 } = {}) {
  const L = typeof layout === 'number' ? LAYOUTS[layout] : layout;
  const val = new Array(N * N).fill(1);
  for (const [x, y] of L.silver || []) val[idx(x, y)] = 2;
  for (const [x, y] of L.gold || []) val[idx(x, y)] = 3;
  const towers = L.towers.map(([x, y, h]) => ({ cell: idx(x, y), h }));
  let id = 1;
  const ps = [];
  const src = pieces || L.pieces;
  for (const owner of [PLAYER, CPU]) for (const [x, y] of src[owner] || []) ps.push({ id: id++, owner, cell: idx(x, y) });
  for (const [x, y] of L.fixed || []) ps.push({ id: id++, owner: CPU, cell: idx(x, y), fixed: true });
  const st = {
    layout: L, val, towers, totem: L.totem ? idx(L.totem[0], L.totem[1]) : -1, pieces: ps,
    hour, hours, turn: starter, starter, moved: 0, totemMoved: false, scores: scores.slice(), over: false,
    log: [], solo: !!L.solo,
  };
  st.shadow = shadowMap(st, hour);
  return st;
}
export const cloneSt = (st) => ({ ...st, pieces: st.pieces.map(p => ({ ...p })), scores: st.scores.slice(), towers: st.towers, log: st.log.slice() });

// Todas as caixas que fazem sombra: torres fixas e o totem
export function casters(st) {
  const out = st.towers.map(t => ({ cell: t.cell, h: t.h }));
  if (st.totem >= 0) out.push({ cell: st.totem, h: TOTEM_H });
  return out;
}

// Quanto um ponto (px, py) está dentro da sombra de uma caixa (folga > 0 = na sombra). A sombra de uma
// caixa com luz direcional é a base varrida na direção oposta ao sol por L = altura / tan(elevação).
export function shadowMargin(px, py, box, sun) {
  const a = TOWER_W / 2;
  const bx = cx(box.cell), by = cy(box.cell);
  const dx = px - bx, dy = py - by;
  const L = box.h * UNIT_H / sun.tan;
  const d = [-sun.dir.x, -sun.dir.y];
  let lo = 0, hi = L;
  const axes = [[dx, d[0]], [dy, d[1]]];
  let margin = Infinity;
  for (const [p, c] of axes) {
    if (Math.abs(c) < 1e-9) { margin = Math.min(margin, a - Math.abs(p)); continue; }
    let t0 = (p - a) / c, t1 = (p + a) / c;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0); hi = Math.min(hi, t1);
  }
  // folga: o quanto o intervalo [lo, hi] existe (convertido em distância aproximada)
  const span = (hi - lo) * Math.hypot(d[0], d[1]);
  return Math.min(margin, span);
}
export function inShadow(px, py, boxes, sun) {
  for (const b of boxes) if (shadowMargin(px, py, b, sun) > 0) return true;
  return false;
}
// Casas na sombra (pelo centro da casa) na hora h, com as caixas do estado
export function shadowMap(st, h = st.hour, sun = sunAt(h)) {
  const boxes = casters(st);
  const m = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const x = cx(i), y = cy(i);
    if (boxes.some(b => b.cell === i)) { m[i] = 1; continue; }
    m[i] = inShadow(x, y, boxes, sun) ? 1 : 0;
  }
  return m;
}

export function blocked(st, cell) {
  return st.towers.some(t => t.cell === cell) || st.totem === cell || st.pieces.some(p => p.cell === cell);
}
// Casas alcançáveis andando até WALK casas por casas livres
export function reach(st, from, steps = WALK) {
  const dist = new Map([[from, 0]]);
  let frontier = [from];
  for (let k = 1; k <= steps; k++) {
    const next = [];
    for (const c of frontier) {
      const x = cx(c), y = cy(c);
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const n = idx(nx, ny);
        if (dist.has(n) || blocked(st, n)) continue;
        dist.set(n, k); next.push(n);
      }
    }
    frontier = next;
  }
  dist.delete(from);
  return [...dist.keys()];
}
export const frozen = (st, p) => st.shadow[p.cell] === 1;

export function legalMoves(st) {
  if (st.over) return [];
  const who = st.turn;
  const out = [];
  for (const p of st.pieces) {
    if (p.owner !== who || p.fixed || frozen(st, p)) continue;
    for (const to of reach(st, p.cell)) out.push({ type: 'walk', id: p.id, to });
  }
  if (st.totem >= 0 && !st.totemMoved) {
    const x = cx(st.totem), y = cy(st.totem);
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const n = idx(nx, ny);
      if (!blocked(st, n)) out.push({ type: 'totem', to: n });
    }
  }
  out.push({ type: 'pass' });
  return out;
}
export function isLegal(st, m) {
  return legalMoves(st).some(x => x.type === m.type && (x.type === 'pass' || (x.to === m.to && (x.type !== 'walk' || x.id === m.id))));
}

// Pontos da hora com a sombra de agora: cada peça no sol ganha o valor da casa
export function hourPoints(st) {
  const pts = [0, 0];
  for (const p of st.pieces) if (!st.shadow[p.cell]) pts[p.owner] += st.val[p.cell];
  return pts;
}

// Faz a jogada de quem está na vez. Depois dos dois, a hora fecha: pontua e o sol anda.
export function applyMove(st, m) {
  if (!isLegal(st, m)) throw new Error(`jogada inválida ${JSON.stringify(m)}`);
  const s = cloneSt(st);
  const who = st.turn;
  if (m.type === 'walk') s.pieces.find(p => p.id === m.id).cell = m.to;
  else if (m.type === 'totem') { s.totem = m.to; s.totemMoved = true; }
  s.shadow = shadowMap(s);            // o totem mexeu: a sombra de agora muda
  s.moved++;
  s.log.push({ hour: st.hour, who, m });
  let closed = null;
  const perHour = s.solo ? 1 : 2;
  if (s.moved >= perHour) {
    closed = hourPoints(s);
    s.scores[0] += closed[0]; s.scores[1] += closed[1];
    s.hour++; s.moved = 0; s.totemMoved = false;
    if (s.hour >= s.hours) s.over = true;
    else { s.starter = s.solo ? PLAYER : 1 - s.starter; s.turn = s.starter; s.shadow = shadowMap(s); }
  } else s.turn = 1 - who;
  return { st: s, closed };
}

// Prévia de uma jogada: sombra de agora, pontos da hora se o outro não mexer e sombra da próxima hora.
export function preview(st, m) {
  if (!isLegal(st, m)) return null;
  const s = cloneSt(st);
  if (m.type === 'walk') s.pieces.find(p => p.id === m.id).cell = m.to;
  else if (m.type === 'totem') s.totem = m.to;
  s.shadow = shadowMap(s);
  const next = st.hour + 1 < st.hours ? shadowMap(s, st.hour + 1) : null;
  return { st: s, points: hourPoints(s), shadowNow: s.shadow, shadowNext: next };
}
export const nextShadow = (st) => (st.hour + 1 < st.hours ? shadowMap(st, st.hour + 1) : null);
// Partida de 2 dias: no segundo dia as peças trocam de lado e começa o outro.
export class Match {
  constructor({ starter = PLAYER, layouts = [0, 1] } = {}) {
    this.layouts = layouts; this.firstStarter = starter; this.index = 0; this.results = [];
    this.round = newGame({ layout: layouts[0], starter });
    this.roundOver = false;
  }
  play(m) { const r = applyMove(this.round, m); this.round = r.st; return r; }
  closeRound() { this.results.push({ score: this.round.scores.slice(), layout: this.round.layout.name }); this.roundOver = true; }
  nextRound() {
    this.index++;
    const L = LAYOUTS[this.layouts[this.index]];
    this.round = newGame({ layout: L, starter: 1 - this.firstStarter, pieces: [L.pieces[1], L.pieces[0]] });
    this.round.swapped = true;
    this.roundOver = false;
  }
  get over() { return this.results.length >= DAYS; }
  total(who) { return this.results.reduce((s, r) => s + r.score[who], 0); }
  get winner() { const a = this.total(0), b = this.total(1); return a > b ? PLAYER : b > a ? CPU : -1; }
}
export const winnerOf = (st) => (st.scores[0] > st.scores[1] ? PLAYER : st.scores[1] > st.scores[0] ? CPU : -1);
