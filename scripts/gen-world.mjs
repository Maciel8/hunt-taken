// Gera a rede completa do continente 10.000 × 10.000 (6 cidades expandidas multi-distrito,
// rios, estradas, docas, oásis, construções, NPCs por distrito, áreas de caça temáticas, depósitos, lagoas),
// o mapa-múndi (2000×2000) e o SQL de sincronização do Supabase.
// Uso: node scripts/gen-world.mjs <dir_saida_tmp>
import fs from "node:fs";
import {
  SIZE, OX, OY, B, baseBiome, initNet, tileAt, isBlocked, NET, chunkObjects, chunkTiles, CHUNK,
  BIOME_RGB, hashTile, coastAt, cityInside, OVT, OVN, treeDensity, cityWater, cityStreet, cityGroundKind,
  valenBayEdge, valenHeadland, solkarLakeVal, SYLVANA_CLEARINGS, inPoly, fbm as fbm2
} from "../js/terrain.js";

const OUT = process.argv[2] || ".";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const edge = JSON.parse(fs.readFileSync(new URL("../assets/heartland-edge.json", import.meta.url)));
const L = (gx, gy) => [gx - OX, gy - OY];
const G = (x, y) => [x + OX, y + OY];
const landAt = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !(b === B.DEEP || b === B.OCEAN || b === B.SHALLOW); };
const solid = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !isBlocked(b) && b !== B.BEACH && b !== B.CLIFF; };

function settle(x, y, ok = solid, maxR = 600) {
  for (let r = 0; r < maxR; r += 4)
    for (let a = 0; a < 6.283; a += r ? 4 / r : 7) {
      const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r);
      if (ok(px, py)) return [px, py];
    }
  throw new Error("sem lugar perto de " + x + "," + y);
}

const roomy = (maxR = 148) => (x, y) => {
  for (const r of [0, 35, 75, 115, maxR])
    for (let a = 0; a < 6.283; a += .32)
      if (!solid(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r))) return false;
  return true;
};
// Porto de Valen precisa de terra firme no lado oeste/centro e mar/baía logo a leste!
const roomyValen = (x, y) => {
  for (const r of [0, 32, 68, 106])
    for (let a = 0; a < 6.283; a += .28) {
      const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      if (dx > 24) continue; // lado leste abre para a baía
      if (!solid(Math.round(x + dx), Math.round(y + dy))) return false;
    }
  // exige mar real logo a leste da baía (x + 96..106) para abrir direto ao oceano sem barra de areia
  return !landAt(x + 96, y) && !landAt(x + 104, y - 22) && !landAt(x + 104, y + 22);
};

const chaikin = (p, n = 3) => {
  for (let k = 0; k < n; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [a, b] = [p[i], p[i + 1]];
      q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    q.push(p[p.length - 1]); p = q;
  }
  return p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
};

// ---------- 1. CIDADES EXPANDIDAS (2.2×–2.5× área maior que antes, 3× maiores que as referências, multi-distrito densas) ----------
const phase = (s, k) => [hashTile(s, k, 91) * 6.283, hashTile(s, k, 92) * 6.283, hashTile(s, k, 93) * 6.283];
const CITY_DEF = [
  { id: "arken",   name: "Vila de Arken",       at: [52, 40],         heart: true, rx: 0,   ry: 0,  r: [1, 260, 600],   spec: "Hub geral e Mercado Central" },
  { id: "valen",   name: "Porto de Valen",      east: true,                        rx: 102, ry: 88, r: [168, 400, 760], spec: "Comércio marítimo, pesca e couros" },
  { id: "khazad",  name: "Forja de Khazad",     at: L(6150, 2750),                 rx: 98,  ry: 84, r: [165, 395, 755], spec: "Metalurgia, minérios e armas" },
  { id: "solkar",  name: "Oásis de Solkar",     at: L(5000, 8050),                 rx: 104, ry: 86, r: [170, 400, 760], spec: "Joalheria, gemas e diamantes" },
  { id: "sylvana", name: "Bosques de Sylvana",  at: L(1850, 4500),                 rx: 106, ry: 90, r: [172, 405, 765], spec: "Alquimia, madeira e ervas" },
  { id: "nocthar", name: "Cidadela de Nocthar", at: L(1750, 2050),                 rx: 98,  ry: 84, r: [165, 395, 755], spec: "Artefatos, encantamento e mercado negro" },
];
const REGNAMES = {
  arken:   ["Campos de Arken", "Fronteira de Arken", "Ermos de Arken"],
  valen:   ["Costa Mansa", "Enseadas Disputadas", "Recifes Vermelhos"],
  khazad:  ["Vales da Forja", "Encostas de Ferro", "Crateras de Khazad"],
  solkar:  ["Jardins do Oásis", "Dunas Externas", "Mar de Areia Rubra"],
  sylvana: ["Clareiras de Sylvana", "Mata Fechada", "Bosque Ancestral Profundo"],
  nocthar: ["Pátio da Cidadela", "Ruínas Disputadas", "Abismo de Nocthar"],
};
const CITY_BASE = { arken: 10, valen: 22, sylvana: 32, solkar: 42, khazad: 52, nocthar: 66 };
const cities = [];
for (const [i, d] of CITY_DEF.entries()) {
  let x, y;
  if (d.heart) [x, y] = d.at;
  else if (d.east) {
    let gx = 6500, gy = 5450;
    while (coastAt(gx, gy) > .02 && gx < SIZE) gx += 5;
    try { [x, y] = settle(...L(gx - 80, gy), roomyValen, 500); }
    catch { [x, y] = settle(...L(gx - 102, gy), roomy(108), 600); }
  } else {
    [x, y] = settle(...d.at, roomy(Math.max(d.rx, d.ry) + 12), 1100);
  }
  cities.push({ id: d.id, name: d.name, x, y, r: d.r, ph: [phase(i, 1), phase(i, 2), phase(i, 3)], plaza: d.rx, rx: d.rx, ry: d.ry, theme: d.id, spec: d.spec, heart: !!d.heart, regions: REGNAMES[d.id], base: CITY_BASE[d.id] });
}
log("cidades", cities.map(c => `${c.id}@${c.x},${c.y}(${c.rx}x${c.ry})`).join(" "));

// ---------- 2. RIOS CONTINENTAIS + RIO DE VALEN + RIO DO SUL DE SOLKAR ----------
const HM = 50;
const nearHeart = (x, y) => x > -HM && y > -HM && x < 300 + HM && y < 200 + HM;
const rivers = [];
function flow(sx, sy, dir0, w0) {
  const pts = [[sx, sy]], ws = [w0]; let x = sx, y = sy, a = dir0;
  for (let k = 0; k < 1400; k++) {
    const [gx, gy] = G(x, y); const out = Math.atan2(gy - SIZE / 2, gx - SIZE / 2);
    let da = out - a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
    a += da * .08 + (hashTile(Math.floor(x / 40), Math.floor(y / 40), 61) - .5) * .5;
    let nx = x + Math.cos(a) * 10, ny = y + Math.sin(a) * 10;
    for (let t = 0; t < 8 && nearHeart(nx, ny); t++) { a += .8; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
    for (const c of cities) if (!c.heart && Math.hypot(nx - c.x, ny - c.y) < Math.max(c.rx, c.ry) + 52) { a += .9; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
    x = nx; y = ny; pts.push([Math.round(x), Math.round(y)]); ws.push(Math.min(2.8, w0 + k * .004));
    if (!landAt(x, y)) break;
    let join = false; if (k > 6) for (const r of rivers) for (let i = 0; i < r.pts.length; i += 3) if (Math.hypot(r.pts[i][0] - x, r.pts[i][1] - y) < 9) { join = true; break; } if (join) break;
  }
  if (pts.length > 4) rivers.push({ pts, w: ws });
}
let srcN = 0;
for (let k = 0; srcN < 18 && k < 4000; k++) {
  const gx = 900 + hashTile(k, 1, 71) * 8200, gy = 600 + hashTile(k, 2, 71) * 5200;
  const b = baseBiome(gx, gy);
  if (![B.MOUNTAIN, B.TUNDRA, B.GLACIER, B.FOREST, B.ANCIENT].includes(b)) continue;
  const [x, y] = L(gx, gy);
  if (nearHeart(x, y) || cities.some(c => !c.heart && Math.hypot(c.x - x, c.y - y) < 280) || rivers.some(r => Math.hypot(r.pts[0][0] - x, r.pts[0][1] - y) < 900)) continue;
  flow(x, y, hashTile(k, 3, 71) * 6.283, 0.95); srcN++;
}
// Rios que saem do coração
const runs = [];
for (const t of edge.tiles.filter(t => t[3])) {
  const side = t[1] === 199 ? "s" : t[1] === 0 ? "n" : t[0] === 0 ? "w" : "e";
  const r = runs.find(r => Math.abs(r.x - t[0]) + Math.abs(r.y - t[1]) < 4 && r.side === side);
  if (r) { r.n++; r.sx += t[0]; r.sy += t[1]; r.x = t[0]; r.y = t[1]; }
  else runs.push({ side, n: 1, sx: t[0], sy: t[1], x: t[0], y: t[1] });
}
for (const r of runs) {
  const mx = Math.round(r.sx / r.n), my = Math.round(r.sy / r.n), d = { s: [0, 1], n: [0, -1], w: [-1, 0], e: [1, 0] }[r.side];
  const pts = [[mx, my], [mx + d[0] * 6, my + d[1] * 6]]; const w = Math.min(2.2, Math.max(1.1, r.n / 3));
  rivers.push({ pts, w: [w, w], heart: true }); flow(mx + d[0] * 6, my + d[1] * 6, Math.atan2(d[1], d[0]), w);
}
// Rio cênico a oeste de Porto de Valen (como na imagem 3 — estrada oeste atravessa por ponte de madeira)
{
  const c = cities.find(q => q.id === "valen"), pts = [];
  for (let dy = -290; dy <= 290; dy += 14) {
    const x = Math.round(c.x - c.rx - 44 + Math.sin(dy / 48) * 18);
    const y = Math.round(c.y + dy);
    pts.push([x, y]);
    if (dy > 180 && !landAt(x, y)) break;
  }
  // curva final rumo ao mar ao sul de Valen
  let lx = pts[pts.length - 1][0], ly = pts[pts.length - 1][1];
  for (let s = 0; s < 50 && landAt(lx, ly); s++) { lx += 12; ly += Math.round(6 + Math.sin(s / 3) * 4); pts.push([lx, ly]); }
  rivers.push({ pts, w: pts.map((_, i) => Math.min(2.6, 1.5 + i * .018)), valen: true });
}
// Rio cênico ao sul de Oásis de Solkar (como na base da imagem 2 — alimentado pelo oásis, atravessado por pontes)
{
  const c = cities.find(q => q.id === "solkar"), pts = [];
  for (let dx = -240; dx <= 240; dx += 14) {
    const x = Math.round(c.x + dx);
    const y = Math.round(c.y + c.ry + 28 - dx * .11 + Math.sin(dx / 44) * 12);
    pts.push([x, y]);
  }
  rivers.push({ pts, w: pts.map(() => 2.2), solkar: true });
}
for (const r of rivers) { const P = chaikin(r.pts, 3); r.w = P.map((_, i) => r.w[Math.round(i / (P.length - 1) * (r.w.length - 1))]); r.pts = P; }
log("rios", rivers.length);

// ---------- 3. ESTRADAS CONTINENTAIS ----------
const CS = 14, GW = Math.ceil(SIZE / CS); const cost = new Float32Array(GW * GW);
for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
  const b = baseBiome(i * CS + CS / 2, j * CS + CS / 2); const [x, y] = L(i * CS + CS / 2, j * CS + CS / 2);
  cost[j * GW + i] = (b === B.DEEP || b === B.OCEAN || b === B.SHALLOW) ? 0
    : nearHeart(x, y) && !(x < -10 || y < -10 || x > 310 || y > 210) ? 0
    : b === B.LAKE || b === B.MURKY ? 25 : b === B.PEAK || b === B.LAVA ? 9
    : b === B.MOUNTAIN || b === B.VOLCANIC || b === B.GLACIER ? 3 : b === B.SWAMP || b === B.MANGROVE ? 2.4
    : b === B.DESERT || b === B.CANYON ? 1.5 : 1;
}
for (const r of rivers) for (const p of r.pts) { const [gx, gy] = G(p[0], p[1]); const k = Math.floor(gy / CS) * GW + Math.floor(gx / CS); if (cost[k]) cost[k] += 4; }
function coarse(ax, ay, bx, by) {
  const [sgx, sgy] = G(ax, ay), [tgx, tgy] = G(bx, by);
  const s = Math.floor(sgy / CS) * GW + Math.floor(sgx / CS), t = Math.floor(tgy / CS) * GW + Math.floor(tgx / CS);
  const g = new Float32Array(GW * GW).fill(1e9), prev = new Int32Array(GW * GW).fill(-1), heap = [[0, s]]; g[s] = 0;
  const tx = t % GW, ty = (t / GW) | 0;
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const done = new Uint8Array(GW * GW);
  while (heap.length) {
    const [, c] = pop(); if (c === t) break; if (done[c]) continue; done[c] = 1;
    const cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GW) continue;
      const k = ny * GW + nx, cc = k === t || k === s ? 1 : cost[k]; if (!cc) continue;
      const g2 = g[c] + w * cc; if (g2 < g[k]) { g[k] = g2; prev[k] = c; push(g2 + Math.hypot(nx - tx, ny - ty), k); }
    }
  }
  if (g[t] >= 1e9) throw new Error("estrada sem caminho " + [ax, ay, bx, by]);
  const pts = []; for (let c = t, guard = 0; c !== -1 && guard < GW * GW; c = prev[c], guard++) { pts.push(L((c % GW) * CS + CS / 2, ((c / GW) | 0) * CS + CS / 2)); if (c === s) break; }
  pts.reverse(); pts[0] = [ax, ay]; pts[pts.length - 1] = [bx, by]; return pts;
}
const C = id => cities.find(c => c.id === id);
const EXIT = Object.fromEntries(edge.exits.map(e => [e.side, e]));
const CROSS = { n: [181.1, -0.2], e: [300.2, 45.9], w: [-0.2, 95.8], s: [57.9, 200.2] };
const exitOut = s => { const e = EXIT[s], d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[s]; const c = CROSS[s] || [e.x + .5, e.y + .5]; return [c, [c[0] + d[0] * 22, c[1] + d[1] * 22]]; };

// Portões de entrada de cada cidade (Valen não tem portão leste por abrir para a baía!)
const CITY_GATES = c => {
  const all = [[c.x + c.rx, c.y, 1, 0], [c.x, c.y + c.ry, 0, 1], [c.x - c.rx, c.y, -1, 0], [c.x, c.y - c.ry, 0, -1]];
  if (c.id === "valen") return all.filter(g => g[2] !== 1);
  if (c.id === "solkar") return [[c.x, c.y + c.ry, 0, 1], [c.x - c.rx, c.y, -1, 0], [c.x, c.y - c.ry, 0, -1], [c.x + c.rx, c.y + 4, 1, 0]];
  return all;
};
function viaGate(pts, c) {
  if (c.heart) return pts;
  const i = pts.findIndex(p => cityInside(c, p[0], p[1]) < 1.35);
  if (i < 1) return pts;
  const e = pts[i - 1];
  const g = CITY_GATES(c).sort((A, Bq) => Math.hypot(A[0] - e[0], A[1] - e[1]) - Math.hypot(Bq[0] - e[0], Bq[1] - e[1]))[0];
  const out = [g[0] + g[2] * 16, g[1] + g[3] * 16];
  const a1 = Math.atan2((e[1] - c.y) / c.ry, (e[0] - c.x) / c.rx), a2 = Math.atan2(g[3], g[2]);
  let da = a2 - a1; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
  const bend = [];
  for (const t of [.33, .66]) { const a = a1 + da * t; bend.push([c.x + Math.cos(a) * c.rx * 1.28, c.y + Math.sin(a) * c.ry * 1.28]); }
  // destino interno sempre cai numa avenida limpa com ponte até a praça central
  const inner = c.id === "solkar" && g[2] === 1
    ? [[c.x + 56, c.y + 4], [c.x - 4, c.y + 4], [c.x, c.y]]
    : c.id === "khazad" && g[3] === -1
      ? [[c.x, c.y - 42], [c.x - 36, c.y - 36], [c.x - 36, c.y - 10], [c.x - 14, c.y - 10], [c.x - 14, c.y + 4], [c.x, c.y + 4], [c.x, c.y]]
      : c.id === "khazad" && g[2] === -1
        ? [[c.x - 36, c.y - 10], [c.x - 12, c.y - 10], [c.x - 12, c.y + 4], [c.x, c.y]]
        : c.id === "khazad" && g[2] === 1
          ? [[c.x + 36, c.y - 10], [c.x + 12, c.y - 10], [c.x + 12, c.y + 4], [c.x, c.y]]
          : [[c.x + g[2] * 14, c.y + g[3] * 14], [c.x, c.y]];
  return [...pts.slice(0, i), ...bend, out, [g[0], g[1]], ...inner].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}

const roads = [];
const ROUTES = [["e", "valen"], ["n", "khazad"], ["s", "solkar"], ["w", "sylvana"], ["sylvana", "nocthar"], ["khazad", "nocthar"], ["valen", "solkar"], ["sylvana", "solkar"], ["khazad", "valen"]];
for (const [a, b] of ROUTES) {
  let start, lead = [];
  if (a.length === 1) { const [p0, p1] = exitOut(a); lead = [p0]; start = p1; } else start = [C(a).x, C(a).y];
  const end = [C(b).x, C(b).y];
  let raw = coarse(start[0], start[1], end[0], end[1]);
  for (let pass = 0; pass < 3; pass++) raw = raw.map((p, i) => {
    if (i === 0 || i === raw.length - 1) return p;
    let sx = 0, sy = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = raw[Math.max(0, Math.min(raw.length - 1, i + k))]; sx += q[0]; sy += q[1]; n++; }
    return [sx / n, sy / n];
  });
  const mid = chaikin(raw, 3);
  let pts = [...lead, ...mid]; pts = viaGate(pts, C(b));
  if (a.length > 1) pts = viaGate(pts.slice().reverse(), C(a)).reverse();
  roads.push({ from: a.length === 1 ? "arken" : a, to: b, exit: a.length === 1 ? a : null, pts });
}
const nearestOn = (p, list) => { let best = null, bd = 1e9; for (const r of list) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } } return { q: best, d: bd }; };
for (let k = 1; k < roads.length; k++) {
  const prev = roads.slice(0, k), r = roads[k];
  for (const end of [1, 0]) {
    const pts = end ? r.pts : r.pts.slice().reverse(); let cut = -1;
    for (let i = pts.length - 1; i > 0; i--) { if (nearestOn(pts[i], prev).d < 7) cut = i; else break; }
    if (cut > 0 && cut < pts.length - 1) { const keep = pts.slice(0, cut + 1), j = nearestOn(keep[keep.length - 1], prev).q; keep.push([Math.round(j[0] * 10) / 10, Math.round(j[1] * 10) / 10]); r.pts = end ? keep : keep.reverse(); }
  }
}
log("estradas", roads.length);

// ---------- 4. PORTO DE VALEN: 5 PÍERES NA BAÍA RECORTADA (ABAÍXO DO PROMONTÓRIO DO FAROL) + FROTA MAJESTOSA ----------
const ports = [];
{
  const c = C("valen");
  const docks = [], ships = [];
  const pierSpec = [
    { dy: -16, len: 28, w: 2.1, ship: "valen_galleon",  sdy: -7, sc: 1.95 },
    { dy: 4,   len: 34, w: 2.3, ship: "valen_galleon",  sdy: 8,  sc: 2.05 },
    { dy: 24,  len: 30, w: 2.1, ship: "valen_sailboat", sdy: -7, sc: 1.60 },
    { dy: 44,  len: 32, w: 2.2, ship: "valen_galleon",  sdy: 7,  sc: 1.90 },
    { dy: 60,  len: 20, w: 1.8, ship: "valen_rowboat",  sdy: 5,  sc: 1.15 },
  ];
  for (const p of pierSpec) {
    const edgeX = Math.round(c.x + valenBayEdge(p.dy));
    const y = c.y + p.dy;
    docks.push([[edgeX - 3, y], [edgeX + p.len, y], p.w]);
    ships.push([edgeX + p.len - 4, y + p.sdy, p.ship, p.sc]);
    if (p.len >= 30) {
      docks.push([[edgeX + Math.round(p.len * .55), y - 6], [edgeX + Math.round(p.len * .55), y + 6], 1.6]);
      ships.push([edgeX + Math.round(p.len * .55) + 7, y + (p.sdy > 0 ? -7 : 7), "valen_sailboat", 1.45]);
    }
  }
  ships.push([c.x + 88, c.y - 10, "valen_galleon", 2.05], [c.x + 92, c.y + 30, "valen_galleon", 1.90], [c.x + 76, c.y + 52, "valen_sailboat", 1.50]);
  const mainEdge = Math.round(c.x + valenBayEdge(4));
  ports.push({ city: "valen", x: mainEdge, y: c.y + 4, docks, ships });
}
const lakes = []; // lago de Solkar agora é geometria orgânica nativa em cityWater!

initNet({ cities, rivers, roads, ports, lakes, edge });

// ---------- 5. ARQUITETURA MULTI-DISTRITO DAS 5 CIDADES DO CONTINENTE ----------
const ROOMS_OUT = [];
const POLY = {
  khazad:  { n: 8,  r: [.92, .94], rot: Math.PI / 8 },
  valen:   { n: 12, r: [.86, .94], open: [-.82, .88] },
  solkar:  { n: 12, r: [.88, .94], open: [-.82, .92] },
  sylvana: { n: 18, r: [.82, .96] },
  nocthar: { n: 10, r: [.88, .95], rot: Math.PI / 10 },
};

// Constrói muralha / anel de árvores colossais + portões + helpers comuns
function makeCityCtx(c) {
  const B2 = c.buildings = [], used = [[c.x, c.y, 4.5]], rnd = (a, b, s) => hashTile(Math.round(a), Math.round(b), s);
  const P = POLY[c.id], verts = [];
  for (let k = 0; k < P.n; k++) {
    const a = k / P.n * 6.283 + (P.rot || 0);
    const f = P.r[0] + (P.r[1] - P.r[0]) * rnd(k, c.x, 171);
    verts.push([c.x + Math.cos(a) * c.rx * f, c.y + Math.sin(a) * c.ry * f, a]);
  }
  const gates = [];
  for (const [gx, gy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    if (c.id === "valen" && gx === 1) continue;
    for (let k = 0; k < P.n; k++) {
      const A = verts[k], Bv = verts[(k + 1) % P.n];
      const d = gx * (Bv[1] - A[1]) - gy * (Bv[0] - A[0]); if (!d) continue;
      const t = (gx * (c.y - A[1]) - gy * (c.x - A[0])) / d, s = ((A[0] - c.x) * (Bv[1] - A[1]) - (A[1] - c.y) * (Bv[0] - A[0])) / d;
      if (t >= 0 && t <= 1 && s > 0) { gates.push([A[0] + (Bv[0] - A[0]) * t, A[1] + (Bv[1] - A[1]) * t, gx, gy]); break; }
    }
  }
  c.gates = gates.map(g => [Math.round(g[0]), Math.round(g[1]), g[2], g[3]]);
  c.wall = verts.map(v => [Math.round(v[0] * 10) / 10, Math.round(v[1] * 10) / 10]);
  c.open = P.open || null;

  const isOpen = a => { if (!P.open) return false; let v = Math.atan2(Math.sin(a), Math.cos(a)); return v > P.open[0] && v < P.open[1]; };
  const inside = (x, y, m = .04) => {
    const e = cityInside(c, x, y);
    if (e > .91 - m) return false;
    if (c.id === "solkar" && x > c.x + 28) return e < .92 - m;
    if (c.id === "valen" && x > c.x + valenBayEdge(y - c.y) - 4) return false;
    return inPoly(c.wall, x, y);
  };
  const free = (x, y, r) => !used.some(([ux, uy, ur]) => Math.hypot(ux - x, uy - y) < r + ur);
  const wet = (x, y, fw = 1, fh = 1) => {
    for (let dy = -fh - 1; dy <= 1; dy++) for (let dx = -Math.ceil(fw / 2) - 1; dx <= Math.ceil(fw / 2) + 1; dx++) {
      const w = cityWater(c, x + dx + .5, y + dy + .5);
      if (w && !w.bridge) return true;
    }
    return false;
  };
  const add = (o, r = 2.5, force = false) => {
    o.x = Math.round(o.x); o.y = Math.round(o.y);
    if (!force && !o.outside && o.kind !== "cwall" && o.kind !== "ctower" && o.kind !== "rail" && o.kind !== "boat") {
      if (wet(o.x, o.y, o.fw || 1, o.fh || 1)) return null;
    }
    if (!force && !free(o.x, o.y, r)) return null;
    used.push([o.x, o.y, r]);
    B2.push(o);
    return o;
  };
  const placeNear = (tx, ty, o, r = 3, maxR = 26, allowStreet = false) => {
    for (let rad = 0; rad <= maxR; rad += 2) {
      const steps = rad ? Math.max(8, Math.round(rad * 1.5)) : 1;
      for (let i = 0; i < steps; i++) {
        const a = i / steps * 6.283 + rnd(tx + rad, ty, 301) * .5;
        const x = Math.round(tx + Math.cos(a) * rad), y = Math.round(ty + Math.sin(a) * rad);
        if (!inside(x, y, .04)) continue;
        if (!allowStreet && cityStreet(c, x + .5, y + .5)) continue;
        if (wet(x, y, o.fw || 3, o.fh || 2)) continue;
        if (!free(x, y, r)) continue;
        const res = add({ ...o, x, y }, r, true);
        if (res) return res;
      }
    }
    return null;
  };
  // Muralha perimetral (ou anel de árvores colossais em Sylvana)
  // Pass 1: torres de canto e torres duplas em todos os portões ANTES de lançar os segmentos de muro
  if (c.id !== "sylvana") {
    for (let k = 0; k < P.n; k++) {
      const A = verts[k], Bv = verts[(k + 1) % P.n], len = Math.hypot(Bv[0] - A[0], Bv[1] - A[1]);
      if (!isOpen(A[2]) && !(c.id === "valen" && A[0] > c.x + valenBayEdge(A[1] - c.y) - 3) && free(A[0], A[1], 1.5)) {
        add({ x: A[0], y: A[1], kind: "ctower", theme: c.id, scale: 1.40, fw: 2, fh: 2 }, 2.2, true);
      }
      const mid = Math.atan2((A[1] + Bv[1]) / 2 - c.y, (A[0] + Bv[0]) / 2 - c.x);
      if (isOpen(mid)) continue;
      for (const g of gates) {
        const vx = (Bv[0] - A[0]) / len, vy = (Bv[1] - A[1]) / len;
        const proj = (g[0] - A[0]) * vx + (g[1] - A[1]) * vy;
        if (proj < 0 || proj > len) continue;
        const dist = Math.hypot(A[0] + vx * proj - g[0], A[1] + vy * proj - g[1]);
        if (dist > 3) continue;
        for (const sd of [-6.2, 6.2]) {
          const tx = g[0] + vx * sd, ty = g[1] + vy * sd;
          if (c.id === "valen" && tx > c.x + valenBayEdge(ty - c.y) - 3) continue;
          if (free(tx, ty, 1.8)) add({ x: tx, y: ty, kind: "ctower", theme: c.id, scale: 1.44, fw: 2, fh: 2, gate: true }, 2.2, true);
        }
      }
    }
  }
  // Pass 2: cortinas de muralha ou anel de árvores colossais em Sylvana
  for (let k = 0; k < P.n; k++) {
    const A = verts[k], Bv = verts[(k + 1) % P.n], len = Math.hypot(Bv[0] - A[0], Bv[1] - A[1]);
    const mid = Math.atan2((A[1] + Bv[1]) / 2 - c.y, (A[0] + Bv[0]) / 2 - c.x);
    if (isOpen(mid)) continue;
    if (c.id === "sylvana") {
      for (let s2 = 0; s2 <= len; s2 += 6.2) {
        const x = A[0] + (Bv[0] - A[0]) * s2 / len, y = A[1] + (Bv[1] - A[1]) * s2 / len;
        if (gates.some(g => Math.hypot(g[0] - x, g[1] - y) < 8)) continue;
        if (wet(x, y, 2, 2)) continue;
        if (free(x, y, 3.0)) add({ x, y, kind: "colossal_tree", scale: 1.30 + rnd(x, y, 180) * .42, solid: true }, 3.0, true);
      }
      continue;
    }
    for (let s = 0; s <= len; s += 1) {
      const x = A[0] + (Bv[0] - A[0]) * s / len, y = A[1] + (Bv[1] - A[1]) * s / len;
      if (c.id === "valen" && x > c.x + valenBayEdge(y - c.y) - 2) continue;
      if (gates.some(g => Math.hypot(g[0] - x, g[1] - y) < 5.2)) continue;
      if (free(x, y, .48)) { used.push([Math.round(x), Math.round(y), .48]); B2.push({ x: Math.round(x), y: Math.round(y), kind: "cwall", theme: c.id }); }
    }
  }
  const addDoor = (o, kind) => {
    if (!o) return;
    o.door = `${c.id}_${kind}`;
    ROOMS_OUT.push({ id: o.door, city: c.id, name: `${o.label || kind} · ${c.name}`, outside: { x: o.x, y: o.y + 1 }, kind });
  };
  const blockedByB2 = (x, y) => B2.some(o => {
    if (o.solid === false) return false;
    const fw = o.fw || 1, fh = o.fh || 1;
    const x0 = o.x - Math.floor((fw - 1) / 2), y0 = o.y - fh + 1;
    return x >= x0 && x < x0 + fw && y >= y0 && y <= o.y;
  });
  const findWalkable = (tx, ty) => {
    for (let r = 0; r < 24; r++) for (let a = 0; a < 6.283; a += r ? .35 : 7) {
      const x = Math.round(tx + Math.cos(a) * r), y = Math.round(ty + Math.sin(a) * r);
      const t = tileAt(x, y);
      if (t !== B.CITY && t !== B.BRIDGE && t !== B.DOCK) continue;
      if (blockedByB2(x, y)) continue;
      return [x, y];
    }
    return [c.x, c.y];
  };
  return { B2, used, rnd, gates, inside, free, wet, add, placeNear, addDoor, findWalkable };
}

// === CIDADE 1: FORJA DE KHAZAD (imagem 1 como base, 3× maior e densa, 5 distritos, malha ferroviária & fosso em U de lava) ===
function buildKhazad(c) {
  const ctx = makeCityCtx(c);
  const { add, placeNear, addDoor, findWalkable, inside, free, wet, rnd, B2 } = ctx;
  // 1. Distrito Central: Cidadela-Forja Monumental abraçada pelo fosso em U de lava (dx=±20, dy=-26..+18)
  const cit = add({ x: c.x, y: c.y - 4, kind: "forgecitadel", fw: 11, fh: 5, scale: 2.50, label: "Cidadela-Forja" }, 6.5, true);
  addDoor(cit, "salao");
  add({ x: c.x - 13, y: c.y - 14, kind: "forge", fw: 3, fh: 2, scale: 1.35 }, 3.0, true);
  add({ x: c.x + 13, y: c.y - 14, kind: "forge", fw: 3, fh: 2, scale: 1.35 }, 3.0, true);
  for (const [dx, dy] of [[-13, 8], [13, 8], [-12, -2], [12, -2], [-8, 25], [8, 25], [-14, 34], [14, 34], [-11, 42], [11, 42]])
    add({ x: c.x + dx, y: c.y + dy, kind: "cauldron", scale: 1.2, fw: 1, fh: 1 }, 1.5);
  add({ x: c.x, y: c.y + 29, kind: "building", sprite: "anvil", fw: 2, fh: 1, scale: 1.75, label: "Monumento da Bigorna" }, 2.2);

  // 2. Malha Ferroviária de Vagonetas atravessando as pontes de lava (dy=-10, dy=+8, dx=+2)
  for (let dx = -78; dx <= 78; dx++) {
    if (Math.abs(dx) < 16) continue;
    const y = c.y - 10;
    if (!wet(c.x + dx, y, 1, 1) || cityWater(c, c.x + dx + .5, y + .5)?.bridge) B2.push({ x: c.x + dx, y, kind: "rail", solid: false });
  }
  for (let dx = -68; dx <= 68; dx++) {
    if (Math.abs(dx) < 16) continue;
    const y = c.y + 8;
    if (!wet(c.x + dx, y, 1, 1) || cityWater(c, c.x + dx + .5, y + .5)?.bridge) B2.push({ x: c.x + dx, y, kind: "rail", solid: false });
  }
  for (let dy = 14; dy <= 80; dy++) {
    const x = c.x + 2;
    if (!wet(x, c.y + dy, 1, 1) || cityWater(c, x + .5, c.y + dy + .5)?.bridge) B2.push({ x, y: c.y + dy, kind: "rail", vert: true, solid: false });
  }
  for (const [dx, dy] of [[-62, -10], [-36, -10], [36, -10], [64, -10], [56, 8], [-54, 8], [2, 48], [2, 68]])
    add({ x: c.x + dx, y: c.y + dy, kind: "minecart", scale: 1.15, fw: 1, fh: 1 }, 1.5, true);

  // 3. 24 Prédios nomeados distribuídos em 5 distritos densos
  const LANDS = [
    // Distrito de Fundição & Metalurgia (Leste)
    [38, -22, "forge", null, 1.42, 4, 3, "Grande Fundição Real"],
    [60, -22, "forge", null, 1.36, 4, 3, "Oficina de Armas"],
    [38, 20, "building", "khazad_house2", 1.35, 3, 2, "Guilda dos Ferreiros"],
    [62, 20, "forge", null, 1.36, 4, 3, "Forja do Mestre"],
    [74, -8, "building", "khazad_mine", 1.38, 4, 2, "Mina Leste de Ferro"],
    [46, -44, "building", "khazad_house2", 1.30, 3, 2, "Casa da Moeda"],
    [66, 38, "building", "barn", 1.30, 4, 2, "Carvoaria Real", "stone"],
    [38, 46, "building", "khazad_house1", 1.30, 3, 2, "Ferramenteiro"],
    // Distrito Mineiro & Trilhos (Oeste)
    [-74, -10, "building", "khazad_mine", 1.42, 4, 2, "Entrada da Mina Real"],
    [-58, -24, "building", "barn", 1.34, 4, 2, "Armazém de Minério", "stone"],
    [-38, -22, "building", "khazad_house2", 1.32, 3, 2, "Depósito de Trilhos"],
    [-60, 22, "forge", null, 1.36, 4, 3, "Fornalha Oeste"],
    [-38, 22, "building", "khazad_house1", 1.30, 3, 2, "Lapidação Bruta"],
    [-60, -44, "building", "khazad_mine", 1.34, 4, 2, "Galeria de Mitril"],
    [-40, -48, "building", "barn", 1.28, 4, 2, "Estábulo de Pôneis", "stone"],
    [-68, 38, "building", "watchtower", 1.36, 2, 2, "Torre da Encosta"],
    // Distrito da Praça das Bigornas & Taverna (Sul)
    [-26, 46, "building", "khazad_tavern", 1.44, 4, 2, "Taverna da Bigorna", null, "taverna"],
    [24, 46, "building", "khazad_house2", 1.35, 3, 2, "Banco de Khazad"],
    [-42, 56, "building", "khazad_house1", 1.28, 3, 2, "Cervejaria Anã"],
    [42, 56, "building", "khazad_house2", 1.28, 3, 2, "Templo da Bigorna"],
    [-18, 62, "building", "khazad_house1", 1.28, 3, 2, "Alojamento dos Mineiros"],
    [18, 62, "building", "khazad_house2", 1.28, 3, 2, "Casa da Guarda"],
    // Distrito Norte & Vigia
    [-26, -54, "building", "khazad_house2", 1.32, 3, 2, "Salão dos Engenheiros"],
    [26, -54, "building", "khazad_house1", 1.32, 3, 2, "Quartel de Ferro"],
  ];
  for (const [dx, dy, kind, sprite, scale, fw, fh, label, tint, room] of LANDS) {
    const o = placeNear(c.x + dx, c.y + dy, { kind, sprite: sprite || undefined, scale, fw, fh, tint: tint || null, label }, Math.max(fw, fh) + .6, 22);
    if (o && room) addDoor(o, room);
  }

  // 4. Malha urbana densa: casas de pedra escura, fundições, bigornas, racks de armas e pinheiros de encosta
  for (let y = c.y - c.ry + 10; y <= c.y + c.ry - 10; y += 6)
    for (let x = c.x - c.rx + 10; x <= c.x + c.rx - 10; x += 6) {
      const px = x + Math.round((rnd(x, y, 401) - .5) * 2), py = y + Math.round((rnd(x, y, 402) - .5) * 2);
      if (!inside(px, py, .03) || cityStreet(c, px + .5, py + .5) || wet(px, py, 3, 2) || !free(px, py, 2.15)) continue;
      const r = rnd(px, py, 403);
      if (r < .64) add({ x: px, y: py, kind: "building", sprite: r < .30 ? "khazad_house1" : r < .55 ? "khazad_house2" : "khazad_foundry", scale: 1.15 + rnd(px, py, 404) * .18, fw: 3, fh: 2 }, 2.25, true);
      else if (r < .80) add({ x: px, y: py, kind: r < .69 ? "cauldron" : "building", sprite: r < .69 ? undefined : ["anvil", "weapon_rack", "crate_stack", "barrel_rack", "cart"][Math.floor(rnd(px, py, 405) * 5)], scale: 1.08, fw: 1, fh: 1 }, 1.35, true);
      else add({ x: px, y: py, kind: "tree", sprite: r < .90 ? "pine" : "pine_small", tint: "deep", big: 1.20 + rnd(px, py, 406) * .25 }, 1.6, true);
    }

  // 5. NPCs nos seus distritos reais
  c.npcs = [
    ["Banqueiro", "banqueiro", 20, 40, { act: "bank" }],
    ["Mercador", "mercador", -8, 36, { shop: "mercador" }],
    ["Mensageiro", "guarda", 0, 42, { act: "travel" }],
    ["Guardião do armazém", "banqueiro", -48, -16, { shop: "armazem" }],
    ["Ferreiro", "ferreiro", 42, -12, { shop: "ferreiro" }],
    ["Metalurgista", "ferreiro", 46, 16, { shop: "metalurgica" }],
    ["Ferramenteiro", "mercador", 34, 40, { shop: "ferramentas" }],
    ["Guarda", "guarda", 6, 70, {}],
    ["Guarda", "guarda", -72, 8, {}],
  ].map(([title, voc, dx, dy, extra]) => { const [x, y] = findWalkable(c.x + dx, c.y + dy); return { x, y, voc, title, ...extra }; });

  // 6. Entorno vulcânico/montanhoso: 4 acampamentos mineradores, picos vulcânicos fumegantes e pinheiros escuros
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + .55, x = Math.round(c.x + Math.cos(a) * (c.rx + 36)), y = Math.round(c.y + Math.sin(a) * (c.ry + 32));
    out.push({ x, y, kind: "building", sprite: "khazad_mine", fw: 4, fh: 2, scale: 1.28 }, { x: x + 7, y: y + 3, kind: "building", sprite: "tent", fw: 3, fh: 2, scale: 1.15 },
      { x: x - 5, y: y + 4, kind: "minecart", fw: 1, fh: 1, scale: 1.15 }, { x: x + 2, y: y + 6, kind: "building", sprite: "campfire", fw: 1, fh: 1, solid: false },
      ...[1, 2, 3, 4, 5, 6].map(i => ({ x: x - 5 - i, y: y + 4, kind: "rail", solid: false })));
  }
  for (let k = 0; k < 42; k++) {
    const a = rnd(k, c.x, 420) * 6.283, d = 1.09 + rnd(k, c.y, 421) * .50;
    out.push({ x: c.x + Math.cos(a) * c.rx * d, y: c.y + Math.sin(a) * c.ry * d, kind: "peak", sprite: k % 2 === 0 ? "peak_volc" : "peak_snow", big: 1.35 + rnd(k, 3, 422) * .55 });
  }
  for (let k = 0; k < 680; k++) {
    const a = rnd(k, c.x, 425) * 6.283, d = 1.07 + rnd(k, c.y, 426) * .60;
    out.push({ x: c.x + Math.cos(a) * c.rx * d, y: c.y + Math.sin(a) * c.ry * d, kind: "tree", sprite: k % 3 ? "pine" : "pine_small", tint: "deep", big: 1.1 + rnd(k, 7, 427) * .35, grove: true });
  }
  return out;
}

// === CIDADE 2: OÁSIS DE SOLKAR (imagem 2 como base, 3× maior e densa, lago rim azul + bazar vibrante + jardins irrigados) ===
function buildSolkar(c) {
  const ctx = makeCityCtx(c);
  const { add, placeNear, addDoor, findWalkable, inside, free, wet, rnd } = ctx;
  // 1. Palácio do Oásis Monumental ao norte dominando o lago e o bazar
  const pal = placeNear(c.x - 16, c.y - 46, { kind: "palace", fw: 9, fh: 4, scale: 2.35, label: "Palácio do Oásis" }, 6.4);
  if (pal) addDoor(pal, "salao");

  // 2. Grande Bazar das Cores (44 tendas listradas vibrantes abraçando o lago, a praça e a avenida!)
  for (let k = 0; k < 22; k++) {
    const a = 1.82 + (k / 21) * 2.62;
    const rad = 26 + (k % 2) * 7;
    const tx = c.x + 26 + Math.cos(a) * rad, ty = c.y + 4 + Math.sin(a) * (rad * 1.22);
    placeNear(tx, ty, { kind: "bazaar", hue: k, scale: 1.22 + (k % 3) * .06, fw: 2, fh: 2 }, 2.1, 12);
  }
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * 6.283 + .2;
    const tx = c.x - 14 + Math.cos(a) * 11, ty = c.y + 4 + Math.sin(a) * 10;
    placeNear(tx, ty, { kind: "bazaar", hue: k + 1, scale: 1.20, fw: 2, fh: 2 }, 2.0, 6, true);
  }
  for (let k = 0; k < 14; k++) {
    const row = k < 7 ? -1 : 1, idx = k % 7;
    const tx = c.x - 16 + row * (8 + (idx % 2) * 4), ty = c.y - 26 + idx * 8;
    placeNear(tx, ty, { kind: "bazaar", hue: k + 2, scale: 1.18 + (k % 3) * .05, fw: 2, fh: 2 }, 2.1, 10);
  }

  // 3. 18 Prédios nomeados e cúpulas douradas em 5 distritos
  const LANDS = [
    [-34, 14, "building", "tavern", 1.38, 4, 2, "Taverna da Areia", null, "taverna"],
    [-30, -14, "dome", null, 1.34, 4, 3, "Casa das Gemas"],
    [-46, -4, "building", "solkar_adobe2", 1.32, 3, 2, "Guilda dos Joalheiros"],
    [-44, 20, "building", "solkar_adobe2", 1.30, 3, 2, "Banco de Solkar"],
    [-64, -18, "building", "solkar_adobe1", 1.28, 3, 2, "Lapidário"],
    [-64, 10, "building", "solkar_adobe2", 1.28, 3, 2, "Oficina de Processamento"],
    [-54, 40, "building", "solkar_adobe1", 1.28, 3, 2, "Caravançará"],
    [-28, 48, "dome", null, 1.30, 4, 3, "Banhos Públicos"],
    [22, -48, "dome", null, 1.34, 4, 3, "Templo do Sol"],
    [-44, -44, "dome", null, 1.28, 4, 3, "Biblioteca do Deserto"],
    [-66, -38, "dome", null, 1.24, 3, 2, "Observatório"],
    [-70, 28, "building", "barn", 1.30, 4, 2, "Estábulo de Camelos"],
    [-10, 58, "building", "solkar_adobe2", 1.26, 3, 2, "Casa da Água"],
    [-76, -6, "building", "solkar_adobe1", 1.26, 3, 2, "Mercador de Tapetes"],
    [-42, 62, "building", "solkar_adobe2", 1.26, 3, 2, "Casa do Caravaneiro"],
    [60, -24, "dome", null, 1.32, 4, 3, "Jardins Suspensos"],
    [66, 38, "building", "solkar_adobe1", 1.26, 3, 2, "Casa dos Jardineiros"],
    [72, -6, "dome", null, 1.26, 3, 2, "Pavilhão das Palmeiras"],
  ];
  for (const [dx, dy, kind, sprite, scale, fw, fh, label, tint, room] of LANDS) {
    const o = placeNear(c.x + dx, c.y + dy, { kind, sprite: sprite || undefined, scale, fw, fh, tint: tint || null, label }, Math.max(fw, fh) + .5, 20);
    if (o && room) addDoor(o, room);
  }

  // 4. Hortas irrigadas verdes no lado leste aberto + palmeirais exuberantes abraçando todo o lago (imagem 2!)
  for (const [dx, dy, fw, fh] of [[62, 10, 10, 7], [80, 14, 10, 7], [62, 32, 11, 7], [52, -32, 10, 6], [78, -18, 10, 7], [50, 50, 10, 6]]) {
    if (!wet(c.x + dx, c.y + dy, fw, fh)) add({ x: c.x + dx, y: c.y + dy, kind: "farm", fw, fh, solid: false }, 5.0, true);
  }
  for (let k = 0; k < 310; k++) {
    const a = rnd(k, c.x, 451) * 6.283;
    const rad = 1.01 + rnd(k, c.y, 452) * .72;
    const x = Math.round(c.x + 26 + Math.cos(a) * 23 * rad), y = Math.round(c.y + 4 + Math.sin(a) * 35 * rad);
    if (cityInside(c, x, y) > .95 || cityStreet(c, x + .5, y + .5) || wet(x, y, 1, 1) || !free(x, y, 1.5)) continue;
    if (k % 6 === 0) add({ x, y, kind: "tree", sprite: k % 12 === 0 ? "bush" : "bush2", big: 1.05, solid: false, decor: true }, 1.1, true);
    else add({ x, y, kind: "palm", sprite: "palm_date", big: 1.15 + rnd(x, y, 453) * .38 }, 1.55, true);
  }

  // 5. Bairros densos de casas térreas e sobrados de arenito/adobe no arco oeste/norte/sul
  for (let y = c.y - c.ry + 10; y <= c.y + c.ry - 10; y += 6)
    for (let x = c.x - c.rx + 10; x <= c.x + 4; x += 6) {
      const px = x + Math.round((rnd(x, y, 461) - .5) * 2), py = y + Math.round((rnd(x, y, 462) - .5) * 2);
      if (!inside(px, py, .03) || cityStreet(c, px + .5, py + .5) || wet(px, py, 3, 2) || !free(px, py, 2.1)) continue;
      const r = rnd(px, py, 463);
      if (r < .64) add({ x: px, y: py, kind: "building", sprite: r < .35 ? "solkar_adobe1" : "solkar_adobe2", scale: 1.14 + rnd(px, py, 464) * .18, fw: 3, fh: 2 }, 2.2, true);
      else if (r < .78) add({ x: px, y: py, kind: "bazaar", hue: Math.floor(r * 30), scale: 1.16, fw: 2, fh: 2 }, 1.9, true);
      else if (r < .88) add({ x: px, y: py, kind: "building", sprite: r < .83 ? "well" : "crate_stack", fw: 1, fh: 1 }, 1.3, true);
      else add({ x: px, y: py, kind: "palm", sprite: "palm_date", big: 1.18 }, 1.65, true);
    }

  // 6. NPCs nos seus distritos reais
  c.npcs = [
    ["Banqueiro", "banqueiro", -38, 18, { act: "bank" }],
    ["Mercador", "mercador", -14, 4, { shop: "mercador" }],
    ["Mensageiro", "guarda", -18, 12, { act: "travel" }],
    ["Guardião do armazém", "banqueiro", -26, -6, { shop: "armazem" }],
    ["Joalheiro", "banqueiro", -40, -4, { shop: "joalheria" }],
    ["Lapidário", "banqueiro", -56, -16, { shop: "lapidaria" }],
    ["Processador", "guarda", -56, 10, { shop: "processamento" }],
    ["Guarda", "guarda", -76, 4, {}],
    ["Guarda", "guarda", -18, 68, {}],
  ].map(([title, voc, dx, dy, extra]) => { const [x, y] = findWalkable(c.x + dx, c.y + dy); return { x, y, voc, title, ...extra }; });

  // 7. Entorno desértico: fazendas irrigadas externas, palmeiras perto do rio sul e cactos nas dunas
  const out = [];
  for (let k = 0; k < 6; k++) {
    const a = -1.0 + k * .44, d = 1.14 + (k % 2) * .18;
    const x = Math.round(c.x + Math.cos(a) * c.rx * d), y = Math.round(c.y + Math.sin(a) * c.ry * d);
    out.push({ x, y, kind: "farm", fw: 11, fh: 7, solid: false }, { x: x + 7, y: y - 1, kind: "building", sprite: "well", fw: 1, fh: 1 },
      { x: x - 7, y, kind: "palm", sprite: "palm_date", big: 1.25 }, { x: x + 8, y: y + 4, kind: "palm", sprite: "palm_date", big: 1.15 });
  }
  for (let k = 0; k < 380; k++) {
    const a = rnd(k, c.x, 470) * 6.283, d = 1.07 + rnd(k, c.y, 471) * .60;
    const eastOrSouth = Math.cos(a) > .2 || Math.sin(a) > .55;
    out.push({ x: c.x + Math.cos(a) * c.rx * d, y: c.y + Math.sin(a) * c.ry * d, kind: eastOrSouth || k % 3 === 0 ? "palm" : "cactus", sprite: eastOrSouth || k % 3 === 0 ? "palm_date" : "cactus_saguaro", big: 1.05 + rnd(k, 5, 472) * .35, grove: true });
  }
  return out;
}

// === CIDADE 3: PORTO DE VALEN (imagem 3 como base, 3× maior e densa, baía aberta, 5 píeres, farol na península rochosa) ===
function buildValen(c) {
  const ctx = makeCityCtx(c);
  const { add, placeNear, addDoor, findWalkable, inside, free, wet, rnd } = ctx;
  // 1. Farol Monumental sobre a península rochosa NE conectada à costa (imagem 3!)
  const lhX = c.x + Math.round(valenBayEdge(-44)) + 15, lhY = c.y - 44;
  add({ x: lhX, y: lhY, kind: "lighthouse", fw: 3, fh: 2, scale: 1.95, label: "Farol de Valen" }, 4.0, true);
  for (const [dx, dy] of [[-10, 4], [-6, -8], [8, -6], [10, 6], [-2, 10], [6, -12], [-12, -2]])
    add({ x: lhX + dx, y: lhY + dy, kind: "tree", sprite: "cliff_rock", big: 1.15 + rnd(dx, dy, 491) * .25, solid: true }, 2.0, true);
  for (const [dx, dy] of [[-14, 10], [-14, -8], [-8, 12]])
    add({ x: lhX + dx, y: lhY + dy, kind: "palm", sprite: "palm_coco", big: 1.15 }, 2.0, true);

  // 2. Grande Praça de Calçamento Irregular com Fonte & Mercado de Peixe vibrante
  add({ x: c.x + 4, y: c.y - 2, kind: "building", sprite: "fountain", fw: 2, fh: 2, scale: 2.05 }, 2.8, true);
  for (const [dx, dy] of [[11, -8], [16, -2], [12, 7], [18, 4], [7, 10], [-5, 9], [-7, -9], [2, -11], [12, -13], [-10, 2], [2, 12], [10, 12], [-4, -13], [-12, -6], [-11, 10], [16, -10]])
    add({ x: c.x + dx, y: c.y + dy, kind: "building", sprite: Math.abs(dx + dy) % 3 === 0 ? "stall" : "valen_fishstall", fw: 2, fh: 1, scale: 1.24 }, 1.8, true);
  for (const [dx, dy] of [[-3, -6], [10, -2], [-2, 6], [9, 6]])
    add({ x: c.x + dx, y: c.y + dy, kind: "building", sprite: (dx + dy) % 2 ? "flower_bed" : "crate_stack", fw: 1, fh: 1, solid: false }, 1.2, true);
  // Guindastes de cais e pilhas de carga ao longo do calçadão dos 5 píeres
  for (const dy of [-16, 4, 24, 44, 60]) {
    const ex = Math.round(c.x + valenBayEdge(dy)) - 4;
    add({ x: ex, y: c.y + dy - 3, kind: "building", sprite: "valen_crane", fw: 2, fh: 2, scale: 1.24 }, 2.4, true);
    add({ x: ex - 4, y: c.y + dy + 3, kind: "building", sprite: "crate_stack", scale: 1.1, fw: 1, fh: 1 }, 1.4, true);
    add({ x: ex - 6, y: c.y + dy - 2, kind: "building", sprite: "barrel_rack", scale: 1.05, fw: 1, fh: 1 }, 1.4, true);
  }

  // 3. 18 Prédios nomeados em 5 distritos portuários
  const LANDS = [
    [-16, -42, "castle", null, .90, 6, 4, "Capitania do Porto", null, "salao"],
    [-22, 14, "building", "tavern", 1.38, 4, 2, "Taverna do Cais", null, "taverna"],
    [-20, -16, "building", "valen_house1", 1.32, 3, 2, "Guilda dos Mercadores"],
    [-12, 28, "building", "valen_house1", 1.28, 3, 2, "Casa de Câmbio"],
    [14, 34, "building", "valen_warehouse", 1.38, 4, 2, "Armazém Naval"],
    [6, 52, "building", "valen_warehouse", 1.36, 4, 2, "Estaleiro de Valen"],
    [8, -50, "building", "valen_warehouse", 1.32, 4, 2, "Armazém de Peixe"],
    [-34, 42, "building", "valen_warehouse", 1.30, 4, 2, "Depósito de Sal"],
    [-46, 22, "building", "valen_house2", 1.28, 3, 2, "Curtume Real"],
    [-46, -20, "building", "valen_house1", 1.28, 3, 2, "Escola de Navegação"],
    [-36, -44, "building", "valen_house2", 1.28, 3, 2, "Capela do Mar"],
    [-64, -10, "building", "valen_house1", 1.28, 3, 2, "Alfândega do Oeste"],
    [-64, 16, "building", "valen_house2", 1.28, 3, 2, "Cordoaria"],
    [-16, -60, "building", "valen_house1", 1.26, 3, 2, "Escritório Naval"],
    [-14, 60, "building", "valen_house2", 1.26, 3, 2, "Defumadouro"],
    [-68, -34, "building", "watchtower", 1.35, 2, 2, "Torre do Vigia"],
    [-40, -64, "building", "valen_house2", 1.24, 3, 2, "Casa do Prático"],
    [-44, 60, "building", "barn", 1.28, 4, 2, "Armazém de Cordas"],
  ];
  for (const [dx, dy, kind, sprite, scale, fw, fh, label, tint, room] of LANDS) {
    const o = placeNear(c.x + dx, c.y + dy, { kind, sprite: sprite || undefined, scale, fw, fh, tint: tint || null, label }, Math.max(fw, fh) + .5, 20);
    if (o && room) addDoor(o, room);
  }

  // 4. Quarteirões medievais densíssimos com telhados variados (vermelho, palha, madeira) + árvores costeiras
  const houseSp = ["valen_house1", "valen_house2", "house", "house2", "house_thatch", "house_thatch2"];
  for (let y = c.y - c.ry + 10; y <= c.y + c.ry - 10; y += 6)
    for (let x = c.x - c.rx + 10; x <= c.x + 28; x += 6) {
      const px = x + Math.round((rnd(x, y, 501) - .5) * 2), py = y + Math.round((rnd(x, y, 502) - .5) * 2);
      if (!inside(px, py, .03) || cityStreet(c, px + .5, py + .5) || wet(px, py, 3, 2) || !free(px, py, 2.1)) continue;
      const r = rnd(px, py, 503);
      if (r < .72) add({ x: px, y: py, kind: "building", sprite: houseSp[Math.floor(rnd(px, py, 504) * houseSp.length)], scale: 1.14 + rnd(px, py, 505) * .16, fw: 3, fh: 2 }, 2.2, true);
      else if (r < .85) add({ x: px, y: py, kind: "building", sprite: ["barrel", "crate_stack", "flower_bed", "well", "cart"][Math.floor(rnd(px, py, 506) * 5)], fw: 1, fh: 1 }, 1.3, true);
      else add({ x: px, y: py, kind: r < .92 ? "palm" : "tree", sprite: r < .92 ? "palm_coco" : "tree_round", big: 1.18 }, 1.65, true);
    }

  // 5. NPCs nos seus distritos reais
  c.npcs = [
    ["Banqueiro", "banqueiro", -8, 22, { act: "bank" }],
    ["Mercador", "mercador", 10, 4, { shop: "mercador" }],
    ["Mensageiro", "guarda", -4, 12, { act: "travel" }],
    ["Guardião do armazém", "banqueiro", 16, 28, { shop: "armazem" }],
    ["Capitão do porto", "mercador", Math.round(valenBayEdge(4)) - 7, 4, { act: "port" }],
    ["Curtidor", "druid", -42, 20, { shop: "curtume" }],
    ["Guarda", "guarda", -76, 0, {}],
    ["Guarda", "guarda", -12, -72, {}],
    ["Guarda", "guarda", -12, 72, {}],
  ].map(([title, voc, dx, dy, extra]) => { const [x, y] = findWalkable(c.x + dx, c.y + dy); return { x, y, voc, title, ...extra }; });

  // 6. Entorno costeiro: vilas de pescadores N/S, coqueiros e mata costeira
  const out = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const fx = c.x + 8 - (k % 3) * 11, fy = c.y + s * (c.ry + 14 + Math.floor(k / 3) * 9);
      out.push({ x: fx, y: fy, kind: "building", sprite: k % 2 ? "valen_house2" : "house_thatch", scale: 1.15, fw: 3, fh: 2 });
    }
  }
  for (let k = 0; k < 660; k++) {
    const a = rnd(k, c.x, 510) * 6.283;
    if (Math.cos(a) > .45) continue; // lado leste é mar aberto
    const d = 1.07 + rnd(k, c.y, 511) * .56;
    const x = c.x + Math.cos(a) * c.rx * d, y = c.y + Math.sin(a) * c.ry * d;
    const coastal = Math.cos(a) > 0;
    out.push({ x, y, kind: coastal && k % 2 === 0 ? "palm" : "tree", sprite: coastal && k % 2 === 0 ? "palm_coco" : (k % 3 ? "oak" : "tree_round"), big: 1.08 + rnd(k, 9, 512) * .35, grove: true });
  }
  return out;
}

// === CIDADE 4: BOSQUES DE SYLVANA (imagem 4 como base, 3× maior e exuberante, santuário + 3 árvores colossais + 6 clareiras) ===
function buildSylvana(c) {
  const ctx = makeCityCtx(c);
  const { add, placeNear, addDoor, findWalkable, inside, free, wet, rnd } = ctx;
  // 1. Coração Sagrado: Santuário Druídico intimamente emoldurado pelas 3 Árvores Colossais (imagem 4!)
  add({ x: c.x, y: c.y - 3, kind: "sanctuary", fw: 5, fh: 3, scale: 1.75, label: "Santuário Druídico" }, 4.5, true);
  add({ x: c.x,      y: c.y - 12, kind: "colossal_tree", fw: 4, fh: 3, scale: 1.95, solid: true }, 4.6, true);
  add({ x: c.x - 13, y: c.y - 6,  kind: "colossal_tree", fw: 4, fh: 3, scale: 1.70, solid: true }, 4.2, true);
  add({ x: c.x + 13, y: c.y - 6,  kind: "colossal_tree", fw: 4, fh: 3, scale: 1.70, solid: true }, 4.2, true);
  for (const [dx, dy] of [[-12, 9], [12, 9], [-16, 2], [16, 2], [-8, 14], [8, 14], [-10, -14], [10, -14]])
    add({ x: c.x + dx, y: c.y + dy, kind: "tree", sprite: Math.abs(dx) > 13 ? "oak" : "pine", tint: "ancient", big: 1.32, solid: true }, 2.0, true);
  for (const [dx, dy] of [[-7, 6], [7, 6]])
    add({ x: c.x + dx, y: c.y + dy, kind: "monolith", scale: 1.18, fw: 1, fh: 1 }, 1.4, true);

  // 2. 20 Prédios nomeados aninhados nas 5 clareiras acolhedoras + clareira da taverna ao sul
  const LANDS = [
    // Clareira Norte — Druidas ([0, -52])
    [0, -56, "building", "sylvana_cottage", 1.42, 4, 2, "Salão dos Druidas", null, "salao"],
    [-12, -52, "building", "sylvana_herbalist", 1.30, 3, 2, "Casa da Anciã"],
    [13, -52, "building", "sylvana_garden", 1.32, 3, 2, "Jardim de Ervas Raras"],
    [0, -40, "monolith", null, 1.25, 1, 1, "Pedra das Runas"],
    // Clareira Noroeste — Lenhadores & Carpintaria ([-54, -22])
    [-58, -26, "building", "sylvana_sawmill", 1.38, 4, 2, "Serraria Élfica"],
    [-46, -32, "building", "sylvana_cottage", 1.30, 3, 2, "Guilda dos Lenhadores"],
    [-64, -14, "building", "sylvana_wagon", 1.22, 2, 1, "Pátio de Toras"],
    [-46, -14, "building", "sylvana_trunkhouse", 1.32, 3, 2, "Oficina de Carpintaria"],
    // Clareira Nordeste — Alquimia & Viveiro ([54, -26])
    [54, -30, "building", "sylvana_herbalist", 1.36, 3, 2, "Alquimia Verde"],
    [64, -20, "building", "sylvana_hut", 1.28, 3, 2, "Viveiro Ancestral"],
    [44, -20, "building", "sylvana_garden", 1.28, 3, 2, "Horta Medicinal"],
    // Clareira Sudoeste — Comércio & Banco ([-48, 38])
    [-50, 34, "building", "sylvana_trunkhouse", 1.34, 3, 2, "Banco da Raiz"],
    [-40, 44, "building", "sylvana_hut", 1.28, 3, 2, "Mercado de Mel e Cera"],
    [-58, 44, "building", "sylvana_cottage", 1.28, 3, 2, "Tecelagem Verde"],
    // Clareira Sudeste — Herbanário & Arqueiros ([52, 36])
    [52, 32, "building", "sylvana_herbalist", 1.32, 3, 2, "Herbanário"],
    [62, 42, "building", "sylvana_cottage", 1.28, 3, 2, "Arqueiros da Copa"],
    [42, 44, "building", "sylvana_hut", 1.26, 3, 2, "Ateliê de Arcos"],
    // Clareira Sul — Taverna da Raiz (ao sul do riacho sul, em solo 100% seco)
    [-14, 48, "building", "witch_hut", 1.44, 4, 2, "Taverna da Raiz", null, "taverna"],
    [14, 48, "building", "sylvana_cottage", 1.28, 3, 2, "Casa dos Guardiões"],
    [-16, 70, "building", "barn", 1.26, 4, 2, "Celeiro de Sementes"],
  ];
  for (const [dx, dy, kind, sprite, scale, fw, fh, label, tint, room] of LANDS) {
    const o = placeNear(c.x + dx, c.y + dy, { kind, sprite: sprite || undefined, scale, fw, fh, tint: tint || null, label }, Math.max(fw, fh) + .2, 16, true);
    if (o && room) addDoor(o, room);
  }
  // Cabanas extras e hortas aninhadas nas 5 clareiras secundárias para nenhuma parecer vazia
  for (const [gx, gy] of [[0, -52], [-54, -22], [54, -26], [-48, 38], [52, 36]]) {
    for (const [ox2, oy2, sp] of [[-7, -5, "sylvana_hut"], [7, -4, "sylvana_cottage"], [-6, 6, "sylvana_garden"], [6, 6, "sylvana_trunkhouse"]]) {
      placeNear(c.x + gx + ox2, c.y + gy + oy2, { kind: "building", sprite: sp, scale: 1.16, fw: 3, fh: 2 }, 2.1, 6, true);
    }
  }

  // 3. Floresta urbana densíssima e em camadas: cabanas de musgo/tronco, hortas, árvores colossais, pinheiros e cogumelos
  const hutSp = ["sylvana_cottage", "sylvana_hut", "sylvana_trunkhouse", "sylvana_herbalist", "sylvana_garden"];
  for (let y = c.y - c.ry + 8; y <= c.y + c.ry - 8; y += 5)
    for (let x = c.x - c.rx + 8; x <= c.x + c.rx - 8; x += 6) {
      const px = x + Math.round((rnd(x, y, 551) - .5) * 2), py = y + Math.round((rnd(x, y, 552) - .5) * 2);
      if (!inside(px, py, .02) || cityStreet(c, px + .5, py + .5) || wet(px, py, 2, 2) || !free(px, py, 1.95)) continue;
      const r = rnd(px, py, 553);
      if (r < .24) add({ x: px, y: py, kind: "building", sprite: hutSp[Math.floor(rnd(px, py, 554) * hutSp.length)], scale: 1.14 + rnd(px, py, 555) * .18, fw: 3, fh: 2 }, 2.4, true);
      else if (r < .38) add({ x: px, y: py, kind: "colossal_tree", scale: 1.20 + rnd(px, py, 556) * .38, solid: true }, 2.9, true);
      else if (r < .85) add({ x: px, y: py, kind: "tree", sprite: r < .58 ? "oak" : r < .76 ? "pine" : "tree_round", tint: "ancient", big: 1.22 + rnd(px, py, 557) * .38, solid: true }, 1.65, true);
      else add({ x: px, y: py, kind: "tree", sprite: r < .92 ? "giant_mushrooms" : r < .96 ? "mushroom_red" : "bush_dark", big: 1.08, solid: false, decor: true }, 1.1, true);
    }

  // 4. NPCs nos seus distritos reais
  c.npcs = [
    ["Banqueiro", "banqueiro", -48, 38, { act: "bank" }],
    ["Mercador", "mercador", -42, 40, { shop: "mercador" }],
    ["Mensageiro", "guarda", 0, 10, { act: "travel" }],
    ["Guardião do armazém", "banqueiro", -8, 10, { shop: "armazem" }],
    ["Alquimista", "sacerdote", 54, -24, { shop: "alquimista" }],
    ["Carpinteiro", "ferreiro", -52, -20, { shop: "carpintaria" }],
    ["Guarda", "guarda", 0, -76, {}],
    ["Guarda", "guarda", 0, 76, {}],
  ].map(([title, voc, dx, dy, extra]) => { const [x, y] = findWalkable(c.x + dx, c.y + dy); return { x, y, voc, title, ...extra }; });

  // 5. Entorno ancestral: serrarias externas, pilhas de toras e mata densa de árvores colossais
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a = k * 1.57 + .75, x = Math.round(c.x + Math.cos(a) * (c.rx + 34)), y = Math.round(c.y + Math.sin(a) * (c.ry + 32));
    out.push({ x, y, kind: "building", sprite: "sylvana_sawmill", scale: 1.26, fw: 4, fh: 2 }, { x: x + 6, y: y + 3, kind: "building", sprite: "sylvana_wagon", fw: 2, fh: 1 },
      { x: x - 5, y: y + 3, kind: "building", sprite: "log", fw: 1, fh: 1 }, { x: x + 2, y: y + 6, kind: "building", sprite: "stump", fw: 1, fh: 1 });
  }
  for (let k = 0; k < 820; k++) {
    const a = rnd(k, c.x, 560) * 6.283, d = 1.05 + rnd(k, c.y, 561) * .60;
    const isBig = k % 10 === 0;
    out.push({ x: c.x + Math.cos(a) * c.rx * d, y: c.y + Math.sin(a) * c.ry * d, kind: isBig ? "colossal_tree" : "tree", sprite: isBig ? "sylvana_colossal" : (k % 2 ? "oak" : "pine"), tint: isBig ? null : "ancient", big: isBig ? 1.18 : (1.15 + rnd(k, 3, 562) * .4), grove: true });
  }
  return out;
}

// === CIDADE 5: CIDADELA DE NOCTHAR (fortaleza gótica densa 3× maior, catedral arcana, fosso escuro, cristais & braseiros) ===
function buildNocthar(c) {
  const ctx = makeCityCtx(c);
  const { add, placeNear, addDoor, findWalkable, inside, free, wet, rnd } = ctx;
  // 1. Catedral Arcana monumental no centro + anel de 10 cristais arcanos brilhantes
  const cat = add({ x: c.x, y: c.y - 4, kind: "cathedral", fw: 9, fh: 4, scale: 2.45, label: "Catedral Arcana" }, 6.4, true);
  addDoor(cat, "salao");
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * 6.283 + .3;
    add({ x: c.x + Math.cos(a) * 16, y: c.y + Math.sin(a) * 13, kind: "crystal", scale: 1.30 }, 1.7, true);
  }
  // Braseiros de chama roxa ladeando todas as 4 avenidas e pontes sobre o fosso
  for (const [gx, gy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let k = 18; k <= 78; k += 11) {
      for (const sd of [-1, 1]) {
        const x = c.x + gx * k + (gy ? sd * 4 : 0), y = c.y + gy * k + (gx ? sd * 4 : 0);
        if (!wet(x, y, 1, 1)) add({ x, y, kind: "ptorch", scale: 1.15, fw: 1, fh: 1 }, 1.1);
      }
    }
  }

  // 2. 20 Prédios nomeados distribuídos no Santuário Interno (dentro do fosso) e no Bastião Externo
  const LANDS = [
    // Santuário Interno (Arcano — dentro do fosso)
    [-26, -18, "darktower", null, 1.45, 3, 3, "Biblioteca Proibida"],
    [26, -18, "darktower", null, 1.45, 3, 3, "Observatório Lunar"],
    [-26, 18, "building", "nocthar_house2", 1.35, 3, 2, "Guilda dos Encantadores"],
    [26, 18, "building", "nocthar_house2", 1.35, 3, 2, "Conselho Arcano"],
    // Bastião Externo (Mercado Negro, Criptas & Residências Góticas)
    [-34, 48, "building", "tavern", 1.38, 4, 2, "Taverna da Lua Negra", "void", "taverna"],
    [34, 48, "building", "nocthar_house2", 1.34, 3, 2, "Mercado Negro"],
    [-60, 18, "building", "nocthar_house1", 1.32, 3, 2, "Banco das Sombras"],
    [60, 18, "building", "nocthar_house2", 1.32, 3, 2, "Alquimia Sombria"],
    [-64, -18, "building", "nocthar_crypt", 1.34, 4, 2, "Ossuário"],
    [-50, -44, "building", "nocthar_crypt", 1.32, 4, 2, "Cripta Antiga"],
    [-24, -56, "building", "nocthar_crypt", 1.30, 4, 2, "Mausoléu"],
    [62, -22, "darktower", null, 1.38, 3, 3, "Vigia do Abismo"],
    [48, -46, "building", "nocthar_house2", 1.30, 3, 2, "Casa do Necromante"],
    [24, -56, "building", "nocthar_house1", 1.30, 3, 2, "Relicário"],
    [-22, 60, "building", "nocthar_house1", 1.28, 3, 2, "Casa das Velas"],
    [22, 60, "building", "nocthar_house2", 1.28, 3, 2, "Loja de Pergaminhos"],
    [-62, 42, "building", "nocthar_house1", 1.26, 3, 2, "Pousada Sombria"],
    [62, 42, "building", "nocthar_house1", 1.26, 3, 2, "Casa do Cartógrafo"],
    [72, -6, "building", "nocthar_house2", 1.26, 3, 2, "Escriba Arcano"],
    [-72, -4, "darktower", null, 1.35, 3, 3, "Torre do Crepúsculo"],
  ];
  for (const [dx, dy, kind, sprite, scale, fw, fh, label, tint, room] of LANDS) {
    const o = placeNear(c.x + dx, c.y + dy, { kind, sprite: sprite || undefined, scale, fw, fh, tint: tint || null, label }, Math.max(fw, fh) + .5, 20);
    if (o && room) addDoor(o, room);
  }

  // 3. Quarteirões góticos densos: casas tingidas de roxo, cristais, ruínas e árvores retorcidas
  for (let y = c.y - c.ry + 10; y <= c.y + c.ry - 10; y += 6)
    for (let x = c.x - c.rx + 10; x <= c.x + c.rx - 10; x += 6) {
      const px = x + Math.round((rnd(x, y, 601) - .5) * 2), py = y + Math.round((rnd(x, y, 602) - .5) * 2);
      if (!inside(px, py, .03) || cityStreet(c, px + .5, py + .5) || wet(px, py, 3, 2) || !free(px, py, 2.15)) continue;
      const r = rnd(px, py, 603);
      if (r < .62) add({ x: px, y: py, kind: "building", sprite: r < .31 ? "nocthar_house1" : "nocthar_house2", scale: 1.15 + rnd(px, py, 604) * .18, fw: 3, fh: 2 }, 2.25, true);
      else if (r < .74) add({ x: px, y: py, kind: "crystal", scale: 1.12 }, 1.45, true);
      else if (r < .89) add({ x: px, y: py, kind: "tree", sprite: "dead_shadow", big: 1.18 + rnd(px, py, 605) * .2 }, 1.65, true);
      else add({ x: px, y: py, kind: "ruinwall", sprite: "ruin_wall", big: 1.15 }, 1.6, true);
    }

  // 4. NPCs nos seus distritos reais
  c.npcs = [
    ["Banqueiro", "banqueiro", -54, 18, { act: "bank" }],
    ["Mercador", "mercador", 12, 10, { shop: "mercador" }],
    ["Mensageiro", "guarda", 0, 12, { act: "travel" }],
    ["Guardião do armazém", "banqueiro", -12, 10, { shop: "armazem" }],
    ["Encantador", "sacerdote", -22, 18, { shop: "encantador" }],
    ["Leiloeiro", "mercador", 30, 44, { shop: "market" }],
    ["Guarda", "guarda", 0, 70, {}],
    ["Guarda", "guarda", 72, 0, {}],
  ].map(([title, voc, dx, dy, extra]) => { const [x, y] = findWalkable(c.x + dx, c.y + dy); return { x, y, voc, title, ...extra }; });

  // 5. Entorno sombrio: 5 círculos rituais com cristais e braseiros + bosques de árvores mortas retorcidas
  const out = [];
  for (let k = 0; k < 5; k++) {
    const a = k * 1.25 + .4, x = Math.round(c.x + Math.cos(a) * (c.rx + 36)), y = Math.round(c.y + Math.sin(a) * (c.ry + 32));
    for (let j = 0; j < 6; j++) { const aa = j / 6 * 6.283; out.push({ x: x + Math.cos(aa) * 6, y: y + Math.sin(aa) * 5, kind: j % 2 ? "crystal" : "ptorch", scale: 1.15 }); }
    out.push({ x, y, kind: "building", sprite: "statue", scale: 1.2, fw: 1, fh: 1 });
  }
  for (let k = 0; k < 660; k++) {
    const a = rnd(k, c.x, 610) * 6.283, d = 1.07 + rnd(k, c.y, 611) * .60;
    out.push({ x: c.x + Math.cos(a) * c.rx * d, y: c.y + Math.sin(a) * c.ry * d, kind: k % 4 === 0 ? "ruinwall" : "tree", sprite: k % 4 === 0 ? "ruin_wall" : "dead_shadow", big: 1.12 + rnd(k, 3, 612) * .35, grove: true });
  }
  return out;
}

const BUILDERS = { khazad: buildKhazad, solkar: buildSolkar, valen: buildValen, sylvana: buildSylvana, nocthar: buildNocthar };
for (const c of cities.filter(c => !c.heart)) {
  const outside = BUILDERS[c.id](c);
  // postos de guarda externos em cada portão
  for (const g of c.gates) {
    const px = g[0] + g[2] * 30 + (g[3] ? 8 : 0), py = g[1] + g[3] * 30 + (g[2] ? 8 : 0);
    outside.push(
      { x: px, y: py, kind: "building", sprite: "guardhouse", fw: 2, fh: 2, scale: 1.25 },
      { x: px + 4, y: py + 1, kind: "building", sprite: "banner", fw: 1, fh: 1 },
      { x: px - 3, y: py + 2, kind: "building", sprite: "campfire", fw: 1, fh: 1, solid: false },
      { x: px + 2, y: py + 5, kind: "building", sprite: "tent", fw: 3, fh: 2, scale: 1.1 }
    );
  }
  for (const o of outside) {
    o.x = Math.round(o.x); o.y = Math.round(o.y); o.outside = true;
    const t = tileAt(o.x, o.y);
    if (isBlocked(t) || t === B.ROAD || t === B.BRIDGE || t === B.HEART || t === B.DOCK || t === B.BEACH || t === B.CITY) continue;
    if (o.grove && [tileAt(o.x + 1, o.y), tileAt(o.x - 1, o.y), tileAt(o.x, o.y + 1), tileAt(o.x, o.y - 1)].some(b => b === B.ROAD || b === B.BRIDGE || b === B.CITY)) continue;
    if (cityInside(c, o.x, o.y) < 1.07) continue;
    c.buildings.push(o);
  }
}
const CITY_ROOMS = ROOMS_OUT;
log("construções multi-distrito:", cities.filter(c => !c.heart).map(c => `${c.id}=${c.buildings.length}`).join(" "));

const hunts = [], monsters = [], nodes = [], markers = [];
const okArea = (x, y, r) => {
  for (let a = 0; a < 6.283; a += .5)
    for (const rr of [0, r * .5, r]) {
      const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr);
      const b = tileAt(px, py);
      if (isBlocked(b) || b === B.HEART || b === B.CITY) return false;
    }
  return true;
};
initNet({ cities, rivers, roads, ports, lakes, edge });

// ---------- 6. TERRITÓRIOS GEOGRÁFICOS (TIER 1/2/3 ORGÂNICOS) ----------
const GROUP = {
  [B.PLAINS]: "planicie", [B.FIELD]: "planicie", [B.FOREST]: "floresta", [B.ANCIENT]: "floresta",
  [B.SWAMP]: "pantano", [B.MANGROVE]: "pantano", [B.MURKY]: "pantano",
  [B.DESERT]: "deserto", [B.CANYON]: "deserto",
  [B.MOUNTAIN]: "montanha", [B.PEAK]: "montanha", [B.VOLCANIC]: "vulcao", [B.LAVA]: "vulcao",
  [B.TUNDRA]: "gelo", [B.GLACIER]: "gelo", [B.ICE]: "gelo", [B.DARK]: "sombrio", [B.BEACH]: "costa", [B.CLIFF]: "costa"
};
const GCOST = { planicie: 1, costa: 1.2, deserto: 1.4, floresta: 1.6, gelo: 2.1, pantano: 2.3, sombrio: 2.2, montanha: 2.7, vulcao: 3 };
const CELL = 16, TW = Math.ceil(SIZE / CELL), cellB = new Uint8Array(TW * TW), cellG = new Array(TW * TW), cellRoad = new Uint8Array(TW * TW);
for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) {
  const x = i * CELL - OX + 8, y = j * CELL - OY + 8; const b = tileAt(x, y);
  cellB[j * TW + i] = b; cellG[j * TW + i] = GROUP[b] || null;
  if (b === B.ROAD || b === B.BRIDGE || b === B.CITY) cellRoad[j * TW + i] = 1;
}
const CNOISE = new Float32Array(TW * TW);
for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) CNOISE[j * TW + i] = .55 + 1.1 * fbm2(i * CELL / 260, j * CELL / 260);
const isLand = k => { const b = cellB[k]; return !(b === B.DEEP || b === B.OCEAN || b === B.SHALLOW); };
const riverSegs = []; for (const r of rivers) for (let i = 1; i < r.pts.length; i++) riverSegs.push([r.pts[i - 1], r.pts[i]]);
const RG = new Map();
for (const [a, b] of riverSegs) {
  for (const dx of [0, 1]) for (const dy of [0, 1]) {
    const kk = (Math.floor(Math.min(a[0], b[0]) / 64) + dx) + "," + (Math.floor(Math.min(a[1], b[1]) / 64) + dy);
    if (!RG.has(kk)) RG.set(kk, []); RG.get(kk).push([a, b]);
  }
}
const cross = (p1, p2, a, b) => { const d = (p2[0] - p1[0]) * (b[1] - a[1]) - (p2[1] - p1[1]) * (b[0] - a[0]); if (!d) return false; const t = ((a[0] - p1[0]) * (b[1] - a[1]) - (a[1] - p1[1]) * (b[0] - a[0])) / d, u = ((a[0] - p1[0]) * (p2[1] - p1[1]) - (a[1] - p1[1]) * (p2[0] - p1[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
function riverBetween(x1, y1, x2, y2) { const segs = RG.get(Math.floor(Math.min(x1, x2) / 64) + "," + Math.floor(Math.min(y1, y2) / 64)) || []; for (const [a, b] of segs) if (cross([x1, y1], [x2, y2], a, b)) return true; return false; }

const D = new Float64Array(TW * TW).fill(Infinity), OWN = new Int8Array(TW * TW).fill(-1);
const heap = [];
const hpush = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
cities.forEach((c, ci) => {
  for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) {
    const x = i * CELL - OX + 8, y = j * CELL - OY + 8, k = j * TW + i;
    const insideC = c.heart ? (x >= 0 && y >= 0 && x < 300 && y < 200) : cityInside(c, x, y) < 1.05;
    if (insideC) { D[k] = 0; OWN[k] = ci; hpush(0, k); }
  }
});
while (heap.length) {
  const [f, k] = hpop(); if (f > D[k] + 1e-3) continue;
  const i = k % TW, j = (k / TW) | 0;
  for (const [di, dj, dw] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
    const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= TW || nj >= TW) continue;
    const nk = nj * TW + ni; if (!isLand(nk)) continue;
    const g0 = cellG[k], g1 = cellG[nk]; let c2 = cellRoad[nk] ? .7 : (GCOST[g1] || 2.5);
    if (cellB[nk] === B.LAKE) c2 = 6; if (cellB[nk] === B.PEAK || cellB[nk] === B.LAVA) c2 = 5;
    c2 *= dw * CNOISE[nk]; if (g0 && g1 && g0 !== g1) c2 += 7;
    const x1 = i * CELL - OX + 8, y1 = j * CELL - OY + 8, x2 = ni * CELL - OX + 8, y2 = nj * CELL - OY + 8;
    if (!(cellRoad[k] && cellRoad[nk]) && riverBetween(x1, y1, x2, y2)) c2 += 45;
    const nd = f + c2; if (nd < D[nk]) { D[nk] = nd; OWN[nk] = OWN[k]; hpush(nd, nk); }
  }
}
const cut = cities.map((c, ci) => { const ds = []; for (let k = 0; k < TW * TW; k++) if (OWN[k] === ci && isLand(k) && D[k] > 0) ds.push(D[k]); ds.sort((a, b) => a - b); const q = f => ds[Math.floor(ds.length * f)] || 0; return [q(c.heart ? .05 : .08), q(c.heart ? .36 : .38)]; });
const lab = new Int8Array(TW * TW).fill(-1);
for (let k = 0; k < TW * TW; k++) {
  if (!isLand(k)) continue; let ci = OWN[k], d = D[k];
  if (ci < 0) { const x = (k % TW) * CELL - OX, y = ((k / TW) | 0) * CELL - OY; let bd = 1e18; cities.forEach((c, i2) => { const dd = Math.hypot(x - (c.heart ? 150 : c.x), y - (c.heart ? 100 : c.y)); if (dd < bd) { bd = dd; ci = i2; } }); d = 1e9; }
  const tier = d <= cut[ci][0] ? 1 : d <= cut[ci][1] ? 2 : 3; lab[k] = ci * 3 + tier - 1;
}
for (let pass = 0; pass < 2; pass++) {
  const src = lab.slice();
  for (let j = 1; j < TW - 1; j++) for (let i = 1; i < TW - 1; i++) {
    const k = j * TW + i; if (src[k] < 0) continue; const cnt = new Map();
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[k + dj * TW + di]; if (v >= 0) cnt.set(v, (cnt.get(v) || 0) + 1); }
    let bv = src[k], bc = 0; for (const [v, n] of cnt) if (n > bc) { bc = n; bv = v; } if (bv !== src[k] && bc >= 5) lab[k] = bv;
  }
}
cities.forEach((c, ci) => {
  for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) {
    const x = i * CELL - OX + 8, y = j * CELL - OY + 8;
    if (c.heart ? (x >= 0 && y >= 0 && x < 300 && y < 200) : cityInside(c, x, y) < 1.08) lab[j * TW + i] = ci * 3;
  }
});
const territory = { cell: CELL, w: TW, h: TW, rows: [] };
for (let j = 0; j < TW; j++) { let row = ""; for (let i = 0; i < TW; i++) { const v = lab[j * TW + i]; row += v < 0 ? "." : String.fromCharCode(97 + v); } territory.rows.push(row); }
NET.territory = territory;
const labAt = (x, y) => { const i = Math.floor((x + OX) / CELL), j = Math.floor((y + OY) / CELL); if (i < 0 || j < 0 || i >= TW || j >= TW) return -1; return lab[j * TW + i]; };

// ---------- 7. ÁREAS DE CAÇA TEMÁTICAS (536+) ----------
const ROSTER = {
  planicie: [["javali_planicie", "Javali da planície", "boar", "fera", "cr_javali"], ["bandoleiro", "Bandoleiro da estrada", "bandit", "humano", "cr_bandido"], ["lobo_alfa", "Lobo-alfa", "wolf", "lobo", "cr_lobo"]],
  floresta: [["aranha_bosque", "Aranha-do-bosque", "spider", "aracnideo", "cr_aranha"], ["lobo_mata", "Lobo da mata", "wolf", "lobo", "cr_lobo"], ["guardiao_mata", "Guardião da mata", "golem", "planta", "cr_ent"]],
  pantano:  [["rato_brejo", "Rato-do-brejo", "rat", "fera", "cr_rato"], ["afogado_mangue", "Afogado do mangue", "drowned", "morto_vivo", "cr_afogado"], ["bruxa_brejo", "Bruxa do brejo", "witch", "humano", "cr_bruxa"]],
  deserto:  [["saqueador_duna", "Saqueador das dunas", "bandit", "humano", "cr_bandido"], ["escorpiao_rubro", "Escorpião rubro", "spider", "aracnideo", "cr_aranha"], ["vespa_sol", "Vespa do sol", "wasp", "inseto", "cr_vespa"]],
  montanha: [["minerador_perdido", "Minerador perdido", "miner", "morto_vivo", "cr_mineiro"], ["lobo_serra", "Lobo da serra", "wolf", "lobo", "cr_lobo_neve"], ["golem_pedra", "Golem de pedra", "golem", "golem", "cr_golem"]],
  vulcao:   [["vespa_cinza", "Vespa de cinza", "wasp", "inseto", "cr_vespa"], ["golem_brasa", "Golem de brasa", "golem", "golem", "cr_golem"], ["dragonete", "Dragonete", "dragonling", "dragao", "cr_golem"]],
  gelo:     [["lobo_gelo", "Lobo do gelo", "wolf", "lobo", "cr_lobo_neve"], ["troll_neve", "Troll da neve", "golem", "gigante", "cr_troll_gelo"], ["sentinela_gelada", "Sentinela gelada", "guardian", "golem", "cr_sentinela"]],
  sombrio:  [["esqueleto_errante", "Esqueleto errante", "fallen", "morto_vivo", "cr_cavaleiro"], ["cavaleiro_caido", "Cavaleiro caído", "fallen", "morto_vivo", "cr_cavaleiro"], ["sentinela_sombria", "Sentinela sombria", "guardian", "golem", "cr_guardiao"]],
  costa:    [["pirata_costa", "Pirata da costa", "bandit", "humano", "cr_bandido"], ["afogado_costa", "Afogado da costa", "drowned", "morto_vivo", "cr_afogado"], ["capitao_afogado", "Capitão afogado", "fallen", "morto_vivo", "cr_afogado"]],
};
const TINT = { gelo: "ice", vulcao: "deep", sombrio: "void", deserto: "sand", floresta: "ancient" };
const PLACE = {
  planicie: ["Campina", "Colinas", "Pasto", "Vau"], floresta: ["Bosque", "Clareira", "Mata", "Toca"],
  pantano: ["Brejo", "Charco", "Lodaçal", "Mangue"], deserto: ["Dunas", "Cânion", "Areal", "Oásis seco"],
  montanha: ["Encosta", "Garganta", "Mina velha", "Penhasco"], vulcao: ["Cratera", "Campo de cinzas", "Fenda", "Forja velha"],
  gelo: ["Geleira", "Vale gelado", "Fiorde", "Picos brancos"], sombrio: ["Ruínas", "Cemitério", "Torre caída", "Vale das sombras"],
  costa: ["Enseada", "Recife", "Praia", "Farol velho"],
};
const HUNT_PROPS = {
  planicie: ["campfire", "cart", "haystack", "log", "stump"],
  floresta: ["web", "cocoon", "giant_mushrooms", "stump", "log"],
  pantano:  ["reed", "cattail", "skull", "dead_shrub", "mushroom_red"],
  deserto:  ["desert_bones", "bone_pile", "tent", "campfire", "skull"],
  montanha: ["minecart", "crate", "bone_pile", "moss_rock2", "campfire"],
  vulcao:   ["bone_pile", "skull", "cauldron", "dead_shrub", "moss_rock2"],
  gelo:     ["bone_pile", "moss_rock", "campfire", "crate", "skull"],
  sombrio:  ["skull", "bone_pile", "candle", "statue", "crystal"],
  costa:    ["barrel", "crate_stack", "campfire", "tent", "wheel"],
};
const SYL1 = ["Val", "Mor", "Ar", "Bel", "Kar", "Thal", "Eld", "Gor", "Nor", "Dra", "Ost", "Fen", "Lir", "Bran", "Cor", "Ves"];
const SYL2 = ["en", "ia", "or", "as", "um", "eth", "ar", "in", "dor", "mir", "vel", "ros"];
const TADD = [3, 16, 32], monIdx = new Map(), perCity = {}; let wi = 0;
function creature(grp, tier, city, boss) {
  const [rid, name, sprite, fam, loot] = ROSTER[grp][tier - 1], c = cities.find(q => q.id === city), id = `${rid}_${city}${boss ? "_chefe" : ""}`;
  if (!monIdx.has(id)) {
    const lvl = c.base + TADD[tier - 1] + (boss ? 6 : 0); monIdx.set(id, 1);
    monsters.push({ id, name: boss ? `Chefe ${name.toLowerCase()}` : name, sprite, lvl, cat: boss ? "miniboss" : tier === 3 ? "elite" : tier === 2 ? "incomum" : "comum", fam, tint: TINT[grp] || null, realm: "eldoria", city, loot, group: grp, tier });
  }
  return id;
}
const SP = 360, extras = [];
for (let gy = -OY + SP / 2; gy < SIZE - OY; gy += SP) for (let gx = -OX + SP / 2; gx < SIZE - OX; gx += SP) {
  const jx = Math.round(gx + (hashTile(gx, gy, 131) - .5) * SP * .6), jy = Math.round(gy + (hashTile(gx, gy, 132) - .5) * SP * .6);
  if (jx > -40 && jy > -40 && jx < 340 && jy < 240) continue;
  let spot = null;
  for (let t = 0; t < 30 && !spot; t++) {
    const a = hashTile(jx, t, 133) * 6.283, rr = t * 6;
    const x = Math.round(jx + Math.cos(a) * rr), y = Math.round(jy + Math.sin(a) * rr);
    const b = tileAt(x, y);
    if (GROUP[b] && !isBlocked(b) && labAt(x, y) >= 0 && okArea(x, y, 9) && !hunts.some(h => Math.hypot(h.cx - x, h.cy - y) < 130) && !cities.some(c => !c.heart && cityInside(c, x, y) < 1.32)) spot = [x, y, b];
  }
  if (!spot) continue;
  const v = labAt(spot[0], spot[1]), city = cities[Math.floor(v / 3)].id, tier = v % 3 + 1, grp = GROUP[spot[2]];
  const key = city + tier; perCity[key] = (perCity[key] || 0) + 1;
  const boss = tier === 3 && perCity[key] % 6 === 2;
  const mon = creature(grp, tier, city, false), bossId = boss ? creature(grp, tier, city, true) : null, lvl = monsters.find(m => m.id === mon).lvl;
  const pl = PLACE[grp][Math.floor(hashTile(spot[0], spot[1], 134) * 4)], nm = SYL1[Math.floor(hashTile(spot[0], spot[1], 135) * SYL1.length)] + SYL2[Math.floor(hashTile(spot[0], spot[1], 136) * SYL2.length)];
  const named = city !== "arken" && perCity[key] === 1 ? `${city}_a${tier}` : `w${String(++wi).padStart(3, "0")}`;
  hunts.push({ id: named, name: `${pl} de ${nm}`, mon, boss: bossId, cx: spot[0], cy: spot[1], r: 9, city, ring: tier, lvl, wild: true, group: grp, region: cities.find(c => c.id === city).regions[tier - 1] });
  // micro-cenário temático na borda da área de caça (não bloqueante, riqueza visual no continente inteiro!)
  const plist = HUNT_PROPS[grp] || HUNT_PROPS.planicie;
  for (let p = 0; p < 3; p++) {
    const a = p * 2.09 + hashTile(spot[0], spot[1], 150 + p) * 1.4;
    const px = Math.round(spot[0] + Math.cos(a) * 8.5), py = Math.round(spot[1] + Math.sin(a) * 8.5);
    const sp = plist[Math.floor(hashTile(px, py, 160 + p) * plist.length)];
    const kind = sp === "crystal" ? "crystal" : sp === "cauldron" ? "cauldron" : sp === "minecart" ? "minecart" : "building";
    extras.push({ x: px, y: py, kind, sprite: kind === "building" ? sp : undefined, fw: 1, fh: 1, solid: false, decor: true });
  }
}
log("caças por cidade/nível", JSON.stringify(perCity));

// ---------- 8. DEPÓSITOS DE COLETA POR TIER ----------
for (const c of cities.filter(c => !c.heart)) for (let k = 1; k <= 3; k++) {
  const h0 = hunts.find(h => h.id === `${c.id}_a${k}`) || hunts.find(h => h.city === c.id && h.ring === k); if (!h0) continue;
  const kinds = k === 1 ? ["rocha", "arvore", "erva"] : k === 2 ? ["veio_ferro", "veio_prata", "carvalho_antigo"] : ["veio_mitril", "veio_profundo", "veio_diamante"];
  for (const [j, kind] of kinds.entries()) {
    let p = null;
    for (let t = 0; t < 80 && !p; t++) {
      const a = hashTile(j, t, 97 + k) * 6.283, rr = 14 + t * .6;
      const x = Math.round(h0.cx + Math.cos(a) * rr), y = Math.round(h0.cy + Math.sin(a) * rr);
      const b = tileAt(x, y);
      if (!isBlocked(b) && b !== B.ROAD && b !== B.CITY && b !== B.HEART && okArea(x, y, 1.5) && labAt(x, y) % 3 + 1 === k) p = [x, y];
    }
    if (p) nodes.push({ id: `${c.id}_${kind}_${k}`, kind, x: p[0], y: p[1], city: c.id, ring: k, owner: k === 3 ? "city:" + c.id : null });
  }
}

// ---------- 9. GRANDES LAGOAS: PÍER, LANTERNAS, BARCO, PESCA RARA E BARQUEIRO ----------
const boatPorts = [], pendingFish = [];
{
  const LC = 6, LW = Math.ceil(SIZE / LC), mask = new Uint8Array(LW * LW), comp = new Int32Array(LW * LW).fill(-1);
  for (let j = 0; j < LW; j++) for (let i = 0; i < LW; i++) if (baseBiome(i * LC + 3, j * LC + 3) === B.LAKE) mask[j * LW + i] = 1;
  const comps = [];
  for (let k = 0; k < LW * LW; k++) if (mask[k] && comp[k] < 0) {
    const q = [k], cells = []; comp[k] = comps.length;
    while (q.length) {
      const c2 = q.pop(); cells.push(c2); const i = c2 % LW, j = (c2 / LW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= LW || nj >= LW) continue;
        const nk = nj * LW + ni; if (mask[nk] && comp[nk] < 0) { comp[nk] = comps.length; q.push(nk); }
      }
    }
    comps.push(cells);
  }
  const roadPts = []; for (const r of roads) for (let i = 0; i < r.pts.length; i += 4) roadPts.push(r.pts[i]);
  const toL = k => [(k % LW) * LC - OX + 3, ((k / LW) | 0) * LC - OY + 3];
  let n = 0;
  for (const cells of comps) {
    if (cells.length < 110) continue;
    const pts = cells.map(toL), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    if (cities.some(c => !c.heart && Math.hypot(c.x - cx, c.y - cy) < 260) || (cx > -60 && cy > -60 && cx < 360 && cy < 260)) continue;
    const shore = cells.filter(k => { const i = k % LW, j = (k / LW) | 0; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => !mask[(j + dj) * LW + i + di]); }).map(toL);
    if (shore.length < 8) continue;
    const dRoad = p => { let b = 1e9; for (const q of roadPts) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < b) b = d; } return b; };
    const A = shore.reduce((best, p) => dRoad(p) < dRoad(best) ? p : best, shore[0]);
    const Bp = shore.reduce((best, p) => Math.hypot(p[0] - A[0], p[1] - A[1]) > Math.hypot(best[0] - A[0], best[1] - A[1]) ? p : best, shore[0]);
    const name = SYL1[Math.floor(hashTile(Math.round(cx), Math.round(cy), 141) * SYL1.length)] + SYL2[Math.floor(hashTile(Math.round(cx), Math.round(cy), 142) * SYL2.length)];
    const id = `lago${++n}`;
    for (const [side, P] of [["a", A], ["b", Bp]]) {
      const ux = P[0] - cx, uy = P[1] - cy, L2 = Math.hypot(ux, uy) || 1, dx = ux / L2, dy = uy / L2; let lx = P[0], ly = P[1], ok = false;
      for (let t = 0; t < 40; t++) { const b = tileAt(Math.round(lx), Math.round(ly)); if (!isBlocked(b) && b !== B.HEART && b !== B.CITY) { ok = true; break; } lx += dx; ly += dy; }
      if (!ok) continue; lx = Math.round(lx); ly = Math.round(ly);
      const ex = Math.round(lx - dx * 11), ey = Math.round(ly - dy * 11), pid = `${id}${side}`;
      ports.push({ lake: id, x: lx, y: ly, docks: [[[lx + dx * 1.5, ly + dy * 1.5], [ex, ey], 1.5]], ships: [] });
      extras.push(
        { x: lx + Math.round(-dy * 2), y: ly + Math.round(dx * 2), kind: "building", sprite: "lantern_fence", fw: 1, fh: 1 },
        { x: lx - Math.round(-dy * 2), y: ly - Math.round(dx * 2), kind: "building", sprite: "lantern_fence", fw: 1, fh: 1 },
        { x: lx + Math.round(dx * 2 - dy * 3), y: ly + Math.round(dy * 2 + dx * 3), kind: "building", sprite: side === "a" ? "crate_stack" : "crate", fw: 1, fh: 1 },
        { x: Math.round(ex - dy * 2), y: Math.round(ey + dx * 2), kind: "boat", sprite: "valen_rowboat", solid: false }
      );
      boatPorts.push({ id: pid, name: side === "a" ? `Píer do Lago ${name}` : `Margem oposta do Lago ${name}`, lake: id, x: lx, y: ly, npc: [lx + Math.round(dx * 2), ly + Math.round(dy * 2)] });
      if (side === "a") pendingFish.push({ id, lx, ly, dx, dy });
    }
  }
  {
    const vp = ports[0];
    boatPorts.push({ id: "valen_porto", name: "Porto de Valen", lake: null, x: vp.x - 2, y: vp.y, npc: [vp.x - 3, vp.y + 3] });
  }
  log("lagoas com píer", n, "portos de barco", boatPorts.length);
}
initNet({ cities, rivers, roads, ports, lakes, edge });
for (const f of pendingFish) {
  const got = [];
  for (let t = 11; t >= 3 && got.length < 2; t -= .5) {
    const x = Math.round(f.lx - f.dx * t), y = Math.round(f.ly - f.dy * t);
    if (tileAt(x, y) === B.DOCK && !got.some(g => Math.hypot(g[0] - x, g[1] - y) < 3)) got.push([x, y]);
  }
  got.forEach((g, i) => nodes.push({ id: `${f.id}_pesca_${i + 1}`, kind: "pesca_lagoa", x: g[0], y: g[1], city: null, ring: null, owner: null, lake: f.id }));
}

// ---------- 10. MARCOS DE FRONTEIRA TIER 2 (ÂMBAR) E TIER 3 (VERMELHO) ----------
for (const r of roads) {
  let prev = null;
  for (let i = 1; i < r.pts.length; i++) {
    const [a, b] = [r.pts[i - 1], r.pts[i]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5);
    for (let s2 = 0; s2 <= n; s2++) {
      const x = a[0] + (b[0] - a[0]) * s2 / n, y = a[1] + (b[1] - a[1]) * s2 / n;
      const v = labAt(x, y); if (v < 0) continue; const t = v % 3 + 1;
      if (prev && prev.t !== t && Math.max(prev.t, t) >= 2 && !markers.some(m => Math.hypot(m.x - x, m.y - y) < 40)) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = Math.hypot(dx, dy) || 1, nx = -dy / L2, ny = dx / L2;
        for (const sd of [-1, 1]) {
          const mx = Math.round(x + nx * 3.0 * sd), my = Math.round(y + ny * 3.0 * sd), tb = tileAt(mx, my);
          if (!isBlocked(tb) && tb !== B.ROAD && tb !== B.BRIDGE && tb !== B.CITY) markers.push({ x: mx, y: my, kind: Math.max(prev.t, t) === 3 ? "redmark" : "flagpost" });
        }
      }
      prev = { t };
    }
  }
}
log("caças", hunts.length, "depósitos", nodes.length, "marcos", markers.length);

// ---------- 11. GRAFO DE ESTRADAS PARA PATHFINDING LONGO ----------
const wpN = [], wpE = [], idOf = new Map();
const key = p => p.map(v => Math.round(v)).join(",");
const node = p => { const k = key(p); if (!idOf.has(k)) { idOf.set(k, wpN.length); wpN.push(p.map(v => Math.round(v))); } return idOf.get(k); };
for (const r of roads) {
  let last = null, acc = 0;
  for (let i = 0; i < r.pts.length; i++) {
    const p = r.pts[i], isEnd = i === 0 || i === r.pts.length - 1;
    if (last && !isEnd) { acc += Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]); if (acc < 20) continue; }
    const n = node(p); if (last != null && last !== n) wpE.push([last, n, Math.round(Math.hypot(wpN[last][0] - p[0], wpN[last][1] - p[1]))]);
    last = n; acc = 0;
  }
}
for (let i = 0; i < wpN.length; i++) for (let j = i + 1; j < wpN.length; j++) { const d = Math.hypot(wpN[i][0] - wpN[j][0], wpN[i][1] - wpN[j][1]); if (d < 4 && d > 0) wpE.push([i, j, Math.round(d)]); }
for (const r of roads) for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) {
  const me = idOf.get(key(e)); if (me == null) continue;
  const near = wpN.map((p, i) => [i, Math.hypot(p[0] - e[0], p[1] - e[1])]).filter(([i, d]) => i !== me && d < 32).sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [i, d] of near) wpE.push([me, i, Math.max(1, Math.round(d))]);
}
const exitIds = edge.exits.map(e => idOf.get(key([e.x, e.y]))).filter(v => v != null);
for (let i = 0; i < exitIds.length; i++) for (let k = i + 1; k < exitIds.length; k++) { const a = wpN[exitIds[i]], b = wpN[exitIds[k]]; wpE.push([exitIds[i], exitIds[k], Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * 1.1)]); }
const wp = { nodes: wpN, edges: wpE, exits: exitIds };
log("pontos de estrada", wpN.length, "ligações", wpE.length);

// ---------- 12. VALIDAÇÃO ----------
const problems = [];
for (const c of cities.filter(c => !c.heart)) {
  if (isBlocked(tileAt(c.x, c.y))) problems.push("cidade bloqueada " + c.id);
}
for (const n of nodes) if (isBlocked(tileAt(n.x, n.y))) problems.push("depósito bloqueado " + n.id);
for (const h of hunts) if (!okArea(h.cx, h.cy, 6)) problems.push("caça bloqueada " + h.id);
for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) {
  const [x, y] = r.pts[i].map(Math.floor); const b = tileAt(x, y);
  if (b !== B.HEART && isBlocked(b)) { problems.push(`estrada bloqueada ${r.from}-${r.to} em ${x},${y} (${b})`); break; }
}
log("problemas:", problems.length ? problems.slice(0, 12).join(" | ") : "nenhum");

// ---------- 13. MAPA-MÚNDI 2000×2000 (1 px = 5 tiles) ----------
const W = OVN, OV = OVT, rgb = Buffer.alloc(W * W * 3);
const CITY_OV_RGB = {
  valen:   { base: [92, 152, 56],  plaza: [152, 148, 142], street: [142, 138, 134], promenade: [148, 146, 142], rock: [110, 112, 118] },
  khazad:  { base: [74, 68, 70],   plaza: [96, 90, 92],    street: [86, 80, 82],    courtyard: [98, 92, 92] },
  solkar:  { base: [228, 204, 148], plaza: [216, 186, 126], street: [194, 154, 96], garden: [82, 148, 54] },
  sylvana: { base: [56, 108, 44],  plaza: [176, 142, 94],  street: [168, 134, 86],  clearing: [172, 138, 90] },
  nocthar: { base: [76, 56, 104],  plaza: [98, 74, 136],   street: [88, 66, 122] },
};
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
  const x = i * OV - OX + 2, y = j * OV - OY + 2;
  let b = tileAt(x, y); if (b === B.HEART) b = B.PLAINS;
  let col = BIOME_RGB[b] || [255, 0, 255];
  if (b === B.CITY) {
    const ci = cities.find(c => !c.heart && cityInside(c, x, y) < 1.06);
    if (ci) { const gk = cityGroundKind(ci, x + .5, y + .5); col = CITY_OV_RGB[ci.theme]?.[gk] || CITY_OV_RGB[ci.theme]?.base || col; }
  }
  const k = (j * W + i) * 3;
  const sh = (.95 + (fbm2(x / 5, y / 5, 1, 621) - .5) * .12 + (hashTile(i, j, 9) - .5) * .05) * (1 - .36 * Math.min(1, treeDensity(b) * 1.6));
  rgb[k] = Math.min(255, col[0] * sh); rgb[k + 1] = Math.min(255, col[1] * sh); rgb[k + 2] = Math.min(255, col[2] * sh);
}
const line = (a, b, col, w = 1) => {
  const [ax, ay] = G(...a), [bx, by] = G(...b), n = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
  for (let s2 = 0; s2 <= n; s2++) {
    const px = Math.round((ax + (bx - ax) * s2 / n) / OV), py = Math.round((ay + (by - ay) * s2 / n) / OV);
    for (let oy = -w + 1; oy < w; oy++) for (let ox = -w + 1; ox < w; ox++) {
      const qx = px + ox, qy = py + oy; if (qx < 0 || qy < 0 || qx >= W || qy >= W) continue;
      const k = (qy * W + qx) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2];
    }
  }
};
for (const r of rivers) for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], [48, 112, 155]);
for (const r of roads) for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], [172, 131, 83]);
fs.writeFileSync(`${OUT}/world-overview.rgb`, rgb);

// ---------- 14. SQL DE SINCRONIZAÇÃO SUPABASE (idempotente, só upserts) ----------
const esc = s => String(s).replace(/'/g, "''");
const sql = [];
sql.push("-- Sincronização automática do continente 10.000x10.000 e das 6 cidades expandidas (upserts seguros).");
cities.forEach((c, idx) => {
  sql.push(`update cities set x = ${c.x}, y = ${c.y}, rx = ${c.rx}, ry = ${c.ry}, regions = '${esc(JSON.stringify(c.regions))}'::jsonb, sort = ${idx} where id = '${c.id}';`);
});
for (let start = 0; start < territory.rows.length; start += 50) {
  const slice = territory.rows.slice(start, start + 50).map((row, j) => `(${start + j}, '${row}')`).join(",\n");
  sql.push(`insert into territory_grid(row, cells) values\n${slice}\non conflict (row) do update set cells = excluded.cells;`);
}
if (monsters.length) {
  const mvals = monsters.map(m => `  ('${esc(m.id)}', '${esc(m.name)}', ${m.lvl}, '${esc(m.sprite)}', '${esc(m.fam)}', '${esc(m.cat)}', '${esc(m.group)}', 'Território nível ${m.tier} de ${esc(cities.find(q => q.id === m.city)?.name || m.city)}.', '${esc(m.loot)}', ${m.cat === "miniboss"})`).join(",\n");
  sql.push(`insert into creatures(id, name, level, hp, atk, def, exp, gold_min, gold_max, drop_item, drop_chance, boss, sprite, family, category, realm_id, biome, resist, weak, abilities, behavior, description, loot_table)
  select m.id, m.name, m.lvl, (f->>'hp')::int, (f->>'atk')::int, (f->>'def')::int, (f->>'exp')::int, (f->>'gmin')::int, (f->>'gmax')::int, null, 0, m.boss, m.sprite, m.fam, m.cat, 'eldoria', m.biome, '{}', '{}', '[]', 'agressivo', m.descr, m.loot
  from (values\n${mvals}\n  ) m(id, name, lvl, sprite, fam, cat, biome, descr, loot, boss), lateral creature_fit(m.lvl, m.cat) f
on conflict (id) do update set name = excluded.name, level = excluded.level, hp = excluded.hp, atk = excluded.atk, def = excluded.def, exp = excluded.exp, gold_min = excluded.gold_min, gold_max = excluded.gold_max, boss = excluded.boss, sprite = excluded.sprite, family = excluded.family, category = excluded.category, biome = excluded.biome, description = excluded.description, loot_table = excluded.loot_table;`);
}
if (hunts.length) {
  const hvals = hunts.map(h => {
    const rect = JSON.stringify({ x: h.cx - h.r, y: h.cy - h.r, w: 2 * h.r + 1, h: 2 * h.r + 1 });
    const door = JSON.stringify([h.cx, h.cy - h.r]);
    const spawns = h.ring === 1 ? 5 : 6, resp = h.ring === 3 ? 18000 : 14000, rare = h.ring === 3 ? 2 : h.ring === 2 ? 1 : 0;
    const zone = h.ring === 3 ? "guerra" : h.ring === 2 ? "protegida" : "segura";
    const tier = h.ring === 3 ? "elite" : h.ring === 2 ? "hostil" : "segura";
    return `  ('${esc(h.id)}', '${esc(h.city)}', '${esc(h.name)}', '${esc(h.mon)}', ${spawns}, ${resp}, '${rect}'::jsonb, '${door}'::jsonb, ${h.boss ? `'${esc(h.boss)}'` : "null"}, ${rare}, ${h.lvl - 4}, '${zone}', '${h.city}_t${h.ring}', '${tier}', '${h.city}', ${h.ring})`;
  }).join(",\n");
  sql.push(`insert into hunts(id, region, name, creature_id, spawns, respawn_ms, rect, door, boss_id, rare, level_min, zone, wregion, tier, city_id, ring) values\n${hvals}\non conflict (id) do update set name = excluded.name, region = excluded.region, creature_id = excluded.creature_id, spawns = excluded.spawns, rect = excluded.rect, door = excluded.door, boss_id = excluded.boss_id, rare = excluded.rare, level_min = excluded.level_min, zone = excluded.zone, wregion = excluded.wregion, tier = excluded.tier, city_id = excluded.city_id, ring = excluded.ring;`);
  sql.push(`update hunts set city_id = null, ring = null where city_id is not null and id not in (${hunts.map(h => `'${esc(h.id)}'`).join(", ")});`);
  sql.push(`insert into hunt_state(hunt_id) select id from hunts where city_id is not null on conflict do nothing;`);
}
for (const n of nodes.filter(n => n.kind !== "pesca_lagoa")) {
  sql.push(`update resource_nodes set x = ${n.x}, y = ${n.y} where id = '${esc(n.id)}';`);
}
const fishNodes = nodes.filter(n => n.kind === "pesca_lagoa");
if (fishNodes.length) {
  sql.push(`insert into resource_nodes(id, name, kind, profession_id, tool, tool_tier, req_level, hardness, extract_s, capacity, respawn_s, drop_table, exp, x, y, region, owner)
  select v.id, 'Deck de pesca da lagoa', 'pesca_lagoa', b.profession_id, b.tool, b.tool_tier, 5, b.hardness, b.extract_s, b.capacity, b.respawn_s, 'pesca_lagoa', b.exp + 6, v.x, v.y, 'campos', null
  from (values ${fishNodes.map(n => `('${esc(n.id)}', ${n.x}, ${n.y})`).join(", ")}) v(id, x, y)
  join lateral (select * from resource_nodes where kind = 'pesca' order by id limit 1) b on true
on conflict (id) do update set x = excluded.x, y = excluded.y;`);
}
if (boatPorts.length) {
  sql.push(`insert into boat_ports(id, name, lake, x, y) values\n${boatPorts.map(b => `  ('${esc(b.id)}', '${esc(b.name)}', ${b.lake ? `'${esc(b.lake)}'` : "null"}, ${b.x}, ${b.y})`).join(",\n")}\non conflict (id) do update set name = excluded.name, lake = excluded.lake, x = excluded.x, y = excluded.y;`);
}
fs.writeFileSync(`${OUT}/world-sync.sql`, sql.join("\n\n") + "\n");

// ---------- monstros do mapa aberto: poucos, espalhados, criatura do bioma e do território (as Hunts continuam sendo o lugar de farm) ----------
const spawns = []; { const SC = 64; let n = 0;
  for (let gy = -OY + SC / 2; gy < SIZE - OY; gy += SC) for (let gx = -OX + SC / 2; gx < SIZE - OX; gx += SC) {
    const x = Math.round(gx + (hashTile(gx, gy, 191) - .5) * SC * .7), y = Math.round(gy + (hashTile(gx, gy, 192) - .5) * SC * .7);
    if (x > -40 && y > -40 && x < 340 && y < 240) continue;
    const b = tileAt(x, y); if (!GROUP[b] || isBlocked(b)) continue; const v = labAt(x, y); if (v < 0) continue;
    if (cities.some(c => !c.heart && cityInside(c, x, y) < 1.35)) continue;
    if (hunts.some(h => Math.hypot(h.cx - x, h.cy - y) < h.r + 22)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isBlocked(tileAt(x + dx, y + dy)))) continue;
    const city = cities[Math.floor(v / 3)].id, tier = v % 3 + 1, grp = GROUP[b];
    spawns.push({ id: `s${++n}`, x, y, mon: creature(grp, tier, city, false), rare: hashTile(x, y, 193) < .04 ? 1 : 0 }); } }
log("monstros do mapa aberto", spawns.length, "raros", spawns.filter(q => q.rare).length);

// ---------- chefes: um covil por região (anel 3) + o dragão no vulcão; dados do combate ficam no servidor (tabela bosses) ----------
const BOSSES = [
  { id: "boss_arken", city: "arken", name: "Rei dos Bandidos", sprite: "boss_king", tint: null, lvl: 30 },
  { id: "boss_valen", city: "valen", name: "Leviatã da Enseada", sprite: "drowned", tint: "deep", lvl: 62 },
  { id: "boss_sylvana", city: "sylvana", name: "Ent Ancião Corrompido", sprite: "golem", tint: "ancient", lvl: 72 },
  { id: "boss_solkar", city: "solkar", name: "Escorpião-Rei das Dunas", sprite: "spider", tint: "sand", lvl: 82 },
  { id: "boss_khazad", city: "khazad", name: "Golem Ancestral da Forja", sprite: "golem", tint: "deep", lvl: 92 },
  { id: "boss_nocthar", city: "nocthar", name: "Lich da Cidadela", sprite: "fallen", tint: "void", lvl: 106 },
  { id: "boss_dragao", city: "khazad", name: "Ignaroth, o Dragão de Cinzas", sprite: "dragon", tint: null, lvl: 120, biome: B.VOLCANIC }];
const bossLairs = [];
for (const bd of BOSSES) { const ci = cities.findIndex(c => c.id === bd.city), c = cities[ci], cx0 = c.heart ? 150 : c.x, cy0 = c.heart ? 100 : c.y; let best = null, bdist = 1e9;
  for (let k = 0; k < 4000; k++) { const a = hashTile(k, ci, 197) * 6.283, d = 250 + hashTile(k, ci, 198) * 1600, x = Math.round(cx0 + Math.cos(a) * d), y = Math.round(cy0 + Math.sin(a) * d);
    if (labAt(x, y) !== ci * 3 + 2) continue; const b = tileAt(x, y); if (bd.biome != null && b !== bd.biome) continue; if (!GROUP[b] || isBlocked(b) || !okArea(x, y, 10)) continue;
    if (hunts.some(h => Math.hypot(h.cx - x, h.cy - y) < 70) || bossLairs.some(l => Math.hypot(l.x - x, l.y - y) < 400)) continue;
    if (d < bdist) { bdist = d; best = [x, y]; } }
  if (!best) { log("sem covil pra", bd.id); continue; }
  bossLairs.push({ ...bd, x: best[0], y: best[1] }); extras.push({ x: best[0], y: best[1] - 4, kind: "lair", boss: bd.id, label: bd.name, sprite: bd.sprite, tint: bd.tint, solid: false }); }
log("covis de chefe", bossLairs.length);
for (let i = spawns.length - 1; i >= 0; i--) if (bossLairs.some(l => Math.hypot(l.x - spawns[i].x, l.y - spawns[i].y) < 40)) spawns.splice(i, 1);
const net = { version: 6, size: SIZE, ox: OX, oy: OY, cities, rivers, roads, ports, lakes, edge, hunts, monsters, nodes, wp, territory, markers, rooms: CITY_ROOMS, extras, boats: boatPorts, spawns, bosses: bossLairs };
fs.writeFileSync(new URL("../assets/world-net.json", import.meta.url), JSON.stringify(net));
fs.writeFileSync(`${OUT}/world-gen.json`, JSON.stringify({ hunts, monsters, nodes, cities: cities.map(({ buildings, ...c }) => c), problems }, null, 1));
log("pronto: assets/world-net.json", (JSON.stringify(net).length / 1024).toFixed(0) + " KB");
