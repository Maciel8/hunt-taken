// Web Worker: desenha os pedaços do continente (32×32 tiles) fora da thread principal.
// Mesmas texturas e escala do mapa original (1 texel = 1 px de mundo no nível "hi"); estradas e rios por distância
// exata até a linha (bordas suaves, margem de terra e grama, ponte de tábuas), como o art.js desenha no coração.
// Níveis: hi = 32 px/tile (zoom perto), mid = 8 px/tile (zoom médio, texturas reduzidas), lod = 1 px/tile (bem longe).
// Cache L2: IndexedDB (WebP por pedaço e nível, por versão do build).
import { initNet, chunkTiles, chunkGround, segsNear, B, CHUNK, OX, OY, vnoise, hashTile, isWater, BIOME_RGB, NET } from "./terrain.js";
const T = 32;
let TEX = {}, MIP = {}, VERSION = "dev", db = null;

// ---------- texturas (vêm do jogo, já recoloridas pelo art.js) ----------
function mip(t, f) { const w = Math.max(1, t.w / f | 0), h = Math.max(1, t.h / f | 0), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = ((y * f + j) * t.w + x * f + i) * 4; r += t.data[k]; g += t.data[k + 1]; b += t.data[k + 2]; }
    const o = (y * w + x) * 4, n = f * f; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255; } return { w, h, data: d }; }
const TEX_OF = { [B.BEACH]: "sand", [B.CLIFF]: "rock", [B.PLAINS]: "grass", [B.FIELD]: "grass_gold", [B.FOREST]: "grass_dark", [B.ANCIENT]: "grass_dark", [B.SWAMP]: "swamp_red", [B.MANGROVE]: "swamp",
  [B.DESERT]: "sand", [B.CANYON]: "earth", [B.MOUNTAIN]: "stone_dark", [B.PEAK]: "rock", [B.VOLCANIC]: "stone_dark", [B.TUNDRA]: "snow", [B.GLACIER]: "snow", [B.ICE]: "snow", [B.DARK]: "ruins",
  [B.ROAD]: "dirt", [B.BRIDGE]: "dirt", [B.CITY]: "plaza", [B.LAVA]: "lava", [B.DOCK]: "bridge", [B.LAKE]: "water", [B.RIVER]: "water", [B.MURKY]: "swamp" };
// tons por bioma sobre a textura (o coração usa as mesmas texturas; aqui só diferencia biomas que não existem lá)
const TONE = { [B.ANCIENT]: [.85, .95, 1.05], [B.VOLCANIC]: [.62, .55, .55], [B.GLACIER]: [.9, .97, 1.06], [B.ICE]: [.82, .92, 1.08], [B.PEAK]: [.85, .85, .9], [B.MURKY]: [.7, .75, .55] };
function tex(name, f, x, y) { const t = f === 1 ? TEX[name] : (MIP[name] && MIP[name][f]); if (!t) return [120, 160, 80]; const tx = ((x % t.w) + t.w) % t.w, ty = ((y % t.h) + t.h) % t.h, i = (ty * t.w + tx) * 4; return [t.data[i], t.data[i + 1], t.data[i + 2]]; }
const OCEAN = { [B.DEEP]: [16, 34, 70], [B.OCEAN]: [26, 58, 106], [B.SHALLOW]: [48, 110, 150] };
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
  const city = NET.cities.find(c => !c.heart && Math.abs(c.x - (tx0 + CHUNK / 2)) < c.plaza + CHUNK && Math.abs(c.y - (ty0 + CHUNK / 2)) < c.plaza + CHUNK);
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
      else if (b === B.CITY && city) { const dx = tx0 + fx - city.x - .5, dy = ty0 + fy - city.y - .5, rr = Math.hypot(dx, dy);
        const street = rr < 8.5 || Math.abs(rr - 16.5) < 1.3 || Math.abs(rr - 28.5) < 1.3 || ((Math.abs(dx) < 1.4 || Math.abs(dy) < 1.4) && rr < city.plaza);
        if (rr < 8.5) [r, g, bl] = tex("plaza", f, wpx, wpy); else if (street) [r, g, bl] = tex("cobble", f, wpx, wpy); else { [r, g, bl] = tex("grass", f, wpx, wpy); r = r * .92 + 8; g = g * .98 + 6; bl *= .85; }
        if (street && rr >= 8.5) { const edge = Math.min(Math.abs(Math.abs(rr - 16.5) - 1.3), Math.abs(Math.abs(rr - 28.5) - 1.3), Math.abs(Math.abs(dx) - 1.4), Math.abs(Math.abs(dy) - 1.4)); if (edge < .12) { r *= .7; g *= .68; bl *= .66; } } }
      else { [r, g, bl] = tex(TEX_OF[b] || "grass", f, wpx, wpy); const tn = TONE[b]; if (tn) { r *= tn[0]; g *= tn[1]; bl *= tn[2]; }
        if (b === B.LAKE) { let shore = 0; for (const [dx, dy] of [[.5, 0], [-.5, 0], [0, .5], [0, -.5]]) { const nb = at(fx + ox + dx, fy + oy + dy); if (!isWater(nb) && nb !== B.HEART) shore = 1; }
          if (shore) { r = 0x4a; g = 0x7a; bl = 0x3e; } } }
      // rios: margem de terra, faixa de grama, água, fundo (mesmas medidas e cores do coração)
      let eRiv = 9; if (dRiv) { eRiv = lerpG(dRiv, px, py);
        if (eRiv < .69) { if (eRiv > .35) { r = 0x6b; g = 0x52; bl = 0x33; } else if (eRiv > 0) { r = 0x4a; g = 0x7a; bl = 0x3e; } else { [r, g, bl] = tex("water", f, wpx, wpy); if (eRiv < -.33) { r = r * .65 + 7; g = g * .65 + 17.5; bl = bl * .65 + 28; } } } }
      // estradas: borda escura, terra, franja; em cima de água vira ponte de tábuas
      if (dRoad) { const dr = lerpG(dRoad, px, py);
        if (dr < .95) { const wet = eRiv < .69 || isWater(b);
          if (wet && dr < .9) { [r, g, bl] = tex("bridge", f, wpx, wpy); if (dr > .76) { r *= .55; g *= .5; bl *= .45; } }
          else if (dr < .75) [r, g, bl] = tex("dirt", f, wpx, wpy);
          else { const a = dr < .875 ? .35 : 0; if (a) { const t2 = tex("dirt", f, wpx, wpy); r = r * (1 - a) + t2[0] * a; g = g * (1 - a) + t2[1] * a; bl = bl * (1 - a) + t2[2] * a; } r = r * .6 + 20; g = g * .6 + 14; bl = bl * .6 + 7; } } }
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = 255;
    }
  }
  return img;
}
// nível bem afastado: 1 pixel por tile
function renderLod(cx, cy) {
  const tiles = chunkTiles(cx, cy), n = CHUNK + 2, img = new ImageData(CHUNK, CHUNK), d = img.data;
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) { const b = tiles[(j + 1) * n + i + 1], o = (j * CHUNK + i) * 4; if (b === B.HEART) { d[o + 3] = 0; continue; }
    const c = BIOME_RGB[b] || [90, 140, 70], x = cx * CHUNK + i, y = cy * CHUNK + j, fv = .92 + (vnoise(x / 5, y / 5, 621) - .5) * .16 + (hashTile(x, y, 623) - .5) * .06;
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
    initNet(m.net); TEX = m.tex; for (const k in TEX) MIP[k] = { 4: mip(TEX[k], 4) }; VERSION = m.version; db = await openDB();
    if (db) { const v = await new Promise(res => { try { const r = db.transaction("meta").objectStore("meta").get("v"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (er) { res(null); } });
      if (v !== VERSION) { await txn("c", "readwrite", s => s.clear()); await txn("meta", "readwrite", s => s.put(VERSION, "v")); } }
    postMessage({ type: "ready" }); return;
  }
  if (m.type === "lod") { const bmp = await createImageBitmap(renderLod(m.cx, m.cy)); postMessage({ type: "lod", cx: m.cx, cy: m.cy, g: bmp }, [bmp]); return; }
  if (m.type === "chunk") {
    const tier = m.tier || "hi", k = tier + ":" + m.cx + "," + m.cy;
    const hit = await idbGet(k);
    if (hit) { try { const g = await createImageBitmap(hit); postMessage({ type: "chunk", tier, cx: m.cx, cy: m.cy, g, src: "L2" }, [g]); return; } catch (er) { } }
    const img = renderChunk(m.cx, m.cy, PXOF[tier]); const c = new OffscreenCanvas(img.width, img.height); c.getContext("2d").putImageData(img, 0, 0);
    const g = await createImageBitmap(c);
    postMessage({ type: "chunk", tier, cx: m.cx, cy: m.cy, g, src: "gen" }, [g]);
    try { const blob = await c.convertToBlob({ type: "image/webp", quality: .9 }); if (db) await txn("c", "readwrite", s => s.put(blob, k)); } catch (er) { }
  }
};
