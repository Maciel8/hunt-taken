// Gera a rede do continente (cidades, rios, estradas, docas, oásis, construções, áreas de caça, depósitos)
// e o mapa-múndi, a partir do terreno determinístico de js/terrain.js. Saídas:
//   assets/world-net.json            → usado pelo jogo e pelo Web Worker
//   tmp overview .rgb (1000x1000)     → convertido em assets/world-overview.png
//   supabase SQL das áreas de caça/criaturas/depósitos/cidades (impresso em arquivo)
// Uso: node scripts/gen-world.mjs <dir_saida_tmp>
import fs from "node:fs";
import { SIZE, OX, OY, B, baseBiome, initNet, tileAt, isBlocked, NET, zoneAt, ringRadius, chunkObjects, chunkTiles, CHUNK, BIOME_RGB, hashTile, coastAt } from "../js/terrain.js";
const OUT = process.argv[2] || "."; const t0 = Date.now(); const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const edge = JSON.parse(fs.readFileSync(new URL("../assets/heartland-edge.json", import.meta.url)));
const L = (gx, gy) => [gx - OX, gy - OY];          // global → local
const G = (x, y) => [x + OX, y + OY];
const landAt = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !(b === B.DEEP || b === B.OCEAN || b === B.SHALLOW); };
const solid = (x, y) => { const [gx, gy] = G(x, y); const b = baseBiome(gx, gy); return !isBlocked(b) && b !== B.BEACH && b !== B.CLIFF; };
// procura em espiral um ponto firme perto do alvo
function settle(x, y, ok = solid, maxR = 400) { for (let r = 0; r < maxR; r += 3) for (let a = 0; a < 6.283; a += r ? 3 / r : 7) { const px = Math.round(x + Math.cos(a) * r), py = Math.round(y + Math.sin(a) * r); if (ok(px, py)) return [px, py]; } throw new Error("sem lugar perto de " + x + "," + y); }

// ---------- cidades ----------
const phase = (s, k) => [hashTile(s, k, 91) * 6.283, hashTile(s, k, 92) * 6.283, hashTile(s, k, 93) * 6.283];
const CITY_DEF = [
  { id: "arken", name: "Vila de Arken", at: [52, 40], heart: true, r: [1, 220, 480], spec: "Hub geral e Mercado Central" },
  { id: "valen", name: "Porto de Valen", east: true, r: [90, 230, 460], spec: "Comércio marítimo, pesca e couros" },
  { id: "khazad", name: "Forja de Khazad", at: L(6150, 2750), r: [90, 230, 460], spec: "Metalurgia, minérios e armas" },
  { id: "solkar", name: "Oásis de Solkar", at: L(5000, 8050), r: [90, 230, 460], spec: "Joalheria, gemas e diamantes" },
  { id: "sylvana", name: "Bosques de Sylvana", at: L(1850, 4500), r: [90, 230, 460], spec: "Alquimia, madeira e ervas" },
  { id: "nocthar", name: "Cidadela de Nocthar", at: L(1750, 2050), r: [90, 230, 460], spec: "Artefatos, encantamento e mercado negro" }];
const cities = [];
for (const [i, d] of CITY_DEF.entries()) {
  let x, y;
  if (d.heart) [x, y] = d.at;
  else if (d.east) { let gx = 6500, gy = 5450; while (coastAt(gx, gy) > .02 && gx < SIZE) gx += 5; [x, y] = settle(...L(gx - 80, gy)); }
  else [x, y] = settle(...d.at);
  cities.push({ id: d.id, name: d.name, x, y, r: d.r, ph: [phase(i, 1), phase(i, 2), phase(i, 3)], plaza: d.heart ? 0 : 16, spec: d.spec, heart: !!d.heart });
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
    for (const c of cities) if (!c.heart && Math.hypot(nx - c.x, ny - c.y) < c.plaza + 26) { a += .9; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
    x = nx; y = ny; pts.push([Math.round(x), Math.round(y)]); ws.push(Math.min(4.2, w0 + k * .006));
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
  flow(x, y, hashTile(k, 3, 71) * 6.283, 1.4); srcN++;
}
// rios do coração: grupos de água na borda continuam pra fora
const runs = []; for (const t of edge.tiles.filter(t => t[3])) { const r = runs.find(r => Math.abs(r.x - t[0]) + Math.abs(r.y - t[1]) < 4 && r.side === (t[1] === 199 ? "s" : t[1] === 0 ? "n" : t[0] === 0 ? "w" : "e")); if (r) { r.n++; r.sx += t[0]; r.sy += t[1]; r.x = t[0]; r.y = t[1]; } else runs.push({ side: t[1] === 199 ? "s" : t[1] === 0 ? "n" : t[0] === 0 ? "w" : "e", n: 1, sx: t[0], sy: t[1], x: t[0], y: t[1] }); }
for (const r of runs) { const mx = Math.round(r.sx / r.n), my = Math.round(r.sy / r.n), d = { s: [0, 1], n: [0, -1], w: [-1, 0], e: [1, 0] }[r.side];
  const pts = [[mx, my], [mx + d[0] * 6, my + d[1] * 6]]; const w = Math.max(1.6, r.n / 2.6); rivers.push({ pts, w: [w, w], heart: true }); flow(mx + d[0] * 6, my + d[1] * 6, Math.atan2(d[1], d[0]), w); }
log("rios", rivers.length);

// ---------- estradas: A* numa grade grossa evitando água e picos ----------
const CS = 25, GW = SIZE / CS; const cost = new Float32Array(GW * GW);
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
const chaikin = (p, n = 3) => { for (let k = 0; k < n; k++) { const q = [p[0]]; for (let i = 0; i < p.length - 1; i++) { const [a, b] = [p[i], p[i + 1]]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); } q.push(p[p.length - 1]); p = q; } return p.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]); };
const C = id => cities.find(c => c.id === id);
const EXIT = Object.fromEntries(edge.exits.map(e => [e.side, e]));
const exitOut = s => { const e = EXIT[s], d = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[s]; return [[e.x, e.y], [e.x + d[0] * 14, e.y + d[1] * 14]]; };
const roads = []; const ROUTES = [["e", "valen"], ["n", "khazad"], ["s", "solkar"], ["w", "sylvana"], ["sylvana", "nocthar"], ["khazad", "nocthar"], ["valen", "solkar"], ["sylvana", "solkar"], ["khazad", "valen"]];
for (const [a, b] of ROUTES) {
  let start, lead = [];
  if (a.length === 1) { const [p0, p1] = exitOut(a); lead = [p0]; start = p1; } else start = [C(a).x, C(a).y];
  const end = [C(b).x, C(b).y];
  const mid = chaikin(coarse(start[0], start[1], end[0], end[1]));
  roads.push({ from: a.length === 1 ? "arken" : a, to: b, exit: a.length === 1 ? a : null, pts: [...lead, ...mid] });
}
log("estradas", roads.length, roads.map(r => r.pts.length).join(","));

// ---------- porto de Valen: docas pro mar e navios ----------
const ports = []; { const c = C("valen"); let x = c.x, y = c.y; while (landAt(x, y)) x += 1; const dock = [[x - 6, y], [x + 16, y]], dock2 = [[x + 4, y - 7], [x + 4, y + 7]];
  ports.push({ city: "valen", x, y, docks: [dock, dock2], ships: [[x + 13, y - 4], [x + 13, y + 5]] });
  roads.push({ from: "valen", to: "porto", pts: [[c.x, c.y], [x - 6, y]] }); }
// oásis de Solkar
const lakes = [{ x: C("solkar").x + 34, y: C("solkar").y + 4, r: 13 }, { x: C("solkar").x - 30, y: C("solkar").y - 22, r: 7 }];

// ---------- construções e NPCs das cidades ----------
const HOUSES = ["house", "house2", "house_thatch", "house_thatch2"];
for (const c of cities.filter(c => !c.heart)) {
  c.buildings = []; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283 + .3, R = c.plaza - 5; c.buildings.push({ x: Math.round(c.x + Math.cos(a) * R), y: Math.round(c.y + Math.sin(a) * R * .85), kind: "building", sprite: HOUSES[k % 4], fw: 3, fh: 2 }); }
  c.buildings.push({ x: c.x, y: c.y - 2, kind: "building", sprite: "fountain", fw: 2, fh: 1 });
  for (const [dx, dy] of [[-6, 3], [5, 4], [-3, 6]]) c.buildings.push({ x: c.x + dx, y: c.y + dy, kind: "building", sprite: "stall", fw: 2, fh: 1, solid: true });
}

// ---------- áreas de caça nos anéis (3 por cidade nova) e criaturas ----------
const MONS = {
  valen: [["pirata_baia", "Pirata da baía", "bandit", 22, "comum", "humano", null], ["afogado_porto", "Afogado do porto", "drowned", 30, "incomum", "morto_vivo", null], ["capitao_fantasma", "Capitão fantasma", "fallen", 40, "elite", "morto_vivo", "ice"]],
  sylvana: [["lobo_bosque", "Lobo do bosque", "wolf", 30, "comum", "lobo", "ancient"], ["aranha_ancestral", "Aranha ancestral", "spider", 40, "incomum", "aracnideo", "ancient"], ["guardiao_bosque", "Guardião do bosque", "golem", 50, "elite", "planta", "ancient"]],
  solkar: [["saqueador_areia", "Saqueador das areias", "bandit", 40, "comum", "humano", "sand"], ["escorpiao_gigante", "Escorpião gigante", "spider", 52, "incomum", "aracnideo", "sand"], ["vespa_solar", "Vespa solar", "wasp", 62, "elite", "inseto", "sand"]],
  khazad: [["lobo_khazad", "Lobo de Khazad", "wolf", 50, "comum", "lobo", "snow"], ["minerador_maldito", "Minerador maldito", "miner", 63, "incomum", "morto_vivo", "ice"], ["golem_magma", "Golem de magma", "golem", 75, "elite", "golem", "deep"]],
  nocthar: [["esqueleto_nocthar", "Esqueleto de Nocthar", "fallen", 70, "comum", "morto_vivo", "void"], ["cavaleiro_sombrio", "Cavaleiro sombrio", "fallen", 85, "incomum", "morto_vivo", "void"], ["sentinela_abismo", "Sentinela do abismo", "guardian", 98, "miniboss", "golem", "void"]] };
const hunts = [], monsters = [], nodes = [];
const okArea = (x, y, r) => { for (let a = 0; a < 6.283; a += .5) for (const rr of [0, r * .5, r]) { const px = Math.round(x + Math.cos(a) * rr), py = Math.round(y + Math.sin(a) * rr); const b = tileAt(px, py); if (isBlocked(b) || b === B.HEART) return false; } return true; };
initNet({ cities, rivers, roads, ports, lakes, edge });
for (const c of cities.filter(c => !c.heart)) for (let k = 0; k < 3; k++) {
  const [id, name, sprite, lvl, cat, fam, tint] = MONS[c.id][k]; const R = k === 0 ? c.r[0] * .62 : k === 1 ? (c.r[0] + c.r[1]) / 2 : (c.r[1] + c.r[2]) / 2;
  let spot = null; for (let t = 0; t < 64 && !spot; t++) { const a = hashTile(k, t, c.id.length * 7) * 6.283, rr = R * (1 + (t % 4 - 1.5) * .06); const x = Math.round(c.x + Math.cos(a) * rr), y = Math.round(c.y + Math.sin(a) * rr); const z = zoneAt(x, y); if (z.city.id === c.id && z.ring === k + 1 && okArea(x, y, 9)) spot = [x, y]; }
  if (!spot) throw new Error("sem área de caça " + c.id + " anel " + (k + 1));
  hunts.push({ id: `${c.id}_a${k + 1}`, name: `${["Arredores", "Terras disputadas", "Zona vermelha"][k]} de ${c.name.split(" ").slice(-1)[0]}`, mon: id, cx: spot[0], cy: spot[1], r: 9, city: c.id, ring: k + 1, lvl });
  monsters.push({ id, name, sprite, lvl, cat, fam, tint, realm: "eldoria", city: c.id });
  // depósitos do anel: 1 básico, 2 médios, 3 exclusivos (do clã que domina a cidade)
  const kinds = k === 0 ? ["rocha", "arvore", "erva"] : k === 1 ? ["veio_ferro", "veio_prata", "carvalho_antigo"] : ["veio_mitril", "veio_profundo", "veio_diamante"];
  for (const [j, kind] of kinds.entries()) { let p = null; for (let t = 0; t < 80 && !p; t++) { const a = hashTile(j, t, 97 + k) * 6.283, rr = 14 + t * .6; const x = Math.round(spot[0] + Math.cos(a) * rr), y = Math.round(spot[1] + Math.sin(a) * rr); const b = tileAt(x, y); if (!isBlocked(b) && b !== B.ROAD && b !== B.CITY && b !== B.HEART && okArea(x, y, 1.5)) p = [x, y]; }
    if (p) nodes.push({ id: `${c.id}_${kind}_${k + 1}`, kind, x: p[0], y: p[1], city: c.id, ring: k + 1, owner: k === 2 ? "city:" + c.id : null }); }
}
log("caças", hunts.length, "depósitos", nodes.length);

// ---------- caminhos: grafo de pontos de estrada (rotas longas) ----------
const wpN = [], wpE = []; const key = p => p.map(v => Math.round(v)).join(",");
const idOf = new Map(); const node = p => { const k = key(p); if (!idOf.has(k)) { idOf.set(k, wpN.length); wpN.push(p.map(v => Math.round(v))); } return idOf.get(k); };
for (const r of roads) { let last = null, acc = 0; for (let i = 0; i < r.pts.length; i++) { const p = r.pts[i]; const isEnd = i === 0 || i === r.pts.length - 1; if (last && !isEnd) { acc += Math.hypot(p[0] - r.pts[i - 1][0], p[1] - r.pts[i - 1][1]); if (acc < 20) continue; } const n = node(p); if (last != null && last !== n) wpE.push([last, n, Math.round(Math.hypot(wpN[last][0] - p[0], wpN[last][1] - p[1]))]); last = n; acc = 0; } }
// pontos que coincidem (cidade) já viram o mesmo nó; liga extremos próximos
for (let i = 0; i < wpN.length; i++) for (let j = i + 1; j < wpN.length; j++) { const d = Math.hypot(wpN[i][0] - wpN[j][0], wpN[i][1] - wpN[j][1]); if (d < 4 && d > 0) wpE.push([i, j, Math.round(d)]); }
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
for (const r of roads) for (let i = 0; i < r.pts.length; i += 2) { const [x, y] = r.pts[i].map(Math.round); const b = tileAt(x, y); if (b !== B.HEART && isBlocked(b)) { problems.push(`estrada bloqueada ${r.from}-${r.to} em ${x},${y} (${b})`); break; } }
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

const net = { version: 1, size: SIZE, ox: OX, oy: OY, cities, rivers, roads, ports, lakes, edge, hunts, monsters, nodes, wp };
fs.writeFileSync(new URL("../assets/world-net.json", import.meta.url), JSON.stringify(net));
fs.writeFileSync(`${OUT}/world-gen.json`, JSON.stringify({ hunts, monsters, nodes, cities: cities.map(({ buildings, ...c }) => c), problems }, null, 1));
log("pronto: assets/world-net.json", (JSON.stringify(net).length / 1024).toFixed(0) + " KB");
