// Continente 10.000 × 10.000 em volta do coração (mapa 300×200 original).
// - colisão/objetos: calculados por pedaço de 32×32 tiles a partir do terreno determinístico (cache LRU em memória)
// - chão: desenhado pelo Web Worker (world.worker.js) → ImageBitmap (cache L1, até 81) + IndexedDB por versão (cache L2)
// - caminho: A* em janela pra rotas curtas; acima de 120 tiles usa o grafo de pontos de estrada (rotas longas)
import { T, MONS, HUNTS, REGIONS, ZONES } from "./data.js";
import * as TR from "./terrain.js";
import { NPCS } from "./world.js";
// NPCs de cada cidade (posição relativa à praça): serviços comuns + a especialidade local
const BASE_NPCS = [[-4, 2, "banqueiro", "Banqueiro", { act: "bank" }], [4, 2, "mercador", "Mercador", { shop: "mercador" }], [0, 6, "guarda", "Mensageiro", { act: "travel" }], [-8, -3, "banqueiro", "Guardião do armazém", { shop: "armazem" }], [9, 7, "guarda", "Guarda"]];
const CITY_NPCS = {
  valen: [...BASE_NPCS, [7, -4, "mercador", "Capitão do porto", { act: "port" }], [-6, -6, "druid", "Curtidor", { shop: "curtume" }]],
  khazad: [...BASE_NPCS, [7, -4, "ferreiro", "Ferreiro", { shop: "ferreiro" }], [-6, -6, "ferreiro", "Metalurgista", { shop: "metalurgica" }], [1, -7, "mercador", "Ferramenteiro", { shop: "ferramentas" }]],
  solkar: [...BASE_NPCS, [7, -4, "banqueiro", "Joalheiro", { shop: "joalheria" }], [-6, -6, "banqueiro", "Lapidário", { shop: "lapidaria" }], [1, -7, "guarda", "Processador", { shop: "processamento" }]],
  sylvana: [...BASE_NPCS, [7, -4, "sacerdote", "Alquimista", { shop: "alquimista" }], [-6, -6, "ferreiro", "Carpinteiro", { shop: "carpintaria" }]],
  nocthar: [...BASE_NPCS, [7, -4, "sacerdote", "Encantador", { shop: "encantador" }], [-6, -6, "mercador", "Leiloeiro", { shop: "market" }]] };
const { CHUNK, B } = TR;
export const CONT = { ready: false, net: null, overview: null, worker: null, stats: { gen: 0, l2: 0, hits: 0 } };

// ---------- carga ----------
const MEANS = {};
function meanTex(im) { const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let r = 0, gg = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } return [r / n, gg / n, b / n]; }
export function heartFallback(g, x, y, w, h) { const im = CONT.heartLod; if (!im) return; const ww = Math.min(w, 300 - x), hh = Math.min(h, 200 - y); g.imageSmoothingEnabled = false; g.drawImage(im, x, y, ww, hh, x * T, y * T, ww * T + .5, hh * T + .5); }
export function buildHeartLod(W) {
  const { tregion, objects, U, MW: mw, MH: mh, DW: dw, UPT: upt } = W, texOf = ["grass", "grass_dark", "swamp_red", "earth", "stone_dark", "snow", "ruins", "grass"];
  const m = k => MEANS[k] || (MEANS[k] = CONT.tex0[k] ? meanTex(CONT.tex0[k]) : [94, 158, 52]);
  const c = document.createElement("canvas"); c.width = mw; c.height = mh; const g = c.getContext("2d"), im = g.createImageData(mw, mh), d = im.data, dark = new Uint8Array(mw * mh);
  for (const o of objects) if (o.y >= 0 && o.y < mh && o.x >= 0 && o.x < mw) dark[o.y * mw + o.x] = 1;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) { const u = (y * upt + 2) * dw + x * upt + 2; let col;
    if (U.bridge[u]) col = m("bridge"); else if (U.water[u]) col = m("water"); else if (U.road[u]) col = m("dirt"); else if (U.field[u] === 1) col = [215, 180, 90]; else if (U.field[u] === 2) col = [122, 86, 52]; else { const ix = Math.max(7, Math.min(mw - 8, x)), iy = Math.max(7, Math.min(mh - 8, y)); col = m(texOf[tregion[iy * mw + ix]] || "grass"); }   // perto da borda o desenho das regiões não chega: usa a região de dentro
    let fv = .95 + (TR.vnoise(x / 5, y / 5, 621) - .5) * .12 + (TR.hashTile(x, y, 623) - .5) * .05; if (dark[y * mw + x]) fv *= .62; const o = (y * mw + x) * 4;
    d[o] = col[0] * fv; d[o + 1] = col[1] * fv; d[o + 2] = col[2] * fv; d[o + 3] = 255; }
  g.putImageData(im, 0, 0); return CONT.heartLod = c;
}
function texData(tex) { const out = {}; for (const k of ["grass", "grass_dark", "grass_gold", "sand", "cobble", "plaza", "swamp", "swamp_red", "rock", "stone_dark", "earth", "dirt", "snow", "ruins", "water", "lava", "bridge"]) { const im = tex[k]; if (!im) continue; const w = im.width, h = im.height, c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(im, 0, 0); out[k] = { w, h, data: g.getImageData(0, 0, w, h).data }; } return out; }
export async function loadContinent(texSrc, version) {
  try { CONT.tex0 = texSrc; const tex = texData(texSrc);
    const net = await (await fetch("assets/world-net.json", { cache: "no-cache" })).json();
    TR.initNet(net); CONT.net = net;
    CONT.overview = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = "assets/world-overview.webp?v=" + (version || ""); });
    // sprites da natureza pro Worker assar árvores/rochas/enfeites nos pedaços de zoom médio
    const sprites = {}; try { const { sprite } = await import("./art.js"); await Promise.all(TR.natureSpriteKeys().map(async k => { const [n, t] = k.split("|"); const im = sprite(n, t || null); if (im) sprites[k] = await createImageBitmap(im); })); } catch (e) { }
    CONT.heartMid = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = "assets/heart-mid.webp?v=" + (version || ""); });
    startWorker(net, tex, version, sprites);
    CONT.ready = true;
  } catch (e) { console.warn("continente não carregou", e); }
}
// áreas de caça, criaturas e regiões das cidades novas entram nas listas do jogo
export function registerContent(net = CONT.net) {
  if (!net) return;
  for (const c of net.cities) if (!REGIONS.find(r => r.id === c.id)) REGIONS.push({ id: c.id, name: c.name, lvl: 1, zone: "anel1", realm: "Eldoria", tier: "segura", city: true });
  for (const m of net.monsters) if (!MONS[m.id]) { const k = { comum: 1, incomum: 1.3, elite: 2.4, miniboss: 6 }[m.cat] || 1;
    MONS[m.id] = { name: m.name, lvl: m.lvl, hp: Math.round(60 + Math.pow(m.lvl, 1.5) * 5 * k), atk: Math.round((8 + m.lvl * 1.6) * (1 + (k - 1) * .25)), def: Math.round(m.lvl * .5), exp: Math.round((10 + Math.pow(m.lvl, 1.7) * 2) * k), gold: [m.lvl, m.lvl * 2 + 2], speed: 1, drop: null, sprite: m.sprite, tint: m.tint, cat: m.cat }; }
  for (const h of net.hunts) if (!HUNTS.find(x => x.id === h.id)) { const r = h.r;
    HUNTS.push({ id: h.id, name: h.name, why: `${h.region || ""} · ${["Zona Segura", "Fronteira Disputada", "Zona Vermelha"][h.ring - 1]} de ${net.cities.find(c => c.id === h.city).name}`, region: h.city, mon: h.mon, boss: h.boss || null, spawns: h.ring === 3 ? 6 : h.ring === 2 ? 6 : 5, respawn: 14000, r, cx: h.cx, cy: h.cy, rect: { x: h.cx - r, y: h.cy - r, w: 2 * r + 1, h: 2 * r + 1 }, door: [h.cx, h.cy - r], ring: h.ring, city: h.city, zone: ["anel1", "anel2", "anel3"][h.ring - 1] || "anel3", wild: true, subregion: h.region, group: h.group }); }
  for (const c of net.cities) if (!c.heart) for (const n of CITY_NPCS[c.id] || []) { const [dx, dy, voc, title, extra] = n; if (!NPCS.find(q => q.title === title && q.city === c.id)) NPCS.push({ x: c.x + dx, y: c.y + dy, voc, title, king: "grey", city: c.id, ...extra, dir: "down", moving: false, anim: 0, npc: true }); }
  for (const b of net.boats || []) if (!NPCS.find(q => q.port === b.id)) NPCS.push({ x: b.npc[0], y: b.npc[1], voc: "mercador", title: "Barqueiro", king: "grey", act: "boat", port: b.id, dir: "down", moving: false, anim: 0, npc: true });
  ZONES.anel1 ||= { name: "Zona Segura", desc: "Território nível 1: monstros iniciais da região, PvP 100% desativado.", risk: "Sem risco", color: "#7fd07a", tint: null };
  ZONES.anel2 ||= { name: "Fronteira Disputada — PvP Opcional", desc: "Território nível 2: +30% exp e +25% drop. PvP só pra quem ligar (botão no topo): +20% exp e +15% loot; desligar exige 60 s sem lutar.", risk: "Médio", color: "#f0b040", tint: null };
  ZONES.anel3 ||= { name: "Zona Vermelha — PvP Liberado", desc: "Território nível 3: monstros brutais (elite e chefes), +80% exp, +60% loot, depósitos de diamante, mitril e adamantita. PvP obrigatório, menos contra o próprio clã.", risk: "Muito alto", color: "#e05a4a", tint: "rgba(168,61,61,.08)" };
  ZONES.selvagem ||= ZONES.anel3;
}

// ---------- pedaços lógicos (colisão + objetos) ----------
const LOGIC = new Map(), LOGIC_MAX = 900;
export const BUDGET = { until: 0 };   // fim do tempo de trabalho deste quadro (o desenho não monta pedaço depois disso)
function logic(cx, cy, soft = false) {
  const k = cx + "," + cy; let L = LOGIC.get(k);
  if (L) { LOGIC.delete(k); LOGIC.set(k, L); return L; }
  if (soft && performance.now() > BUDGET.until) return null;
  const tiles = TR.chunkTiles(cx, cy), objs = TR.chunkObjects(cx, cy, tiles), n = CHUNK + 2, blk = new Uint8Array(CHUNK * CHUNK);
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) if (TR.isBlocked(tiles[(j + 1) * n + i + 1])) blk[j * CHUNK + i] = 1;
  for (const o of objs) if (o.solid) { const fw = o.fw || 1, fh = o.fh || 1; for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) {
    const x = o.x - Math.floor((fw - 1) / 2) + dx - cx * CHUNK, y = o.y - fh + 1 + dy - cy * CHUNK; if (x >= 0 && y >= 0 && x < CHUNK && y < CHUNK) blk[y * CHUNK + x] = 1; } }
  L = { tiles, objs, blk }; LOGIC.set(k, L);
  if (LOGIC.size > LOGIC_MAX) LOGIC.delete(LOGIC.keys().next().value);
  return L;
}
const fl = Math.floor;
export const procWalk = (x, y) => { if (!CONT.ready) return false; x = fl(x); y = fl(y); const cx = fl(x / CHUNK), cy = fl(y / CHUNK); return !logic(cx, cy).blk[(y - cy * CHUNK) * CHUNK + x - cx * CHUNK]; };
export const procTile = (x, y) => { x = fl(x); y = fl(y); const cx = fl(x / CHUNK), cy = fl(y / CHUNK); return logic(cx, cy).tiles[(y - cy * CHUNK + 1) * (CHUNK + 2) + x - cx * CHUNK + 1]; };
export const isRoadProc = (x, y) => { const b = procTile(x, y); return b === B.ROAD || b === B.BRIDGE || b === B.CITY || b === B.DOCK; };
export function procObjects(tx0, ty0, tx1, ty1) {
  const out = []; if (!CONT.ready) return out;
  for (let cy = fl(ty0 / CHUNK); cy <= fl(ty1 / CHUNK); cy++) for (let cx = fl(tx0 / CHUNK); cx <= fl(tx1 / CHUNK); cx++) { const L = logic(cx, cy, true); if (!L) continue; for (const o of L.objs) if (o.x >= tx0 && o.x <= tx1 && o.y >= ty0 && o.y <= ty1) out.push(o); }
  return out;
}
// ---------- região e zona ----------
export function zoneInfo(x, y) { if (!CONT.ready) return { city: null, ring: 4 }; return TR.zoneAt(x, y); }
export const zoneKey = ring => ring === 1 ? "anel1" : ring === 2 ? "anel2" : "anel3";
export function procRegion(x, y) {
  if (!CONT.ready) return { id: "mar", name: "Mar", lvl: 1, zone: "anel3", realm: "Eldoria", tier: "selvagem" };
  const z = TR.zoneAt(x, y), zone = zoneKey(z.ring);
  if (z.city && !z.city.heart && TR.cityInside(z.city, x, y) < 1.02) return { id: z.city.id, name: z.city.name, lvl: 1, zone: "anel1", realm: "Eldoria", tier: "segura", city: z.city };
  return { id: (z.city ? z.city.id : "mar") + z.ring, name: TR.regionName(z), sub: ZONES[zone]?.name, lvl: 1, zone, realm: "Eldoria", tier: ["segura", "hostil", "lendaria"][z.ring - 1], city: z.city, ring: z.ring };
}
export const procZone = (x, y) => zoneKey(zoneInfo(x, y).ring);

// ---------- caminho ----------
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
class Heap { constructor() { this.a = []; } push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; } get size() { return this.a.length; } }
// A* numa janela retangular em volta de origem e destino
function astar(sx, sy, tx, ty, walk, isRoad, margin = 40, maxNodes = 90000) {
  const x0 = Math.min(sx, tx) - margin, y0 = Math.min(sy, ty) - margin, W = Math.abs(tx - sx) + 2 * margin + 1, H = Math.abs(ty - sy) + 2 * margin + 1;
  if (W * H > 700000) return null;
  const G = new Float32Array(W * H).fill(Infinity), P = new Int32Array(W * H).fill(-1), open = new Heap();
  const id = (x, y) => (y - y0) * W + (x - x0), s = id(sx, sy), goal = id(tx, ty);
  const Hh = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + .4142 * Math.min(dx, dy); };
  G[s] = 0; open.push(s, Hh(sx, sy)); let n = 0;
  while (open.size && n++ < maxNodes) {
    const c = open.pop(); if (c === goal) break; const cx = c % W + x0, cy = ((c / W) | 0) + y0, gc = G[c];
    for (const [dx, dy, w] of DIRS) { const nx = cx + dx, ny = cy + dy; if (nx < x0 || ny < y0 || nx >= x0 + W || ny >= y0 + H || !walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const k = id(nx, ny), g2 = gc + w * (isRoad(nx, ny) ? .8 : 1); if (G[k] <= g2) continue; G[k] = g2; P[k] = c; open.push(k, g2 + Hh(nx, ny)); }
  }
  if (G[goal] === Infinity) return null;
  const pts = []; for (let c = goal; c !== s && c !== -1; c = P[c]) pts.push({ x: c % W + x0, y: ((c / W) | 0) + y0 }); return pts.reverse();
}
function lineOK(a, b, walk) { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d * 4); for (let i = 1; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (!walk(x + .5, y + .5) || !walk(x + .2, y + .5) || !walk(x + .8, y + .5) || !walk(x + .5, y + .2) || !walk(x + .5, y + .8)) return false; } return true; }
function smooth(start, pts, walk) { if (pts.length < 3) return pts; const out = []; let a = start, i = 0; while (i < pts.length) { let j = Math.min(pts.length - 1, i + 24); while (j > i && !lineOK(a, pts[j], walk)) j--; out.push(pts[j]); a = pts[j]; i = j + 1; } return out; }
// grafo de pontos de estrada (Dijkstra)
// Dijkstra a partir do ponto de estrada do destino; a entrada na estrada é escolhida pelo menor (andar até ela + estrada até o fim)
export function wpRouteFrom(sx, sy, b) {
  const { nodes, edges } = CONT.net.wp; if (!CONT.adj) { CONT.adj = nodes.map(() => []); for (const [i, j, w] of edges) { CONT.adj[i].push([j, w]); CONT.adj[j].push([i, w]); } }
  const D = new Float64Array(nodes.length).fill(Infinity), P = new Int32Array(nodes.length).fill(-1), h = new Heap(); D[b] = 0; h.push(b, 0);
  while (h.size) { const c = h.pop(); for (const [j, w] of CONT.adj[c]) { const d = D[c] + w; if (d < D[j]) { D[j] = d; P[j] = c; h.push(j, d); } } }
  // andar fora da estrada pesa bem mais (pode ter rio, lago, montanha no meio); entrada sempre perto da origem
  let a = -1, best = Infinity; nodes.forEach((p, i) => { const e = Math.hypot(p[0] - sx, p[1] - sy); if (e > 420) return; const v = e * 3 + D[i]; if (v < best) { best = v; a = i; } });
  if (a < 0) a = nearestWp(sx, sy);
  if (a < 0 || D[a] === Infinity) return null; const out = []; for (let c = a; c !== -1; c = P[c]) out.push(c); return out;   // já vem de a até b
}
function nearestWp(x, y) { let best = -1, bd = Infinity; CONT.net.wp.nodes.forEach((p, i) => { const d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
export function findPathWide(sx, sy, tx, ty, walk, isRoad, heartPath) {
  const d = Math.hypot(tx - sx, ty - sy);
  if (d <= 260 && d > 120 && CONT.ready) { const p = astar(sx, sy, tx, ty, walk, isRoad, 40, 60000); if (p) return smooth({ x: sx, y: sy }, p, walk); }
  if (d <= 120 || !CONT.ready) { const p = astar(sx, sy, tx, ty, walk, isRoad, d < 30 ? 24 : 48); return p && smooth({ x: sx, y: sy }, p, walk); }
  // rota longa: anda até a estrada mais perto, segue os pontos de estrada, sai da estrada perto do destino
  const b = nearestWp(tx, ty), r = wpRouteFrom(sx, sy, b);
  if (!r) { const p = astar(sx, sy, tx, ty, walk, isRoad, 60, 250000); return p && smooth({ x: sx, y: sy }, p, walk); }
  const N = CONT.net.wp.nodes, stops = r.map(i => ({ x: N[i][0], y: N[i][1] })); stops.push({ x: tx, y: ty });
  // calcula só os primeiros trechos; o resto é calculado enquanto anda (extendPath), sem travar a tela
  const out = []; Object.defineProperty(out, "rest", { value: { stops, cur: { x: sx, y: sy }, walk, isRoad, heartPath }, writable: true, enumerable: false });
  extendPath(out, 4);
  return out.length ? out : null;
}
const inH = p => p.x >= 0 && p.y >= 0 && p.x < 300 && p.y < 200;
// estende o caminho com os próximos trechos; teto de tempo por chamada (roda dentro do quadro)
export function extendPath(path, n = 2, budgetMs = 12) {
  const R = path.rest; if (!R) return; const t0 = performance.now();
  for (let k = 0; k < n && R.stops.length && performance.now() - t0 < budgetMs; k++) {
    const st = R.stops.shift(); if (R.stops.length && !R.walk(st.x, st.y)) continue; const far = Math.hypot(st.x - R.cur.x, st.y - R.cur.y);
    let seg = null;
    if (R.heartPath && inH(R.cur) && inH(st)) seg = R.heartPath(R.cur.x, R.cur.y, st.x, st.y);
    else { const raw = astar(Math.round(R.cur.x), Math.round(R.cur.y), st.x, st.y, R.walk, R.isRoad, far > 60 ? 32 : 10, far > 60 ? 40000 : 6000); seg = raw && smooth(R.cur, raw, R.walk); }
    if (!seg) continue; path.push(...seg); R.cur = st;
  }
  if (!R.stops.length) path.rest = null;
}

// ---------- chão (Worker + caches) ----------
// cache L1 por nível: "hi" (32 px/tile, 1024 px por pedaço) e "mid" (8 px/tile)
const L1 = { hi: new Map(), mid: new Map() }, L1_MAX = { hi: 64, mid: 256 }, pending = new Set(); let inflight = 0, lastView = "";
function startWorker(net, tex, version, sprites = {}) {
  try {
    const w = new Worker(new URL("./world.worker.js", import.meta.url), { type: "module" }); CONT.worker = w;
    w.onmessage = e => { const m = e.data; if (m.type === "lod") { lodInflight--; const k = m.cx + "," + m.cy; lodPending.delete(k); LOD.set(k, m.g); while (LOD.size > LOD_MAX) { const [k0, v] = LOD.entries().next().value; LOD.delete(k0); try { v.close(); } catch (er) { } } return; }
      if (m.type === "dropped") { for (const k of m.keys) { if (pending.delete(k)) inflight--; else if (lodPending.delete(k.slice(4))) lodInflight--; } return; }
      if (m.type !== "chunk") return; inflight--; const k = m.cx + "," + m.cy, M = L1[m.tier]; pending.delete(m.tier + ":" + k);
      M.set(k, m.g); CONT.stats[m.src === "L2" ? "l2" : "gen"]++;
      while (M.size > L1_MAX[m.tier]) { const [k0, v] = M.entries().next().value; M.delete(k0); try { v.close(); } catch (er) { } } };
    w.onerror = e => console.warn("worker do mundo", e.message);
    w.postMessage({ type: "init", net, tex, version: version || "dev", sprites }, Object.values(sprites));
  } catch (e) { console.warn("sem worker", e); }
}
function request(tier, cx, cy) { const k = cx + "," + cy; if (L1[tier].has(k) || pending.has(tier + ":" + k) || !CONT.worker || inflight >= 48) return; pending.add(tier + ":" + k); inflight++; CONT.worker.postMessage({ type: "chunk", tier, cx, cy }); }
// desenha alinhado aos pixels da tela (sem frestas nem linhas entre pedaços em qualquer zoom)
export function snapDraw(g, img, x, y, w, h) { const m = g.getTransform(), x0 = Math.round(m.a * x + m.e), y0 = Math.round(m.d * y + m.f), x1 = Math.round(m.a * (x + w) + m.e), y1 = Math.round(m.d * (y + h) + m.f);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(img, x0, y0, x1 - x0, y1 - y0); g.restore(); }
const PXC = CHUNK * T;      // 1024 px de mundo por pedaço
export const LOD_ZOOM = .12, HI_ZOOM = .4;
const LOD = new Map(), LOD_MAX = 2500, lodPending = new Set(); let lodInflight = 0;
function requestLod(cx, cy) { const k = cx + "," + cy; if (LOD.has(k) || lodPending.has(k) || !CONT.worker || lodInflight >= 160) return; lodPending.add(k); lodInflight++; CONT.worker.postMessage({ type: "lod", cx, cy }); }
// zoom bem afastado: pedaços de 1 pixel por tile; o que ainda não chegou usa o mapa-múndi
function drawLod(g, ox, oy, WW, WH) {
  const cx0 = fl(ox / PXC), cy0 = fl(oy / PXC), cx1 = fl((ox + WW) / PXC), cy1 = fl((oy + WH) / PXC), mid = [(cx0 + cx1) / 2, (cy0 + cy1) / 2], miss = [];
  if (CONT.overview) { g.imageSmoothingEnabled = true; g.drawImage(CONT.overview, (ox / T + TR.OX) / TR.OVT, (oy / T + TR.OY) / TR.OVT, WW / T / TR.OVT, WH / T / TR.OVT, ox, oy, WW, WH); }
  g.imageSmoothingEnabled = false;
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const b = LOD.get(cx + "," + cy); if (b) snapDraw(g, b, cx * PXC, cy * PXC, PXC, PXC); else miss.push([cx, cy]); }
  miss.sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1])); for (const [cx, cy] of miss) requestLod(cx, cy);
}
// desenha o chão do continente visível; o coração é desenhado por cima pelo art.js
function sendView(ox, oy, WW, WH) { const v = [fl(ox / PXC) - 1, fl(oy / PXC) - 1, fl((ox + WW) / PXC) + 1, fl((oy + WH) / PXC) + 1].join(","); if (v === lastView || !CONT.worker) return; lastView = v; const [a, b, c, d] = v.split(",").map(Number); CONT.worker.postMessage({ type: "view", x0: a, y0: b, x1: c, y1: d }); }
export const MACRO_ZOOM = .03;
export function drawContinent(g, ox, oy, WW, WH, t, zoom = 1) {
  if (!CONT.ready) return;
  sendView(ox, oy, WW, WH);
  // visão macro: o mapa-múndi nítido, sem pedir pedaço nenhum
  if (zoom < MACRO_ZOOM) { if (CONT.overview) { g.imageSmoothingEnabled = false; g.drawImage(CONT.overview, (ox / T + TR.OX) / TR.OVT, (oy / T + TR.OY) / TR.OVT, WW / T / TR.OVT, WH / T / TR.OVT, ox, oy, WW, WH); } return; }
  if (zoom < LOD_ZOOM) return drawLod(g, ox, oy, WW, WH);
  const tier = zoom >= HI_ZOOM ? "hi" : "mid", M = L1[tier];
  const cx0 = fl(ox / PXC), cy0 = fl(oy / PXC), cx1 = fl((ox + WW) / PXC), cy1 = fl((oy + WH) / PXC);
  const mid = [(cx0 + cx1) / 2, (cy0 + cy1) / 2], order = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy]);
  order.sort((a, b) => Math.hypot(a[0] - mid[0], a[1] - mid[1]) - Math.hypot(b[0] - mid[0], b[1] - mid[1]));
  for (const [cx, cy] of order) {
    if (cx * CHUNK >= 0 && cy * CHUNK >= 0 && (cx + 1) * CHUNK <= 300 && (cy + 1) * CHUNK <= 200) continue;   // inteiro dentro do coração
    const k = cx + "," + cy, c = M.get(k), x = cx * PXC, y = cy * PXC;
    if (c) { M.delete(k); M.set(k, c); CONT.stats.hits++; snapDraw(g, c, x, y, PXC, PXC); continue; }
    request(tier, cx, cy);
    // enquanto não chega: o outro nível, ou o 1 px/tile, ou o mapa-múndi
    const alt = (tier === "hi" ? L1.mid : L1.hi).get(k) || LOD.get(k);
    if (alt) { g.imageSmoothingEnabled = alt.width < 64 ? false : true; snapDraw(g, alt, x, y, PXC, PXC); g.imageSmoothingEnabled = false; }
    else { requestLod(cx, cy); if (CONT.overview) { const s = CHUNK / TR.OVT; g.imageSmoothingEnabled = true; g.drawImage(CONT.overview, (cx * CHUNK + TR.OX) / TR.OVT, (cy * CHUNK + TR.OY) / TR.OVT, s, s, x, y, PXC + 1, PXC + 1); g.imageSmoothingEnabled = false; } }
  }
  // pré-carrega a volta
  for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) if (cy < cy0 || cy > cy1 || cx < cx0 || cx > cx1) request(tier, cx, cy);
}
// navios ancorados no porto (desenho simples, balançando)
export function drawShips(g, t) { if (!CONT.ready) return; for (const p of CONT.net.ports) for (const [i, s] of p.ships.entries()) { const x = (s[0] + .5) * T, y = (s[1] + .5) * T + Math.sin(t * 1.4 + i) * 3;
  g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.ellipse(x, y + 22, 70, 14, 0, 0, 6.283); g.fill();
  g.fillStyle = "#5e3b1e"; g.beginPath(); g.moveTo(x - 72, y); g.lineTo(x + 72, y); g.lineTo(x + 52, y + 22); g.lineTo(x - 56, y + 22); g.closePath(); g.fill();
  g.fillStyle = "#7a4e28"; g.fillRect(x - 70, y - 4, 140, 6); g.fillStyle = "#3a2412"; g.fillRect(x - 3, y - 96, 6, 96); g.fillRect(x - 40, y - 66, 4, 66);
  g.fillStyle = "#efe6cf"; g.beginPath(); g.moveTo(x + 4, y - 92); g.quadraticCurveTo(x + 46, y - 60, x + 4, y - 18); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(x - 36, y - 62); g.quadraticCurveTo(x - 10, y - 44, x - 36, y - 20); g.closePath(); g.fill();
  g.fillStyle = "#b8322c"; g.fillRect(x - 2, y - 106, 16, 9); } }
// minimapa fora do coração: recorte do mapa-múndi em volta do jogador
export function drawMiniOverview(g, mx, my, w, h, px, py, span = 900) {
  if (!CONT.overview) return null; const sx = (px + TR.OX - span / 2) / TR.OVT, sy = (py + TR.OY - span * h / w / 2) / TR.OVT, sw = span / TR.OVT, sh = span * h / w / TR.OVT;
  g.imageSmoothingEnabled = true; g.drawImage(CONT.overview, sx, sy, sw, sh, mx, my, w, h); g.imageSmoothingEnabled = false;
  return { tx: x => mx + (x + TR.OX - sx * TR.OVT) / span * w, ty: y => my + (y + TR.OY - sy * TR.OVT) / (span * h / w) * h };
}
export const cities = () => CONT.net ? CONT.net.cities : [];
export const ports = () => CONT.net ? CONT.net.ports : [];
