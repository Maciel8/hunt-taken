// Terreno do continente (10.000 × 10.000 tiles) calculado por coordenada, sem matriz gigante na memória.
// Módulo puro (sem DOM): usado pelo Web Worker (desenho dos pedaços), pelo jogo (colisão, caminho, objetos)
// e pelos scripts de geração/validação no Node. Tudo é determinístico pela semente.
// Coordenadas "locais" = as do coração (mapa 300×200 em 0..300 × 0..200); o continente vai de -OX a SIZE-OX.
export const SIZE = 10000, OX = 4900, OY = 5200, SEED = 7331, CHUNK = 32;
export const OVT = 5, OVN = 2000;   // mapa-múndi: 1 px = 5 tiles, 2000×2000
export const HEART = { x: 0, y: 0, w: 300, h: 200 };

// ---------- biomas ----------
export const B = { DEEP: 0, OCEAN: 1, SHALLOW: 2, BEACH: 3, CLIFF: 4, PLAINS: 5, FIELD: 6, FOREST: 7, ANCIENT: 8, SWAMP: 9, MANGROVE: 10, DESERT: 11, CANYON: 12, MOUNTAIN: 13, PEAK: 14,
  VOLCANIC: 15, LAVA: 16, TUNDRA: 17, GLACIER: 18, ICE: 19, DARK: 20, LAKE: 21, RIVER: 22, ROAD: 23, BRIDGE: 24, CITY: 25, MURKY: 26, DOCK: 27, HEART: 255 };
const BLOCKED = new Uint8Array(256); for (const b of [B.DEEP, B.OCEAN, B.SHALLOW, B.PEAK, B.LAVA, B.LAKE, B.RIVER, B.MURKY]) BLOCKED[b] = 1;
export const isBlocked = b => BLOCKED[b] === 1;
export const isWater = b => b === B.DEEP || b === B.OCEAN || b === B.SHALLOW || b === B.LAKE || b === B.RIVER || b === B.MURKY;
export const BIOME_NAME = ["Oceano profundo", "Oceano", "Águas rasas", "Praia", "Costa rochosa", "Planícies Douradas", "Campos Férteis", "Floresta Densa", "Floresta Ancestral", "Pântano Vermelho", "Manguezal", "Deserto Dourado", "Cânions", "Cordilheira", "Picos", "Terras Vulcânicas", "Lava", "Tundra", "Geleiras", "Lago congelado", "Terras Sombrias", "Lago", "Rio", "Estrada", "Ponte", "Cidade", "Água turva", "Docas"];
// cor média de cada bioma (minimapa e mapa-múndi)
export const BIOME_RGB = [[16, 34, 70], [26, 58, 106], [48, 110, 150], [229, 208, 158], [139, 139, 143], [94, 158, 52], [120, 159, 36], [38, 68, 37], [33, 66, 39], [101, 59, 50], [82, 128, 72], [229, 208, 158], [181, 136, 85], [100, 97, 100], [118, 118, 129],
  [62, 53, 55], [218, 92, 24], [235, 240, 246], [212, 233, 255], [193, 221, 255], [81, 58, 107], [48, 112, 155], [48, 112, 155], [172, 131, 83], [128, 92, 51], [154, 138, 113], [57, 96, 40], [128, 92, 51]];

// ---------- ruído ----------
const ih = (x, y, s = SEED) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const fade = t => t * t * (3 - 2 * t);
export function vnoise(x, y, s = SEED) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = fade(x - x0), fy = fade(y - y0);
  const a = ih(x0, y0, s), b = ih(x0 + 1, y0, s), c = ih(x0, y0 + 1, s), d = ih(x0 + 1, y0 + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }
export function fbm(x, y, oct = 4, s = SEED) { let v = 0, a = .5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= .5; f *= 2.03; } return v / n; }   // 0..1
export const hashTile = (x, y, s = 1) => ih(x, y, SEED + s * 977);
export function inPoly(P, x, y) { if (!P) return true; let w = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) w = !w; } return w; }

// ---------- formato do continente: máscara radial deformada + cabos, baías e ilhas satélites ----------
const BUMPS = [[1700, 2000, 900, .32], [8300, 2600, 700, .14], [2100, 7600, 800, .16], [7600, 8000, 900, .18], [5000, 9100, 700, .14], [9000, 5600, 500, -.22], [600, 4900, 500, -.16], [4800, 700, 600, .12],
  [9420, 3300, 260, .55], [8950, 8500, 300, .5], [560, 7000, 240, .55], [2800, 9420, 270, .5], [9300, 6900, 200, .5], [3600, 480, 220, .5]];
export function coastAt(gx, gy) {
  const nx = (gx - SIZE / 2) / (SIZE / 2), ny = (gy - SIZE / 2) / (SIZE / 2), r = Math.sqrt(nx * nx + ny * ny);
  let c = .88 - r + (fbm(gx / 2100, gy / 2100, 5, SEED + 1) - .5) * .5 + (fbm(gx / 520, gy / 520, 3, SEED + 2) - .5) * .08;
  for (const [bx, by, br, s] of BUMPS) { const d = Math.hypot(gx - bx, gy - by) / br; if (d < 3) c += s * Math.exp(-d * d); }
  return c;
}
// ---------- âncoras de bioma ----------
const ANCH = [[5100, 5300, B.PLAINS, 1.15], [6200, 5800, B.PLAINS, 1], [5700, 4600, B.FIELD, .95], [4300, 5900, B.FIELD, .9], [7000, 6400, B.PLAINS, .95], [8300, 5300, B.PLAINS, .9], [6900, 4700, B.FIELD, .85],
  [2700, 4900, B.FOREST, 1], [3400, 5400, B.FOREST, .95], [2600, 3900, B.FOREST, .9], [3900, 4300, B.FOREST, .85], [1800, 4500, B.ANCIENT, 1.1], [1200, 5300, B.ANCIENT, .8],
  [2300, 6900, B.SWAMP, 1.05], [3100, 7400, B.MANGROVE, .9], [1800, 6200, B.SWAMP, .85],
  [5000, 8100, B.DESERT, 1.15], [6300, 8300, B.DESERT, 1], [3900, 8400, B.DESERT, .95], [7300, 7600, B.CANYON, .85], [4300, 7400, B.DESERT, .8],
  [5300, 2600, B.MOUNTAIN, 1], [6500, 3000, B.MOUNTAIN, 1], [4200, 2900, B.MOUNTAIN, .9], [7700, 3700, B.MOUNTAIN, .9], [7700, 2300, B.VOLCANIC, 1], [8400, 3200, B.VOLCANIC, .8],
  [5000, 1150, B.TUNDRA, 1], [6700, 1300, B.GLACIER, 1], [3700, 1500, B.TUNDRA, .9], [8000, 1600, B.GLACIER, .85],
  [1600, 1950, B.DARK, 1.15], [2400, 2700, B.DARK, .8]];
function anchorBiome(gx, gy) {
  const wx = gx + (fbm(gx / 1300, gy / 1300, 3, SEED + 7) - .5) * 1700 + (fbm(gx / 260, gy / 260, 3, SEED + 9) - .5) * 420, wy = gy + (fbm(gx / 1300, gy / 1300, 3, SEED + 8) - .5) * 1700 + (fbm(gx / 260, gy / 260, 3, SEED + 10) - .5) * 420;
  let best = B.PLAINS, bd = 1e18; for (const [ax, ay, b, w] of ANCH) { const d = ((wx - ax) ** 2 + (wy - ay) ** 2) / (w * w); if (d < bd) { bd = d; best = b; } } return best;
}
// bioma base num ponto global (sem rios, estradas e cidades)
export function baseBiome(gx, gy) {
  if (gx < 0 || gy < 0 || gx >= SIZE || gy >= SIZE) return B.DEEP;
  const c = coastAt(gx, gy);
  if (c < -.05) return B.DEEP; if (c < -.012) return B.OCEAN; if (c < 0) return B.SHALLOW;
  let b = anchorBiome(gx, gy);
  if (c < .014) { const rocky = b === B.MOUNTAIN || b === B.VOLCANIC || b === B.TUNDRA || b === B.GLACIER || b === B.DARK; return rocky ? B.CLIFF : (b === B.SWAMP || b === B.MANGROVE ? B.MANGROVE : B.BEACH); }
  const rid = 1 - Math.abs(fbm(gx / 260, gy / 260, 4, SEED + 11) - .5) * 2;
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
export const NET = { ready: false, cities: [], rivers: [], roads: [], ports: [], edge: null, hunts: [], nodes: [], wp: null, grid: new Map(), edgeMap: null, objChunks: new Map() };
const GCELL = 64;
function indexSeg(kind, a, b, w, extra) { const x0 = Math.floor((Math.min(a[0], b[0]) - w - 2) / GCELL), x1 = Math.floor((Math.max(a[0], b[0]) + w + 2) / GCELL), y0 = Math.floor((Math.min(a[1], b[1]) - w - 2) / GCELL), y1 = Math.floor((Math.max(a[1], b[1]) + w + 2) / GCELL);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const k = x + "," + y; let l = NET.grid.get(k); if (!l) NET.grid.set(k, l = []); l.push({ kind, a, b, w, ...extra }); } }
function addObjChunk(o) {
  const k = Math.floor(o.x / CHUNK) + "," + Math.floor(o.y / CHUNK);
  let l = NET.objChunks.get(k); if (!l) NET.objChunks.set(k, l = []);
  l.push(o);
}
export function initNet(net) {
  Object.assign(NET, net, { ready: true, grid: new Map(), clear: null, clearBuilt: false, objChunks: new Map() });
  for (const r of NET.rivers) for (let i = 1; i < r.pts.length; i++) indexSeg("river", r.pts[i - 1], r.pts[i], r.w[i]);
  for (const r of NET.roads) for (let i = 1; i < r.pts.length; i++) indexSeg("road", r.pts[i - 1], r.pts[i], 1.45);
  for (const c of NET.cities) if (!c.heart) indexSeg("city", [c.x, c.y], [c.x, c.y], Math.max(c.rx || c.plaza, c.ry || c.plaza) + 28, { city: c });
  for (const p of NET.ports || []) for (const d of p.docks) indexSeg("dock", d[0], d[1], d[2] || 1.6);
  for (const l of NET.lakes || []) indexSeg("lake", [l.x, l.y], [l.x, l.y], l.r);
  if (NET.edge) { NET.edgeMap = new Map(); for (const t of NET.edge.tiles) NET.edgeMap.set(t[0] + "," + t[1], t); }
  // índice O(1) por chunk para prédios, muralhas, extras e marcos (fundamental com cidades 4x maiores)
  for (const c of NET.cities) for (const o of c.buildings || []) addObjChunk({ ...o, proc: true, solid: o.solid !== false });
  for (const o of NET.extras || []) addObjChunk({ ...o, proc: true, solid: o.solid !== false });
  for (const m of NET.markers || []) addObjChunk({ ...m, proc: true, solid: true });
}
const segDist = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); };
const HEART_BIOME = [B.PLAINS, B.FOREST, B.SWAMP, B.CANYON, B.MOUNTAIN, B.TUNDRA, B.DARK, B.PLAINS];
function heartSeam(x, y) {
  if (!NET.edgeMap) return null;
  const qx = Math.max(0, Math.min(HEART.w - 1, x)), qy = Math.max(0, Math.min(HEART.h - 1, y)), d = Math.hypot(x - qx, y - qy);
  if (d > 110) return null;
  const j = (fbm(x / 23, y / 23, 3, SEED + 43) - .5) * 70;
  const cx = (x < 0 || x >= HEART.w) ? (x < 0 ? 0 : HEART.w - 1) : Math.max(0, Math.min(HEART.w - 1, Math.round(qx + j)));
  const cy = (y < 0 || y >= HEART.h) ? (y < 0 ? 0 : HEART.h - 1) : Math.max(0, Math.min(HEART.h - 1, Math.round(qy + j)));
  const t = NET.edgeMap.get(cx + "," + cy) || NET.edgeMap.get(qx + "," + qy); if (!t) return null;
  return { b: HEART_BIOME[t[2]], d };
}

// ---------- geometria urbana orgânica por cidade (compartilhada entre gerador, Worker e colisão) ----------
export function cityInside(c, x, y) { const rx = c.rx || c.plaza || 1, ry = c.ry || c.plaza || 1; return Math.hypot((x - c.x) / rx, (y - c.y) / ry); }
const wob = (x, y, s = 811, amp = 7) => (fbm(x / 16, y / 16, 2, s) - .5) * amp;

// Porto de Valen: baía recortada a leste + península rochosa do farol conectada à costa norte
export function valenBayEdge(dy) {
  return Math.max(12, 28 + 8 * Math.sin(dy / 18) - (dy * dy) / 340);
}
export function valenHeadland(dx, dy) {
  if (dy > -26 || dy < -64) return false;
  const edge = valenBayEdge(dy);
  const reach = 26 * Math.sin(Math.max(0, Math.min(1, (-dy - 26) / 36)) * Math.PI);
  return dx >= edge - 6 && dx <= edge + reach + wob(dx, dy, 821, 5);
}
export function valenBayWater(c, x, y) {
  const dx = x - c.x - .5, dy = y - c.y - .5;
  if (valenHeadland(dx, dy)) return false;
  const edge = valenBayEdge(dy) + wob(x, y, 822, 3.2);
  return dx > edge && Math.abs(dy) < c.ry * 1.18 && dx < c.rx * 1.3;
}

// Oásis de Solkar: lago orgânico em formato de rim a leste da praça do bazar + halo verdejante orgânico
export function solkarLakeVal(dx, dy) {
  const lx = dx - 26, ly = dy - 4;
  const ang = Math.atan2(ly, lx);
  const lobe = 1 + .15 * Math.sin(ang * 2 + .5) - .13 * Math.cos(ang * 3 - .3) + .05 * Math.sin(ang * 5);
  return Math.hypot(lx / (20 * lobe), ly / (31 * lobe));
}
export function solkarOasisGrass(c, x, y) {
  const dx = x - c.x - .5, dy = y - c.y - .5;
  const w = wob(x, y, 831, .22);
  if (solkarLakeVal(dx, dy) < 1.44 + w) return true;
  if (dx > 28 && dx < 96 && dy > -38 && dy < 58 && Math.hypot((dx - 60) / 42, (dy - 10) / 44) < 1 + w) return true;
  if (Math.abs(dy - 20 - 3 * Math.sin(dx / 15)) < 8 && dx > 30 && dx < 96) return true;
  return false;
}

// Clareiras íntimas e orgânicas de Bosques de Sylvana (relativas ao centro da cidade)
export const SYLVANA_CLEARINGS = [
  [0, 0, 14.5, "Santuário"],
  [0, -52, 11, "Druidas"],
  [-54, -22, 11, "Lenhadores"],
  [54, -26, 11, "Alquimia"],
  [-48, 38, 11, "Comércio"],
  [52, 36, 11, "Herbanário"],
];

// Tipo de chão em cada ponto dentro da cidade (sem círculos geométricos ou anéis artificiais!)
export function cityGroundKind(c, x, y) {
  if (!c || c.heart) return "base";
  const dx = x - c.x - .5, dy = y - c.y - .5;
  const rx = c.rx || 100, ry = c.ry || 86;
  const e = Math.hypot(dx / rx, dy / ry);
  const ang = Math.atan2(dy, dx);
  const inW = c.wall ? inPoly(c.wall, x, y) : e < .92;
  const w = wob(x, y, 811, 4.5);

  if (c.theme === "khazad") {
    if (!inW) return "base";
    // Pátio da Cidadela-Forja abraçado pelo fosso em U de lava
    if (Math.abs(dx) < 18 && dy > -24 && dy < 16) return "courtyard";
    // Praça das Bigornas logo ao sul da ponte principal de lava
    if (Math.hypot(dx / 17, (dy - 31) / 10) < 1 + w * .04) return "plaza";
    // Avenidas cardeais e vias da fundição / minas
    if (Math.abs(dx) < 2.6) return "street";
    if (Math.abs(dy - 33) < 2.3 && Math.abs(dx) < rx * .86) return "street";
    if (Math.abs(dy + 10) < 2.2 && Math.abs(dx) < rx * .84) return "street";
    if (Math.abs(dy - 8) < 2.2 && Math.abs(dx) < rx * .84) return "street";
    if (Math.abs(dx - 48) < 2.1 && Math.abs(dy) < ry * .76) return "street";
    if (Math.abs(dx + 46) < 2.1 && Math.abs(dy) < ry * .76) return "street";
    if (Math.abs(dy + 42) < 2.0 && Math.abs(dx) < 54) return "street";
    return "base";
  }

  if (c.theme === "solkar") {
    // Praça íntima do bazar (areia compactada quente, contorno orgânico)
    if (Math.hypot((dx + 14) / 13, (dy - 4) / 12) < 1 + w * .06) return "plaza";
    // Eixo da ponte central sobre o lago e avenidas curvas do bazar
    if (Math.abs(dy - 4) < 2.6 && dx > -rx * .95 && dx < rx * .92) return "street";
    if (Math.abs(dx + 16 - 4 * Math.sin(dy / 22)) < 2.4 && Math.abs(dy) < ry * .90) return "street";
    // Rua crescente do bazar abraçando a margem oeste do lago
    const crescent = Math.hypot((dx - 24) / 48, (dy - 4) / 50);
    if (Math.abs(crescent - 1) < .052 && dx < 24) return "street";
    // Vias secundárias nos bairros de adobe e trilha pelos jardins do oásis
    if (inW && Math.abs(dx + 52 - 5 * Math.cos(dy / 20)) < 2.1 && Math.abs(dy) < 62) return "street";
    if (inW && Math.abs(dy + 38 - 3 * Math.sin(dx / 18)) < 2.1 && dx > -76 && dx < 24) return "street";
    if (inW && Math.abs(dy - 42 + 3 * Math.sin(dx / 18)) < 2.1 && dx > -76 && dx < 46) return "street";
    if (Math.abs(Math.hypot((dx - 28) / 48, (dy - 6) / 50) - 1) < .048 && dx > 16 && e < .94) return "street";
    if (solkarOasisGrass(c, x, y)) return "garden";
    return "base";
  }

  if (c.theme === "valen") {
    if (valenHeadland(dx, dy)) return "rock";
    if (!inW && dx < valenBayEdge(dy) - 4) return "base";
    const bayDist = valenBayEdge(dy) - dx;
    // Calçadão de pedra irregular acompanhando toda a curva da baía
    if (bayDist >= -1 && bayDist < 10.5 && Math.abs(dy) < ry * .86) return "promenade";
    // Grande Praça do Mercado e da Fonte com borda orgânica
    if (Math.hypot((dx - 4) / 22, dy / 20) < 1 + w * .06) return "plaza";
    // Ruas medievais curvas entre os quarteirões densos
    if (Math.abs(dy - 3 * Math.sin(dx / 22)) < 2.5 && dx > -rx * .92 && dx < 34) return "street";
    if (Math.abs(dx + 14 - 6 * Math.sin(dy / 26)) < 2.4 && Math.abs(dy) < ry * .92) return "street";
    if (Math.abs(dy + 34 - 3 * Math.cos(dx / 18)) < 2.1 && dx > -76 && dx < 26) return "street";
    if (Math.abs(dy - 34 + 3 * Math.cos(dx / 18)) < 2.1 && dx > -76 && dx < 26) return "street";
    if (Math.abs(dx + 48 - 4 * Math.sin(dy / 20)) < 2.1 && Math.abs(dy) < 62) return "street";
    return "base";
  }

  if (c.theme === "sylvana") {
    for (let i = 0; i < SYLVANA_CLEARINGS.length; i++) {
      const [cx2, cy2, cr] = SYLVANA_CLEARINGS[i];
      if (Math.hypot(dx - cx2, dy - cy2) < cr + w * .55) return i === 0 ? "plaza" : "clearing";
    }
    // Anel sinuoso orgânico de terra batida ligando as clareiras (imagem 4 expandida!)
    const ringR = Math.hypot(dx / (52 + 5 * Math.sin(ang * 3 + .4)), dy / (44 + 4 * Math.cos(ang * 2 - .3)));
    if (Math.abs(ringR - 1) < .046) return "street";
    // 4 trilhas sinuosas de entrada das 4 direções
    if (Math.abs(dx - 5 * Math.sin(dy / 18)) < 2.2 && Math.abs(dy) < ry * .96) return "street";
    if (Math.abs(dy - 5 * Math.sin(dx / 20)) < 2.2 && Math.abs(dx) < rx * .96) return "street";
    return "base";
  }

  if (c.theme === "nocthar") {
    if (!inW) return "base";
    if (Math.hypot(dx / 21, (dy + 2) / 18) < 1 + w * .05) return "plaza";
    if (Math.abs(dx) < 2.6 || Math.abs(dy) < 2.6) return "street";
    if (Math.abs(dx - 38) < 2.0 && Math.abs(dy) < 66) return "street";
    if (Math.abs(dx + 38) < 2.0 && Math.abs(dy) < 66) return "street";
    if (Math.abs(dy - 36) < 2.0 && Math.abs(dx) < 68) return "street";
    if (Math.abs(dy + 36) < 2.0 && Math.abs(dx) < 68) return "street";
    return "base";
  }

  return "base";
}

export function cityStreet(c, x, y) {
  const k = cityGroundKind(c, x, y);
  return k === "plaza" || k === "street" || k === "promenade" || k === "courtyard" || k === "clearing";
}

// Água / lava / fosso / baía dentro das cidades (mesma conta no gerador, Worker e colisão)
export function cityWater(c, x, y) {
  if (!c || c.heart) return null;
  const dx = x - c.x - .5, dy = y - c.y - .5;
  const rx = c.rx || 100, ry = c.ry || 86;
  const e = Math.hypot(dx / rx, dy / ry);

  if (c.theme === "khazad") {
    if (e > .86) return null;
    // Fosso em U de lava abraçando a Cidadela-Forja + canais laterais da fundição (proporção da imagem 1!)
    const uWest = Math.abs(dx + 20) < 2.5 && dy > -26 && dy < 20;
    const uEast = Math.abs(dx - 20) < 2.5 && dy > -26 && dy < 20;
    const uSouth = Math.abs(dy - 18) < 2.5 && Math.abs(dx) <= 22.5;
    const chanEast = Math.abs(dy - 2) < 1.9 && dx > 20 && dx < 74;
    const chanWest = Math.abs(dy - 8) < 1.9 && dx < -20 && dx > -74;
    if (!uWest && !uEast && !uSouth && !chanEast && !chanWest) return null;
    const bridge = (Math.abs(dx) < 3.6 && dy > 13 && dy < 23)
      || (Math.abs(dy + 10) < 2.6 && Math.abs(Math.abs(dx) - 20) < 4.5)
      || (Math.abs(dy - 8) < 2.6 && Math.abs(Math.abs(dx) - 20) < 4.5)
      || (Math.abs(dx - 48) < 2.8 && Math.abs(dy - 2) < 4)
      || (Math.abs(dx + 46) < 2.8 && Math.abs(dy - 8) < 4);
    return { t: "lava", bridge };
  }

  if (c.theme === "solkar") {
    const inLake = solkarLakeVal(dx, dy) < 1;
    const canalE = Math.abs(dy - 20 - 3 * Math.sin(dx / 15)) < 1.65 && dx > 42 && dx < 96;
    const canalS = Math.abs(dx - 24 - 4 * Math.sin(dy / 14)) < 1.8 && dy > 32 && dy < 86;
    if (!inLake && !canalE && !canalS) return null;
    const mainBridge = Math.abs(dy - 4) < 3.0 && dx > 0 && dx < 54;
    const otherBridge = !inLake && cityGroundKind(c, x, y) === "street";
    return { t: "water", bridge: mainBridge || otherBridge };
  }

  if (c.theme === "valen") {
    if (valenBayWater(c, x, y)) return { t: "bay", bridge: false };
    return null;
  }

  if (c.theme === "sylvana") {
    if (e > .98) return null;
    // Dois riachos sinuosos passando ENTRE as clareiras (pontes só nas estradas estreitas!)
    // riacho do sul atravessa de oeste a leste; o do norte desce serpenteando e DESÁGUA nele (sem cruzar)
    const south = 58 + 8 * Math.sin((dx + 12) / 17) - dx * .04;
    const s2 = Math.abs(dy - south) < 1.95 && dx > -82 && dx < 84;
    const s1 = Math.abs(dx - 30 - 11 * Math.sin((dy + 10) / 17) - dy * .1) < 2.0 && dy > -84 && dy < south;
    if (!s1 && !s2) return null;
    const gk = cityGroundKind(c, x, y);
    return { t: "water", bridge: gk === "street" || Math.abs(dx) < 2.6 || Math.abs(dy) < 2.6 };
  }

  if (c.theme === "nocthar") {
    if (e > .86) return null;
    const ang = Math.atan2(dy, dx);
    const w = .018 * Math.sin(ang * 4 + .5) + .010 * Math.cos(ang * 7);
    if (Math.abs(e - (.55 + w)) > .028) return null;
    const bridge = Math.abs(dx) < 3.4 || Math.abs(dy) < 3.4;
    return { t: "murky", bridge };
  }

  return null;
}

// tile final num ponto local: oceano/costa/bioma + costura com o coração + rio/lago/estrada/ponte/cidade/docas
export function tileAt(x, y, ground = false) {
  if (x >= HEART.x && y >= HEART.y && x < HEART.x + HEART.w && y < HEART.y + HEART.h) return B.HEART;
  const gx = x + OX, gy = y + OY; let b = baseBiome(gx, gy);
  const seam = heartSeam(x, y);
  if (seam && b !== B.DEEP && b !== B.OCEAN) { const k = seam.d / 110 + (fbm(gx / 18, gy / 18, 2, SEED + 29) - .5) * .5; if (k < .75) b = seam.b; }
  if (!NET.ready) return b;
  const cell = NET.grid.get(Math.floor(x / GCELL) + "," + Math.floor(y / GCELL));
  if (cell) {
    let river = false, riverNear = false, road = false, dock = false, city = null, lake = false;
    for (const s of cell) { const d = segDist(x + .5, y + .5, s.a, s.b);
      if (s.kind === "river") { if (d < s.w) river = true; if (d < s.w + .7) riverNear = true; }
      else if (s.kind === "road" && d < s.w) road = true;
      else if (s.kind === "dock" && d < s.w) dock = true;
      else if (s.kind === "lake" && d < s.w + (fbm(gx / 11, gy / 11, 2, SEED + 41) - .5) * 4) lake = true;
      else if (s.kind === "city" && cityInside(s.city, x + .5, y + .5) < 1.05) city = s.city; }
    if (dock) return B.DOCK;
    if (city) {
      const w = cityWater(city, x + .5, y + .5);
      if (!w) return B.CITY;
      if (w.bridge) return B.BRIDGE;
      if (w.t === "bay") return B.SHALLOW;
      if (w.t === "lava") return B.LAVA;
      if (w.t === "murky") return B.MURKY;
      return B.RIVER;
    }
    if (lake && !road) return B.LAKE;
    if (ground) return b;
    if (road) return (riverNear || b === B.LAKE || b === B.MURKY || b === B.SHALLOW) ? B.BRIDGE : B.ROAD;
    if (river && b !== B.DEEP && b !== B.OCEAN) return b === B.TUNDRA || b === B.GLACIER ? B.ICE : B.RIVER;
  }
  return b;
}
export function chunkGround(cx, cy) { const n = CHUNK + 2, t = new Uint8Array(n * n), x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t[j * n + i] = tileAt(x0 + i, y0 + j, true); return t; }
export function segsNear(x0, y0, x1, y1) { const out = new Set(); for (let y = Math.floor(y0 / GCELL); y <= Math.floor(y1 / GCELL); y++) for (let x = Math.floor(x0 / GCELL); x <= Math.floor(x1 / GCELL); x++) for (const s of NET.grid.get(x + "," + y) || []) if (s.kind === "river" || s.kind === "road") out.add(s); return [...out]; }
export function chunkTiles(cx, cy) { const n = CHUNK + 2, t = new Uint8Array(n * n), x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t[j * n + i] = tileAt(x0 + i, y0 + j); return t; }

// ---------- anéis e territórios geográficos ----------
export function ringRadius(c, ring, th) { const p = c.ph[ring - 1], R = c.r[ring - 1]; return R * (1 + .16 * Math.sin(3 * th + p[0]) + .09 * Math.sin(5 * th + p[1]) + .05 * Math.sin(11 * th + p[2])); }
export const TIER_NAME = { 1: "Zona Segura", 2: "Fronteira Disputada — PvP Opcional", 3: "Zona Vermelha — PvP Liberado" };
export function cellAt(x, y) { const t = NET.territory; if (!t) return null; const i = Math.floor((x + OX) / t.cell), j = Math.floor((y + OY) / t.cell); if (i < 0 || j < 0 || i >= t.w || j >= t.h) return null;
  const ch = t.rows[j].charCodeAt(i) - 97; if (ch < 0 || ch > 40) return null; return { city: NET.cities[Math.floor(ch / 3)], ring: ch % 3 + 1 }; }
export function zoneAt(x, y) {
  if (x >= HEART.x && y >= HEART.y && x < HEART.x + HEART.w && y < HEART.y + HEART.h) return { city: NET.cities.find(c => c.heart) || null, ring: 1 };
  const c = cellAt(x, y); if (c) return c;
  let best = null, bd = 1e18; for (const ci of NET.cities) { const d = Math.hypot(x - (ci.heart ? 150 : ci.x), y - (ci.heart ? 100 : ci.y)); if (d < bd) { bd = d; best = ci; } }
  return { city: best, ring: 3 };
}
export function regionName(z) { if (!z || !z.city) return "Mar aberto"; return (z.city.regions && z.city.regions[z.ring - 1]) || z.city.name; }

// ---------- objetos de um pedaço (árvores, rochas, casas, marcos) — determinístico ----------
const TREE = {
  [B.PLAINS]: [["oak", .017], ["oak_small", .016], ["tree_small", .014], ["tree_round", .016]],
  [B.FIELD]: [["oak_small", .011], ["tree_small", .009], ["tree_round", .009]],
  [B.FOREST]: [["pine", .105], ["pine_small", .055], ["oak", .058], ["oak_small", .052], ["tree_round", .053]],
  [B.ANCIENT]: [["sylvana_colossal", .028, null, .75], ["oak", .095, "ancient", 1.35], ["pine", .075, "ancient"], ["oak_small", .05, "ancient"], ["willow", .038]],
  [B.SWAMP]: [["dead", .032], ["swamp_willow", .022], ["willow", .012, "swamp"]],
  [B.MANGROVE]: [["swamp_willow", .045], ["willow", .025, "swamp"], ["dead", .022]],
  [B.DESERT]: [["palm_date", .009], ["cactus_saguaro", .024]],
  [B.CANYON]: [["cliff_rock", .032], ["boulder", .026]],
  [B.MOUNTAIN]: [["peak_snow", .022], ["cliff_rock", .034], ["pine", .028], ["boulder", .022]],
  [B.VOLCANIC]: [["peak_volc", .024], ["cliff_rock", .028, "ember"], ["dead_shadow", .025], ["boulder", .02, "ember"]],
  [B.TUNDRA]: [["peak_snow", .032], ["pine_small", .032, "snow"], ["pine", .034, "snow"], ["boulder", .03, "snow"]],
  [B.GLACIER]: [["peak_snow", .024, "ice"], ["boulder", .024, "ice"]],
  [B.DARK]: [["dead_shadow", .022], ["ruin_wall", .032], ["boulder", .015, "void"]],
  [B.BEACH]: [["palm_coco", .015]],
  [B.CLIFF]: [["cliff_rock", .045], ["boulder", .02]],
};
export const NATURE = new Set(["tree", "palm", "cactus", "peak", "ruinwall"]);
export const isNature = o => NATURE.has(o.kind) && !o.label && !o.door;
export function natureSpriteKeys() {
  const set = new Set(); const add = (sp, t) => set.add(sp + "|" + (t || ""));
  for (const list of Object.values(TREE)) for (const [sp, , t] of list) add(sp, t);
  for (const d of Object.values(DECOR)) for (const sp of d.s) add(sp, d.t);
  for (const [sp, t] of [["oak", "ancient"], ["pine", "ancient"], ["pine", "deep"], ["pine_small", "deep"], ["dead", "void"], ["dead_shadow", null], ["tree_round", null], ["oak_small", "ancient"], ["pine", "snow"], ["boulder", "ice"], ["boulder", "ember"], ["palm_date", null], ["palm_coco", null], ["cactus_saguaro", null], ["peak_snow", null], ["peak_volc", null], ["cliff_rock", null], ["ruin_wall", null], ["swamp_willow", null], ["sylvana_colossal", null], ["giant_mushrooms", null], ["desert_bones", null]]) add(sp, t);
  return [...set];
}
export const treeDensity = b => (TREE[b] || []).reduce((a, t) => a + t[1], 0);
function clearAt(x, y) {
  if (!NET.ready) return false; const c = NET.clear || (NET.clear = new Map());
  if (!NET.clearBuilt) {
    NET.clearBuilt = true;
    for (const h of NET.hunts || []) for (let dy = -h.r - 2; dy <= h.r + 2; dy++) for (let dx = -h.r - 2; dx <= h.r + 2; dx++) if (dx * dx + dy * dy <= (h.r + 2) ** 2) c.set((h.cx + dx) + "," + (h.cy + dy), 1);
    for (const n of NET.nodes || []) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) c.set((n.x + dx) + "," + (n.y + dy), 1);
  }
  return c.has(x + "," + y);
}
const DECOR = {
  [B.PLAINS]: { p: .052, s: ["flower_yellow2", "flower_red", "flower_yellow", "bush3", "berry_bush", "bush2"] },
  [B.FIELD]: { p: .062, s: ["bush", "flower_yellow", "flower_yellow2", "hay", "flower_red"] },
  [B.FOREST]: { p: .095, s: ["bush_dark", "bush_dark2", "mushroom", "mushroom_red", "stump", "log", "bush"] },
  [B.ANCIENT]: { p: .10, s: ["bush_dark", "bush_dark2", "giant_mushrooms", "mushroom_red", "moss_rock", "stump"] },
  [B.SWAMP]: { p: .085, s: ["reed", "cattail", "dead_shrub", "mushroom", "lily"] },
  [B.MANGROVE]: { p: .085, s: ["reed", "cattail", "bush_dark", "lily2"] },
  [B.DESERT]: { p: .03, s: ["desert_bones", "dead_shrub", "bone_pile", "skull"] },
  [B.CANYON]: { p: .036, s: ["dead_shrub", "moss_rock2", "desert_bones"] },
  [B.MOUNTAIN]: { p: .055, s: ["moss_rock", "moss_rock2", "pine_small"] },
  [B.TUNDRA]: { p: .045, s: ["pine_small", "moss_rock"], t: "snow" },
  [B.VOLCANIC]: { p: .035, s: ["dead_shrub", "bone", "moss_rock2"] },
  [B.DARK]: { p: .055, s: ["dead_shrub", "bone", "skull", "bone_pile"] },
  [B.BEACH]: { p: .015, s: ["dead_shrub", "moss_rock"] },
};
export function chunkObjects(cx, cy, tiles) {
  const out = [], n = CHUNK + 2; tiles = tiles || chunkTiles(cx, cy);
  for (let j = 1; j <= CHUNK; j++) for (let i = 1; i <= CHUNK; i++) {
    const b = tiles[j * n + i]; const x = cx * CHUNK + i - 1, y = cy * CHUNK + j - 1; const list = TREE[b]; if (!list) continue;
    if (x >= HEART.x && y >= HEART.y && x < HEART.x + HEART.w && y < HEART.y + HEART.h) continue;
    if (clearAt(x, y)) continue;
    let near = false; for (const o of [tiles[j * n + i - 1], tiles[j * n + i + 1], tiles[(j - 1) * n + i], tiles[(j + 1) * n + i]]) if (o === B.ROAD || o === B.BRIDGE || o === B.CITY || o === B.RIVER || o === B.DOCK || isBlocked(o)) near = true; if (near) continue;
    const r = hashTile(x, y, 3); let acc = 0;
    for (const [sp, p, tint, big] of list) {
      acc += p;
      if (r < acc) {
        const kind = sp === "palm_date" || sp === "palm_coco" ? "palm" : sp === "cactus_saguaro" ? "cactus" : sp === "ruin_wall" ? "ruinwall" : sp === "peak_snow" || sp === "peak_volc" ? "peak" : "tree";
        out.push({ x, y, kind, sprite: sp, tint: tint || null, big: big || (sp === "pine" || sp === "oak" ? .9 + hashTile(x, y, 5) * .35 : 1), solid: true, proc: true });
        break;
      }
    }
  }
  for (let j = 1; j <= CHUNK; j++) for (let i = 1; i <= CHUNK; i++) {
    const b = tiles[j * n + i], list = DECOR[b]; if (!list) continue; const x = cx * CHUNK + i - 1, y = cy * CHUNK + j - 1, r = hashTile(x, y, 8);
    if (r > list.p) continue; if (x >= HEART.x && y >= HEART.y && x < HEART.x + HEART.w && y < HEART.y + HEART.h) continue;
    const sp = list.s[Math.floor(hashTile(x, y, 9) * list.s.length)]; out.push({ x, y, kind: "tree", sprite: sp, tint: list.t || null, big: .8 + hashTile(x, y, 10) * .3, solid: false, decor: true, proc: true });
  }
  // busca O(1) de construções, extras e marcos do chunk
  if (NET.ready) {
    const pre = NET.objChunks.get(cx + "," + cy);
    if (pre) for (const o of pre) out.push(o);
  }
  return out;
}
export const chunkKey = (cx, cy) => cx + "," + cy;
