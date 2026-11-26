// Gera a rede do continente (cidades, rios, estradas, docas, oásis, construções, áreas de caça, depósitos)
// e o mapa-múndi, a partir do terreno determinístico de js/terrain.js. Saídas:
//   assets/world-net.json            → usado pelo jogo e pelo Web Worker
//   tmp overview .rgb (1000x1000)     → convertido em assets/world-overview.png
//   supabase SQL das áreas de caça/criaturas/depósitos/cidades (impresso em arquivo)
// Uso: node scripts/gen-world.mjs <dir_saida_tmp>
import fs from "node:fs";
import { fbm as fbm2 } from "../js/terrain.js";
import { SIZE, OX, OY, B, baseBiome, initNet, tileAt, isBlocked, NET, zoneAt, chunkObjects, chunkTiles, CHUNK, BIOME_RGB, hashTile, coastAt, cityInside } from "../js/terrain.js";
const OUT = process.argv[2] || "."; const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const edge = JSON.parse(fs.readFileSync(new URL("../assets/heartland-edge.json", import.meta.url)));
const L = (gx, gy) => [gx - OX, gy - OY];          // global → local
const G = (x, y) => [x + OX, y + OY];
const landAt = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !(b === B.DEEP || b === B.OCEAN || b === B.SHALLOW); };
const solid = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !isBlocked(b) && b !== B.BEACH && b !== B.CLIFF; };
// procura em espiral um ponto firme perto do alvo
function settle(x, y, ok = solid, maxR = 400) { for (let r = 0; r < maxR; r += 3) for (let a = 0; a < 6.283; a += r ? 3 / r : 7) { const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r); if (ok(px, py)) return [px, py]; } throw new Error("sem lugar perto de " + x + "," + y); }

const roomy = (x, y) => { for (const r of [0, 25, 50, 75, 88]) for (let a = 0; a < 6.283; a += .35) if (!solid(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r))) return false; return true; };
const chaikin = (p, n = 3) => { for (let k = 0; k < n; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(p[p.length - 1]); p = q; } return p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]); };
// ---------- cidades ----------
const phase = (s, k) => [hashTile(s, k, 91) * 6.283, hashTile(s, k, 92) * 6.283, hashTile(s, k, 93) * 6.283];
const CITY_DEF = [
  { id: "arken", name: "Vila de Arken", at: [52, 40], heart: true, r: [1, 260, 600], spec: "Hub geral e Mercado Central" },
  { id: "valen", name: "Porto de Valen", east: true, r: [150, 380, 740], spec: "Comércio marítimo, pesca e couros" },
  { id: "khazad", name: "Forja de Khazad", at: L(6150, 2750), r: [150, 380, 740], spec: "Metalurgia, minérios e armas" },
  { id: "solkar", name: "Oásis de Solkar", at: L(5000, 8050), r: [150, 380, 740], spec: "Joalheria, gemas e diamantes" },
  { id: "sylvana", name: "Bosques de Sylvana", at: L(1850, 4500), r: [150, 380, 740], spec: "Alquimia, madeira e ervas" },
  { id: "nocthar", name: "Cidadela de Nocthar", at: L(1750, 2050), r: [150, 380, 740], spec: "Artefatos, encantamento e mercado negro" }];
const REGNAMES = { arken: ["Campos de Arken", "Fronteira de Arken", "Ermos de Arken"], valen: ["Costa Mansa", "Enseadas Disputadas", "Recifes Vermelhos"], khazad: ["Vales da Forja", "Encostas de Ferro", "Crateras de Khazad"],
  solkar: ["Jardins do Oásis", "Dunas Externas", "Mar de Areia Rubra"], sylvana: ["Clareiras de Sylvana", "Mata Fechada", "Bosque Ancestral Profundo"], nocthar: ["Pátio da Cidadela", "Ruínas Disputadas", "Abismo de Nocthar"] };
const CITY_BASE = { arken: 10, valen: 22, sylvana: 32, solkar: 42, khazad: 52, nocthar: 66 };
const cities = [];
for (const [i, d] of CITY_DEF.entries()) {
  let x, y;
  if (d.heart) [x, y] = d.at;
  else if (d.east) { let gx = 6500, gy = 5450; while (coastAt(gx, gy) > .02 && gx < SIZE) gx += 5; [x, y] = settle(...L(gx - 112, gy), roomy, 400); }
  else [x, y] = settle(...d.at, roomy, 900);
  cities.push({ id: d.id, name: d.name, x, y, r: d.r, ph: [phase(i, 1), phase(i, 2), phase(i, 3)], plaza: d.heart ? 0 : 70, rx: d.heart ? 0 : 70, ry: d.heart ? 0 : 60, theme: d.id, spec: d.spec, heart: !!d.heart, regions: REGNAMES[d.id], base: CITY_BASE[d.id] });
}
log("cidades", cities.map(c => `${c.id}@${c.x},${c.y}`).join(" "));

// ---------- rios: das montanhas/gelo pro mar, e os dois rios que saem do coração ----------
const HM = 50; const nearHeart = (x, y) => x > -HM && y > -HM && x < 300 + HM && y < 200 + HM;
const rivers = [];
function flow(sx, sy, dir0, w0) {
  const pts = [[sx, sy]], ws = [w0]; let x = sx, y = sy, a = dir0;
  for (let k = 0; k < 1400; k++) {
    const [gx, gy] = G(x, y); const out = Math.atan2(gy - SIZE / 2, gx - SIZE / 2);
    let da = out - a; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
    a += da * .08 + (hashTile(Math.floor(x / 40), Math.floor(y / 40), 61) - .5) * .5;
    let nx = x + Math.cos(a) * 10, ny = y + Math.sin(a) * 10;
    for (let t = 0; t < 8 && nearHeart(nx, ny); t++) { a += .8; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
    for (const c of cities) if (!c.heart && Math.hypot(nx - c.x, ny - c.y) < c.plaza + 40) { a += .9; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
    x = nx; y = ny; pts.push([Math.round(x), Math.round(y)]); ws.push(Math.min(2.6, w0 + k * .004));
    if (!landAt(x, y)) break;
    let join = false; if (k > 6) for (const r of rivers) for (let i = 0; i < r.pts.length; i += 3) if (Math.hypot(r.pts[i][0] - x, r.pts[i][1] - y) < 9) { join = true; break; } if (join) break;
  }
  if (pts.length > 4) rivers.push({ pts, w: ws });
}
// fontes: pontos altos no norte e nas cordilheiras
let srcN = 0; for (let k = 0; srcN < 18 && k < 4000; k++) {
  const gx = 900 + hashTile(k, 1, 71) * 8200, gy = 600 + hashTile(k, 2, 71) * 5200; const b = baseBiome(gx, gy);
  if (![B.MOUNTAIN, B.TUNDRA, B.GLACIER, B.FOREST, B.ANCIENT].includes(b)) continue;
  const [x, y] = L(gx, gy); if (nearHeart(x, y) || rivers.some(r => Math.hypot(r.pts[0][0] - x, r.pts[0][1] - y) < 900)) continue;
  flow(x, y, hashTile(k, 3, 71) * 6.283, 0.9); srcN++;
}
// rios do coração: grupos de água na borda continuam pra fora
const runs = []; for (const t of edge.tiles.filter(t => t[3])) { const r = runs.find(r => Math.abs(r.x - t[0]) + Math.abs(r.y - t[1]) < 4 && r.side === (t[1] === 199 ? "s" : t[1] === 0 ? "n" : t[0] === 0 ? "w" : "e")); if (r) { r.n++; r.sx += t[0]; r.sy += t[1]; r.x = t[0]; r.y = t[1]; } else runs.push({ side: t[1] === 199 ? "s" : t[1] === 0 ? "n" : t[0] === 0 ? "w" : "e", n: 1, sx: t[0], sy: t[1], x: t[0], y: t[1] }); }
for (const r of runs) { const mx = Math.round(r.sx / r.n), my = Math.round(r.sy / r.n), d = { s: [0, 1], n: [0, -1], w: [-1, 0], e: [1, 0] }[r.side];
  const pts = [[mx, my], [mx + d[0] * 6, my + d[1] * 6]]; const w = Math.min(2.2, Math.max(1.1, r.n / 3)); rivers.push({ pts, w: [w, w], heart: true }); flow(mx + d[0] * 6, my + d[1] * 6, Math.atan2(d[1], d[0]), w); }
// rios suaves (curvas em vez de segmentos retos de 10 tiles), largura acompanhando
for (const r of rivers) { const P = chaikin(r.pts, 3); r.w = P.map((_, i) => r.w[Math.round(i / (P.length - 1) * (r.w.length - 1))]); r.pts = P; }
log("rios", rivers.length);

// ---------- estradas: A* numa grade grossa evitando água e picos ----------
const CS = 14, GW = Math.ceil(SIZE / CS); const cost = new Float32Array(GW * GW);
for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) { const b = baseBiome(i * CS + CS / 2, j * CS + CS / 2); const [x, y] = L(i * CS + CS / 2, j * CS + CS / 2);
  cost[j * GW + i] = (b === B.DEEP || b === B.OCEAN || b === B.SHALLOW) ? 0 : nearHeart(x, y) && !(x < -10 || y < -10 || x > 310 || y > 210) ? 0 : b === B.LAKE || b === B.MURKY ? 25 : b === B.PEAK || b === B.LAVA ? 9 : b === B.MOUNTAIN || b === B.VOLCANIC || b === B.GLACIER ? 3 : b === B.SWAMP || b === B.MANGROVE ? 2.4 : b === B.DESERT || b === B.CANYON ? 1.5 : 1; }
for (const r of rivers) for (const p of r.pts) { const [gx, gy] = G(p[0], p[1]); const k = Math.floor(gy / CS) * GW + Math.floor(gx / CS); if (cost[k]) cost[k] += 4; }
function coarse(ax, ay, bx, by) {
  const [sgx, sgy] = G(ax, ay), [tgx, tgy] = G(bx, by); const s = Math.floor(sgy / CS) * GW + Math.floor(sgx / CS), t = Math.floor(tgy / CS) * GW + Math.floor(tgx / CS);
  const g = new Float32Array(GW * GW).fill(1e9), prev = new Int32Array(GW * GW).fill(-1), heap = [[0, s]]; g[s] = 0; const tx = t % GW, ty = (t / GW) | 0;
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const done = new Uint8Array(GW * GW); let pops = 0;
  while (heap.length) { const [, c] = pop(); if (c === t) break; if (done[c]) continue; done[c] = 1; pops++; const cx = c % GW, cy = (c / GW) | 0;
    for (const [dx, dy, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GW) continue; const k = ny * GW + nx;
      const cc = k === t || k === s ? 1 : cost[k]; if (!cc) continue; const g2 = g[c] + w * cc; if (g2 < g[k]) { g[k] = g2; prev[k] = c; push(g2 + Math.hypot(nx - tx, ny - ty), k); } } }
  if (g[t] >= 1e9) throw new Error("estrada sem caminho " + [ax, ay, bx, by] + " pops " + pops);
  const pts = []; for (let c = t, guard = 0; c !== -1 && guard < GW * GW; c = prev[c], guard++) { pts.push(L((c % GW) * CS + CS / 2, ((c / GW) | 0) * CS + CS / 2)); if (c === s) break; } pts.reverse(); pts[0] = [ax, ay]; pts[pts.length - 1] = [bx, by]; return pts;
}
const C = id => cities.find(c => c.id === id);
const EXIT = Object.fromEntries(edge.exits.map(e => [e.side, e]));
const exitOut = s => { const e = EXIT[s], d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[s]; const c = CROSS[s] || [e.x + .5, e.y + .5]; return [c, [c[0] + d[0] * 22, c[1] + d[1] * 22]]; };
// onde a estrada de saída do coração (geo.js) cruza a borda, em tiles: o continente começa exatamente ali
const CROSS = { n: [181.1, -0.2], e: [300.2, 45.9], w: [-0.2, 95.8], s: [57.9, 200.2] };
// portões nos pontos cardeais da muralha (elipse rx×ry); a estrada entra pelo portão mais perto de onde chega e segue a avenida até a praça
const GATES = c => [[c.x + c.rx, c.y, 1, 0], [c.x, c.y + c.ry, 0, 1], [c.x - c.rx, c.y, -1, 0], [c.x, c.y - c.ry, 0, -1]];
function viaGate(pts, c) {
  if (c.heart) return pts; const i = pts.findIndex(p => cityInside(c, p[0], p[1]) < 1.4); if (i < 1) return pts;
  const e = pts[i - 1], g = GATES(c).sort((A, Bq) => Math.hypot(A[0] - e[0], A[1] - e[1]) - Math.hypot(Bq[0] - e[0], Bq[1] - e[1]))[0];
  const out = [g[0] + g[2] * 14, g[1] + g[3] * 14], a1 = Math.atan2((e[1] - c.y) / c.ry, (e[0] - c.x) / c.rx), a2 = Math.atan2(g[3], g[2]); let da = a2 - a1; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
  const bend = []; for (const t of [.33, .66]) { const a = a1 + da * t; bend.push([c.x + Math.cos(a) * c.rx * 1.32, c.y + Math.sin(a) * c.ry * 1.32]); }
  return [...pts.slice(0, i), ...bend, out, [g[0], g[1]], [c.x + g[2] * 10, c.y + g[3] * 10]].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}
const roads = []; const ROUTES = [["e", "valen"], ["n", "khazad"], ["s", "solkar"], ["w", "sylvana"], ["sylvana", "nocthar"], ["khazad", "nocthar"], ["valen", "solkar"], ["sylvana", "solkar"], ["khazad", "valen"]];
for (const [a, b] of ROUTES) {
  let start, lead = [];
  if (a.length === 1) { const [p0, p1] = exitOut(a); lead = [p0]; start = p1; } else start = [C(a).x, C(a).y];
  const end = [C(b).x, C(b).y];
  let raw = coarse(start[0], start[1], end[0], end[1]);
  // média móvel tira os degraus da grade; depois Chaikin arredonda as curvas
  for (let pass = 0; pass < 3; pass++) raw = raw.map((p, i) => { if (i === 0 || i === raw.length - 1) return p; let sx = 0, sy = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = raw[Math.max(0, Math.min(raw.length - 1, i + k))]; sx += q[0]; sy += q[1]; n++; } return [sx / n, sy / n]; });
  const mid = chaikin(raw, 3);
  let pts = [...lead, ...mid]; pts = viaGate(pts, C(b)); if (a.length > 1) pts = viaGate(pts.slice().reverse(), C(a)).reverse();
  roads.push({ from: a.length === 1 ? "arken" : a, to: b, exit: a.length === 1 ? a : null, pts });
}
// entroncamentos: estrada que chega (ou sai) colada numa estrada anterior é cortada e termina nela (sem trilhos paralelos)
const nearestOn = (p, list) => { let best = null, bd = 1e9; for (const r of list) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } } return { q: best, d: bd }; };
for (let k = 1; k < roads.length; k++) { const prev = roads.slice(0, k), r = roads[k];
  for (const end of [1, 0]) { const pts = end ? r.pts : r.pts.slice().reverse(); let cut = -1;
    for (let i = pts.length - 1; i > 0; i--) { if (nearestOn(pts[i], prev).d < 7) cut = i; else break; }
    if (cut > 0 && cut < pts.length - 1) { const keep = pts.slice(0, cut + 1), j = nearestOn(keep[keep.length - 1], prev).q; keep.push([Math.round(j[0] * 10) / 10, Math.round(j[1] * 10) / 10]); r.pts = end ? keep : keep.reverse(); } } }
log("estradas", roads.length, roads.map(r => r.pts.length).join(","));

// ---------- porto de Valen: docas pro mar e navios ----------
const ports = []; { const c = C("valen"); let x = c.x + c.rx + 2, y = c.y; while (landAt(x, y)) x += 1; const dock = [[x - 6, y], [x + 16, y]], dock2 = [[x + 4, y - 7], [x + 4, y + 7]];
  ports.push({ city: "valen", x, y, docks: [dock, dock2], ships: [[x + 13, y - 4], [x + 13, y + 5]] });
  roads.push({ from: "valen", to: "porto", pts: [[c.x + c.rx, c.y], [x - 6, y]] }); }
// oásis de Solkar
const lakes = [{ x: C("solkar").x, y: C("solkar").y + 22, r: 9 }, { x: C("solkar").x + 110, y: C("solkar").y + 30, r: 14 }];

// ---------- cidades: muralha temática, portões, torres, casas entre as ruas, marcos de cada cidade ----------
const THEME = {
  valen: { houses: ["house", "house2", "barn"], props: ["barrel", "crate", "crate_stack", "cart", "barrel_rack"], tint: null },
  khazad: { houses: ["house2", "mine", "house"], props: ["anvil", "weapon_rack", "campfire", "cart", "barrel"], tint: null },
  solkar: { houses: ["tent", "house_thatch", "house_thatch2"], props: ["well", "barrel", "crate"], tint: null },
  sylvana: { houses: ["witch_hut", "house_thatch", "house_thatch2"], props: ["flower_bed", "statue", "bush", "berry_bush"], tint: null },
  nocthar: { houses: ["house", "house2"], props: ["skull", "bone_pile", "candle", "relic"], tint: "void" } };
for (const c of cities.filter(c => !c.heart)) {
  const th = THEME[c.id]; c.buildings = []; const used = []; const free = (x, y, r) => !used.some(([ux, uy, ur]) => Math.hypot(ux - x, uy - y) < r + ur);
  const add = (x, y, sprite, fw, fh, extra = {}, r = 2) => { x = Math.round(x); y = Math.round(y); used.push([x, y, r]); c.buildings.push({ x, y, kind: "building", sprite, fw, fh, ...extra }); };
  const e = (x, y) => cityInside(c, x, y), street = (x, y) => { const dx = x - c.x, dy = y - c.y, an = Math.atan2(dy / c.ry, dx / c.rx), en = e(x, y) + .03 * Math.sin(5 * an + c.x) + .018 * Math.sin(9 * an + c.y); return Math.abs(dx) < 3.6 || Math.abs(dy) < 3.6 || Math.abs(en - .42) < .055 || Math.abs(en - .72) < .045 || en < .17; };
  // muralha: um bloco por tile do contorno, com 4 portões (vãos) e torres
  const per = Math.round(Math.PI * (3 * (c.rx + c.ry) - Math.sqrt((3 * c.rx + c.ry) * (c.rx + 3 * c.ry))));
  let lastTower = -99;
  for (let k = 0; k < per; k++) { const a = k / per * 6.283, x = Math.round(c.x + Math.cos(a) * c.rx), y = Math.round(c.y + Math.sin(a) * c.ry);
    const gateNear = GATES(c).some(g => Math.hypot(g[0] - x, g[1] - y) < 4.2); if (gateNear) continue;
    const towerAtGate = GATES(c).some(g => Math.abs(Math.hypot(g[0] - x, g[1] - y) - 5.2) < .7);
    if (towerAtGate || k - lastTower > 34) { if (free(x, y, 2)) { add(x, y, null, 2, 2, { kind: "ctower", theme: c.id, gate: towerAtGate }, 2.2); lastTower = k; } continue; }
    if (free(x, y, .4)) { used.push([x, y, .5]); c.buildings.push({ x, y, kind: "cwall", theme: c.id }); } }
  // praça: fonte (Solkar: lago no meio-sul), barracas em volta
  if (c.id !== "solkar") add(c.x, c.y - 2, c.id === "nocthar" ? "orb" : "fountain", 2, 1, { kind: c.id === "nocthar" ? "crystal" : "building" }, 3);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + .39; add(c.x + Math.cos(a) * 12, c.y + Math.sin(a) * 10, "stall", 2, 1, {}, 2); }
  // casas numa grade com variação, entre avenidas e ruas em anel
  for (let gy = c.y - c.ry; gy <= c.y + c.ry; gy += 6) for (let gx = c.x - c.rx; gx <= c.x + c.rx; gx += 7) {
    const x = gx + (hashTile(gx, gy, 151) - .5) * 2, y = gy + (hashTile(gx, gy, 152) - .5) * 1.5; const en = e(x, y);
    if (en > .9 || street(x, y) || street(x - 1.5, y) || street(x + 1.5, y) || street(x, y - 1.2) || !free(x, y, 2.2)) continue;
    if (c.id === "solkar" && Math.hypot(x - c.x, y - c.y - 22) < 14) continue;
    const r = hashTile(gx, gy, 153);
    if (c.id === "sylvana" && r < .22) { used.push([Math.round(x), Math.round(y), 2]); c.buildings.push({ x: Math.round(x), y: Math.round(y), kind: "tree", sprite: "oak", big: 2.1, tint: "ancient", solid: true }); continue; }
    if (c.id === "nocthar" && r < .12) { add(x, y, null, 3, 3, { kind: "darktower" }, 4); continue; }
    if (c.id === "solkar" && r < .16) { add(x, y, null, 3, 2, { kind: "dome" }, 3); continue; }
    if (r < .8) add(x, y, th.houses[Math.floor(hashTile(gx, gy, 154) * th.houses.length)], 3, 2, th.tint ? { tint: th.tint } : {}, 2.6);
    else { const sp = th.props[Math.floor(hashTile(gx, gy, 155) * th.props.length)]; add(x, y, sp, 1, 1, {}, 1.2); } }
  // detalhes próprios
  if (c.id === "solkar") for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283; const x = Math.round(c.x + Math.cos(a) * 13), y = Math.round(c.y + 22 + Math.sin(a) * 11); if (free(x, y, 1)) { used.push([x, y, 1]); c.buildings.push({ x, y, kind: "palm", solid: true }); } }
  if (c.id === "khazad") for (const [dx, dy] of [[-16, -6], [16, -6], [-16, 7], [16, 7]]) { if (free(c.x + dx, c.y + dy, 2)) add(c.x + dx, c.y + dy, "anvil", 1, 1, { kind: "forge" }, 2); }
  if (c.id === "nocthar") for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + .5, x = c.x + Math.cos(a) * 20, y = c.y + Math.sin(a) * 17; if (free(x, y, 1.5)) add(x, y, null, 1, 1, { kind: "crystal" }, 1.5); }
  if (c.id === "sylvana") for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + .2, x = c.x + Math.cos(a) * 22, y = c.y + Math.sin(a) * 19; if (free(x, y, 2)) { used.push([Math.round(x), Math.round(y), 2]); c.buildings.push({ x: Math.round(x), y: Math.round(y), kind: "tree", sprite: "oak", big: 2.4, tint: "ancient", solid: true }); } }
}

log("construções ok");
const hunts = [], monsters = [], nodes = [], markers = [];
const okArea = (x, y, r) => { for (let a = 0; a < 6.283; a += .5) for (const rr of [0, r * .5, r]) { const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr); const b = tileAt(px, py); if (isBlocked(b) || b === B.HEART || b === B.CITY) return false; } return true; };
initNet({ cities, rivers, roads, ports, lakes, edge });

// ---------- territórios geográficos: custo de viagem a partir de cada cidade (rio sem ponte, serra e mudança de bioma pesam) ----------
const GROUP = { [B.PLAINS]: "planicie", [B.FIELD]: "planicie", [B.FOREST]: "floresta", [B.ANCIENT]: "floresta", [B.SWAMP]: "pantano", [B.MANGROVE]: "pantano", [B.MURKY]: "pantano", [B.DESERT]: "deserto", [B.CANYON]: "deserto",
  [B.MOUNTAIN]: "montanha", [B.PEAK]: "montanha", [B.VOLCANIC]: "vulcao", [B.LAVA]: "vulcao", [B.TUNDRA]: "gelo", [B.GLACIER]: "gelo", [B.ICE]: "gelo", [B.DARK]: "sombrio", [B.BEACH]: "costa", [B.CLIFF]: "costa" };
const GCOST = { planicie: 1, costa: 1.2, deserto: 1.4, floresta: 1.6, gelo: 2.1, pantano: 2.3, sombrio: 2.2, montanha: 2.7, vulcao: 3 };
const CELL = 16, TW = Math.ceil(SIZE / CELL), cellB = new Uint8Array(TW * TW), cellG = new Array(TW * TW), cellRoad = new Uint8Array(TW * TW);
for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) { const x = i * CELL - OX + 8, y = j * CELL - OY + 8; const b = tileAt(x, y); cellB[j * TW + i] = b; cellG[j * TW + i] = GROUP[b] || null; if (b === B.ROAD || b === B.BRIDGE || b === B.CITY) cellRoad[j * TW + i] = 1; }
// ruído no custo: bordas orgânicas em vez de formas geométricas
const CNOISE = new Float32Array(TW * TW); for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) CNOISE[j * TW + i] = .55 + 1.1 * fbm2(i * CELL / 260, j * CELL / 260);
const isLand = k => { const b = cellB[k]; return !(b === B.DEEP || b === B.OCEAN || b === B.SHALLOW); };
// rio entre dois centros de célula sem ponte por perto = fronteira forte
const riverSegs = []; for (const r of rivers) for (let i = 1; i < r.pts.length; i++) riverSegs.push([r.pts[i - 1], r.pts[i]]);
const RG = new Map(); for (const [a, b] of riverSegs) { const k = Math.floor(Math.min(a[0], b[0]) / 64) + "," + Math.floor(Math.min(a[1], b[1]) / 64); for (const dx of [0, 1]) for (const dy of [0, 1]) { const kk = (Math.floor(Math.min(a[0], b[0]) / 64) + dx) + "," + (Math.floor(Math.min(a[1], b[1]) / 64) + dy); if (!RG.has(kk)) RG.set(kk, []); RG.get(kk).push([a, b]); } }
const cross = (p1, p2, a, b) => { const d = (p2[0] - p1[0]) * (b[1] - a[1]) - (p2[1] - p1[1]) * (b[0] - a[0]); if (!d) return false; const t = ((a[0] - p1[0]) * (b[1] - a[1]) - (a[1] - p1[1]) * (b[0] - a[0])) / d, u = ((a[0] - p1[0]) * (p2[1] - p1[1]) - (a[1] - p1[1]) * (p2[0] - p1[0])) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
function riverBetween(x1, y1, x2, y2) { const segs = RG.get(Math.floor(Math.min(x1, x2) / 64) + "," + Math.floor(Math.min(y1, y2) / 64)) || []; for (const [a, b] of segs) if (cross([x1, y1], [x2, y2], a, b)) return true; return false; }
log("células ok");
const D = new Float64Array(TW * TW).fill(Infinity), OWN = new Int8Array(TW * TW).fill(-1);
const heap = []; const hpush = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
cities.forEach((c, ci) => { for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) { const x = i * CELL - OX + 8, y = j * CELL - OY + 8, k = j * TW + i;
  const inside = c.heart ? (x >= 0 && y >= 0 && x < 300 && y < 200) : cityInside(c, x, y) < 1; if (inside) { D[k] = 0; OWN[k] = ci; hpush(0, k); } } });
while (heap.length) { const [f, k] = hpop(); if (f > D[k] + 1e-3) continue; const i = k % TW, j = (k / TW) | 0;
  for (const [di, dj, dw] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= TW || nj >= TW) continue; const nk = nj * TW + ni; if (!isLand(nk)) continue;
    const g0 = cellG[k], g1 = cellG[nk]; let c = cellRoad[nk] ? .7 : (GCOST[g1] || 2.5); if (cellB[nk] === B.LAKE) c = 6; if (cellB[nk] === B.PEAK || cellB[nk] === B.LAVA) c = 5;
    c *= dw * CNOISE[nk]; if (g0 && g1 && g0 !== g1) c += 7;
    const x1 = i * CELL - OX + 8, y1 = j * CELL - OY + 8, x2 = ni * CELL - OX + 8, y2 = nj * CELL - OY + 8;
    if (!(cellRoad[k] && cellRoad[nk]) && riverBetween(x1, y1, x2, y2)) c += 45;
    const nd = f + c; if (nd < D[nk]) { D[nk] = nd; OWN[nk] = OWN[k]; hpush(nd, nk); } } }
log("dijkstra ok");
// cortes por cidade (proporção do território de cada uma), sempre por custo: a borda acompanha rio/serra/bioma
const cut = cities.map((c, ci) => { const ds = []; for (let k = 0; k < TW * TW; k++) if (OWN[k] === ci && isLand(k) && D[k] > 0) ds.push(D[k]); ds.sort((a, b) => a - b); const q = f => ds[Math.floor(ds.length * f)] || 0; return [q(c.heart ? .05 : .08), q(c.heart ? .36 : .38)]; });
log("cortes", JSON.stringify(cut.map(v => v.map(Math.round))));
const lab = new Int8Array(TW * TW).fill(-1);
for (let k = 0; k < TW * TW; k++) { if (!isLand(k)) continue; let ci = OWN[k], d = D[k];
  if (ci < 0) { const x = (k % TW) * CELL - OX, y = ((k / TW) | 0) * CELL - OY; let bd = 1e18; cities.forEach((c, i2) => { const dd = Math.hypot(x - (c.heart ? 150 : c.x), y - (c.heart ? 100 : c.y)); if (dd < bd) { bd = dd; ci = i2; } }); d = 1e9; }
  const tier = d <= cut[ci][0] ? 1 : d <= cut[ci][1] ? 2 : 3; lab[k] = ci * 3 + tier - 1; }
// suaviza manchas soltas (moda 3×3, duas passadas)
for (let pass = 0; pass < 2; pass++) { const src = lab.slice(); for (let j = 1; j < TW - 1; j++) for (let i = 1; i < TW - 1; i++) { const k = j * TW + i; if (src[k] < 0) continue; const cnt = new Map();
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = src[k + dj * TW + di]; if (v >= 0) cnt.set(v, (cnt.get(v) || 0) + 1); }
  let bv = src[k], bc = 0; for (const [v, n] of cnt) if (n > bc) { bc = n; bv = v; } if (bv !== src[k] && bc >= 5) lab[k] = bv; } }
// cidades e coração sempre nível 1
cities.forEach((c, ci) => { for (let j = 0; j < TW; j++) for (let i = 0; i < TW; i++) { const x = i * CELL - OX + 8, y = j * CELL - OY + 8; if (c.heart ? (x >= 0 && y >= 0 && x < 300 && y < 200) : cityInside(c, x, y) < 1.05) lab[j * TW + i] = ci * 3; } });
const territory = { cell: CELL, w: TW, h: TW, rows: [] }; for (let j = 0; j < TW; j++) { let row = ""; for (let i = 0; i < TW; i++) { const v = lab[j * TW + i]; row += v < 0 ? "." : String.fromCharCode(97 + v); } territory.rows.push(row); }
NET.territory = territory;
{ const cnt = {}; for (const v of lab) if (v >= 0) { const k = cities[Math.floor(v / 3)].id + (v % 3 + 1); cnt[k] = (cnt[k] || 0) + 1; } log("territórios (células)", JSON.stringify(cnt)); }
const labAt = (x, y) => { const i = Math.floor((x + OX) / CELL), j = Math.floor((y + OY) / CELL); if (i < 0 || j < 0 || i >= TW || j >= TW) return -1; return lab[j * TW + i]; };

// ---------- áreas de caça: por cidade e nível de território; criatura do bioma ----------
const ROSTER = {
  planicie: [["javali_planicie", "Javali da planície", "boar", "fera", "cr_javali"], ["bandoleiro", "Bandoleiro da estrada", "bandit", "humano", "cr_bandido"], ["lobo_alfa", "Lobo-alfa", "wolf", "lobo", "cr_lobo"]],
  floresta: [["aranha_bosque", "Aranha-do-bosque", "spider", "aracnideo", "cr_aranha"], ["lobo_mata", "Lobo da mata", "wolf", "lobo", "cr_lobo"], ["guardiao_mata", "Guardião da mata", "golem", "planta", "cr_ent"]],
  pantano: [["rato_brejo", "Rato-do-brejo", "rat", "fera", "cr_rato"], ["afogado_mangue", "Afogado do mangue", "drowned", "morto_vivo", "cr_afogado"], ["bruxa_brejo", "Bruxa do brejo", "witch", "humano", "cr_bruxa"]],
  deserto: [["saqueador_duna", "Saqueador das dunas", "bandit", "humano", "cr_bandido"], ["escorpiao_rubro", "Escorpião rubro", "spider", "aracnideo", "cr_aranha"], ["vespa_sol", "Vespa do sol", "wasp", "inseto", "cr_vespa"]],
  montanha: [["minerador_perdido", "Minerador perdido", "miner", "morto_vivo", "cr_mineiro"], ["lobo_serra", "Lobo da serra", "wolf", "lobo", "cr_lobo_neve"], ["golem_pedra", "Golem de pedra", "golem", "golem", "cr_golem"]],
  vulcao: [["vespa_cinza", "Vespa de cinza", "wasp", "inseto", "cr_vespa"], ["golem_brasa", "Golem de brasa", "golem", "golem", "cr_golem"], ["dragonete", "Dragonete", "dragonling", "dragao", "cr_golem"]],
  gelo: [["lobo_gelo", "Lobo do gelo", "wolf", "lobo", "cr_lobo_neve"], ["troll_neve", "Troll da neve", "golem", "gigante", "cr_troll_gelo"], ["sentinela_gelada", "Sentinela gelada", "guardian", "golem", "cr_sentinela"]],
  sombrio: [["esqueleto_errante", "Esqueleto errante", "fallen", "morto_vivo", "cr_cavaleiro"], ["cavaleiro_caido", "Cavaleiro caído", "fallen", "morto_vivo", "cr_cavaleiro"], ["sentinela_sombria", "Sentinela sombria", "guardian", "golem", "cr_guardiao"]],
  costa: [["pirata_costa", "Pirata da costa", "bandit", "humano", "cr_bandido"], ["afogado_costa", "Afogado da costa", "drowned", "morto_vivo", "cr_afogado"], ["capitao_afogado", "Capitão afogado", "fallen", "morto_vivo", "cr_afogado"]] };
const TINT = { gelo: "ice", vulcao: "deep", sombrio: "void", deserto: "sand", floresta: "ancient" };
const PLACE = { planicie: ["Campina", "Colinas", "Pasto", "Vau"], floresta: ["Bosque", "Clareira", "Mata", "Toca"], pantano: ["Brejo", "Charco", "Lodaçal", "Mangue"], deserto: ["Dunas", "Cânion", "Areal", "Oásis seco"],
  montanha: ["Encosta", "Garganta", "Mina velha", "Penhasco"], vulcao: ["Cratera", "Campo de cinzas", "Fenda", "Forja velha"], gelo: ["Geleira", "Vale gelado", "Fiorde", "Picos brancos"], sombrio: ["Ruínas", "Cemitério", "Torre caída", "Vale das sombras"], costa: ["Enseada", "Recife", "Praia", "Farol velho"] };
const SYL1 = ["Val", "Mor", "Ar", "Bel", "Kar", "Thal", "Eld", "Gor", "Nor", "Dra", "Ost", "Fen", "Lir", "Bran", "Cor", "Ves"], SYL2 = ["en", "ia", "or", "as", "um", "eth", "ar", "in", "dor", "mir", "vel", "ros"];
const TADD = [3, 16, 32], monIdx = new Map(), perCity = {}; let wi = 0;
function creature(grp, tier, city, boss) {
  const [rid, name, sprite, fam, loot] = ROSTER[grp][tier - 1], c = cities.find(q => q.id === city), id = `${rid}_${city}${boss ? "_chefe" : ""}`;
  if (!monIdx.has(id)) { const lvl = c.base + TADD[tier - 1] + (boss ? 6 : 0); monIdx.set(id, 1);
    monsters.push({ id, name: boss ? `Chefe ${name.toLowerCase()}` : name, sprite, lvl, cat: boss ? "miniboss" : tier === 3 ? "elite" : tier === 2 ? "incomum" : "comum", fam, tint: TINT[grp] || null, realm: "eldoria", city, loot, group: grp, tier }); }
  return id;
}
const SP = 360;
for (let gy = -OY + SP / 2; gy < SIZE - OY; gy += SP) for (let gx = -OX + SP / 2; gx < SIZE - OX; gx += SP) {
  const jx = Math.round(gx + (hashTile(gx, gy, 131) - .5) * SP * .6), jy = Math.round(gy + (hashTile(gx, gy, 132) - .5) * SP * .6);
  if (jx > -40 && jy > -40 && jx < 340 && jy < 240) continue;
  let spot = null; for (let t = 0; t < 30 && !spot; t++) { const a = hashTile(jx, t, 133) * 6.283, rr = t * 6; const x = Math.round(jx + Math.cos(a) * rr), y = Math.round(jy + Math.sin(a) * rr); const b = tileAt(x, y);
    if (GROUP[b] && !isBlocked(b) && labAt(x, y) >= 0 && okArea(x, y, 9) && !hunts.some(h => Math.hypot(h.cx - x, h.cy - y) < 130) && !cities.some(c => !c.heart && cityInside(c, x, y) < 1.25)) spot = [x, y, b]; }
  if (!spot) continue;
  const v = labAt(spot[0], spot[1]), city = cities[Math.floor(v / 3)].id, tier = v % 3 + 1, grp = GROUP[spot[2]];
  const key = city + tier; perCity[key] = (perCity[key] || 0) + 1;
  const boss = tier === 3 && perCity[key] % 6 === 2;
  const mon = creature(grp, tier, city, false), bossId = boss ? creature(grp, tier, city, true) : null, lvl = monsters.find(m => m.id === mon).lvl;
  const pl = PLACE[grp][Math.floor(hashTile(spot[0], spot[1], 134) * 4)], nm = SYL1[Math.floor(hashTile(spot[0], spot[1], 135) * SYL1.length)] + SYL2[Math.floor(hashTile(spot[0], spot[1], 136) * SYL2.length)];
  const named = city !== "arken" && perCity[key] === 1 ? `${city}_a${tier}` : `w${String(++wi).padStart(3, "0")}`;
  hunts.push({ id: named, name: `${pl} de ${nm}`, mon, boss: bossId, cx: spot[0], cy: spot[1], r: 9, city, ring: tier, lvl, wild: true, group: grp, region: cities.find(c => c.id === city).regions[tier - 1] });
}
log("caças por cidade/nível", JSON.stringify(perCity));

// ---------- depósitos: básicos no nível 1, médios no 2, exclusivos (diamante, mitril, adamantita) no 3 ----------
for (const c of cities.filter(c => !c.heart)) for (let k = 1; k <= 3; k++) {
  const h0 = hunts.find(h => h.id === `${c.id}_a${k}`) || hunts.find(h => h.city === c.id && h.ring === k); if (!h0) continue;
  const kinds = k === 1 ? ["rocha", "arvore", "erva"] : k === 2 ? ["veio_ferro", "veio_prata", "carvalho_antigo"] : ["veio_mitril", "veio_profundo", "veio_diamante"];
  for (const [j, kind] of kinds.entries()) { let p = null; for (let t = 0; t < 80 && !p; t++) { const a = hashTile(j, t, 97 + k) * 6.283, rr = 14 + t * .6; const x = Math.round(h0.cx + Math.cos(a) * rr), y = Math.round(h0.cy + Math.sin(a) * rr); const b = tileAt(x, y); if (!isBlocked(b) && b !== B.ROAD && b !== B.CITY && b !== B.HEART && okArea(x, y, 1.5) && labAt(x, y) % 3 + 1 === k) p = [x, y]; }
    if (p) nodes.push({ id: `${c.id}_${kind}_${k}`, kind, x: p[0], y: p[1], city: c.id, ring: k, owner: k === 3 ? "city:" + c.id : null }); }
}
// ---------- marcos onde as estradas mudam de nível: bandeiras âmbar (1↔2) e monólitos vermelhos com tochas (2↔3) ----------
for (const r of roads) { let prev = null; for (let i = 1; i < r.pts.length; i++) { const [a, b] = [r.pts[i - 1], r.pts[i]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.5);
  for (let s2 = 0; s2 <= n; s2++) { const x = a[0] + (b[0] - a[0]) * s2 / n, y = a[1] + (b[1] - a[1]) * s2 / n; const v = labAt(x, y); if (v < 0) continue; const t = v % 3 + 1;
    if (prev && prev.t !== t && Math.max(prev.t, t) >= 2 && !markers.some(m => Math.hypot(m.x - x, m.y - y) < 40)) { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      for (const sd of [-1, 1]) { const mx = Math.round(x + nx * 2.8 * sd), my = Math.round(y + ny * 2.8 * sd), tb = tileAt(mx, my); if (!isBlocked(tb) && tb !== B.ROAD && tb !== B.BRIDGE) markers.push({ x: mx, y: my, kind: Math.max(prev.t, t) === 3 ? "redmark" : "flagpost" }); } }
    prev = { t }; } } }
log("caças", hunts.length, "depósitos", nodes.length, "marcos", markers.length);

// ---------- caminhos: grafo de pontos de estrada (rotas longas) ----------
const wpN = [], wpE = []; const key = p => p.map(v => Math.round(v)).join(",");
const idOf = new Map(); const node = p => { const k = key(p); if (!idOf.has(k)) { idOf.set(k, wpN.length); wpN.push(p.map(v => Math.round(v))); } return idOf.get(k); };
for (const r of roads) { let last = null, acc = 0; for (let i = 0; i < r.pts.length; i++) { const p = r.pts[i]; const isEnd = i === 0 || i === r.pts.length - 1; if (last && !isEnd) { acc += Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]); if (acc < 20) continue; } const n = node(p); if (last != null && last !== n) wpE.push([last, n, Math.round(Math.hypot(wpN[last][0] - p[0], wpN[last][1] - p[1]))]); last = n; acc = 0; } }
// pontos que coincidem (cidade) já viram o mesmo nó; liga extremos próximos
for (let i = 0; i < wpN.length; i++) for (let j = i + 1; j < wpN.length; j++) { const d = Math.hypot(wpN[i][0] - wpN[j][0], wpN[i][1] - wpN[j][1]); if (d < 4 && d > 0) wpE.push([i, j, Math.round(d)]); }
// pontas de estrada que terminam num entroncamento (meio de outra estrada) se ligam aos nós vizinhos dessa estrada
for (const r of roads) for (const e of [r.pts[0], r.pts[r.pts.length - 1]]) { const me = idOf.get(key(e)); if (me == null) continue;
  const near = wpN.map((p, i) => [i, Math.hypot(p[0] - e[0], p[1] - e[1])]).filter(([i, d]) => i !== me && d < 30).sort((a, b) => a[1] - b[1]).slice(0, 2);
  for (const [i, d] of near) wpE.push([me, i, Math.max(1, Math.round(d))]); }
// as 4 saídas do coração se ligam por dentro dele (o coração é todo andável por estradas próprias)
const exitIds = edge.exits.map(e => idOf.get(key([e.x, e.y]))).filter(v => v != null);
for (let i = 0; i < exitIds.length; i++) for (let k = i + 1; k < exitIds.length; k++) { const a = wpN[exitIds[i]], b = wpN[exitIds[k]]; wpE.push([exitIds[i], exitIds[k], Math.round((Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) * 1.1)]); }
const wp = { nodes: wpN, edges: wpE, exits: exitIds };
log("pontos de estrada", wpN.length, "ligações", wpE.length);

// ---------- validação: nada importante bloqueado ----------
const problems = [];
for (const c of cities.filter(c => !c.heart)) { if (isBlocked(tileAt(c.x, c.y))) problems.push("cidade bloqueada " + c.id); for (const o of c.buildings) if (tileAt(o.x, o.y) !== B.CITY) problems.push(`construção fora do calçamento ${c.id} ${o.sprite} ${tileAt(o.x, o.y)}`); }
for (const n of nodes) if (isBlocked(tileAt(n.x, n.y))) problems.push("depósito bloqueado " + n.id);
for (const h of hunts) if (!okArea(h.cx, h.cy, 6)) problems.push("caça bloqueada " + h.id);
for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) { const [x, y] = r.pts[i].map(Math.floor); const b = tileAt(x, y); if (b !== B.HEART && isBlocked(b)) { problems.push(`estrada bloqueada ${r.from}-${r.to} em ${x},${y} (${b})`); break; } }
// estrada contínua: cada ponto andável e ligado
log("problemas:", problems.length ? problems.slice(0, 12).join(" | ") : "nenhum");

// ---------- mapa-múndi 1000×1000 (1 px = 10 tiles) ----------
const W = 1000, rgb = Buffer.alloc(W * W * 3);
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const x = i * 10 - OX + 5, y = j * 10 - OY + 5; let b = tileAt(x, y); if (b === B.HEART) b = B.PLAINS; const c = BIOME_RGB[b] || [255, 0, 255]; const k = (j * W + i) * 3;
  const sh = .9 + (hashTile(i, j, 9) - .5) * .08; rgb[k] = Math.min(255, c[0] * sh); rgb[k + 1] = Math.min(255, c[1] * sh); rgb[k + 2] = Math.min(255, c[2] * sh); }
const line = (a, b, col, w = 1) => { const [ax, ay] = G(...a), [bx, by] = G(...b); const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 5); for (let s = 0; s <= n; s++) { const px = Math.round((ax + (bx - ax) * s / n) / 10), py = Math.round((ay + (by - ay) * s / n) / 10); for (let oy = -w + 1; oy < w; oy++) for (let ox = -w + 1; ox < w; ox++) { const qx = px + ox, qy = py + oy; if (qx < 0 || qy < 0 || qx >= W || qy >= W) continue; const k = (qy * W + qx) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2]; } } };
for (const r of rivers) for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], [60, 128, 180]);
for (const r of roads) for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], [170, 132, 84]);
fs.writeFileSync(`${OUT}/world-overview.rgb`, rgb);

const net = { version: 2, size: SIZE, ox: OX, oy: OY, cities, rivers, roads, ports, lakes, edge, hunts, monsters, nodes, wp, territory, markers };
fs.writeFileSync(new URL("../assets/world-net.json", import.meta.url), JSON.stringify(net));
fs.writeFileSync(`${OUT}/world-gen.json`, JSON.stringify({ hunts, monsters, nodes, cities: cities.map(({ buildings, ...c }) => c), problems }, null, 1));
log("pronto: assets/world-net.json", (JSON.stringify(net).length / 1024).toFixed(0) + " KB");
