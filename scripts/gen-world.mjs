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

const roomy = (x, y) => { for (const r of [0, 20, 40, 56]) for (let a = 0; a < 6.283; a += .35) if (!solid(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r))) return false; return true; };
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
const cities = [];
for (const [i, d] of CITY_DEF.entries()) {
  let x, y;
  if (d.heart) [x, y] = d.at;
  else if (d.east) { let gx = 6500, gy = 5450; while (coastAt(gx, gy) > .02 && gx < SIZE) gx += 5; [x, y] = settle(...L(gx - 95, gy), roomy, 300); }
  else [x, y] = settle(...d.at, roomy, 900);
  cities.push({ id: d.id, name: d.name, x, y, r: d.r, ph: [phase(i, 1), phase(i, 2), phase(i, 3)], plaza: d.heart ? 0 : 44, spec: d.spec, heart: !!d.heart });
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
    for (const c of cities) if (!c.heart && Math.hypot(nx - c.x, ny - c.y) < c.plaza + 45) { a += .9; nx = x + Math.cos(a) * 10; ny = y + Math.sin(a) * 10; }
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
const roads = []; const ROUTES = [["e", "valen"], ["n", "khazad"], ["s", "solkar"], ["w", "sylvana"], ["sylvana", "nocthar"], ["khazad", "nocthar"], ["valen", "solkar"], ["sylvana", "solkar"], ["khazad", "valen"]];
for (const [a, b] of ROUTES) {
  let start, lead = [];
  if (a.length === 1) { const [p0, p1] = exitOut(a); lead = [p0]; start = p1; } else start = [C(a).x, C(a).y];
  const end = [C(b).x, C(b).y];
  let raw = coarse(start[0], start[1], end[0], end[1]);
  // média móvel tira os degraus da grade; depois Chaikin arredonda as curvas
  for (let pass = 0; pass < 3; pass++) raw = raw.map((p, i) => { if (i === 0 || i === raw.length - 1) return p; let sx = 0, sy = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = raw[Math.max(0, Math.min(raw.length - 1, i + k))]; sx += q[0]; sy += q[1]; n++; } return [sx / n, sy / n]; });
  const mid = chaikin(raw, 3);
  roads.push({ from: a.length === 1 ? "arken" : a, to: b, exit: a.length === 1 ? a : null, pts: [...lead, ...mid] });
}
// entroncamentos: estrada que chega (ou sai) colada numa estrada anterior é cortada e termina nela (sem trilhos paralelos)
const nearestOn = (p, list) => { let best = null, bd = 1e9; for (const r of list) for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } } return { q: best, d: bd }; };
for (let k = 1; k < roads.length; k++) { const prev = roads.slice(0, k), r = roads[k];
  for (const end of [1, 0]) { const pts = end ? r.pts : r.pts.slice().reverse(); let cut = -1;
    for (let i = pts.length - 1; i > 0; i--) { if (nearestOn(pts[i], prev).d < 7) cut = i; else break; }
    if (cut > 0 && cut < pts.length - 1) { const keep = pts.slice(0, cut + 1), j = nearestOn(keep[keep.length - 1], prev).q; keep.push([Math.round(j[0] * 10) / 10, Math.round(j[1] * 10) / 10]); r.pts = end ? keep : keep.reverse(); } } }
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
  c.buildings = []; const add = (x, y, sprite, fw, fh, extra = {}) => c.buildings.push({ x: Math.round(x), y: Math.round(y), kind: "building", sprite, fw, fh, ...extra });
  add(c.x, c.y - 2, "fountain", 2, 1);
  // praça do mercado, depois dois anéis de casas, deixando 4 avenidas livres (as estradas entram por elas)
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + .39; add(c.x + Math.cos(a) * 11, c.y + Math.sin(a) * 9, "stall", 2, 1); }
  for (const [R, n, off] of [[22, 12, .26], [34, 18, .17]]) for (let k = 0; k < n; k++) { const a = k / n * 6.283 + off; if (Math.abs(Math.sin(2 * a)) < .22) continue;
    add(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R * .88, HOUSES[(k + R) % 4], 3, 2); }
  for (const a of [.8, 2.4, 3.9, 5.5]) add(c.x + Math.cos(a) * 41, c.y + Math.sin(a) * 36, "watchtower", 2, 2);
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
  monsters.push({ id, name, sprite, lvl, cat, fam, tint, realm: "eldoria", city: c.id, loot: ({ bandit: "cr_bandido", drowned: "cr_afogado", fallen: "cr_cavaleiro", wolf: "cr_lobo", spider: "cr_aranha", golem: "cr_golem", wasp: "cr_vespa", miner: "cr_mineiro", guardian: "cr_guardiao" })[sprite] || "cr_bandido" });
  // depósitos do anel: 1 básico, 2 médios, 3 exclusivos (do clã que domina a cidade)
  const kinds = k === 0 ? ["rocha", "arvore", "erva"] : k === 1 ? ["veio_ferro", "veio_prata", "carvalho_antigo"] : ["veio_mitril", "veio_profundo", "veio_diamante"];
  for (const [j, kind] of kinds.entries()) { let p = null; for (let t = 0; t < 80 && !p; t++) { const a = hashTile(j, t, 97 + k) * 6.283, rr = 14 + t * .6; const x = Math.round(spot[0] + Math.cos(a) * rr), y = Math.round(spot[1] + Math.sin(a) * rr); const b = tileAt(x, y); if (!isBlocked(b) && b !== B.ROAD && b !== B.CITY && b !== B.HEART && okArea(x, y, 1.5)) p = [x, y]; }
    if (p) nodes.push({ id: `${c.id}_${kind}_${k + 1}`, kind, x: p[0], y: p[1], city: c.id, ring: k + 1, owner: k === 2 ? "city:" + c.id : null }); }
}
// ---------- monstros no continente inteiro: áreas de caça espalhadas, criatura do bioma, nível pela distância ----------
const GROUP = { [B.PLAINS]: "planicie", [B.FIELD]: "planicie", [B.FOREST]: "floresta", [B.ANCIENT]: "floresta", [B.SWAMP]: "pantano", [B.MANGROVE]: "pantano", [B.DESERT]: "deserto", [B.CANYON]: "deserto",
  [B.MOUNTAIN]: "montanha", [B.VOLCANIC]: "vulcao", [B.TUNDRA]: "gelo", [B.GLACIER]: "gelo", [B.DARK]: "sombrio", [B.BEACH]: "costa", [B.CLIFF]: "costa" };
// [id, nome, sprite, família, tabela de loot] por faixa (perto / médio / longe)
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
const OFF = { planicie: 0, costa: 2, floresta: 4, pantano: 7, deserto: 10, montanha: 12, gelo: 15, vulcao: 18, sombrio: 20 };
const TIER_LVL = [14, 42, 80];
const TINT = { gelo: "ice", vulcao: "deep", sombrio: "void", deserto: "sand", floresta: "ancient" };
const PLACE = { planicie: ["Campina", "Colinas", "Pasto", "Vau"], floresta: ["Bosque", "Clareira", "Mata", "Toca"], pantano: ["Brejo", "Charco", "Lodaçal", "Mangue"], deserto: ["Dunas", "Cânion", "Areal", "Oásis seco"],
  montanha: ["Encosta", "Garganta", "Mina velha", "Penhasco"], vulcao: ["Cratera", "Campo de cinzas", "Fenda", "Forja velha"], gelo: ["Geleira", "Vale gelado", "Fiorde", "Picos brancos"], sombrio: ["Ruínas", "Cemitério", "Torre caída", "Vale das sombras"], costa: ["Enseada", "Recife", "Praia", "Farol velho"] };
const SYL1 = ["Val", "Mor", "Ar", "Bel", "Kar", "Thal", "Eld", "Gor", "Nor", "Dra", "Ost", "Fen", "Lir", "Bran", "Cor", "Ves"], SYL2 = ["en", "ia", "or", "as", "um", "eth", "ar", "in", "dor", "mir", "vel", "ros"];
const heartDist = (x, y) => Math.hypot(Math.max(-x, 0, x - 300), Math.max(-y, 0, y - 200));
const usedMon = new Map(); let wi = 0;
const SP = 420;
for (let gy = -OY + SP / 2; gy < SIZE - OY; gy += SP) for (let gx = -OX + SP / 2; gx < SIZE - OX; gx += SP) {
  const jx = Math.round(gx + (hashTile(gx, gy, 131) - .5) * SP * .6), jy = Math.round(gy + (hashTile(gx, gy, 132) - .5) * SP * .6);
  if (heartDist(jx, jy) < 60) continue;
  const z = zoneAt(jx, jy); if (z.city && z.ring === 1) continue;
  if (cities.some(c => !c.heart && Math.hypot(c.x - jx, c.y - jy) < c.r[0] + 40)) continue;
  let spot = null; for (let t = 0; t < 30 && !spot; t++) { const a = hashTile(jx, t, 133) * 6.283, rr = t * 6; const x = Math.round(jx + Math.cos(a) * rr), y = Math.round(jy + Math.sin(a) * rr); const b = tileAt(x, y);
    if (GROUP[b] && okArea(x, y, 9) && !hunts.some(h => Math.hypot(h.cx - x, h.cy - y) < 160)) spot = [x, y, b]; }
  if (!spot) continue;
  const grp = GROUP[spot[2]], d = heartDist(spot[0], spot[1]), tier = d < 1300 ? 0 : d < 2700 ? 1 : 2;
  const [id, name, sprite, fam, loot] = ROSTER[grp][tier]; const lvl = TIER_LVL[tier] + OFF[grp];
  if (!usedMon.has(id)) { usedMon.set(id, 1); monsters.push({ id, name, sprite, lvl, cat: "comum", fam, tint: TINT[grp] || null, realm: "eldoria", city: null, loot, group: grp }); }
  const near = cities.slice().sort((a, b) => Math.hypot(a.heart ? 150 - spot[0] : a.x - spot[0], a.heart ? 100 - spot[1] : a.y - spot[1]) - Math.hypot(b.heart ? 150 - spot[0] : b.x - spot[0], b.heart ? 100 - spot[1] : b.y - spot[1]))[0];
  const pl = PLACE[grp][Math.floor(hashTile(spot[0], spot[1], 134) * 4)], nm = SYL1[Math.floor(hashTile(spot[0], spot[1], 135) * SYL1.length)] + SYL2[Math.floor(hashTile(spot[0], spot[1], 136) * SYL2.length)];
  hunts.push({ id: `w${String(++wi).padStart(3, "0")}`, name: `${pl} de ${nm}`, mon: id, cx: spot[0], cy: spot[1], r: 9, city: near.id, ring: z.ring <= 3 ? z.ring : 4, lvl, wild: true, group: grp });
}
log("caças", hunts.length, "depósitos", nodes.length);

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

const net = { version: 1, size: SIZE, ox: OX, oy: OY, cities, rivers, roads, ports, lakes, edge, hunts, monsters, nodes, wp };
fs.writeFileSync(new URL("../assets/world-net.json", import.meta.url), JSON.stringify(net));
fs.writeFileSync(`${OUT}/world-gen.json`, JSON.stringify({ hunts, monsters, nodes, cities: cities.map(({ buildings, ...c }) => c), problems }, null, 1));
log("pronto: assets/world-net.json", (JSON.stringify(net).length / 1024).toFixed(0) + " KB");
