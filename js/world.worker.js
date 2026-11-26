// Web Worker: desenha os pedaços do continente (32×32 tiles) fora da thread principal.
// Texturas orgânicas multi-escala, transições irregulares de bioma, chão urbano temático por distrito,
// espuma costeira, canais de lava/água/fosso e pontes temáticas.
// Níveis: hi = 32 px/tile, mid = 8 px/tile, lod = 1 px/tile. Cache L2: IndexedDB por versão.
import { isNature, initNet, chunkTiles, chunkGround, chunkObjects, segsNear, B, CHUNK, OX, OY, vnoise, hashTile, isWater, BIOME_RGB, NET, cityWater, cityGroundKind, inPoly } from "./terrain.js";
const T = 32;
let TEX = {}, MIP = {}, VERSION = "dev", db = null, SPR = {};

function mip(t, f) { const w = Math.max(1, t.w / f | 0), h = Math.max(1, t.h / f | 0), d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) { const k = ((y * f + j) * t.w + x * f + i) * 4; r += t.data[k]; g += t.data[k + 1]; b += t.data[k + 2]; }
    const o = (y * w + x) * 4, n = f * f; d[o] = r / n; d[o + 1] = g / n; d[o + 2] = b / n; d[o + 3] = 255; } return { w, h, data: d }; }

const TEX_OF = {
  [B.BEACH]: "solkar_sand", [B.CLIFF]: "rock", [B.PLAINS]: "grass", [B.FIELD]: "grass_gold", [B.FOREST]: "grass_dark", [B.ANCIENT]: "grass_dark",
  [B.SWAMP]: "swamp_red", [B.MANGROVE]: "swamp", [B.DESERT]: "solkar_sand", [B.CANYON]: "earth", [B.MOUNTAIN]: "stone_dark", [B.PEAK]: "rock",
  [B.VOLCANIC]: "khazad_floor", [B.TUNDRA]: "snow", [B.GLACIER]: "snow", [B.ICE]: "snow", [B.DARK]: "ruins",
  [B.ROAD]: "dirt", [B.BRIDGE]: "bridge", [B.CITY]: "cobble_v3", [B.LAVA]: "lava", [B.DOCK]: "bridge", [B.LAKE]: "water", [B.RIVER]: "water", [B.MURKY]: "swamp"
};
const TONE = {
  [B.ANCIENT]: [.84, .96, 1.04], [B.VOLCANIC]: [.72, .66, .68], [B.GLACIER]: [.90, .97, 1.06],
  [B.ICE]: [.80, .92, 1.08], [B.PEAK]: [.86, .87, .92], [B.MURKY]: [.68, .74, .54], [B.CANYON]: [1.06, .88, .76]
};

function tex(name, f, x, y) {
  if (f !== 1) { x *= f; y *= f; }
  const t = TEX[name] || TEX.cobble || TEX.grass;
  if (!t) return [120, 160, 80];
  const tx = ((x % t.w) + t.w) % t.w, ty = ((y % t.h) + t.h) % t.h, i = (ty * t.w + tx) * 4;
  return [t.data[i], t.data[i + 1], t.data[i + 2]];
}

const CITY_TH = {
  valen:   { base: "grass", street: "cobble_v3", plaza: "cobble_v3", promenade: "cobble_v3", rock: "rock" },
  khazad:  { base: "khazad_floor", street: "khazad_floor", courtyard: "khazad_floor", plaza: "cobble_v3", tint: [.88, .85, .84] },
  solkar:  { base: "solkar_sand", street: "dirt", plaza: "plaza", garden: "grass", tint: [1.03, .99, .92] },
  sylvana: { base: "grass", street: "dirt", plaza: "dirt", clearing: "dirt" },
  nocthar: { base: "ruins", street: "cobble_v3", plaza: "cobble_v3", tint: [.78, .70, .96] },
};
const OCEAN = { [B.DEEP]: [16, 34, 70], [B.OCEAN]: [26, 58, 106], [B.SHALLOW]: [48, 114, 158] };
function segD(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((px - a[0]) * dx + (py - a[1]) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }
const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;

function renderChunk(cx, cy, PX) {
  const N = CHUNK * PX, f = T / PX;
  const ground = chunkGround(cx, cy), n = CHUNK + 2;
  const img = new ImageData(N, N), d = img.data;
  const gx0 = cx * CHUNK + OX, gy0 = cy * CHUNK + OY, tx0 = cx * CHUNK, ty0 = cy * CHUNK;
  const segs = segsNear(tx0 - 5, ty0 - 5, tx0 + CHUNK + 5, ty0 + CHUNK + 5);
  const rivers = segs.filter(s => s.kind === "river"), roads = segs.filter(s => s.kind === "road");

  // deformação orgânica de bordas + modulação tonal macro (elimina repetição visível)
  const STEP = Math.max(2, PX / 4), GW = Math.ceil(N / STEP) + 2;
  const wx = new Float32Array(GW * GW), wy = new Float32Array(GW * GW), mac = new Float32Array(GW * GW);
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
    const fx = gx0 + i * STEP / PX, fy = gy0 + j * STEP / PX;
    wx[j * GW + i] = (vnoise(fx * .85, fy * .85, 501) - .5) * .95 + (vnoise(fx * 3.1, fy * 3.1, 503) - .5) * .38;
    wy[j * GW + i] = (vnoise(fx * .85, fy * .85, 502) - .5) * .95 + (vnoise(fx * 3.1, fy * 3.1, 504) - .5) * .38;
    mac[j * GW + i] = 1 + (vnoise(fx / 26, fy / 26, 701) - .5) * .13 + (vnoise(fx / 7.5, fy / 7.5, 702) - .5) * .055;
  }
  const at = (fx, fy) => { const ix = Math.max(0, Math.min(n - 1, Math.floor(fx) + 1)), iy = Math.max(0, Math.min(n - 1, Math.floor(fy) + 1)); return ground[iy * n + ix]; };

  const DS = PX >= 16 ? 4 : 1, DW = Math.ceil(N / DS) + 2;
  const dRiv = rivers.length ? new Float32Array(DW * DW) : null;
  const dRoad = roads.length ? new Float32Array(DW * DW) : null;
  for (let j = 0; j < DW; j++) for (let i = 0; i < DW; i++) {
    const x = tx0 + i * DS / PX, y = ty0 + j * DS / PX;
    if (dRiv) { let e = 9; for (const s of rivers) { const v = segD(x, y, s.a, s.b) - s.w; if (v < e) e = v; } dRiv[j * DW + i] = e; }
    if (dRoad) { let e = 9; for (const s of roads) { const v = segD(x, y, s.a, s.b); if (v < e) e = v; } dRoad[j * DW + i] = e; }
  }
  const lerpG = (G, px, py) => { const gi = px / DS, gj = py / DS, i0 = Math.min(DW - 2, gi | 0), j0 = Math.min(DW - 2, gj | 0), ti = gi - i0, tj = gj - j0, k = j0 * DW + i0;
    return (G[k] * (1 - ti) + G[k + 1] * ti) * (1 - tj) + (G[k + DW] * (1 - ti) + G[k + DW + 1] * ti) * tj; };

  const city = NET.cities.find(c => !c.heart && Math.abs(c.x - (tx0 + CHUNK / 2)) < (c.rx || 105) + CHUNK + 48 && Math.abs(c.y - (ty0 + CHUNK / 2)) < (c.ry || 92) + CHUNK + 48);
  const TH = city && CITY_TH[city.theme];

  for (let py = 0; py < N; py++) {
    const gj = py / STEP, j0 = Math.min(GW - 2, gj | 0), tj = gj - j0;
    for (let px = 0; px < N; px++) {
      const gi = px / STEP, i0 = Math.min(GW - 2, gi | 0), ti = gi - i0, k = j0 * GW + i0;
      const ox = (wx[k] * (1 - ti) + wx[k + 1] * ti) * (1 - tj) + (wx[k + GW] * (1 - ti) + wx[k + GW + 1] * ti) * tj;
      const oy = (wy[k] * (1 - ti) + wy[k + 1] * ti) * (1 - tj) + (wy[k + GW] * (1 - ti) + wy[k + GW + 1] * ti) * tj;
      const mv = (mac[k] * (1 - ti) + mac[k + 1] * ti) * (1 - tj) + (mac[k + GW] * (1 - ti) + mac[k + GW + 1] * ti) * tj;
      const fx = (px + .5) / PX, fy = (py + .5) / PX, own = at(fx, fy);
      const firm = own === B.CITY || own === B.DOCK;
      let b = firm ? at(fx + ox * .22, fy + oy * .22) : at(fx + ox, fy + oy);
      if (b === B.HEART && own !== B.HEART) b = own;
      const o = (py * N + px) * 4;
      if (b === B.HEART) { d[o + 3] = 0; continue; }
      const wpx = tx0 * (T / f) + px, wpy = ty0 * (T / f) + py;
      const wx3 = tx0 + fx, wy3 = ty0 + fy;
      let r, g, bl;

      // 1. Píeres / docas de madeira (sempre nítidas por cima da água)
      if (own === B.DOCK) {
        [r, g, bl] = tex("bridge", f, wpx, wpy);
        // tábuas nítidas com contorno sutil na borda da doca
        const edge = at(fx + .28, fy) !== B.DOCK || at(fx - .28, fy) !== B.DOCK || at(fx, fy + .28) !== B.DOCK || at(fx, fy - .28) !== B.DOCK;
        if (edge) { r *= .58; g *= .52; bl *= .46; }
      }
      // 2. Oceano e baías (com espuma costeira orgânica e brilhos sutis)
      else if (OCEAN[b]) {
        [r, g, bl] = OCEAN[b];
        const sh = (vnoise((gx0 + fx) * 1.4, (gy0 + fy) * 1.4, 511) - .5) * 16;
        r += sh; g += sh; bl += sh * 1.25;
        let shore = false, nearShore = false;
        for (const [dx2, dy2] of [[.42, 0], [-.42, 0], [0, .42], [0, -.42]]) {
          const nb = at(fx + ox * .4 + dx2, fy + oy * .4 + dy2);
          if (!isWater(nb) && nb !== B.HEART) { shore = true; break; }
        }
        if (!shore && b === B.SHALLOW) {
          for (const [dx2, dy2] of [[.95, 0], [-.95, 0], [0, .95], [0, -.95]]) {
            const nb = at(fx + ox * .4 + dx2, fy + oy * .4 + dy2);
            if (!isWater(nb) && nb !== B.HEART) { nearShore = true; break; }
          }
        }
        if (shore) {
          const fo = .55 + vnoise((gx0 + fx) * 5.5, (gy0 + fy) * 5.5, 513) * .35;
          r += (238 - r) * fo; g += (247 - g) * fo; bl += (252 - bl) * fo;
        } else if (nearShore) {
          r += 16; g += 26; bl += 24;
        } else if (hashTile(Math.floor(wpx * f / 9), Math.floor(wpy * f / 9), 7) > .996) {
          r = 225; g = 240; bl = 250;
        }
      }
      // 3. Águas, canais de lava, lago do oásis, riachos e fosso das cidades
      else if (city && (b === B.CITY || b === B.RIVER || b === B.LAVA || b === B.MURKY || b === B.BRIDGE || b === B.SHALLOW) && cityWater(city, wx3, wy3)) {
        const cw = cityWater(city, wx3, wy3);
        if (cw.bridge) {
          [r, g, bl] = tex("bridge", f, wpx, wpy);
          // borda lateral da ponte (parapeito)
          const bw1 = cityWater(city, wx3 + .38, wy3), bw2 = cityWater(city, wx3 - .38, wy3), bw3 = cityWater(city, wx3, wy3 + .38), bw4 = cityWater(city, wx3, wy3 - .38);
          const rail = (bw1 && !bw1.bridge) || (bw2 && !bw2.bridge) || (bw3 && !bw3.bridge) || (bw4 && !bw4.bridge);
          if (city.theme === "khazad") {
            const l = (r + g + bl) / 3;
            r = l * (rail ? .35 : .60); g = l * (rail ? .32 : .55); bl = l * (rail ? .34 : .58);
          } else if (city.theme === "nocthar") {
            r *= rail ? .38 : .62; g *= rail ? .32 : .52; bl *= rail ? .52 : .78;
          } else if (rail) {
            r *= .56; g *= .48; bl *= .40;
          }
        } else if (cw.t === "lava") {
          // canal de lava vivo: borda de basalto escuro -> laranja brilhante -> núcleo amarelo
          const edge = !cityWater(city, wx3 + .42, wy3) || !cityWater(city, wx3 - .42, wy3) || !cityWater(city, wx3, wy3 + .42) || !cityWater(city, wx3, wy3 - .42);
          const mid = cityWater(city, wx3 + 1.1, wy3) && cityWater(city, wx3 - 1.1, wy3) && cityWater(city, wx3, wy3 + 1.1) && cityWater(city, wx3, wy3 - 1.1);
          if (edge) { r = 68; g = 34; bl = 26; }
          else {
            [r, g, bl] = tex("lava", f, wpx, wpy);
            const nv = vnoise((gx0 + fx) * 1.9, (gy0 + fy) * 1.9, 531);
            if (mid && nv > .48) { r = 255; g = 185 + (nv - .48) * 110; bl = 48 + (nv - .48) * 70; }
            else { r = Math.min(255, r * 1.2 + 30); g = Math.min(220, g * 1.1 + 16); bl *= .85; }
          }
        } else if (cw.t === "bay") {
          [r, g, bl] = OCEAN[B.SHALLOW];
          const shore = !cityWater(city, wx3 + .45, wy3) || !cityWater(city, wx3 - .45, wy3) || !cityWater(city, wx3, wy3 + .45) || !cityWater(city, wx3, wy3 - .45);
          const sh = (vnoise((gx0 + fx) * 1.5, (gy0 + fy) * 1.5, 511) - .5) * 14;
          r += sh; g += sh; bl += sh * 1.2;
          if (shore) { const fo = .55 + vnoise((gx0 + fx) * 5, (gy0 + fy) * 5, 513) * .3; r += (238 - r) * fo; g += (247 - g) * fo; bl += (252 - bl) * fo; }
        } else {
          // lago do oásis / riachos de Sylvana / fosso sombrio de Nocthar
          const edge = !cityWater(city, wx3 + .42, wy3) || !cityWater(city, wx3 - .42, wy3) || !cityWater(city, wx3, wy3 + .42) || !cityWater(city, wx3, wy3 - .42);
          const deep = cityWater(city, wx3 + 2.2, wy3) && cityWater(city, wx3 - 2.2, wy3) && cityWater(city, wx3, wy3 + 2.2) && cityWater(city, wx3, wy3 - 2.2);
          [r, g, bl] = tex("water", f, wpx, wpy);
          if (cw.t === "murky") {
            r = r * .44 + 28; g = g * .34 + 20; bl = bl * .58 + 42;
            if (edge) { r *= .68; g *= .62; bl *= .75; }
          } else if (city.theme === "solkar") {
            // azul cristalino tropical do oásis (imagem 2)
            r = r * .82 + 12; g = Math.min(255, g * 1.15 + 22); bl = Math.min(255, bl * 1.18 + 24);
            if (edge) { r = 104; g = 166; bl = 162; }
            else if (deep) { r *= .86; g *= .90; bl *= .96; }
          } else {
            // riachos de Sylvana com margem musgosa escura
            if (edge) { r = 74; g = 122; bl = 62; }
            else if (deep) { r *= .82; g *= .88; bl *= .94; }
          }
        }
      }
      // 4. Chão urbano orgânico por distrito (bordas orgânicas suaves, sem emenda de chunk!)
      else if (b === B.CITY && city && TH) {
        const jx = wx3 + ox * .52, jy = wy3 + oy * .52;
        const gk = cityGroundKind(city, jx, jy);
        const tk = TH[gk] || TH.base;
        [r, g, bl] = tex(tk, f, wpx, wpy);
        if (city.theme === "khazad") {
          if (gk === "courtyard") { [r, g, bl] = tex("cobble_v3", f, wpx, wpy); r *= .62; g *= .59; bl *= .61; }
          else if (gk === "plaza") { [r, g, bl] = tex("cobble_v3", f, wpx, wpy); r *= .68; g *= .65; bl *= .66; }
          else if (gk === "street") { r *= 1.16; g *= 1.11; bl *= 1.09; }
          else { r *= .95; g *= .92; bl *= .92; }
        } else if (city.theme === "solkar") {
          if (gk === "garden") { r *= 1.02; g *= 1.06; bl *= .92; }
          else if (gk === "street") { r = r * 1.16 + 26; g = g * 1.10 + 18; bl = bl * .92 + 6; }
          else if (gk === "plaza") { [r, g, bl] = tex("dirt", f, wpx, wpy); r = r * 1.24 + 28; g = g * 1.16 + 20; bl = bl * .96 + 8; }
          else {
            // exatamente igual às dunas do deserto externo (zero emenda visível!)
            const dw = Math.sin((gx0 + fx) * .10 + (gy0 + fy) * .065 + vnoise((gx0 + fx) / 22, (gy0 + fy) / 22, 711) * 3.4);
            const dm = 1 + dw * .065; r *= dm; g *= dm * .995; bl *= dm * .96;
          }
        } else if (city.theme === "valen") {
          if (gk === "promenade") { r *= .98; g *= .97; bl *= .99; }
          else if (gk === "plaza") { r *= 1.06; g *= 1.04; bl *= 1.0; }
          else if (gk === "street") { r *= .96; g *= .95; bl *= .94; }
          else if (gk === "rock") { r *= .78; g *= .80; bl *= .84; }
        } else if (city.theme === "sylvana") {
          if (gk === "plaza" || gk === "clearing") { r = r * 1.10 + 18; g = g * 1.06 + 14; bl = bl * .92 + 6; }
          else if (gk === "street") { r = r * 1.04 + 10; g = g * 1.00 + 6; bl = bl * .88; }
          else {
            // transição suave da grama viva das clareiras para a Floresta Ancestral escura ao redor
            const ed = Math.hypot((jx - city.x) / (city.rx || 106), (jy - city.y) / (city.ry || 90));
            const t = Math.max(0, Math.min(1, (ed - .74) / .30));
            if (t > 0) {
              const [dr, dg, db] = tex("grass_dark", f, wpx, wpy);
              r = r * (1 - t) + dr * .84 * t; g = g * (1 - t) + dg * .96 * t; bl = bl * (1 - t) + db * 1.04 * t;
            }
          }
        } else if (city.theme === "nocthar") {
          const ed = Math.hypot((jx - city.x) / (city.rx || 98), (jy - city.y) / (city.ry || 84));
          const fadeOut = Math.max(0, Math.min(1, (ed - .88) / .16));
          const tn = TH.tint;
          r *= tn[0] + (1 - tn[0]) * fadeOut; g *= tn[1] + (1 - tn[1]) * fadeOut; bl *= tn[2] + (1 - tn[2]) * fadeOut;
          if (gk === "plaza") { r *= 1.12; g *= 1.04; bl *= 1.20; }
          else if (gk === "street") { r *= .98; g *= .92; bl *= 1.08; }
        }
        if (gk !== "base" && gk !== "garden" && gk !== "rock") {
          const nb1 = cityGroundKind(city, jx + .26, jy);
          const nb2 = cityGroundKind(city, jx, jy + .26);
          if (nb1 === "base" || nb2 === "base" || nb1 === "garden" || nb2 === "garden") { r *= .88; g *= .86; bl *= .84; }
        }
        r *= mv; g *= mv; bl *= mv;
      }
      // 5. Biomas naturais do continente 10.000 × 10.000
      else {
        [r, g, bl] = tex(TEX_OF[b] || "grass", f, wpx, wpy);
        const tn = TONE[b]; if (tn) { r *= tn[0]; g *= tn[1]; bl *= tn[2]; }
        // dunas onduladas no deserto (estilo imagem 2)
        if (b === B.DESERT) {
          const dw = Math.sin((gx0 + fx) * .10 + (gy0 + fy) * .065 + vnoise((gx0 + fx) / 22, (gy0 + fy) / 22, 711) * 3.4);
          const dm = 1 + dw * .065;
          r *= dm; g *= dm * .995; bl *= dm * .96;
        }
        // veios escuros sutis nas terras vulcânicas
        else if (b === B.VOLCANIC) {
          const cr = vnoise((gx0 + fx) * .65, (gy0 + fy) * .65, 719);
          if (cr > .84) { r = Math.min(255, r + 65); g = Math.min(255, g + 22); }
        }
        // margem suave de lago natural
        else if (b === B.LAKE) {
          let shore = 0; for (const [dx2, dy2] of [[.48, 0], [-.48, 0], [0, .48], [0, -.48]]) { const nb = at(fx + ox + dx2, fy + oy + dy2); if (!isWater(nb) && nb !== B.HEART) shore = 1; }
          if (shore) { r = 74; g = 122; bl = 62; }
        }
        // modulação tonal macro para que o chão nunca pareça azulejo repetido
        r *= mv; g *= mv; bl *= mv;
      }

      // 6. Rios continentais: margem de terra, faixa de grama escura, água, fundo mais escuro
      let eRiv = 9;
      if (dRiv && own !== B.DOCK) {
        eRiv = lerpG(dRiv, px, py);
        if (eRiv < .72) {
          if (eRiv > .36) { r = 110; g = 84; bl = 52; }
          else if (eRiv > 0) { r = 74; g = 122; bl = 62; }
          else {
            [r, g, bl] = tex("water", f, wpx, wpy);
            if (eRiv < -.35) { r = r * .66 + 7; g = g * .66 + 18; bl = bl * .66 + 28; }
          }
        }
      }

      // 7. Estradas continentais: terra batida orgânica + borda escura + pontes de tábuas sobre água
      if (dRoad && own !== B.DOCK && !(city && cityWater(city, wx3, wy3)) && (b !== B.CITY || !city || (city.wall && !inPoly(city.wall, wx3, wy3)))) {
        const dr = lerpG(dRoad, px, py);
        if (dr < 1.05) {
          const wet = eRiv < .72 || isWater(b);
          if (wet && dr < .96) {
            [r, g, bl] = tex("bridge", f, wpx, wpy);
            if (dr > .80) { r *= .52; g *= .46; bl *= .40; }
          } else if (dr < .82) {
            [r, g, bl] = tex("dirt", f, wpx, wpy);
            r *= (.96 + (mv - 1) * .4); g *= (.96 + (mv - 1) * .4); bl *= (.96 + (mv - 1) * .4);
          } else {
            const a = dr < .95 ? .38 : 0;
            if (a) { const t2 = tex("dirt", f, wpx, wpy); r = r * (1 - a) + t2[0] * a; g = g * (1 - a) + t2[1] * a; bl = bl * (1 - a) + t2[2] * a; }
            r = r * .68 + 20; g = g * .68 + 14; bl = bl * .68 + 8;
          }
        }
      }

      d[o] = clamp(r); d[o + 1] = clamp(g); d[o + 2] = clamp(bl); d[o + 3] = 255;
    }
  }
  return img;
}

// zoom médio: assa sprites reais de natureza no pedaço (inclui vizinhos que invadem por cima)
const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };
function bake(g, cx, cy, PX) {
  const s = PX / 32, x0 = cx * CHUNK, y0 = cy * CHUNK, list = [];
  for (let dy = 0; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) for (const o of chunkObjects(cx + dx, cy + dy)) if (isNature(o)) list.push(o);
  list.sort((a, b) => a.y - b.y); g.imageSmoothingEnabled = false;
  for (const o of list) {
    const px = (o.x - x0 + .5) * PX, by = (o.y - y0 + 1) * PX;
    if (px < -100 * s || px > CHUNK * PX + 100 * s || by < 0 || by > CHUNK * PX + 160 * s) continue;
    const spName = o.sprite || (o.kind === "palm" ? "palm_date" : o.kind === "cactus" ? "cactus_saguaro" : o.kind === "peak" ? "peak_snow" : o.kind === "ruinwall" ? "ruin_wall" : null);
    const im = spName && (SPR[spName + "|" + (o.tint || "")] || SPR[spName + "|"]);
    if (im) {
      const sc = (o.big || 1) * s, w = im.width * sc, h = im.height * sc;
      if (hsh(o.x, o.y) % 2 === 0) { g.save(); g.translate(px, 0); g.scale(-1, 1); g.drawImage(im, -w / 2, by + 2 * s - h, w, h); g.restore(); }
      else g.drawImage(im, px - w / 2, by + 2 * s - h, w, h);
    } else if (o.kind === "palm") {
      g.strokeStyle = "#7a5a32"; g.lineWidth = 6 * s; g.beginPath(); g.moveTo(px, by); g.quadraticCurveTo(px + 10 * s, by - 30 * s, px + 4 * s, by - 58 * s); g.stroke();
      g.fillStyle = "#3f8a3a"; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283; g.beginPath(); g.ellipse(px + (4 + Math.cos(a) * 14) * s, by - (58 - Math.sin(a) * 6) * s, 16 * s, 5 * s, a, 0, 6.283); g.fill(); }
    } else if (o.kind === "cactus") {
      g.fillStyle = "#4f8a3e"; g.fillRect(px - 5 * s, by - 34 * s, 10 * s, 34 * s); g.fillRect(px - 14 * s, by - 24 * s, 6 * s, 12 * s); g.fillRect(px + 8 * s, by - 28 * s, 6 * s, 14 * s);
    } else if (o.kind === "peak") {
      const h = hsh(o.x, o.y), w = (30 + h % 14) * s, hh = (34 + (h >>> 6) % 20) * s;
      g.fillStyle = "#7d8a98"; g.beginPath(); g.moveTo(px - w, by); g.lineTo(px - 2 * s, by - hh); g.lineTo(px + w, by); g.closePath(); g.fill();
      g.fillStyle = "#f4f8fb"; g.beginPath(); g.moveTo(px - w * .42, by - hh * .55); g.lineTo(px - 2 * s, by - hh); g.lineTo(px + w * .38, by - hh * .55); g.closePath(); g.fill();
    } else if (o.kind === "ruinwall") {
      const h = (18 + hsh(o.x, o.y) % 22) * s; g.fillStyle = "#5c4d6c"; g.fillRect(px - 13 * s, by - h, 26 * s, h); g.fillStyle = "#7e6e90"; g.fillRect(px - 13 * s, by - h, 26 * s, 3 * s);
    }
  }
}

const MEANC = {};
function meanOf(b) { if (MEANC[b]) return MEANC[b]; if (OCEAN[b]) return MEANC[b] = OCEAN[b]; const t = TEX[TEX_OF[b] || "grass"]; if (!t) return BIOME_RGB[b] || [90, 140, 70];
  let r = 0, g = 0, bl = 0, n = 0; for (let i = 0; i < t.data.length; i += 16) { r += t.data[i]; g += t.data[i + 1]; bl += t.data[i + 2]; n++; } const tn = TONE[b] || [1, 1, 1]; return MEANC[b] = [r / n * tn[0], g / n * tn[1], bl / n * tn[2]]; }
const TMEAN = {};
function texMean(name) { if (TMEAN[name]) return TMEAN[name]; const t = TEX[name] || TEX.cobble; if (!t) return [120, 120, 120]; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < t.data.length; i += 16) { r += t.data[i]; g += t.data[i + 1]; b += t.data[i + 2]; n++; } return TMEAN[name] = [r / n, g / n, b / n]; }

function renderLod(cx, cy) {
  const tiles = chunkTiles(cx, cy), n = CHUNK + 2, img = new ImageData(CHUNK, CHUNK), d = img.data, trees = new Uint8Array(CHUNK * CHUNK);
  const CITYC = NET.cities.find(c => !c.heart && Math.abs(c.x - (cx + .5) * CHUNK) < (c.rx || 135) + CHUNK && Math.abs(c.y - (cy + .5) * CHUNK) < (c.ry || 115) + CHUNK) || null;
  for (const o of chunkObjects(cx, cy, tiles)) if (!o.decor) { const i = o.x - cx * CHUNK, j = o.y - cy * CHUNK; if (i >= 0 && j >= 0 && i < CHUNK && j < CHUNK) trees[j * CHUNK + i] = 1; }
  for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) {
    const b = tiles[(j + 1) * n + i + 1], o = (j * CHUNK + i) * 4;
    if (b === B.HEART) { d[o + 3] = 0; continue; }
    const x = cx * CHUNK + i, y = cy * CHUNK + j;
    let c = b === B.RIVER ? meanOf(B.LAKE) : b === B.ROAD ? meanOf(B.ROAD) : b === B.LAVA ? [242, 118, 28] : meanOf(b);
    if (b === B.CITY && CITYC) {
      const th = CITY_TH[CITYC.theme], gk = cityGroundKind(CITYC, x + .5, y + .5);
      c = texMean(th?.[gk] || th?.base || "grass");
      if (th?.tint && gk !== "garden") c = [c[0] * th.tint[0], c[1] * th.tint[1], c[2] * th.tint[2]];
    }
    let fv = .95 + (vnoise(x / 5, y / 5, 621) - .5) * .12 + (hashTile(x, y, 623) - .5) * .05;
    if (trees[j * CHUNK + i]) fv *= .64;
    d[o] = clamp(c[0] * fv); d[o + 1] = clamp(c[1] * fv); d[o + 2] = clamp(c[2] * fv); d[o + 3] = 255;
  }
  return img;
}

// ---------- IndexedDB (cache L2) ----------
function openDB() { return new Promise(res => { try { const rq = indexedDB.open("ht-chunks", 3); rq.onupgradeneeded = () => { for (const s of ["c", "meta"]) if (!rq.result.objectStoreNames.contains(s)) rq.result.createObjectStore(s); }; rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); } catch (e) { res(null); } }); }
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
