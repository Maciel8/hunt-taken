// Terreno do continente (10.000 × 10.000 tiles) calculado por coordenada, sem matriz gigante na memória.
// Módulo puro (sem DOM): usado pelo Web Worker (desenho dos pedaços), pelo jogo (colisão, caminho, objetos)
// e pelos scripts de geração/validação no Node. Tudo é determinístico pela semente.
// Coordenadas "locais" = as do coração (mapa 300×200 em 0..300 × 0..200); o continente vai de -OX a SIZE-OX.
export const SIZE = 10000, OX = 4900, OY = 5200, SEED = 7331, CHUNK = 32;
export const HEART = { x: 0, y: 0, w: 300, h: 200 };

// ---------- biomas ----------
export const B = { DEEP: 0, OCEAN: 1, SHALLOW: 2, BEACH: 3, CLIFF: 4, PLAINS: 5, FIELD: 6, FOREST: 7, ANCIENT: 8, SWAMP: 9, MANGROVE: 10, DESERT: 11, CANYON: 12, MOUNTAIN: 13, PEAK: 14,
  VOLCANIC: 15, LAVA: 16, TUNDRA: 17, GLACIER: 18, ICE: 19, DARK: 20, LAKE: 21, RIVER: 22, ROAD: 23, BRIDGE: 24, CITY: 25, MURKY: 26, DOCK: 27, HEART: 255 };
const BLOCKED = new Uint8Array(256); for (const b of [B.DEEP, B.OCEAN, B.SHALLOW, B.PEAK, B.LAVA, B.LAKE, B.RIVER, B.MURKY]) BLOCKED[b] = 1;
export const isBlocked = b => BLOCKED[b] === 1;
export const isWater = b => b === B.DEEP || b === B.OCEAN || b === B.SHALLOW || b === B.LAKE || b === B.RIVER || b === B.MURKY;
export const BIOME_NAME = ["Oceano profundo", "Oceano", "Águas rasas", "Praia", "Costa rochosa", "Planícies Douradas", "Campos Férteis", "Floresta Densa", "Floresta Ancestral", "Pântano Vermelho", "Manguezal", "Deserto Dourado", "Cânions", "Cordilheira", "Picos", "Terras Vulcânicas", "Lava", "Tundra", "Geleiras", "Lago congelado", "Terras Sombrias", "Lago", "Rio", "Estrada", "Ponte", "Cidade", "Água turva", "Docas"];
// cor média (minimapa e mapa-múndi)
export const BIOME_RGB = [[18, 38, 74], [28, 62, 110], [52, 112, 150], [222, 204, 150], [120, 112, 104], [104, 150, 64], [150, 160, 70], [52, 100, 48], [40, 92, 70], [110, 60, 52], [70, 90, 60], [224, 190, 110], [186, 120, 80], [126, 120, 112], [90, 86, 84],
  [70, 54, 54], [220, 90, 30], [210, 220, 226], [190, 214, 236], [170, 206, 230], [76, 58, 92], [48, 110, 160], [56, 120, 170], [150, 118, 78], [130, 94, 60], [180, 170, 150], [70, 74, 52], [120, 90, 60]];

// ---------- ruído ----------
const ih = (x, y, s = SEED) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const fade = t => t * t * (3 - 2 * t);
export function vnoise(x, y, s = SEED) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = fade(x - x0), fy = fade(y - y0);
  const a = ih(x0, y0, s), b = ih(x0 + 1, y0, s), c = ih(x0, y0 + 1, s), d = ih(x0 + 1, y0 + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
export function fbm(x, y, oct = 4, s = SEED) { let v = 0, a = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= .5; f *= 2.03; } return v / n; }   // 0..1
export const hashTile = (x, y, s = 1) => ih(x, y, SEED + s * 977);

// ---------- formato do continente: máscara radial deformada + cabos, baías e ilhas satélites ----------
const BUMPS = [[1700, 2000, 900, .32], [8300, 2600, 700, .14], [2100, 7600, 800, .16], [7600, 8000, 900, .18], [5000, 9100, 700, .14], [9000, 5600, 500, -.22], [600, 4900, 500, -.16], [4800, 700, 600, .12],
  [9420, 3300, 260, .55], [8950, 8500, 300, .5], [560, 7000, 240, .55], [2800, 9420, 270, .5], [9300, 6900, 200, .5], [3600, 480, 220, .5]];
export function coastAt(gx, gy) {
  const nx = (gx - SIZE / 2) / (SIZE / 2), ny = (gy - SIZE / 2) / (SIZE / 2), r = Math.sqrt(nx * nx + ny * ny);
  let c = .88 - r + (fbm(gx / 2100, gy / 2100, 5, SEED + 1) - .5) * .5 + (fbm(gx / 520, gy / 520, 3, SEED + 2) - .5) * .08;
  for (const [bx, by, br, s] of BUMPS) { const d = Math.hypot(gx - bx, gy - by) / br; if (d < 3) c += s * Math.exp(-d * d); }
  return c;
}
// ---------- âncoras de bioma (layout pedido: centro planícies, oeste floresta, sudoeste pântano, sul deserto, norte montanhas, extremo norte gelo, noroeste sombrio) ----------
const ANCH = [[5100, 5300, B.PLAINS, 1.15], [6200, 5800, B.PLAINS, 1], [5700, 4600, B.FIELD, .95], [4300, 5900, B.FIELD, .9], [7000, 6400, B.PLAINS, .95], [8300, 5300, B.PLAINS, .9], [6900, 4700, B.FIELD, .85],
  [2700, 4900, B.FOREST, 1], [3400, 5400, B.FOREST, .95], [2600, 3900, B.FOREST, .9], [3900, 4300, B.FOREST, .85], [1800, 4500, B.ANCIENT, 1.1], [1200, 5300, B.ANCIENT, .8],
  [2300, 6900, B.SWAMP, 1.05], [3100, 7400, B.MANGROVE, .9], [1800, 6200, B.SWAMP, .85],
  [5000, 8100, B.DESERT, 1.15], [6300, 8300, B.DESERT, 1], [3900, 8400, B.DESERT, .95], [7300, 7600, B.CANYON, .85], [4300, 7400, B.DESERT, .8],
  [5300, 2600, B.MOUNTAIN, 1], [6500, 3000, B.MOUNTAIN, 1], [4200, 2900, B.MOUNTAIN, .9], [7700, 3700, B.MOUNTAIN, .9], [7700, 2300, B.VOLCANIC, 1], [8400, 3200, B.VOLCANIC, .8],
  [5000, 1150, B.TUNDRA, 1], [6700, 1300, B.GLACIER, 1], [3700, 1500, B.TUNDRA, .9], [8000, 1600, B.GLACIER, .85],
  [1600, 1950, B.DARK, 1.15], [2400, 2700, B.DARK, .8]];
function anchorBiome(gx, gy) {
  // deformação em duas escalas: contorno grande sinuoso + franjas menores (nenhuma fronteira reta)
  const wx = gx + (fbm(gx / 1300, gy / 1300, 3, SEED + 7) - .5) * 1700 + (fbm(gx / 260, gy / 260, 3, SEED + 9) - .5) * 420, wy = gy + (fbm(gx / 1300, gy / 1300, 3, SEED + 8) - .5) * 1700 + (fbm(gx / 260, gy / 260, 3, SEED + 10) - .5) * 420;
  let best = B.PLAINS, bd = 1e18; for (const [ax, ay, b, w] of ANCH) { const d = ((wx - ax) ** 2 + (wy - ay) ** 2) / (w * w); if (d < bd) { bd = d; best = b; } } return best;
}
// bioma base num ponto global (sem rios, estradas e cidades)
export function baseBiome(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return B.DEEP;
  const c = coastAt(gx, gy);
  if (c < -.05) return B.DEEP; if (c < -.012) return B.OCEAN; if (c < 0) return B.SHALLOW;
  let b = anchorBiome(gx, gy);
  if (c < .012) { const rocky = b === B.MOUNTAIN || b === B.VOLCANIC || b === B.TUNDRA || b === B.GLACIER || b === B.DARK; return rocky ? B.CLIFF : (b === B.SWAMP || b === B.MANGROVE ? B.MANGROVE : B.BEACH); }
  const rid = 1 - Math.abs(fbm(gx / 260, gy / 260, 4, SEED + 11) - .5) * 2;          // cristas
  if ((b === B.MOUNTAIN || b === B.GLACIER) && rid > .86) return B.PEAK;
  if (b === B.VOLCANIC) { if (rid > .9) return B.PEAK; if (fbm(gx / 140, gy / 140, 3, SEED + 13) > .7) return B.LAVA; }
  const lk = fbm(gx / 380, gy / 380, 3, SEED + 17);
  if (lk > .72 && (b === B.PLAINS || b === B.FOREST || b === B.FIELD || b === B.ANCIENT)) return B.LAKE;
  if (lk > .7 && (b === B.TUNDRA || b === B.GLACIER)) return B.ICE;
  if ((b === B.SWAMP || b === B.MANGROVE) && fbm(gx / 90, gy / 90, 3, SEED + 19) > .64) return B.MURKY;
  if (b === B.DESERT && fbm(gx / 700, gy / 700, 2, SEED + 23) > .72) return B.CANYON;
  return b;
}

// ---------- rede: cidades, rios, estradas, docas (vem de assets/world-net.json, gerado por scripts/gen-world.mjs) ----------
export const NET = { ready: false, cities: [], rivers: [], roads: [], ports: [], edge: null, hunts: [], nodes: [], wp: null, grid: new Map(), edgeMap: null };
const GCELL = 64;
function indexSeg(kind, a, b, w, extra) { const x0 = Math.floor((Math.min(a[0], b[0]) - w - 2) / GCELL), x1 = Math.floor((Math.max(a[0], b[0]) + w + 2) / GCELL), y0 = Math.floor((Math.min(a[1], b[1]) - w - 2) / GCELL), y1 = Math.floor((Math.max(a[1], b[1]) + w + 2) / GCELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + "," + y; let l = NET.grid.get(k); if (!l) NET.grid.set(k, l = []); l.push({ kind, a, b, w, ...extra }); } }
export function initNet(net) {
  Object.assign(NET, net, { ready: true, grid: new Map(), clear: null, clearBuilt: false });
  for (const r of NET.rivers) for (let i = 1; i < r.pts.length; i++) indexSeg("river", r.pts[i - 1], r.pts[i], r.w[i]);
  for (const r of NET.roads) for (let i = 1; i < r.pts.length; i++) indexSeg("road", r.pts[i - 1], r.pts[i], 1.35);
  for (const c of NET.cities) indexSeg("city", [c.x, c.y], [c.x, c.y], c.plaza + 2, { city: c });
  for (const p of NET.ports || []) for (const d of p.docks) indexSeg("dock", d[0], d[1], 1.1);
  for (const l of NET.lakes || []) indexSeg("lake", [l.x, l.y], [l.x, l.y], l.r);
  if (NET.edge) { NET.edgeMap = new Map(); for (const t of NET.edge.tiles) NET.edgeMap.set(t[0] + "," + t[1], t); }
}
const segDist = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); };
// região do coração mais perto (costura sem emenda): biomas do coração → biomas do continente
const HEART_BIOME = [B.PLAINS, B.FOREST, B.SWAMP, B.MOUNTAIN, B.MOUNTAIN, B.TUNDRA, B.DARK, B.PLAINS];
function heartSeam(x, y) {
  if (!NET.edgeMap) return null;
  const qx = Math.max(0, Math.min(HEART.w - 1, x)), qy = Math.max(0, Math.min(HEART.h - 1, y)), d = Math.hypot(x - qx, y - qy);
  if (d > 48) return null;
  // amostra a borda com deslocamento por ruído ao longo dela (vira manchas, não faixas)
  const j = (fbm(x / 23, y / 23, 3, SEED + 43) - .5) * 70;
  const cx = (x < 0 || x >= HEART.w) ? (x < 0 ? 0 : HEART.w - 1) : Math.max(0, Math.min(HEART.w - 1, Math.round(qx + j)));
  const cy = (y < 0 || y >= HEART.h) ? (y < 0 ? 0 : HEART.h - 1) : Math.max(0, Math.min(HEART.h - 1, Math.round(qy + j)));
  const t = NET.edgeMap.get(cx + "," + cy) || NET.edgeMap.get(qx + "," + qy); if (!t) return null;
  return { b: HEART_BIOME[t[2]], d };
}
// tile final num ponto local: oceano/costa/bioma + costura com o coração + rio/lago/estrada/ponte/cidade/docas
export function tileAt(x, y) {
  if (x >= HEART.x && y >= HEART.y && x < HEART.x + HEART.w && y < HEART.y + HEART.h) return B.HEART;
  const gx = x + OX, gy = y + OY; let b = baseBiome(gx, gy);
  const seam = heartSeam(x, y);
  if (seam && b !== B.DEEP && b !== B.OCEAN) { const k = seam.d / 48 + (fbm(gx / 18, gy / 18, 2, SEED + 29) - .5) * .5; if (k < .75) b = seam.b; }
  if (!NET.ready) return b;
  const cell = NET.grid.get(Math.floor(x / GCELL) + "," + Math.floor(y / GCELL));
  if (cell) {
    let river = false, road = false, dock = false, city = null, lake = false;
    for (const s of cell) { const d = segDist(x + .5, y + .5, s.a, s.b);
      if (s.kind === "river" && d < s.w + (fbm(gx / 9, gy / 9, 2, SEED + 31) - .5) * .8) river = true;
      else if (s.kind === "road" && d < s.w) road = true;
      else if (s.kind === "dock" && d < s.w) dock = true;
      else if (s.kind === "lake" && d < s.w + (fbm(gx / 11, gy / 11, 2, SEED + 41) - .5) * 4) lake = true;
      else if (s.kind === "city" && d < s.w - 2 + (fbm(gx / 7, gy / 7, 2, SEED + 37) - .5) * 2.5) city = s.city; }
    if (dock) return B.DOCK;
    if (city) return B.CITY;
    if (lake && !road) return B.LAKE;
    if (road) return (river || b === B.LAKE || b === B.MURKY || b === B.SHALLOW) ? B.BRIDGE : (b === B.PEAK || b === B.LAVA ? B.ROAD : B.ROAD);
    if (river && b !== B.DEEP && b !== B.OCEAN) return b === B.TUNDRA || b === B.GLACIER ? B.ICE : B.RIVER;
  }
  return b;
}
// grade de tiles de um pedaço (com 1 tile de borda pra transições): (CHUNK+2)²
export function chunkTiles(cx, cy) { const n = CHUNK + 2, t = new Uint8Array(n * n), x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t[j * n + i] = tileAt(x0 + i, y0 + j); return t; }

// ---------- anéis irregulares em volta das cidades ----------
// raio(θ) = R × (1 + 0,16 sen(3θ+a) + 0,09 sen(5θ+b) + 0,05 sen(11θ+c)): mesma conta no servidor (ring_at)
export function ringRadius(c, ring, th) { const p = c.ph[ring - 1], R = c.r[ring - 1]; return R * (1 + .16 * Math.sin(3 * th + p[0]) + .09 * Math.sin(5 * th + p[1]) + .05 * Math.sin(11 * th + p[2])); }
export function cityDist(c, x, y) {
  if (!c.heart) return Math.hypot(x - c.x, y - c.y);
  const dx = Math.max(HEART.x - x, 0, x - (HEART.x + HEART.w)), dy = Math.max(HEART.y - y, 0, y - (HEART.y + HEART.h)); return Math.hypot(dx, dy);
}
export function zoneAt(x, y) {
  let best = null; for (const c of NET.cities) { const d = cityDist(c, x, y), th = Math.atan2(y - (c.heart ? HEART.y + HEART.h / 2 : c.y), x - (c.heart ? HEART.x + HEART.w / 2 : c.x));
    let ring = 4; for (let k = 1; k <= 3; k++) if (d < ringRadius(c, k, th)) { ring = k; break; }
    const score = ring * 1e6 + d; if (!best || score < best.score) best = { city: c, ring, d, score }; }
  return best || { city: null, ring: 4 };
}

// ---------- objetos de um pedaço (árvores, rochas, casas, marcos de anel) — determinístico ----------
const TREE = { [B.FOREST]: [["pine", .11], ["oak", .07], ["tree_round", .05]], [B.ANCIENT]: [["oak", .13, "ancient", 1.4], ["willow", .05]], [B.PLAINS]: [["oak", .025], ["tree_round", .02]], [B.FIELD]: [["tree_round", .012]],
  [B.SWAMP]: [["willow", .08, "swamp"], ["dead", .06]], [B.MANGROVE]: [["willow", .14, "swamp"]], [B.DESERT]: [["palm", .008], ["cactus", .02]], [B.CANYON]: [["boulder", .04, "sand"]],
  [B.MOUNTAIN]: [["boulder", .05], ["pine", .04, "snow"]], [B.VOLCANIC]: [["boulder", .035], ["dead", .025]], [B.TUNDRA]: [["pine", .07, "snow"], ["boulder", .02, "ice"]], [B.GLACIER]: [["boulder", .02, "ice"]],
  [B.DARK]: [["dead", .07, "void"], ["ruinwall", .025]], [B.BEACH]: [["palm", .012]], [B.CLIFF]: [["boulder", .05]] };
function clearAt(x, y) {
  if (!NET.ready) return false; const c = NET.clear || (NET.clear = new Map());
  if (!NET.clearBuilt) { NET.clearBuilt = true; for (const h of NET.hunts || []) for (let dy = -h.r - 2; dy <= h.r + 2; dy++) for (let dx = -h.r - 2; dx <= h.r + 2; dx++) if (dx * dx + dy * dy <= (h.r + 2) ** 2) c.set((h.cx + dx) + "," + (h.cy + dy), 1);
    for (const n of NET.nodes || []) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) c.set((n.x + dx) + "," + (n.y + dy), 1); }
  return c.has(x + "," + y);
}
export function chunkObjects(cx, cy, tiles) {
  const out = [], n = CHUNK + 2; tiles = tiles || chunkTiles(cx, cy);
  for (let j = 1; j <= CHUNK; j++) for (let i = 1; i <= CHUNK; i++) {
    const b = tiles[j * n + i]; const x = cx * CHUNK + i - 1, y = cy * CHUNK + j - 1; const list = TREE[b]; if (!list) continue;
    if (x > HEART.x - 4 && y > HEART.y - 4 && x < HEART.x + HEART.w + 3 && y < HEART.y + HEART.h + 3) continue;   // borda do coração livre
    if (clearAt(x, y)) continue;   // clareira nas áreas de caça e em volta dos depósitos
    // não planta grudado em estrada, rio, cidade ou água
    let near = false; for (const o of [tiles[j * n + i - 1], tiles[j * n + i + 1], tiles[(j - 1) * n + i], tiles[(j + 1) * n + i]]) if (o === B.ROAD || o === B.BRIDGE || o === B.CITY || o === B.RIVER || o === B.DOCK || isBlocked(o)) near = true; if (near) continue;
    const r = hashTile(x, y, 3); let acc = 0;
    for (const [sp, p, tint, big] of list) { acc += p; if (r < acc) { const kind = sp === "palm" || sp === "cactus" ? sp : sp === "ruinwall" ? "ruinwall" : sp === "boulder" ? "tree" : "tree"; out.push({ x, y, kind, sprite: sp, tint: tint || null, big: big || (sp === "pine" || sp === "oak" ? .9 + hashTile(x, y, 5) * .35 : 1), solid: true, proc: true }); break; } }
  }
  // construções das cidades (geradas sobre o calçamento)
  if (NET.ready) for (const c of NET.cities) for (const o of c.buildings || []) if (Math.floor(o.x / CHUNK) === cx && Math.floor(o.y / CHUNK) === cy) out.push({ ...o, proc: true, solid: o.solid !== false });
  // marcos de pedra nos limites dos anéis (a cada ~7°)
  if (NET.ready) for (const c of NET.cities) { if (c.heart) continue; if (Math.abs(c.x - (cx + .5) * CHUNK) > c.r[2] * 1.5 + CHUNK || Math.abs(c.y - (cy + .5) * CHUNK) > c.r[2] * 1.5 + CHUNK) continue;
    for (let k = 1; k <= 3; k++) for (let a = 0; a < 6.283; a += .12) { const R = ringRadius(c, k, a), x = Math.round(c.x + Math.cos(a) * R), y = Math.round(c.y + Math.sin(a) * R);
      if (Math.floor(x / CHUNK) !== cx || Math.floor(y / CHUNK) !== cy) continue; const b = tiles[(y - cy * CHUNK + 1) * n + (x - cx * CHUNK + 1)]; if (isBlocked(b) || b === B.ROAD || b === B.BRIDGE || b === B.HEART) continue;
      out.push({ x, y, kind: "ringmark", ring: k, solid: true, proc: true }); } }
  return out;
}
export const chunkKey = (cx, cy) => cx + "," + cy;
