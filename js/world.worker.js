// Web Worker: desenha os pedaços do continente (32×32 tiles) fora da thread principal.
// Mesmas texturas e escala do mapa original (1 texel = 1 px de mundo no nível "hi"); estradas e rios por distância
// exata até a linha (bordas suaves, margem de terra e grama, ponte de tábuas), como o art.js desenha no coração.
// Níveis: hi = 32 px/tile (zoom perto), mid = 8 px/tile (zoom médio, texturas reduzidas), lod = 1 px/tile (bem longe).
// Cache L2: IndexedDB (WebP por pedaço e nível, por versão do build).
import { isNature, initNet, chunkTiles, chunkGround, chunkObjects, segsNear, B, CHUNK, OX, OY, vnoise, hashTile, isWater, BIOME_RGB, NET, cityWater } from "./terrain.js";
const T = 32;
let TEX = {}, MIP = {}, VERSION = "dev", db = null, SPR = {};

// ---------- texturas (vêm do jogo, já recoloridas pelo art.js) ----------
function mip(t, f) { const w = Math.max(1, t.w / f | 0), h = Math.max(1, t.h / f | 0), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = ((y * f + j) * t.w + x * f + i) * 4; r += t.data[k]; g += t.data[k + 1]; b += t.data[k + 2]; }
    const o = (y * w + x) * 4, n = f * f; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255; } return { w, h, data: d }; }
const TEX_OF = { [B.BEACH]: "sand", [B.CLIFF]: "rock", [B.PLAINS]: "grass", [B.FIELD]: "grass_gold", [B.FOREST]: "grass_dark", [B.ANCIENT]: "grass_dark", [B.SWAMP]: "swamp_red", [B.MANGROVE]: "swamp",
  [B.DESERT]: "sand", [B.CANYON]: "earth", [B.MOUNTAIN]: "stone_dark", [B.PEAK]: "rock", [B.VOLCANIC]: "stone_dark", [B.TUNDRA]: "snow", [B.GLACIER]: "snow", [B.ICE]: "snow", [B.DARK]: "ruins",
  [B.ROAD]: "dirt", [B.BRIDGE]: "dirt", [B.CITY]: "plaza", [B.LAVA]: "lava", [B.DOCK]: "bridge", [B.LAKE]: "water", [B.RIVER]: "water", [B.MURKY]: "swamp" };
// tons por bioma sobre a textura (o coração usa as mesmas texturas; aqui só diferencia biomas que não existem lá)
const TONE = { [B.ANCIENT]: [.85, .95, 1.05], [B.VOLCANIC]: [.62, .55, .55], [B.GLACIER]: [.9, .97, 1.06], [B.ICE]: [.82, .92, 1.08], [B.PEAK]: [.85, .85, .9], [B.MURKY]: [.7, .75, .55] };
// no zoom médio pega o texel mais próximo (igual ao coração desenhado reduzido), não a média
function tex(name, f, x, y) { if (f !== 1) { x *= f; y *= f; f = 1; } const t = TEX[name]; if (!t) return [120, 160, 80]; const tx = ((x % t.w) + t.w) % t.w, ty = ((y % t.h) + t.h) % t.h, i = (ty * t.w + tx) * 4; return [t.data[i], t.data[i + 1], t.data[i + 2]]; }
// chão temático de cada cidade: base, ruas e praça
const CITY_TH = { valen: { base: "grass", street: "cobble", plaza: "plaza" }, khazad: { base: "stone_dark", street: "cobble", plaza: "rock", tint: [.85, .82, .8] },
  solkar: { base: "sand", street: "plaza", plaza: "plaza", tint: [1.04, .98, .86] }, sylvana: { base: "grass_dark", street: "bridge", plaza: "grass" }, nocthar: { base: "ruins", street: "cobble", plaza: "ruins", tint: [.82, .74, .98] } };
const OCEAN = { [B.DEEP]: [16, 34, 70], [B.OCEAN]: [26, 58, 106], [B.SHALLOW]: [48, 110, 150] };
function inPoly(P, x, y) { if (!P) return true; let w = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) w = !w; } return w; }
function segD(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }

// ---------- desenho de um pedaço ----------
function renderChunk(cx, cy, PX) {
  const N = CHUNK * PX, f = T / PX;                       // f: quantos px de mundo cada pixel cobre (1 no hi, 4 no mid)
  const ground = chunkGround(cx, cy), n = CHUNK + 2;
  const img = new ImageData(N, N), d = img.data;
  const gx0 = cx * CHUNK + OX, gy0 = cy * CHUNK + OY, tx0 = cx * CHUNK, ty0 = cy * CHUNK;
  const segs = segsNear(tx0 - 4, ty0 - 4, tx0 + CHUNK + 4, ty0 + CHUNK + 4);
  const rivers = segs.filter(s => s.kind === "river"), roads = segs.filter(s => s.kind === "road");
  // deformação das bordas entre biomas (amostrada numa grade e interpolada)
  const STEP = Math.max(2, PX / 4), GW = Math.ceil(N / STEP) + 2, wx = new Float32Array(GW * GW), wy = new Float32Array(GW * GW);
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) { const fx = gx0 + i * STEP / PX, fy = gy0 + j * STEP / PX;
    wx[j * GW + i] = (vnoise(fx * .9, fy * .9, 501) - .5) * .95 + (vnoise(fx * 3.3, fy * 3.3, 503) - .5) * .4;
    wy[j * GW + i] = (vnoise(fx * .9, fy * .9, 502) - .5) * .95 + (vnoise(fx * 3.3, fy * 3.3, 504) - .5) * .4; }
  const at = (fx, fy) => { const ix = Math.max(0, Math.min(n - 1, Math.floor(fx) + 1)), iy = Math.max(0, Math.min(n - 1, Math.floor(fy) + 1)); return ground[iy * n + ix]; };
  // distância a rios/estradas calculada numa grade (2 px no hi) e interpolada: rápido e liso
  const DS = PX >= 16 ? 4 : 1, DW = Math.ceil(N / DS) + 2, dRiv = rivers.length ? new Float32Array(DW * DW) : null, dRoad = roads.length ? new Float32Array(DW * DW) : null;
  for (let j = 0; j < DW; j++) for (let i = 0; i < DW; i++) { const x = tx0 + i * DS / PX, y = ty0 + j * DS / PX;
    if (dRiv) { let e = 9; for (const s of rivers) { const v = segD(x, y, s.a, s.b) - s.w; if (v < e) e = v; } dRiv[j * DW + i] = e; }
    if (dRoad) { let e = 9; for (const s of roads) { const v = segD(x, y, s.a, s.b); if (v < e) e = v; } dRoad[j * DW + i] = e; } }
  const lerpG = (G, px, py) => { const gi = px / DS, gj = py / DS, i0 = Math.min(DW - 2, gi | 0), j0 = Math.min(DW - 2, gj | 0), ti = gi - i0, tj = gj - j0, k = j0 * DW + i0;
    return (G[k] * (1 - ti) + G[k + 1] * ti) * (1 - tj) + (G[k + DW] * (1 - ti) + G[k + DW + 1] * ti) * tj; };
  // cidade perto deste pedaço (ruas de pedra sobre grama, como a Vila de Arken)
  const city = NET.cities.find(c => !c.heart && Math.abs(c.x - (tx0 + CHUNK / 2)) < (c.rx || c.plaza) + CHUNK && Math.abs(c.y - (ty0 + CHUNK / 2)) < (c.ry || c.plaza) + CHUNK);
  const TH = city && CITY_TH[city.theme];
  for (let py = 0; py < N; py++) {
    const gj = py / STEP, j0 = Math.min(GW - 2, gj | 0), tj = gj - j0;
    for (let px = 0; px < N; px++) {
      const gi = px / STEP, i0 = Math.min(GW - 2, gi | 0), ti = gi - i0, k = j0 * GW + i0;
      const ox = (wx[k] * (1 - ti) + wx[k + 1] * ti) * (1 - tj) + (wx[k + GW] * (1 - ti) + wx[k + GW + 1] * ti) * tj;
      const oy = (wy[k] * (1 - ti) + wy[k + 1] * ti) * (1 - tj) + (wy[k + GW] * (1 - ti) + wy[k + GW + 1] * ti) * tj;
      const fx = (px + .5) / PX, fy = (py + .5) / PX, own = at(fx, fy);
      const firm = own === B.CITY || own === B.DOCK;
      let b = firm ? at(fx + ox * .25, fy + oy * .25) : at(fx + ox, fy + oy);
      if (b === B.HEART && own !== B.HEART) b = own;
      const o = (py * N + px) * 4;
      if (b === B.HEART) { d[o + 3] = 0; continue; }
      const wpx = tx0 * (T / f) + px, wpy = ty0 * (T / f) + py;      // coordenada de textura (mesma origem do coração)
      let r, g, bl;
      if (OCEAN[b]) { [r, g, bl] = OCEAN[b]; const sh = (vnoise((gx0 + fx) * 1.7, (gy0 + fy) * 1.7, 511) - .5) * 18; r += sh; g += sh; bl += sh * 1.2;
        let shore = false; for (const [dx, dy] of [[.45, 0], [-.45, 0], [0, .45], [0, -.45]]) { const nb = at(fx + ox + dx, fy + oy + dy); if (!isWater(nb) && nb !== B.HEART) { shore = true; break; } }
        if (shore) { const fo = .45 + vnoise((gx0 + fx) * 6, (gy0 + fy) * 6, 513) * .4; r += (235 - r) * fo; g += (245 - g) * fo; bl += (250 - bl) * fo; }
        else if (hashTile(Math.floor(wpx * f / 8), Math.floor(wpy * f / 8), 7) > .996) { r = g = bl = 230; } }
      else if (city && (b === B.CITY || b === B.RIVER || b === B.LAVA || b === B.MURKY || b === B.BRIDGE) && cityWater(city, tx0 + fx, ty0 + fy)) {
        // canais / lava / riacho / fosso da cidade, com ponte onde a rua cruza (ferro em Khazad, tronco em Sylvana, madeira no resto)
        const cw = cityWater(city, tx0 + fx, ty0 + fy);
        if (cw.bridge) { [r, g, bl] = tex("bridge", f, wpx, wpy); if (city.theme === "khazad") { const l = (r + g + bl) / 3; r = g = l * .55; bl = l * .62; } else if (city.theme === "nocthar") { r *= .6; g *= .5; bl *= .75; } }
        else if (cw.t === "lava") { [r, g, bl] = tex("lava", f, wpx, wpy); } else { [r, g, bl] = tex("water", f, wpx, wpy); if (cw.t === "murky") { r = r * .45 + 30; g = g * .35 + 22; bl = bl * .55 + 40; } } }
      else if (b === B.CITY && city) { const wx3 = tx0 + fx, wy3 = ty0 + fy, dx = wx3 - city.x - .5, dy = wy3 - city.y - .5, inW = inPoly(city.wall, wx3, wy3);
        const mx = ((dx % 16) + 16) % 16, my = ((dy % 14) + 14) % 14, plaza = Math.abs(dx) < 11 && Math.abs(dy) < 9, ave = Math.abs(dx) < 2.2 || Math.abs(dy) < 2.2, grid = Math.min(mx, 16 - mx) < 1.3 || Math.min(my, 14 - my) < 1.3;
        const street = inW && (ave || grid);
        if (inW && plaza) [r, g, bl] = tex(TH.plaza, f, wpx, wpy); else if (street) [r, g, bl] = tex(TH.street, f, wpx, wpy); else [r, g, bl] = tex(TH.base, f, wpx, wpy);
        const k = TH.tint; if (k) { r *= k[0]; g *= k[1]; bl *= k[2]; }
        if (street && !plaza) { const e1 = ave ? Math.min(Math.abs(Math.abs(dx) - 2.2), Math.abs(Math.abs(dy) - 2.2)) : Math.min(Math.abs(Math.min(mx, 16 - mx) - 1.3), Math.abs(Math.min(my, 14 - my) - 1.3)); if (e1 < .14) { r *= .7; g *= .68; bl *= .66; } }
        else if (inW && plaza && (Math.abs(Math.abs(dx) - 11) < .15 || Math.abs(Math.abs(dy) - 9) < .15)) { r *= .7; g *= .68; bl *= .66; } }
      else { [r, g, bl] = tex(TEX_OF[b] || "grass", f, wpx, wpy); const tn = TONE[b]; if (tn) { r *= tn[0]; g *= tn[1]; bl *= tn[2]; }
        if (b === B.LAKE) { let shore = 0; for (const [dx, dy] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) { const nb = at(fx + ox + dx, fy + oy + dy); if (!isWater(nb) && nb !== B.HEART) shore = 1; }
          if (shore) { r = 0x4a; g = 0x7a; bl = 0x3e; } } }
      // rios: margem de terra, faixa de grama, água, fundo (mesmas medidas e cores do coração)
      let eRiv = 9; if (dRiv) { eRiv = lerpG(dRiv, px, py);
        if (eRiv < .69) { if (eRiv > .35) { r = 0x6b; g = 0x52; bl = 0x33; } else if (eRiv > 0) { r = 0x4a; g = 0x7a; bl = 0x3e; } else { [r, g, bl] = tex("water", f, wpx, wpy); if (eRiv < -.33) { r = r * .65 + 7; g = g * .65 + 17.5; bl = bl * .65 + 28; } } } }
      // estradas: borda escura, terra, franja; em cima de água vira ponte de tábuas
      if (dRoad && (b !== B.CITY || !city || !inPoly(city.wall, tx0 + fx, ty0 + fy))) { const dr = lerpG(dRoad, px, py);
        if (dr < .95) { const wet = eRiv < .69 || isWater(b);
          if (wet && dr < .9) { [r, g, bl] = tex("bridge", f, wpx, wpy); if (dr > .76) { r *= .55; g *= .5; bl *= .45; } }
          else if (dr < .75) [r, g, bl] = tex("dirt", f, wpx, wpy);
          else { const a = dr < .875 ? .35 : 0; if (a) { const t2 = tex("dirt", f, wpx, wpy); r = r * (1 - a) + t2[0] * a; g = g * (1 - a) + t2[1] * a; bl = bl * (1 - a) + t2[2] * a; } r = r * .6 + 20; g = g * .6 + 14; bl = bl * .6 + 7; } } }
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
    }
  }
  return img;
}
// zoom médio: árvores, rochas e enfeites desenhados dentro do pedaço (inclui os que vêm dos vizinhos e invadem por cima)
const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
function bake(g, cx, cy, PX) {
  const s = PX / 32, x0 = cx * CHUNK, y0 = cy * CHUNK, list = [];
  for (let dy = 0; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (const o of chunkObjects(cx + dx, cy + dy)) if (isNature(o)) list.push(o);
  list.sort((a, b) => a.y - b.y); g.imageSmoothingEnabled = false;
  for (const o of list) { const px = (o.x - x0 + .5) * PX, by = (o.y - y0 + 1) * PX; if (px < -80 * s || px > CHUNK * PX + 80 * s || by < 0 || by > CHUNK * PX + 140 * s) continue;
    if (o.kind === "tree") { const im = SPR[o.sprite + "|" + (o.tint || "")] || SPR[o.sprite + "|"]; if (!im) continue; const sc = (o.big || 1) * s, w = im.width * sc, h = im.height * sc;
      if (hsh(o.x, o.y) % 2 === 0) { g.save(); g.translate(px, 0); g.scale(-1, 1); g.drawImage(im, -w / 2, by + 2 * s - h, w, h); g.restore(); } else g.drawImage(im, px - w / 2, by + 2 * s - h, w, h); }
    else if (o.kind === "palm") { g.strokeStyle = "#7a5a32"; g.lineWidth = 6 * s; g.beginPath(); g.moveTo(px, by); g.quadraticCurveTo(px + 10 * s, by - 30 * s, px + 4 * s, by - 58 * s); g.stroke(); g.fillStyle = "#3f8a3a"; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.beginPath(); g.ellipse(px + (4 + Math.cos(a) * 14) * s, by - (58 - Math.sin(a) * 6) * s, 16 * s, 5 * s, a, 0, 6.283); g.fill(); } }
    else if (o.kind === "cactus") { g.fillStyle = "#4f8a3e"; g.fillRect(px - 5 * s, by - 34 * s, 10 * s, 34 * s); g.fillRect(px - 14 * s, by - 24 * s, 6 * s, 12 * s); g.fillRect(px + 8 * s, by - 28 * s, 6 * s, 14 * s); }
    else if (o.kind === "peak") { const h = hsh(o.x, o.y), w = (30 + h % 14) * s, hh = (34 + (h >>> 6) % 20) * s; g.fillStyle = "#7d8a98"; g.beginPath(); g.moveTo(px - w, by); g.lineTo(px - 2 * s, by - hh); g.lineTo(px + w, by); g.closePath(); g.fill(); g.fillStyle = "#5d6875"; g.beginPath(); g.moveTo(px - 2 * s, by - hh); g.lineTo(px + w, by); g.lineTo(px + 4 * s, by); g.closePath(); g.fill(); g.fillStyle = "#f4f8fb"; g.beginPath(); g.moveTo(px - w * .42, by - hh * .55); g.lineTo(px - 2 * s, by - hh); g.lineTo(px + w * .38, by - hh * .55); g.closePath(); g.fill(); }
    else if (o.kind === "ruinwall") { const h = (18 + hsh(o.x, o.y) % 22) * s; g.fillStyle = "#5c4d6c"; g.fillRect(px - 13 * s, by - h, 26 * s, h); g.fillStyle = "#7e6e90"; g.fillRect(px - 13 * s, by - h, 26 * s, 3 * s); } }
}
// nível bem afastado: 1 pixel por tile
// cor média de cada bioma tirada das MESMAS texturas (com o mesmo tom), pra o zoom distante bater com o perto
const MEANC = {};
function meanOf(b) { if (MEANC[b]) return MEANC[b]; if (OCEAN[b]) return MEANC[b] = OCEAN[b]; const t = TEX[TEX_OF[b] || "grass"]; if (!t) return BIOME_RGB[b] || [90, 140, 70];
  let r = 0, g = 0, bl = 0, n = 0; for (let i = 0; i < t.data.length; i += 16) { r += t.data[i]; g += t.data[i + 1]; bl += t.data[i + 2]; n++; } const tn = TONE[b] || [1, 1, 1]; return MEANC[b] = [r / n * tn[0], g / n * tn[1], bl / n * tn[2]]; }
// nível bem afastado: 1 pixel por tile, mesmas cores médias, árvores escurecem o tile, rio e estrada com as cores de perto
const TMEAN = {}; function texMean(name) { if (TMEAN[name]) return TMEAN[name]; const t = TEX[name]; if (!t) return [120, 120, 120]; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < t.data.length; i += 16) { r += t.data[i]; g += t.data[i + 1]; b += t.data[i + 2]; n++; } return TMEAN[name] = [r / n, g / n, b / n]; }
function cityStreetLod(c, x, y) { const dx = x - c.x, dy = y - c.y; if (Math.abs(dx) < 2 || Math.abs(dy) < 2) return true; const mx = ((dx % 16) + 16) % 16, my = ((dy % 14) + 14) % 14; return Math.min(mx, 16 - mx) < 1 || Math.min(my, 14 - my) < 1; }
let CITYC = null;
function renderLod(cx, cy) {
  const tiles = chunkTiles(cx, cy), n = CHUNK + 2, img = new ImageData(CHUNK, CHUNK), d = img.data, trees = new Uint8Array(CHUNK * CHUNK);
  CITYC = NET.cities.find(c => !c.heart && Math.abs(c.x - (cx + .5) * CHUNK) < (c.rx || 0) + CHUNK && Math.abs(c.y - (cy + .5) * CHUNK) < (c.ry || 0) + CHUNK) || null;
  for (const o of chunkObjects(cx, cy, tiles)) if (!o.decor) { const i = o.x - cx * CHUNK, j = o.y - cy * CHUNK; if (i >= 0 && j >= 0 && i < CHUNK && j < CHUNK) trees[j * CHUNK + i] = 1; }
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) { const b = tiles[(j + 1) * n + i + 1], o = (j * CHUNK + i) * 4; if (b === B.HEART) { d[o + 3] = 0; continue; }
    const x = cx * CHUNK + i, y = cy * CHUNK + j; let c = b === B.RIVER ? meanOf(B.LAKE) : b === B.ROAD ? meanOf(B.ROAD) : meanOf(b);
    if (b === B.CITY && CITYC) { const th = CITY_TH[CITYC.theme]; c = texMean(th ? th.base : "grass"); if (th && th.tint) c = [c[0] * th.tint[0], c[1] * th.tint[1], c[2] * th.tint[2]]; if (cityStreetLod(CITYC, x, y)) c = texMean(th ? th.street : "cobble"); }
    let fv = .95 + (vnoise(x / 5, y / 5, 621) - .5) * .12 + (hashTile(x, y, 623) - .5) * .05; if (trees[j * CHUNK + i]) fv *= .62;
    d[o] = c[0] * fv; d[o + 1] = c[1] * fv; d[o + 2] = c[2] * fv; d[o + 3] = 255; }
  return img;
}

// ---------- IndexedDB (cache L2) ----------
function openDB() { return new Promise(res => { try { const rq = indexedDB.open("ht-chunks", 2); rq.onupgradeneeded = () => { for (const s of ["c", "meta"]) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch (e) { res(null); } }); }
const txn = (store, mode, fn) => new Promise(res => { try { const t = db.transaction(store, mode), s = t.objectStore(store); fn(s); t.oncomplete = () => res(true); t.onerror = () => res(null); } catch (e) { res(null); } });
function idbGet(k) { if (!db) return Promise.resolve(null); return new Promise(res => { try { const r = db.transaction("c").objectStore("c").get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } }); }

const PXOF = { hi: 32, mid: 8 };
onmessage = async e => {
  const m = e.data;
  if (m.type === "init") {
    initNet(m.net); TEX = m.tex; SPR = m.sprites || {}; for (const k in TEX) MIP[k] = { 4: mip(TEX[k], 4) }; VERSION = m.version; db = await openDB();
    if (db) { const v = await new Promise(res => { try { const r = db.transaction("meta").objectStore("meta").get("v"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (er) { res(null); } });
      if (v !== VERSION) { await txn("c", "readwrite", s => s.clear()); await txn("meta", "readwrite", s => s.put(VERSION, "v")); } }
    postMessage({ type: "ready" }); return;
  }
  if (m.type === "view") { VIEW = m; prune(); return; }
  if (m.type === "lod") { QUEUE.set("lod:" + m.cx + "," + m.cy, { kind: "lod", cx: m.cx, cy: m.cy }); pump(); return; }
  if (m.type === "chunk") { const tier = m.tier || "hi"; QUEUE.set(tier + ":" + m.cx + "," + m.cy, { kind: "chunk", tier, cx: m.cx, cy: m.cy }); pump(); }
};
// fila: sempre o pedido mais perto do centro da câmera; o que saiu da tela é descartado (o jogo é avisado)
let VIEW = null, busy = false; const QUEUE = new Map();
const inView = q => !VIEW || (q.cx >= VIEW.x0 && q.cx <= VIEW.x1 && q.cy >= VIEW.y0 && q.cy <= VIEW.y1);
function prune() { const out = []; for (const [k, q] of QUEUE) if (!inView(q)) { QUEUE.delete(k); out.push(k); } if (out.length) postMessage({ type: "dropped", keys: out }); }
async function pump() {
  if (busy) return; busy = true;
  try { while (QUEUE.size) { prune(); if (!QUEUE.size) break; let best = null, bk = null, bd = Infinity; const mx = VIEW ? (VIEW.x0 + VIEW.x1) / 2 : 0, my = VIEW ? (VIEW.y0 + VIEW.y1) / 2 : 0;
      for (const [k, q] of QUEUE) { const d = Math.hypot(q.cx - mx, q.cy - my) + (q.kind === "lod" ? -100 : 0); if (d < bd) { bd = d; best = q; bk = k; } }
      QUEUE.delete(bk); await work(best); } }
  finally { busy = false; }
}
async function work(q) {
  if (q.kind === "lod") { const bmp = await createImageBitmap(renderLod(q.cx, q.cy)); postMessage({ type: "lod", cx: q.cx, cy: q.cy, g: bmp }, [bmp]); return; }
  const k = q.tier + ":" + q.cx + "," + q.cy, hit = await idbGet(k);
  if (hit) { try { const g = await createImageBitmap(hit); postMessage({ type: "chunk", tier: q.tier, cx: q.cx, cy: q.cy, g, src: "L2" }, [g]); return; } catch (er) { } }
  const img = renderChunk(q.cx, q.cy, PXOF[q.tier]); const c = new OffscreenCanvas(img.width, img.height); c.getContext("2d").putImageData(img, 0, 0); if (q.tier === "mid") bake(c.getContext("2d"), q.cx, q.cy, PXOF.mid);
  const g = await createImageBitmap(c); postMessage({ type: "chunk", tier: q.tier, cx: q.cx, cy: q.cy, g, src: "gen" }, [g]);
  c.convertToBlob({ type: "image/webp", quality: .9 }).then(blob => db && txn("c", "readwrite", s2 => s2.put(blob, k))).catch(() => { });
}
