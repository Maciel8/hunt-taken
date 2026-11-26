// Mundo: constrói o território de 300x200 tiles a partir de geo.js (mesma geografia do mapa da proposta).
// Raster em unidades de desenho (1200x800, 4 por tile = 8 px por unidade) dá bordas orgânicas; colisão, regiões e objetos ficam por tile.
import { MW, MH, MHA, IY, IYR, HUNTS, REGIONS, CAPITAL, TOWNS, ZONES } from "./data.js";
import { procWalk, procRegion, procZone, findPathWide, isRoadProc } from "./continent.js";
import { NET as TNET } from "./terrain.js";
import { DW, DH, UPT, REG, RIVERS, LAKES, LAKE_POLYS, ROADS, BRIDGES, FARMS, riverCurves, HEART_EXITS } from "./geo.js";

export const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
export const inRect = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

// ---------- camadas por unidade (8 px) ----------
// região: 0 campos 1 floresta 2 pântano 3 minas 4 rocha 5 montanhas 6 ruínas 7 vila
export const R = { CAMPOS: 0, FLORESTA: 1, PANTANO: 2, MINAS: 3, ROCHA: 4, MONTANHAS: 5, RUINAS: 6, VILA: 7 };
const REGION_ID = ["campos", "floresta", "pantano", "minas", "minas", "montanhas", "ruinas", "vila"];
export const U = { region: new Uint8Array(DW * DH), water: new Uint8Array(DW * DH), road: new Uint8Array(DW * DH), field: new Uint8Array(DW * DH), bridge: new Uint8Array(DW * DH), clearing: new Uint8Array(DW * DH) };
export const VILA = { cx: 204, cy: 132, rx: 148, ry: 96 };       // muralha expandida da Vila de Arken (74x48 tiles)
// ruas da vila (unidades): avenidas cardeais, dois anéis internos, grande praça da fonte e pátio real
export const VILA_ST = {
  lines: [[[56, 132], [352, 132]], [[204, 36], [204, 228]], [[130, 82], [282, 82]], [[120, 182], [292, 182]]],
  ring: { cx: 204, cy: 138, rx: 72, ry: 46 },
  ring2: { cx: 204, cy: 132, rx: 118, ry: 74 },
  plaza: { cx: 208, cy: 160, r: 28 },
  plaza2: { cx: 204, cy: 88, r: 22 },
  w: 8,
};
export const FIELDS = [];
const CLEARINGS = [[540, 470, 34], [330, 400, 26], [620, 310, 50], [790, 300, 60], [200, 620, 40]];

// ---------- por tile ----------
export const block = new Uint8Array(MW * MHA);   // 1 = não anda
export const tregion = new Uint8Array(MW * MHA);
export const objects = [];                       // {x,y,kind,sprite?,w,h,tint?,big?} em tiles (base no chão)
export const props = [];                         // decoração sem colisão
// grade do coração (300x200) + faixa de interiores; y >= IY (mundo) cai nas linhas internas a partir de IYR
const idx = (x, y) => (y >= IY ? y - IY + IYR : y) * MW + x;
export const inHeart = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
const inRooms = (x, y) => y >= IY && y < IY + (MHA - IYR) && x >= 0 && x < MW;
export const at = (ux, uy) => (ux < 0 || uy < 0 || ux >= DW || uy >= DH) ? -1 : uy * DW + ux;

function rasterize() {
  const c = document.createElement("canvas"); c.width = DW; c.height = DH; const g = c.getContext("2d", { willReadFrequently: true });
  const poly = p => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); };
  const path = p => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; g.quadraticCurveTo(p[i][0], p[i][1], mx, my); } const l = p[p.length - 1]; g.lineTo(l[0], l[1]); };
  const read = (arr, fn) => { const d = g.getImageData(0, 0, DW, DH).data; for (let i = 0; i < DW * DH; i++) arr[i] = fn(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); };
  // regiões: cada uma com uma cor pura; o valor mais próximo decide (bordas suavizadas não criam região falsa)
  g.fillStyle = "rgb(0,0,0)"; g.fillRect(0, 0, DW, DH);
  const order = [["floresta", 1], ["pantano", 2], ["minas", 3], ["serraLeste", 4], ["montanhas", 5], ["ruinas", 6]];
  for (const [k, id] of order) { g.fillStyle = `rgb(${id * 36},0,0)`; poly(REG[k]); g.fill(); }
  g.fillStyle = `rgb(${7 * 36},0,0)`; g.beginPath(); g.ellipse(VILA.cx, VILA.cy, VILA.rx, VILA.ry, 0, 0, 6.283); g.fill();
  read(U.region, r => Math.min(7, Math.round(r / 36)));
  // água
  g.fillStyle = "#000"; g.fillRect(0, 0, DW, DH); g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  for (const r of RIVERS) for (const c of riverCurves(r)) { g.lineWidth = c.w; g.beginPath(); g.moveTo(c.a[0], c.a[1]); g.quadraticCurveTo(c.c[0], c.c[1], c.b[0], c.b[1]); g.stroke(); }
  for (const L of LAKE_POLYS) { poly(L.pts); g.fill(); }
  read(U.water, r => r > 110 ? 1 : 0);
  // estradas e pontes
  g.fillStyle = "#000"; g.fillRect(0, 0, DW, DH); g.lineWidth = 6;
  for (const r of ROADS) { path(r); g.stroke(); }
  g.lineWidth = VILA_ST.w; for (const l of VILA_ST.lines) { g.beginPath(); g.moveTo(l[0][0], l[0][1]); g.lineTo(l[1][0], l[1][1]); g.stroke(); }
  g.beginPath(); g.ellipse(VILA_ST.ring.cx, VILA_ST.ring.cy, VILA_ST.ring.rx, VILA_ST.ring.ry, 0, 0, 6.283); g.stroke();
  if (VILA_ST.ring2) { g.beginPath(); g.ellipse(VILA_ST.ring2.cx, VILA_ST.ring2.cy, VILA_ST.ring2.rx, VILA_ST.ring2.ry, 0, 0, 6.283); g.stroke(); }
  g.fillStyle = "#fff"; g.beginPath(); g.arc(VILA_ST.plaza.cx, VILA_ST.plaza.cy, VILA_ST.plaza.r, 0, 6.283); g.fill();
  if (VILA_ST.plaza2) { g.beginPath(); g.arc(VILA_ST.plaza2.cx, VILA_ST.plaza2.cy, VILA_ST.plaza2.r, 0, 6.283); g.fill(); }
  read(U.road, r => r > 100 ? 1 : 0);
  findBridges();
  g.fillStyle = "#000"; g.fillRect(0, 0, DW, DH); g.fillStyle = "#fff";
  for (const b of BRIDGES) { g.save(); g.translate(b.x, b.y); g.rotate(b.ang); g.fillRect(-b.len / 2, -b.w / 2, b.len, b.w); g.restore(); }
  read(U.bridge, r => r > 100 ? 1 : 0);
  // plantações (mesma semente do mapa)
  g.fillStyle = "#000"; g.fillRect(0, 0, DW, DH); g.fillStyle = "#fff";
  let seed = 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const KINDS = ["trigo", "verde", "terra", "trigo", "repolho", "verde"]; let fi = 0;
  const fits = (x, y, rot, pw, ph) => { for (let u = -.5; u <= .5; u += .1) for (let v = -.5; v <= .5; v += .125) { const lx = u * (pw + 8), ly = v * (ph + 8), px = Math.round(x + lx * Math.cos(rot) - ly * Math.sin(rot)), py = Math.round(y + lx * Math.sin(rot) + ly * Math.cos(rot)); if (px < 0 || py < 0 || px >= DW || py >= DH) return false; const i = py * DW + px; if (U.water[i] || U.road[i] || U.region[i] !== 0) return false; } return true; };
  FARMS.forEach((f, fk) => { const pw = 30, ph = 20, gap = 4; f.kept = []; for (let r = 0; r < f.rows; r++) for (let c = 0; c < f.cols; c++) {
    const lx = c * (pw + gap) - (f.cols * (pw + gap) - gap) / 2 + pw / 2, ly = r * (ph + gap) - (f.rows * (ph + gap) - gap) / 2 + ph / 2;
    const x = f.x + lx * Math.cos(f.rot) - ly * Math.sin(f.rot), y = f.y + lx * Math.sin(f.rot) + ly * Math.cos(f.rot), kind = KINDS[(fi++ * 7 + r) % KINDS.length];
    if (!fits(x, y, f.rot, pw, ph)) continue; f.kept.push([lx, ly]);
    FIELDS.push({ x, y, w: pw, h: ph, rot: f.rot, kind, farm: fk }); g.save(); g.translate(x, y); g.rotate(f.rot); g.fillStyle = kind === "terra" ? "#888" : "#fff"; g.fillRect(-pw / 2, -ph / 2, pw, ph); g.restore(); } });
  read(U.field, r => r > 180 ? 1 : r > 90 ? 2 : 0);
  // clareiras
  g.fillStyle = "#000"; g.fillRect(0, 0, DW, DH); g.fillStyle = "#fff";
  for (const [x, y, r] of CLEARINGS) { g.beginPath(); g.ellipse(x, y, r, r * .75, 0, 0, 6.283); g.fill(); }
  for (const h of HUNTS) { g.beginPath(); g.arc(h.cx * UPT, h.cy * UPT, h.r * UPT * .55, 0, 6.283); g.fill(); }
  read(U.clearing, r => r > 100 ? 1 : 0);
  // estrada não vira água: onde estrada cruza rio sem ponte, a água vence; ponte sempre anda
  for (let i = 0; i < DW * DH; i++) if (U.field[i] && (U.region[i] !== 0 || U.water[i] || U.road[i])) U.field[i] = 0;
}

// cada grupo de unidades onde estrada e água se encontram vira uma ponte alinhada com a estrada
function findBridges() {
  BRIDGES.length = 0; const seen = new Uint8Array(DW * DH);
  for (let i = 0; i < DW * DH; i++) {
    if (seen[i] || !(U.road[i] && U.water[i])) continue;
    const q = [i]; seen[i] = 1; let sx = 0, sy = 0;
    for (let k = 0; k < q.length; k++) { const c = q[k], x = c % DW, y = (c / DW) | 0; sx += x; sy += y; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = c + dy * DW + dx; if (x + dx < 0 || x + dx >= DW || y + dy < 0 || y + dy >= DH || seen[n] || !(U.road[n] && U.water[n])) continue; seen[n] = 1; q.push(n); } }
    if (q.length < 6) continue;
    const cx = sx / q.length, cy = sy / q.length;
    let best = 1e9, ang = 0; for (const r of ROADS) for (let j = 0; j < r.length - 1; j++) { const [ax, ay] = r[j], [bx, by] = r[j + 1], vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((cx - ax) * vx + (cy - ay) * vy) / (vx * vx + vy * vy))), d = Math.hypot(ax + vx * t - cx, ay + vy * t - cy); if (d < best) { best = d; ang = Math.atan2(vy, vx); } }
    const len = dir => { let n = 0; while (n < 60) { const x = Math.round(cx + Math.cos(ang) * n * dir), y = Math.round(cy + Math.sin(ang) * n * dir); if (x < 0 || y < 0 || x >= DW || y >= DH || !U.water[y * DW + x]) break; n++; } return n; };
    const l1 = len(1), l2 = len(-1), mid = (l1 - l2) / 2;
    const nb = { x: cx + Math.cos(ang) * mid, y: cy + Math.sin(ang) * mid, ang, len: l1 + l2 + 10, w: 9 };
    const near = BRIDGES.find(b => Math.hypot(b.x - nb.x, b.y - nb.y) < 18);
    if (near) { const x0 = Math.min(near.x - Math.cos(near.ang) * near.len / 2, nb.x - Math.cos(nb.ang) * nb.len / 2, near.x + Math.cos(near.ang) * near.len / 2, nb.x + Math.cos(nb.ang) * nb.len / 2), x1 = Math.max(near.x - Math.cos(near.ang) * near.len / 2, nb.x - Math.cos(nb.ang) * nb.len / 2, near.x + Math.cos(near.ang) * near.len / 2, nb.x + Math.cos(nb.ang) * nb.len / 2); near.x = (near.x + nb.x) / 2; near.y = (near.y + nb.y) / 2; near.len = Math.max(near.len, nb.len, Math.abs(x1 - x0) / Math.max(.3, Math.abs(Math.cos(near.ang)))); }
    else BRIDGES.push(nb);
  }
}
const unitsOfTile = (x, y, arr) => { let n = 0; for (let dy = 0; dy < UPT; dy++) for (let dx = 0; dx < UPT; dx++) n += arr[(y * UPT + dy) * DW + x * UPT + dx] ? 1 : 0; return n; };
export const regionIdAt = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? 0 : tregion[idx(x | 0, y | 0)];
const heartWalk = (x, y) => !block[idx(x, y)];
// anda? coração e interiores pela grade; o resto do continente pelo gerador determinístico
export const walk = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (inHeart(x, y)) return heartWalk(x, y); if (inRooms(x, y)) return heartWalk(x, y); if (y >= MH && y < IY && x >= 0 && x < MW && y < MH) return false; return procWalk(x, y); };
export const isRoadTile = (x, y) => unitsOfTile(x, y, U.road) >= 6;

// ---------- construção ----------
let built = false;
export function buildWorld() {
  if (built) return; built = true;
  rasterize();
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const c = (y * UPT + 2) * DW + x * UPT + 2; tregion[idx(x, y)] = U.region[c];
    const water = unitsOfTile(x, y, U.water), bridge = unitsOfTile(x, y, U.bridge);
    if (water >= 3 && bridge < 3) block[idx(x, y)] = 1;
  }
  for (let y = MH; y < MHA; y++) for (let x = 0; x < MW; x++) block[idx(x, y)] = 1;
  buildTowns();
  scatter();
  ensureReachable();
  carveExits();
  addCityRooms();
  buildInteriors();
}

const occupied = new Uint8Array(MW * MHA);         // tile já tem objeto
function put(o) { objects.push(o); const fw = o.fw || 1, fh = o.fh || 1; for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) { const xx = o.x - Math.floor((fw - 1) / 2) + dx, yy = o.y - dy; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; occupied[idx(xx, yy)] = 1; if (o.solid !== false) block[idx(xx, yy)] = 1; } }
export const putObj = o => put(o);
const free = (x, y, fw = 1, fh = 1) => { for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) { const xx = x - Math.floor((fw - 1) / 2) + dx, yy = y - dy; if (xx < 1 || yy < 1 || xx >= MW - 1 || yy >= MH - 1 || occupied[idx(xx, yy)] || block[idx(xx, yy)] || isRoadTile(xx, yy)) return false; } return true; };

function buildTowns() {
  // Vila de Arken expandida (74×48 tiles): muralha poligonal de pedra clara, 4 portões, cidadela real ao norte,
  // grande praça da fonte, bairro artesanal a oeste, bairro mercantil/residencial a leste e bosques internos
  const vx = VILA.cx / UPT, vy = VILA.cy / UPT, rx = VILA.rx / UPT, ry = VILA.ry / UPT;
  for (let a = 0; a < 6.283; a += .008) {
    const x = Math.round(vx + Math.cos(a) * rx), y = Math.round(vy + Math.sin(a) * ry);
    const gate = [0, 1.5708, 3.1416, 4.7124].some(g => Math.abs(((a - g + 9.42) % 6.283) - 3.1416) > 3.01);
    if (gate || occupied[idx(x, y)]) continue;
    put({ x, y, kind: "wall", solid: true });
  }
  // torres nos 4 portões + 8 torres de perímetro
  for (const [a, k] of [[0, 1], [1.5708, 1], [3.1416, 1], [4.7124, 1], [.52, 0], [1.05, 0], [2.09, 0], [2.62, 0], [3.66, 0], [4.19, 0], [5.24, 0], [5.76, 0]]) {
    const x = Math.round(vx + Math.cos(a) * rx), y = Math.round(vy + Math.sin(a) * ry);
    put({ x, y, kind: "tower", fw: 2, fh: 2, gate: !!k });
  }
  // 1. Distrito Real (Norte): Castelo / Cidadela Real + Quartel + Arsenal + Jardins Reais
  put({ x: 51, y: 18, kind: "castle", fw: 9, fh: 4, scale: 1.35 });
  put({ x: 37, y: 19, kind: "building", sprite: "house2", fw: 3, fh: 2, scale: 1.18 });   // Quartel da Guarda
  put({ x: 65, y: 19, kind: "building", sprite: "house2", fw: 3, fh: 2, scale: 1.18 });   // Conselho Real
  put({ x: 31, y: 24, kind: "building", sprite: "barn", fw: 4, fh: 2, scale: 1.08 });     // Estábulo Real
  put({ x: 71, y: 24, kind: "building", sprite: "house", fw: 3, fh: 2, scale: 1.12 });    // Capela da Luz
  put({ x: 42, y: 25, kind: "building", sprite: "house_thatch", fw: 3, fh: 2, scale: 1.05 });
  put({ x: 60, y: 25, kind: "building", sprite: "house_thatch2", fw: 3, fh: 2, scale: 1.05 });
  for (const [x, y] of [[44, 19], [58, 19], [46, 25], [56, 25], [18, 32], [84, 32], [49, 54], [53, 54]]) put({ x, y, kind: "building", sprite: "banner", fw: 1, fh: 1 });
  // 2. Grande Praça da Fonte (Centro) & Comércio
  put({ x: 52, y: 39, kind: "building", sprite: "fountain", fw: 2, fh: 2, scale: 1.38 });
  put({ x: 36, y: 39, kind: "building", sprite: "tavern", fw: 4, fh: 2, scale: 1.25, door: "taverna" });
  put({ x: 59, y: 37, kind: "building", sprite: "house2", fw: 3, fh: 2, scale: 1.18, sign: "Banco" });
  put({ x: 44, y: 35, kind: "building", sprite: "anvil_forge", fw: 2, fh: 1 });
  put({ x: 40, y: 35, kind: "building", sprite: "house", fw: 3, fh: 2, scale: 1.1 });     // Ferraria
  put({ x: 65, y: 36, kind: "building", sprite: "house2", fw: 3, fh: 2, scale: 1.1 });    // Guilda dos Mercadores
  put({ x: 60, y: 47, kind: "building", sprite: "house", fw: 3, fh: 2, scale: 1.15 });    // Casa de Leilões
  put({ x: 43, y: 46, kind: "building", sprite: "house_thatch", fw: 3, fh: 2, scale: 1.1 }); // Empório de Arken
  for (const [x, y] of [[47, 41], [49, 43], [55, 43], [57, 41], [48, 36], [56, 36]]) put({ x, y, kind: "building", sprite: "stall", fw: 2, fh: 1, scale: 1.1 });
  // 3. Distrito Artesanal (Oeste: x=20..36)
  const westBld = [
    [22, 29, "house_thatch", 3, 2], [28, 28, "house", 3, 2], [34, 29, "house2", 3, 2], [23, 37, "barn", 4, 2],
    [30, 36, "house_thatch2", 3, 2], [24, 43, "house2", 3, 2], [31, 44, "house_thatch", 3, 2], [36, 48, "house", 3, 2],
    [28, 49, "house_thatch2", 3, 2], [41, 29, "house", 3, 2], [44, 51, "house2", 3, 2],
    [20, 34, "well", 1, 1], [34, 43, "cart", 2, 1], [27, 39, "crate_stack", 1, 1], [21, 40, "barrel", 1, 1],
  ];
  for (const [x, y, sp, fw, fh] of westBld) put({ x, y, kind: "building", sprite: sp, fw, fh, scale: fw >= 3 ? 1.08 : 1 });
  // 4. Distrito Mercantil e Residencial (Leste: x=62..82)
  const eastBld = [
    [68, 29, "house", 3, 2], [75, 29, "house2", 3, 2], [62, 29, "house_thatch", 3, 2], [80, 33, "house_thatch", 3, 2],
    [73, 37, "house", 3, 2], [79, 39, "house_thatch2", 3, 2], [68, 43, "house2", 3, 2], [75, 44, "house_thatch", 3, 2],
    [67, 49, "house", 3, 2], [73, 49, "house_thatch2", 3, 2], [58, 51, "house_thatch", 3, 2], [81, 27, "watchtower", 2, 2],
    [72, 33, "well", 1, 1], [77, 41, "cart", 2, 1],
  ];
  for (const [x, y, sp, fw, fh] of eastBld) put({ x, y, kind: "building", sprite: sp, fw, fh, scale: fw >= 3 ? 1.08 : 1 });
  // 5. Iluminação e mobiliário urbano
  for (const [x, y] of [[49, 36], [55, 36], [52, 45], [46, 33], [58, 33], [33, 33], [69, 33], [51, 27], [38, 44], [64, 44]]) put({ x, y, kind: "building", sprite: "lantern_fence", fw: 1, fh: 1, solid: false });
  // 6. Jardins, canteiros e bosques de carvalho dentro da muralha
  for (let y = 12; y < 55; y++) for (let x = 16; x < 86; x++) {
    if (!inVila(x, y) || !free(x, y)) continue;
    const h = hash(x, y) % 100;
    if (h < 7) put({ x, y, kind: "tree", sprite: h < 3 ? "oak_small" : h < 5 ? "tree_small" : "tree_round" });
    else if (h < 12) put({ x, y, kind: "building", sprite: "flower_bed", fw: 1, fh: 1, solid: false });
  }
  // 7. Subúrbio agrícola extramuros (moinho e celeiro ao oeste/sul de Arken)
  for (const [x, y, sp, fw, fh] of [[25, 68, "windmill", 2, 2], [20, 71, "barn", 4, 2], [30, 70, "house_thatch", 3, 2], [11, 44, "house_thatch2", 3, 2], [9, 48, "haystack", 1, 1]]) {
    if (free(x, y, fw, fh)) put({ x, y, kind: "building", sprite: sp, fw, fh });
  }
  // assentamentos
  const T = n => TOWNS.find(t => t.name === n);
  const near = (t, list) => { for (const [dx, dy, s, fw = 3, fh = 2, solid = true] of list) put({ x: t.tx + dx, y: t.ty + dy, kind: "building", sprite: s, fw, fh, solid }); };
  near(T("Posto da Serra"), [[0, 0, "house_thatch"], [4, 1, "tent", 2, 2], [2, 3, "campfire", 1, 1, false]]);
  near(T("Moinho Velho"), [[0, -1, "windmill", 2, 2], [-4, 1, "house_thatch"], [4, 2, "house_thatch2"], [1, 3, "hay", 1, 1]]);
  near(T("Aldeia do Celeiro"), [[-3, -1, "house_thatch"], [2, -2, "barn", 4, 2], [6, 1, "house"], [0, 2, "haystack", 1, 1], [-2, 3, "pumpkin", 1, 1, false]]);
  objects[objects.length - 4].door = "celeiro";
  near(T("Vau dos Juncos"), [[-2, 0, "house_thatch"], [3, -1, "house_thatch2"], [1, 2, "campfire", 1, 1, false]]);
  near(T("Acampamento Mineiro"), [[-3, 0, "tent", 2, 2], [2, -1, "tent", 2, 2], [0, 3, "crate", 1, 1], [3, 3, "barrel", 1, 1], [-1, 2, "campfire", 1, 1, false]]);
  const forte = T("Forte Cinzento"); put({ x: forte.tx, y: forte.ty, kind: "castle", fw: 9, fh: 4, small: true, door: "forte" });
  const portao = T("Portão Partido"); put({ x: portao.tx - 3, y: portao.ty, kind: "tower", fw: 2, fh: 2, ruin: true }); put({ x: portao.tx + 3, y: portao.ty, kind: "tower", fw: 2, fh: 2, ruin: true });
  // marcos de cada área de caça
  const H = id => HUNTS.find(x => x.id === id), mark = (id, list) => { const h = H(id); for (const [dx, dy, sp, fw = 1, fh = 1, solid = true] of list) { const x = h.cx + dx, y = h.cy + dy; if (!block[idx(x, y)] || sp) put({ x, y, kind: "building", sprite: sp, fw, fh, solid }); } };
  mark("ratos", [[3, -4, "barn", 4, 2], [-3, -3, "haystack"], [6, 0, "haystack"], [-2, 3, "cart", 2, 1]]);
  mark("javalis", [[2, -3, "log"], [-3, 2, "stump"], [4, 3, "log"]]);
  mark("bandidos", [[0, -4, "watchtower", 2, 2], [-4, -1, "tent", 2, 2], [4, 1, "tent", 2, 2], [0, 1, "campfire", 1, 1, false], [3, -2, "cart", 2, 1]]);
  mark("aranhas", [[-2, -2, "web", 2, 1], [3, 1, "web", 2, 1], [0, 3, "cocoon"], [-4, 2, "cocoon"]]);
  mark("lobos", [[0, -3, "wolf_den", 3, 2], [3, 1, "bone_pile", 1, 1, false]]);
  mark("bruxas", [[0, 0, "witch_hut", 4, 3]]);
  mark("ruinas1", [[-3, -2, "statue"], [3, -2, "statue"], [0, 2, "banner"]]);
  mark("gelo", [[0, -3, "ice_cave", 4, 2]]);
  // Floresta dos Ancestrais: anel de árvores antigas, círculo de pedras, altar do Ancião e o portal selado
  { const h = H("ancestrais"); for (let a = 0; a < 6.283; a += .5) { const x = Math.round(h.cx + Math.cos(a) * (h.r + 1)), y = Math.round(h.cy + Math.sin(a) * (h.r + 1) * .8); if (free(x, y)) put({ x, y, kind: "tree", sprite: "oak", tint: "ancient", big: 1.5 }); }
    for (let a = 0; a < 6.283; a += .79) { const x = Math.round(h.cx + Math.cos(a) * 4), y = Math.round(h.cy + Math.sin(a) * 3); put({ x, y, kind: "monolith" }); }
    put({ x: h.cx, y: h.cy - 2, kind: "altar", fw: 2, fh: 1 }); put({ x: h.cx, y: h.cy - 5, kind: "portal", fw: 3, fh: 2 }); }
  // Caverna do Dragão: entrada nas Montanhas Gélidas, a leste da Caverna Congelada
  put({ x: 205, y: 22, kind: "building", sprite: "cave_entrance", fw: 4, fh: 2, door: "dragao" });
  // entradas de mina e caverna
  for (const id of ["mina1", "mina2", "mina3"]) { const h = HUNTS.find(x => x.id === id); put({ x: h.cx, y: h.cy - 3, kind: "building", sprite: "mine", fw: 3, fh: 2 }); }
  // torre roxa das ruínas
  const tp = HUNTS.find(x => x.id === "templo"); put({ x: tp.cx, y: tp.cy - 4, kind: "darktower", fw: 3, fh: 3 });
}

function scatter() {
  for (let y = 2; y < MH - 2; y++) for (let x = 2; x < MW - 2; x++) {
    if (block[idx(x, y)] || occupied[idx(x, y)]) continue;
    const c = (y * UPT + 2) * DW + x * UPT + 2, reg = U.region[c], h = hash(x, y), r = (h % 1000) / 1000;
    if (unitsOfTile(x, y, U.road) || unitsOfTile(x, y, U.water) || unitsOfTile(x, y, U.bridge)) { if (r < .04 && !unitsOfTile(x, y, U.road) && !unitsOfTile(x, y, U.bridge)) props.push({ x, y, kind: ["reed", "lily", "cattail"][h % 3] }); continue; }
    if (reg === R.VILA) continue;
    const town = TOWNS.some(t => Math.abs(t.tx - x) < 7 && Math.abs(t.ty - y) < 6);
    const hunt = HUNTS.find(hh => (hh.cx - x) ** 2 + (hh.cy - y) ** 2 < hh.r * hh.r);
    const clear = U.clearing[c];
    let dens = 0, kinds = [];
    if (reg === R.CAMPOS) { if (U.field[c]) { if (U.field[c] === 2 && r < .35) props.push({ x, y, kind: "pumpkin" }); continue; } if (FIELDS.some(f => Math.hypot(f.x - x * UPT, f.y - y * UPT) < 30)) { if (r < .03) props.push({ x, y, kind: "hay" }); continue; } dens = .035; kinds = ["oak", "tree_round", "oak_small", "tree_small"]; }
    else if (reg === R.FLORESTA) { dens = clear ? .03 : .42; kinds = ["pine", "oak", "tree_round", "pine", "oak_small", "pine_small"]; }
    else if (reg === R.PANTANO) { dens = .08; kinds = ["dead", "willow", "dead", "dead_shrub"]; }
    else if (reg === R.MINAS || reg === R.ROCHA) { dens = .08; kinds = ["boulder", "boulder", "dead_shrub"]; }
    else if (reg === R.MONTANHAS) { dens = .16; kinds = ["peak", "pine", "boulder", "pine_small"]; }
    else if (reg === R.RUINAS) { dens = .07; kinds = ["ruinwall", "dead", "boulder", "ruinwall"]; }
    if (hunt) dens *= .25; if (town) dens = 0;
    { const an = HUNTS.find(q => q.id === "ancestrais"); if (an && Math.hypot(x - an.cx, (y - an.cy) / .8) < an.r + .5) continue; }   // clareira sagrada limpa
    // bosques em grupos nos campos
    if (reg === R.CAMPOS && hash(Math.floor(x / 9), Math.floor(y / 9)) % 5 === 0) dens = .22;
    if (r < dens) {
      const k = kinds[(h >>> 10) % kinds.length];
      if (k === "dead_shrub") { props.push({ x, y, kind: k }); continue; }
      const big = k === "oak" || k === "pine" || k === "willow" || k === "dead" || k === "tree_round" || k === "peak";
      if (big && !free(x, y)) continue;
      put({ x, y, kind: k === "peak" ? "peak" : k === "ruinwall" ? "ruinwall" : "tree", sprite: k, tint: reg === R.MONTANHAS ? "snow" : reg === R.RUINAS ? "void" : reg === R.PANTANO && k === "willow" ? "swamp" : null });
      continue;
    }
    // decoração rasteira
    const pr = (h >>> 8) % 100;
    if (reg === R.CAMPOS && pr < 10) props.push({ x, y, kind: ["bush", "flower_yellow", "flower_red", "bush2", "flower_yellow2", "bush3", "berry_bush", "mushroom"][h % 8] });
    if (reg === R.FLORESTA && pr < 14) props.push({ x, y, kind: ["bush_dark", "bush_dark2", "mushroom_red", "log", "berry_bush", "mushroom", "stump"][h % 7] });
    if (reg === R.PANTANO && pr < 16) props.push({ x, y, kind: ["reed", "lily", "cattail", "reed", "mushroom_red", "cattail", "lily2"][h % 7] });
    if ((reg === R.MINAS || reg === R.ROCHA) && pr < 8) props.push({ x, y, kind: ["moss_rock2", "bone", "skull", "crate", "wheel"][h % 5] });
    if (reg === R.RUINAS && pr < 10) props.push({ x, y, kind: ["skull", "bone", "bone_pile", "dead_shrub"][h % 4] });
    
  }
}

// garante que toda área de caça e todo assentamento se alcança a pé a partir da vila
// saídas do coração pro continente: uma em cada lado, a mais perto do meio da borda que já é alcançável (ou abre um corredor)
export const EXITS = [];
function carveExits() {
  // as estradas de saída (geo.js) chegam até a borda; libera a estrada e uma faixa de 3 tiles em volta da saída
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoadTile(x, y) && (x < 3 || y < 3 || x > MW - 4 || y > MH - 4) && unitsOfTile(x, y, U.water) < 3) block[idx(x, y)] = 0;
  for (const e of HEART_EXITS) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = e.x + dx, y = e.y + dy; if (x >= 0 && y >= 0 && x < MW && y < MH && unitsOfTile(x, y, U.water) < 3) block[idx(x, y)] = 0; }
    for (let i = objects.length - 1; i >= 0; i--) { const o = objects[i]; if (Math.abs(o.x - e.x) <= 2 && Math.abs(o.y - e.y) <= 2 && !o.door) objects.splice(i, 1); }
    EXITS.push(e);
  }
}
// borda do coração: região e água de cada tile do contorno (o continente usa pra costurar sem emenda)
export function heartEdge() {
  // região de cada tile da borda = a que mais aparece numa faixa de 14 tiles pra dentro (o desenho das regiões não chega na última coluna)
  const inward = (x, y) => { const cnt = new Map(), dx = x === 0 ? 1 : x === MW - 1 ? -1 : 0, dy = y === 0 ? 1 : y === MH - 1 ? -1 : 0;
    for (let k = 0; k < 14; k++) for (let o = -3; o <= 3; o++) { const xx = Math.max(0, Math.min(MW - 1, x + dx * k + (dx ? 0 : o))), yy = Math.max(0, Math.min(MH - 1, y + dy * k + (dy ? 0 : o))); const r = tregion[idx(xx, yy)]; cnt.set(r, (cnt.get(r) || 0) + 1); }
    let br = tregion[idx(x, y)], bc = 0; for (const [r, n] of cnt) if (n > bc) { bc = n; br = r; } return br; };
  const t = []; const push = (x, y) => t.push([x, y, inward(x, y), unitsOfTile(x, y, U.water) >= 3 && unitsOfTile(x, y, U.bridge) < 3 ? 1 : 0, block[idx(x, y)] ? 1 : 0]);
  for (let x = 0; x < MW; x++) { push(x, 0); push(x, MH - 1); } for (let y = 1; y < MH - 1; y++) { push(0, y); push(MW - 1, y); }
  return { tiles: t, exits: EXITS, regions: REGION_ID };
}
function ensureReachable() {
  const start = idx(Math.round(VILA.cx / UPT), Math.round(VILA.cy / UPT) + 6);
  const targets = [...HUNTS.map(h => [h.cx, h.cy]), ...TOWNS.map(t => [t.tx, t.ty + 2])];
  for (let pass = 0; pass < 4; pass++) {
    const seen = new Uint8Array(MW * MHA), q = [start]; seen[start] = 1;
    for (let i = 0; i < q.length; i++) { const c = q[i], cx = c % MW, cy = (c / MW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const n = idx(nx, ny); if (seen[n] || block[n]) continue; seen[n] = 1; q.push(n); } }
    let fixed = 0;
    // bolsões livres que ficaram ilhados (cercados por árvore, pedra ou parede) também ganham trilha
    const pockets = [], mark = new Uint8Array(MW * MHA);
    for (let y0 = 1; y0 < MH - 1; y0++) for (let x0 = 1; x0 < MW - 1; x0++) { const c0 = idx(x0, y0); if (seen[c0] || mark[c0] || block[c0]) continue;
      const pq = [c0]; mark[c0] = 1; for (let i = 0; i < pq.length; i++) { const c = pq[i], cx = c % MW, cy = (c / MW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const n = idx(nx, ny); if (mark[n] || seen[n] || block[n]) continue; mark[n] = 1; pq.push(n); } }
      if (pq.length >= 4) { const m = pq[pq.length >> 1]; pockets.push([m % MW, (m / MW) | 0]); } }
    for (const [tx, ty] of targets.concat(pockets)) {
      if (seen[idx(tx, ty)]) continue;
      // abre uma trilha em linha reta até o ponto alcançado mais perto (derruba árvores e pedras, não cria ponte)
      let best = null, bd = 1e9; for (let i = 0; i < q.length; i += 7) { const c = q[i], d = (c % MW - tx) ** 2 + (((c / MW) | 0) - ty) ** 2; if (d < bd) { bd = d; best = c; } }
      if (best == null) continue; const bx = best % MW, by = (best / MW) | 0, n = Math.ceil(Math.hypot(tx - bx, ty - by));
      for (let s = 0; s <= n; s++) { const x = Math.round(bx + (tx - bx) * s / n), y = Math.round(by + (ty - by) * s / n); for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) { const k = idx(x + ox, y + oy); if (block[k] && unitsOfTile(x + ox, y + oy, U.water) < 3) { block[k] = 0; for (let j = objects.length - 1; j >= 0; j--) { const o = objects[j]; if (o.x === x + ox && o.y === y + oy && (o.kind === "tree" || o.kind === "peak" || o.kind === "ruinwall")) objects.splice(j, 1); } } } }
      fixed++;
    }
    if (!fixed) break;
  }
}

// ---------- consultas ----------
export const huntAt = (x, y) => { let best = null, bd = 1e9; for (const h of HUNTS) { const d = (h.cx - x) ** 2 + (h.cy - y) ** 2; if (d <= h.r * h.r && d < bd) { bd = d; best = h; } } return best; };
export const regionAt = (x, y) => inHeart(Math.floor(x), Math.floor(y)) || inRooms(Math.floor(x), Math.floor(y)) ? (REGIONS.find(r => r.id === REGION_ID[regionIdAt(x, y)]) || REGIONS[1]) : procRegion(x, y);
export function zoneAt(x, y) {
  if (!inHeart(Math.floor(x), Math.floor(y)) && !inRooms(Math.floor(x), Math.floor(y))) return procZone(x, y);
  if (inVila(x, y)) return "segura";
  for (const t of TOWNS) if (t.zone === "segura" && Math.hypot(t.tx - x, t.ty - y) < 7) return "segura";
  return regionAt(x, y).zone;
}
export const inVila = (x, y) => ((x * UPT - VILA.cx) / VILA.rx) ** 2 + ((y * UPT - VILA.cy) / VILA.ry) ** 2 < 1;
export function freeTile(h) { for (let i = 0; i < 120; i++) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * h.r; const x = Math.round(h.cx + Math.cos(a) * r), y = Math.round(h.cy + Math.sin(a) * r); if (walk(x, y)) return { x, y }; } return { x: h.cx, y: h.cy }; }

// ---------- caminho: A* em 8 direções sem cortar quina, depois alisado por linha de visão ----------
class Heap { constructor() { this.a = []; } push(n, f) { const a = this.a; a.push([f, n]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; } get size() { return this.a.length; } }
const G = new Float32Array(MW * MHA), PREV = new Int32Array(MW * MHA), STAMP = new Uint32Array(MW * MHA); let stamp = 0;
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
export function findPath(sx, sy, tx, ty, maxNodes = 120000) {
  sx = Math.floor(sx + .5); sy = Math.floor(sy + .5); tx = Math.floor(tx + .5); ty = Math.floor(ty + .5);
  if (!walk(tx, ty)) { // destino bloqueado: usa o vizinho livre mais perto
    let ok = false; for (let r = 1; r < 7 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) if (walk(tx + dx, ty + dy)) { tx += dx; ty += dy; ok = true; }
    if (!ok) return null;
  }
  if (sx === tx && sy === ty) return [];
  // fora do coração (ou atravessando a borda): caminho do continente
  const hs = inHeart(sx, sy) || inRooms(sx, sy), ht = inHeart(tx, ty) || inRooms(tx, ty);
  if (!hs || !ht) return findPathWide(sx, sy, tx, ty, walk, (x, y) => inHeart(x, y) ? isRoadTile(x, y) : isRoadProc(x, y), (a, b, c, d) => findPath(a, b, c, d));
  stamp++; const s = idx(sx, sy), goal = idx(tx, ty), open = new Heap();
  const H = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + .4142 * Math.min(dx, dy); };
  G[s] = 0; PREV[s] = -1; STAMP[s] = stamp; open.push(s, H(sx, sy)); let n = 0;
  while (open.size && n++ < maxNodes) {
    const c = open.pop(); if (c === goal) break;
    const cx = c % MW, cy0 = (c / MW) | 0, cy = cy0 >= IYR ? cy0 - IYR + IY : cy0, gc = G[c];
    for (const [dx, dy, w] of DIRS) {
      const nx = cx + dx, ny = cy + dy; if (!(inHeart(nx, ny) || inRooms(nx, ny)) || !walk(nx, ny)) continue;
      if (dx && dy && (!walk(cx + dx, cy) || !walk(cx, cy + dy))) continue;
      const k = idx(nx, ny), road = isRoadTile(nx, ny) ? .85 : 1, g2 = gc + w * road;
      if (STAMP[k] === stamp && G[k] <= g2) continue;
      STAMP[k] = stamp; G[k] = g2; PREV[k] = c; open.push(k, g2 + H(nx, ny));
    }
  }
  if (STAMP[goal] !== stamp) return null;
  const pts = []; for (let c = goal; c !== s && c !== -1; c = PREV[c]) { const ry = (c / MW) | 0; pts.push({ x: c % MW, y: ry >= IYR ? ry - IYR + IY : ry }); }
  pts.reverse();
  return smooth({ x: sx, y: sy }, pts);
}
export function lineOfWalk(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d * 4);
  for (let i = 1; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (!walk(x + .5, y + .5) || !walk(x + .2, y + .5) || !walk(x + .8, y + .5) || !walk(x + .5, y + .2) || !walk(x + .5, y + .8)) return false; }
  return true;
}
function smooth(start, pts) {
  if (pts.length < 3) return pts;
  const out = []; let anchor = start, i = 0;
  while (i < pts.length) { let j = Math.min(pts.length - 1, i + 24); while (j > i && !lineOfWalk(anchor, pts[j])) j--; out.push(pts[j]); anchor = pts[j]; i = j + 1; }
  return out;
}

// NPCs da vila: identificados como NPC (rótulo dourado), nunca entram em lista de jogadores
export const NPCS = [
  { x: 59, y: 39, voc: "banqueiro", title: "Banqueiro", shop: "armazem", king: "grey" },
  { x: 49, y: 43, voc: "mercador", title: "Mercador", shop: "mercador", king: "ash" },
  { x: 53, y: 33, voc: "sacerdote", title: "Sacerdote", tab: "bless", king: "grey" },
  { x: 46, y: 38, voc: "ferreiro", title: "Ferreiro", shop: "ferreiro", king: "thorn" },
  { x: 70, y: 35, voc: "guarda", title: "Guarda", king: "grey" },
  { x: 52, y: 47, voc: "guarda", title: "Guarda", king: "grey" },
  { x: 12, y: IY + 7, voc: "mercador", title: "Taverneiro", king: "ash", tab: "market" },
  { x: 48, y: IY + 9, voc: "guarda", title: "Comandante", king: "grey" },
  { x: 74, y: IY + 9, voc: "druid", title: "Fazendeira", king: "thorn" },
  { x: 35, y: 35, voc: "guarda", title: "Guarda", king: "grey" },
  // área comercial: cada estabelecimento com seu NPC
  { x: 62, y: 40, voc: "ferreiro", title: "Metalurgista", shop: "metalurgica", king: "ash" },
  { x: 59, y: 43, voc: "banqueiro", title: "Lapidário", shop: "lapidaria", king: "grey" },
  { x: 53, y: 46, voc: "guarda", title: "Processador", shop: "processamento", king: "thorn" },
  { x: 41, y: 41, voc: "ferreiro", title: "Carpinteiro", shop: "carpintaria", king: "thorn" },
  { x: 43, y: 36, voc: "sacerdote", title: "Alquimista", shop: "alquimista", king: "thorn" },
  { x: 50, y: 35, voc: "druid", title: "Curtidor", shop: "curtume", king: "ash" },
  { x: 59, y: 35, voc: "banqueiro", title: "Joalheiro", shop: "joalheria", king: "ash" },
  { x: 65, y: 38, voc: "sacerdote", title: "Encantador", shop: "encantador", king: "grey" },
  { x: 63, y: 44, voc: "mercador", title: "Ferramenteiro", shop: "ferramentas", king: "grey" },
  { x: 57, y: 46, voc: "mercador", title: "Leiloeiro", shop: "market", king: "ash" },
].map(n => ({ ...n, dir: "down", moving: false, anim: 0, npc: true }));

// ---------- interiores e masmorra (faixa abaixo do mapa) ----------
// cada sala: retângulo de tiles com piso, paredes e saída; portas do mundo levam pra dentro
export const ROOMS = {
  taverna: { name: "Taverna do Javali Bêbado", x: 8, y: IY + 4, w: 18, h: 12, floor: "wood", wall: "wood" },
  forte: { name: "Salão do Forte Cinzento", x: 34, y: IY + 4, w: 26, h: 16, floor: "stone_floor", wall: "stone" },
  celeiro: { name: "Celeiro da Aldeia", x: 66, y: IY + 4, w: 16, h: 10, floor: "wood", wall: "wood" },
  dragao: { name: "Caverna do Dragão", x: 92, y: IY + 4, w: 120, h: 30, floor: "cave", wall: "cave", dungeon: true },
};
// salas da masmorra em sequência (x relativo à caverna), separadas por portões que abrem quando o servidor confirma a etapa
export const DG_ROOMS = [
  { id: "dg1", name: "Túnel dos Filhotes", x0: 1, x1: 28, mons: [["dragonling", 6]] },
  { id: "dg2", name: "Ponte de Lava", x0: 30, x1: 58, mons: [["guardiao_lava", 1], ["dragonling", 3]] },
  { id: "dg3", name: "Ninho", x0: 60, x1: 88, mons: [["dragonling_elite", 4]] },
  { id: "dg4", name: "Covil de Ignaroth", x0: 90, x1: 118, mons: [["dragao", 1]] },
];
export const DOORS = [];       // {room, outside:{x,y}, inside:{x,y}}
export const GATES = [];       // portões da masmorra: {stage, tiles:[[x,y]...]}
export const interiorAt = (x, y) => { if (y < IY) return null; for (const [id, r] of Object.entries(ROOMS)) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return id; return null; };
// interiores das cidades do continente (taverna e salão de cada uma), numa fileira abaixo das salas do coração
function addCityRooms() {
  (TNET.rooms || []).forEach((rm, i) => { if (ROOMS[rm.id]) return; const tav = rm.kind === "taverna";
    ROOMS[rm.id] = { name: rm.name, x: 6 + i * 29, y: IY + 38, w: 18, h: 12, floor: tav ? "wood" : "stone_floor", wall: tav ? "wood" : "stone", outside: { x: rm.outside.x, y: rm.outside.y - 1 }, cityKind: rm.kind }; });
}
function buildInteriors() {
  for (const [id, r] of Object.entries(ROOMS)) {
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) block[idx(x, y)] = 0;
    for (let x = r.x; x < r.x + r.w; x++) { put({ x, y: r.y, kind: "iwall", style: r.wall, top: true }); if (x !== r.x + Math.floor(r.w / 2) || r.dungeon) put({ x, y: r.y + r.h - 1, kind: "iwall", style: r.wall, low: true }); }
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) { put({ x: r.x, y, kind: "iwall", style: r.wall, side: true }); put({ x: r.x + r.w - 1, y, kind: "iwall", style: r.wall, side: true }); }
    const out = objects.find(o => o.door === id) || r.outside;
    const exit = r.dungeon ? { x: r.x + 3, y: r.y + Math.floor(r.h / 2) } : { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 2 };
    if (out) DOORS.push({ room: id, outside: { x: out.x, y: out.y + 1 }, inside: exit });
    put({ x: exit.x, y: r.dungeon ? exit.y : exit.y + 1, kind: "exit", solid: false, room: id });
  }
  const F = (room, list) => { const r = ROOMS[room]; for (const [dx, dy, sp, fw = 1, fh = 1, solid = true] of list) put({ x: r.x + dx, y: r.y + dy, kind: "furn", sprite: sp, fw, fh, solid }); };
  F("taverna", [[3, 2, "bar", 4, 1], [8, 2, "barrel_rack", 2, 1], [13, 2, "fireplace", 2, 1], [4, 6, "table", 2, 1], [3, 6, "chair"], [6, 6, "chair"], [10, 7, "table", 2, 1], [9, 7, "chair"], [12, 7, "chair"], [14, 6, "table", 2, 1], [15, 9, "plant"], [2, 9, "crate_stack"], [9, 4, "rug", 1, 1, false]]);
  F("forte", [[13, 3, "throne", 2, 1], [9, 2, "banner"], [17, 2, "banner"], [3, 3, "weapon_rack", 2, 1], [22, 3, "weapon_rack", 2, 1], [6, 8, "candle"], [20, 8, "candle"], [6, 12, "candle"], [20, 12, "candle"], [12, 9, "table", 2, 1], [3, 13, "chest_big"], [22, 13, "bookshelf", 2, 1], [13, 6, "rug", 1, 1, false]]);
  for (const [id, r] of Object.entries(ROOMS)) { if (r.cityKind === "taverna") F(id, [[3, 2, "bar", 4, 1], [8, 2, "barrel_rack", 2, 1], [13, 2, "fireplace", 2, 1], [4, 6, "table", 2, 1], [3, 6, "chair"], [6, 6, "chair"], [10, 7, "table", 2, 1], [9, 7, "chair"], [12, 7, "chair"], [14, 6, "table", 2, 1], [15, 9, "plant"], [2, 9, "barrel"]]);
    if (r.cityKind === "salao") F(id, [[8, 2, "throne", 2, 1], [4, 2, "banner"], [13, 2, "banner"], [2, 3, "weapon_rack", 2, 1], [14, 3, "bookshelf", 2, 1], [5, 6, "candle"], [12, 6, "candle"], [8, 6, "table", 2, 1], [2, 9, "chest_big"], [15, 9, "statue"]]); }
  F("celeiro", [[2, 2, "haystack"], [3, 2, "haystack"], [12, 2, "haystack"], [6, 3, "cart", 2, 1], [2, 7, "crate_stack"], [13, 7, "barrel_rack", 2, 1], [9, 6, "haystack"]]);
  // masmorra: paredes entre salas com portão; lava na sala 2 com ponte
  const r = ROOMS.dragao;
  for (let k = 0; k < DG_ROOMS.length - 1; k++) {
    const wx = r.x + DG_ROOMS[k].x1 + 1, gate = { stage: k + 1, tiles: [] };
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) { const mid = Math.abs(y - (r.y + r.h / 2)) < 2; if (mid) { gate.tiles.push([wx, y]); block[idx(wx, y)] = 1; } else put({ x: wx, y, kind: "iwall", style: "cave", side: true }); }
    GATES.push(gate);
  }
  const lx0 = r.x + DG_ROOMS[1].x0 + 6, lx1 = r.x + DG_ROOMS[1].x1 - 6;
  for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = lx0; x <= lx1; x++) if (Math.abs(y - (r.y + r.h / 2)) > 2) { block[idx(x, y)] = 1; LAVA.push([x, y]); }
  for (let i = 0; i < 70; i++) { const x = r.x + 2 + (hash(i, 7) % (r.w - 4)), y = r.y + 2 + (hash(i, 9) % (r.h - 4)); if (!block[idx(x, y)] && Math.abs(y - (r.y + r.h / 2)) > 3) put({ x, y, kind: "tree", sprite: "boulder", tint: "ember" }); }
  for (let i = 0; i < 40; i++) { const x = r.x + 2 + (hash(i, 17) % (r.w - 4)), y = r.y + 2 + (hash(i, 19) % (r.h - 4)); if (!block[idx(x, y)]) props.push({ x, y, kind: i % 3 ? "bone" : "skull" }); }
}
export const LAVA = [];
export function openGate(stage) { const g = GATES.find(x => x.stage === stage); if (g) for (const [x, y] of g.tiles) block[idx(x, y)] = 0; }
export function closeGates() { for (const g of GATES) for (const [x, y] of g.tiles) block[idx(x, y)] = 1; }
