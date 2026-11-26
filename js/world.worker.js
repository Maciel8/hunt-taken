// Web Worker: desenha os pedaços do continente (32×32 tiles) fora da thread principal.
// Cache L2: IndexedDB (PNG por pedaço, por versão do build). O jogo guarda o resultado como ImageBitmap (cache L1).
// Transição entre biomas sem corte reto: cada pixel escolhe o tile por uma posição deformada por ruído (franjas orgânicas),
// espuma onde a água encosta na terra, decoração (tufos, flores, pedrinhas) e uma camada separada de ondas.
import { initNet, chunkTiles, B, CHUNK, OX, OY, vnoise, hashTile, isWater } from "./terrain.js";
const PX = 16;                       // pixels por tile no pedaço (desenhado 2× na tela)
const N = CHUNK * PX;                // 512
let TEX = {}, VERSION = "dev", db = null;

// ---------- texturas (vêm do jogo como ImageData; recolor igual ao art.js) ----------
const lum = (r, g, b) => .3 * r + .59 * g + .11 * b;
function recolor(src, fn) { const d = new Uint8ClampedArray(src.data); for (let i = 0; i < d.length; i += 4) { const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]); d[i] = r; d[i + 1] = g; d[i + 2] = b; } return { w: src.w, h: src.h, data: d }; }
function buildTex(base) {
  const t = { ...base };
  t.grass_gold = recolor(base.grass, (r, g, b) => [r + (170 - r) * .35, g + (160 - g) * .15, b * .7]);
  t.ancient = recolor(base.grass_dark, (r, g, b) => [r * .6 + 18, g * .9 + 14, b * .7 + 26]);
  t.swamp_red = recolor(base.swamp, (r, g, b) => { const l = lum(r, g, b); return [l * .62 + 34, l * .4 + 16, l * .34 + 14]; });
  t.dirt = recolor(base.sand, (r, g, b) => { const l = lum(r, g, b); return [l * .72 + 22, l * .56 + 14, l * .36 + 8]; });
  t.sand_light = recolor(base.sand, (r, g, b) => [r * .95 + 14, g * .95 + 12, b * .9 + 10]);
  t.canyon = recolor(base.sand, (r, g, b) => { const l = lum(r, g, b); return [l * .85 + 40, l * .5 + 18, l * .32 + 6]; });
  t.stone_dark = recolor(base.rock, (r, g, b) => [r * .55, g * .5, b * .52]);
  t.ice = recolor(base.snow, (r, g, b) => [r * .78, g * .88, b]);
  t.dark = recolor(base.grass_dark, (r, g, b) => { const l = lum(r, g, b); return [l * .55 + 30, l * .4 + 18, l * .8 + 40]; });
  t.plaza = recolor(base.cobble, (r, g, b) => { const l = lum(r, g, b); return [l * .9 + 40, l * .85 + 30, l * .75 + 18]; });
  return t;
}
const TEX_OF = { [B.BEACH]: "sand_light", [B.CLIFF]: "rock", [B.PLAINS]: "grass", [B.FIELD]: "grass_gold", [B.FOREST]: "grass_dark", [B.ANCIENT]: "ancient", [B.SWAMP]: "swamp_red", [B.MANGROVE]: "swamp",
  [B.DESERT]: "sand", [B.CANYON]: "canyon", [B.MOUNTAIN]: "rock", [B.PEAK]: "rock", [B.VOLCANIC]: "stone_dark", [B.TUNDRA]: "snow", [B.GLACIER]: "ice", [B.ICE]: "ice", [B.DARK]: "dark", [B.ROAD]: "dirt", [B.CITY]: "plaza" };
const WATER_RGB = { [B.DEEP]: [16, 34, 70], [B.OCEAN]: [26, 58, 106], [B.SHALLOW]: [48, 110, 150], [B.LAKE]: [44, 104, 156], [B.RIVER]: [52, 116, 166], [B.MURKY]: [66, 70, 48] };
// cor média de cada textura (o chão do continente é procedural: média + ruído em 3 escalas, sem a grade das texturas)
const MEAN = {};
function meanOf(name) { if (MEAN[name]) return MEAN[name]; const t = TEX[name] || TEX.grass; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < t.data.length; i += 16) { r += t.data[i]; g += t.data[i + 1]; b += t.data[i + 2]; n++; } return MEAN[name] = [r / n, g / n, b / n]; }
// tons ajustados pra ficar menos saturado que a textura crua
const TONE = { dirt: [1.02, 1, .98], grass: [.86, .92, .8], grass_gold: [1, .96, .84], grass_dark: [.9, .95, .9], ancient: [.95, 1, 1], snow: [1, 1, 1], ice: [1, 1, 1] };
function groundPx(name, gx, gy, px, py) {
  const m = meanOf(name), k = TONE[name] || [1, 1, 1];
  const n1 = vnoise(gx / 7, gy / 7, 601) - .5, n2 = vnoise(gx / 1.6, gy / 1.6, 603) - .5, sp = hashTile(px, py, 605) - .5;
  const f = 1 + n1 * .22 + n2 * .14 + sp * .1;
  return [m[0] * k[0] * f, m[1] * k[1] * f, m[2] * k[2] * f];
}
// 0 colado no coração → 1 a partir de 28 tiles (com franja irregular)
function heartNear(x, y) { const dx = Math.max(-x, 0, x - 300), dy = Math.max(-y, 0, y - 200), d = Math.hypot(dx, dy) + (vnoise(x / 6, y / 6, 611) - .5) * 8; return Math.max(0, Math.min(1, d / 28)); }
function texPx(name, x, y) { const t = TEX[name] || TEX.grass; const tx = ((x % t.w) + t.w) % t.w, ty = ((y % t.h) + t.h) % t.h, i = (ty * t.w + tx) * 4; return [t.data[i], t.data[i + 1], t.data[i + 2]]; }

// ---------- desenho de um pedaço ----------
function renderChunk(cx, cy) {
  const tiles = chunkTiles(cx, cy), n = CHUNK + 2;
  const img = new ImageData(N, N), d = img.data, wav = new ImageData(N / 2, N / 2), wd = wav.data;
  const gx0 = cx * CHUNK + OX, gy0 = cy * CHUNK + OY;
  // deformação calculada a cada 4 px e interpolada (rápido)
  const S = 4, GW = N / S + 1, wx = new Float32Array(GW * GW), wy = new Float32Array(GW * GW);
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) { const fx = gx0 + i * S / PX, fy = gy0 + j * S / PX;
    wx[j * GW + i] = (vnoise(fx * .9, fy * .9, 501) - .5) * .95 + (vnoise(fx * 3.3, fy * 3.3, 503) - .5) * .4;
    wy[j * GW + i] = (vnoise(fx * .9, fy * .9, 502) - .5) * .95 + (vnoise(fx * 3.3, fy * 3.3, 504) - .5) * .4; }
  const tileOf = (fx, fy) => { const ix = Math.max(0, Math.min(n - 1, Math.floor(fx) + 1)), iy = Math.max(0, Math.min(n - 1, Math.floor(fy) + 1)); return tiles[iy * n + ix]; };
  for (let py = 0; py < N; py++) {
    const gj = py / S, j0 = Math.min(GW - 2, gj | 0), tj = gj - j0;
    for (let px = 0; px < N; px++) {
      const gi = px / S, i0 = Math.min(GW - 2, gi | 0), ti = gi - i0, k = j0 * GW + i0;
      const ox = (wx[k] * (1 - ti) + wx[k + 1] * ti) * (1 - tj) + (wx[k + GW] * (1 - ti) + wx[k + GW + 1] * ti) * tj;
      const oy = (wy[k] * (1 - ti) + wy[k + 1] * ti) * (1 - tj) + (wy[k + GW] * (1 - ti) + wy[k + GW + 1] * ti) * tj;
      const fx = px / PX, fy = py / PX; const own = tileOf(fx, fy);
      // estrada, ponte, cidade e docas mantêm borda mais firme (só leve ondulação)
      const firm = own === B.ROAD || own === B.BRIDGE || own === B.CITY || own === B.DOCK;
      let b = firm ? tileOf(fx + ox * .25, fy + oy * .25) : tileOf(fx + ox, fy + oy);
      if (b === B.HEART && own !== B.HEART) b = own;   // a deformação não pode abrir buraco na borda do coração
      const o = (py * N + px) * 4; let r, g, bl, a = 255;
      const wpx = (cx * N + px) * 2, wpy = (cy * N + py) * 2;    // coordenada da textura (mesma escala do coração)
      if (b === B.HEART) { a = 0; r = g = bl = 0; }
      else if (WATER_RGB[b]) {
        [r, g, bl] = WATER_RGB[b]; const sh = (vnoise((gx0 + fx) * 1.7, (gy0 + fy) * 1.7, 511) - .5) * 18; r += sh; g += sh; bl += sh * 1.2;
        // espuma onde encosta na terra
        let shore = false; for (const [dx, dy] of [[.45, 0], [-.45, 0], [0, .45], [0, -.45]]) { const nb = tileOf(fx + ox + dx, fy + oy + dy); if (!isWater(nb) && nb !== B.HEART) { shore = true; break; } }
        if (shore) { const f = .45 + vnoise((gx0 + fx) * 6, (gy0 + fy) * 6, 513) * .4; r += (235 - r) * f; g += (245 - g) * f; bl += (250 - bl) * f; }
        if (b !== B.MURKY && hashTile(wpx >> 3, wpy >> 3, 7) > .992) { const wi = ((py >> 1) * (N / 2) + (px >> 1)) * 4; wd[wi] = wd[wi + 1] = wd[wi + 2] = 255; wd[wi + 3] = 150; }
      } else if (b === B.LAVA) { const h = vnoise((gx0 + fx) * 2.5, (gy0 + fy) * 2.5, 517); r = 200 + h * 55; g = 70 + h * 120; bl = 20; }
      else if (b === B.BRIDGE || b === B.DOCK) { const plank = (Math.floor(wpy / 6) % 2) ? 0 : 14; r = 128 + plank; g = 90 + plank; bl = 56 + plank / 2; if (wpy % 6 === 0) { r -= 30; g -= 26; bl -= 18; } }
      else if (TEX_OF[b] && heartNear(cx * CHUNK + fx, cy * CHUNK + fy) < 1 && b !== B.ROAD && b !== B.CITY) {
        const k = heartNear(cx * CHUNK + fx, cy * CHUNK + fy), t1 = texPx(TEX_OF[b], wpx, wpy), t2 = groundPx(TEX_OF[b], gx0 + fx, gy0 + fy, wpx >> 1, wpy >> 1);
        r = t1[0] * (1 - k) + t2[0] * k; g = t1[1] * (1 - k) + t2[1] * k; bl = t1[2] * (1 - k) + t2[2] * k; }
      else { [r, g, bl] = (b === B.CITY || b === B.CLIFF || b === B.MOUNTAIN || b === B.PEAK) ? texPx(TEX_OF[b], wpx >> 1, wpy >> 1) : groundPx(TEX_OF[b] || "grass", gx0 + fx, gy0 + fy, wpx >> 1, wpy >> 1);
        if (b === B.PEAK) { r *= .78; g *= .78; bl *= .8; }
        // decoração assada no chão: tufos, flores, pedrinhas, brilho na neve
        const tx = cx * CHUNK + Math.floor(fx), ty = cy * CHUNK + Math.floor(fy), hx = hashTile(tx, ty, 21), sx = (px % PX), sy = (py % PX);
        if ((b === B.PLAINS || b === B.FIELD || b === B.FOREST) && hx < .16 && sx > 5 && sx < 10 && sy > 8 && sy < 14) { const m = (sx + sy) % 3 === 0; if (m) { r *= .7; g *= .82; bl *= .7; } }
        if ((b === B.PLAINS || b === B.FIELD) && hx > .97 && sx >= 7 && sx <= 8 && sy >= 7 && sy <= 8) { const fl = [[236, 220, 90], [220, 90, 90], [240, 240, 250]][Math.floor(hashTile(tx, ty, 22) * 3)]; [r, g, bl] = fl; }
        if ((b === B.DESERT || b === B.MOUNTAIN || b === B.CANYON || b === B.VOLCANIC) && hx < .06 && sx >= 6 && sx <= 8 && sy >= 9 && sy <= 10) { r *= .65; g *= .62; bl *= .6; }
        if ((b === B.TUNDRA || b === B.GLACIER) && hx > .98 && sx === 8 && sy === 8) { r = g = bl = 255; }
        if (b === B.ROAD && hashTile(wpx >> 2, wpy >> 2, 23) > .93) { r *= .86; g *= .84; bl *= .82; }
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = bl; d[o + 3] = a;
    }
  }
  return { img, wav };
}

// ---------- IndexedDB (cache L2) ----------
function openDB() { return new Promise(res => { try { const rq = indexedDB.open("ht-chunks", 1); rq.onupgradeneeded = () => { rq.result.createObjectStore("c"); rq.result.createObjectStore("meta"); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch (e) { res(null); } }); }
const tx = (store, mode, fn) => new Promise(res => { try { const t = db.transaction(store, mode), s = t.objectStore(store); const r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => res(null); } catch (e) { res(null); } });
async function idbGet(k) { if (!db) return null; return new Promise(res => { try { const r = db.transaction("c").objectStore("c").get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } }); }
async function idbPut(k, v) { if (db) await tx("c", "readwrite", s => s.put(v, k)); }

async function toBitmaps(img, wav) { const c1 = new OffscreenCanvas(N, N); c1.getContext("2d").putImageData(img, 0, 0); const c2 = new OffscreenCanvas(N / 2, N / 2); c2.getContext("2d").putImageData(wav, 0, 0); return { c1, c2, g: c1.transferToImageBitmap ? await createImageBitmap(c1) : null, w: await createImageBitmap(c2) }; }
onmessage = async e => {
  const m = e.data;
  if (m.type === "init") {
    initNet(m.net); TEX = buildTex(m.tex); VERSION = m.version; db = await openDB();
    // versão nova do build: limpa o cache L2
    if (db) { const v = await new Promise(res => { try { const r = db.transaction("meta").objectStore("meta").get("v"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (er) { res(null); } });
      if (v !== VERSION) { await tx("c", "readwrite", s => s.clear()); await tx("meta", "readwrite", s => s.put(VERSION, "v")); } }
    postMessage({ type: "ready" }); return;
  }
  if (m.type === "chunk") {
    const k = m.cx + "," + m.cy;
    const hit = await idbGet(k);
    if (hit) { try { const g = await createImageBitmap(hit.g), w = await createImageBitmap(hit.w); postMessage({ type: "chunk", cx: m.cx, cy: m.cy, g, w, src: "L2" }, [g, w]); return; } catch (er) { } }
    const { img, wav } = renderChunk(m.cx, m.cy);
    const { c1, c2 } = await toBitmaps(img, wav);
    const g = await createImageBitmap(c1), w = await createImageBitmap(c2);
    postMessage({ type: "chunk", cx: m.cx, cy: m.cy, g, w, src: "gen" }, [g, w]);
    try { const [bg, bw] = await Promise.all([c1.convertToBlob({ type: "image/png" }), c2.convertToBlob({ type: "image/png" })]); await idbPut(k, { g: bg, w: bw }); } catch (er) { }
  }
};
