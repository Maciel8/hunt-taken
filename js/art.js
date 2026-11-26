// Arte: texturas por bioma, chão desenhado em pedaços de 16x16 tiles com bordas orgânicas, objetos, criaturas e personagens.
import { T, MW, MH, MHA, IY, MONS, KING } from "./data.js";
import { DW, DH, UPT } from "./geo.js";
import { U, R, hash, objects, props, VILA, VILA_ST, FIELDS, ROOMS, LAVA } from "./world.js";
import { REG, RIVERS, LAKES, LAKE_POLYS, ROADS, BRIDGES, FARMS, riverCurves } from "./geo.js";
import { charSprite } from "./chars.js";

export const A = { tex: {}, sp: {}, pat: {}, ready: false, paint: null };
const CELL = T / UPT;                  // 8 px por unidade
const CH = 16;                         // tiles por pedaço
function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

// recolore pixel a pixel (funciona em todo navegador, sem ctx.filter)
function recolor(img, fn) { const c = canvas(img.width, img.height), g = c.getContext("2d"); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { const [r, gg, b] = fn(d.data[i], d.data[i + 1], d.data[i + 2]); d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b; } g.putImageData(d, 0, 0); return c; }
const lum = (r, g, b) => .3 * r + .59 * g + .11 * b;
const mix = (a, b, t) => a + (b - a) * t;
function procTex(size, base, dots, salt) { const c = canvas(size, size), g = c.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, size, size); for (let i = 0; i < size * size / 14; i++) { const h = hash(i * 7 + salt, i * 13 + salt * 3); g.fillStyle = dots[h % dots.length]; g.fillRect(h % size, (h >>> 8) % size, 1 + ((h >>> 16) & 1), 1); } return c; }

export async function loadAssets() {
  const names = ["grass", "grass_dark", "sand", "cobble", "swamp", "rock"];
  const imgs = await Promise.all(names.map(n => loadImg(`assets/tex/${n}.png`)));
  names.forEach((n, i) => { A.tex[n] = imgs[i] || procTex(64, "#4c8534", ["#41752c", "#5a9a3e"], i); });
  try { const man = await (await fetch("assets/manifest.json", { cache: "no-cache" })).json(); const sp = await Promise.all(man.map(m => loadImg(`assets/sprites/${m.file}`))); man.forEach((m, i) => { if (sp[i]) A.sp[m.name] = sp[i]; }); } catch (e) { }
  A.paint = await loadImg("assets/mapa-pintura.png");
  const t = A.tex;
  t.snow = snowTex();
  t.ruins = recolor(t.cobble, (r, g, b) => { const l = lum(r, g, b) * .55; return [l * .9 + 18, l * .7 + 10, l * 1.05 + 34]; });
  t.swamp_red = recolor(t.swamp, (r, g, b) => { const l = lum(r, g, b); return [l * .62 + 34, l * .4 + 16, l * .34 + 14]; });
  t.earth = recolor(t.sand, (r, g, b) => { const l = lum(r, g, b); return [l * .78 + 18, l * .6 + 10, l * .38 + 6]; });
  t.dirt = recolor(t.sand, (r, g, b) => { const l = lum(r, g, b); return [l * .72 + 22, l * .56 + 14, l * .36 + 8]; });
  t.stone_dark = recolor(t.rock, (r, g, b) => [r * .72, g * .7, b * .7]);
  t.grass_gold = recolor(t.grass, (r, g, b) => [mix(r, 170, .35), mix(g, 160, .15), b * .7]);
  t.grass_vila = recolor(t.grass, (r, g, b) => [r * .92 + 8, g * .98 + 6, b * .85]);
  t.plaza = recolor(t.cobble, (r, g, b) => { const l = lum(r, g, b); return [l * .9 + 40, l * .85 + 30, l * .75 + 18]; });
  t.wood = await texOr("wood", () => recolor(t.sand, (r, g, b) => { const l = lum(r, g, b); return [l * .7 + 40, l * .45 + 22, l * .25 + 10]; }));
  t.stone_floor = await texOr("stone_floor", () => recolor(t.cobble, (r, g, b) => [r * .85, g * .85, b * .9]));
  t.cave = await texOr("cave", () => recolor(t.rock, (r, g, b) => { const l = lum(r, g, b); return [l * .5 + 20, l * .35 + 10, l * .3 + 10]; }));
  t.lava = lavaTex();
  t.water = waterTex(); t.wheat = wheatTex("#d7b45a", "#b88d3a"); t.wheat2 = wheatTex("#8fae4a", "#6f8f38"); t.soil = wheatTex("#7a5634", "#5a3c22"); t.cabbage = cabbageTex(); t.bridge = bridgeTex();
  const g = canvas(1, 1).getContext("2d");
  for (const k in t) A.pat[k] = g.createPattern(t[k], "repeat");
  A.tint = {};
  A.ready = true;
}
async function texOr(name, fb) { const im = await loadImg(`assets/tex/${name}.png`); return im || fb(); }
function snowTex() { const c = canvas(128, 128), g = c.getContext("2d"); g.fillStyle = "#eef3f8"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) { const h = hash(i, 71); g.fillStyle = h % 2 ? "rgba(200,214,232,.45)" : "rgba(255,255,255,.7)"; g.beginPath(); g.ellipse(h % 128, (h >>> 8) % 128, 8 + (h >>> 16) % 18, 3 + (h >>> 20) % 6, 0, 0, 6.283); g.fill(); g.beginPath(); g.ellipse((h % 128) + 128 * ((h % 128) < 20 ? 1 : -1), (h >>> 8) % 128, 8 + (h >>> 16) % 18, 3 + (h >>> 20) % 6, 0, 0, 6.283); g.fill(); }
  for (let i = 0; i < 260; i++) { const h = hash(i, 73); g.fillStyle = h % 4 ? "rgba(170,190,215,.35)" : "#ffffff"; g.fillRect(h % 128, (h >>> 8) % 128, 1 + (h >>> 18) % 2, 1); } return c; }
function lavaTex() { const c = canvas(64, 64), g = c.getContext("2d"); g.fillStyle = "#b33a12"; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 70; i++) { const h = hash(i, 33); g.fillStyle = h % 3 ? "#ff7a1a" : "#ffd24a"; g.fillRect(h % 64, (h >>> 8) % 64, 2 + (h >>> 20) % 6, 2); } for (let i = 0; i < 20; i++) { const h = hash(i, 44); g.fillStyle = "#5a1a08"; g.fillRect(h % 64, (h >>> 8) % 64, 5, 3); } return c; }
function waterTex() { const c = canvas(64, 64), g = c.getContext("2d"); g.fillStyle = "#2f6f9a"; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 90; i++) { const h = hash(i, 91); g.fillStyle = h % 3 ? "#3b7fac" : "#285f86"; g.fillRect(h % 64, (h >>> 8) % 64, 3 + (h >>> 20) % 6, 1); } for (let i = 0; i < 14; i++) { const h = hash(i, 17); g.fillStyle = "rgba(220,240,255,.55)"; g.fillRect(h % 64, (h >>> 8) % 64, 4, 1); } return c; }
function cabbageTex() { const c = canvas(32, 32), g = c.getContext("2d"); g.fillStyle = "#6a4a2c"; g.fillRect(0, 0, 32, 32); for (let y = 4; y < 32; y += 8) for (let x = 4; x < 32; x += 8) { g.fillStyle = "#3f7a2e"; g.beginPath(); g.arc(x, y, 3.5, 0, 6.283); g.fill(); g.fillStyle = "#7cc252"; g.beginPath(); g.arc(x - 1, y - 1, 2, 0, 6.283); g.fill(); } return c; }
function wheatTex(a, b) { const c = canvas(32, 32), g = c.getContext("2d"); g.fillStyle = a; g.fillRect(0, 0, 32, 32); for (let x = 0; x < 32; x += 4) { g.fillStyle = b; g.fillRect(x, 0, 1, 32); } for (let i = 0; i < 40; i++) { const h = hash(i, 5); g.fillStyle = h % 2 ? "#ecd27a" : "#9c7428"; g.fillRect(h % 32, (h >>> 8) % 32, 1, 2); } return c; }
function bridgeTex() { const c = canvas(32, 32), g = c.getContext("2d"); g.fillStyle = "#8a6438"; g.fillRect(0, 0, 32, 32); for (let x = 0; x < 32; x += 6) { g.fillStyle = "#5e4022"; g.fillRect(x, 0, 1, 32); } g.fillStyle = "#a57a45"; for (let x = 2; x < 32; x += 6) g.fillRect(x, 0, 2, 32); return c; }

// ---------- chão ----------
function keyAt(ux, uy) {
  if (ux < 0 || uy < 0 || ux >= DW || uy >= DH) return "water";
  const i = uy * DW + ux;
  if (U.bridge[i]) return "bridge";
  if (U.water[i]) return "water";
  const reg = U.region[i];
  if (U.road[i]) return reg === R.VILA ? "cobble" : reg === R.MONTANHAS ? "stone_dark" : reg === R.RUINAS ? "ruins" : "dirt";
  if (reg === R.VILA) return "cobble";
  if (U.field[i]) return U.field[i] === 1 ? "wheat" : "wheat2";
  return ["grass", "grass_dark", "swamp_red", "earth", "stone_dark", "snow", "ruins", "cobble"][reg];
}
const chunks = new Map();
// Chão desenhado pelas próprias formas do mundo (bordas curvas), com franja suave entre biomas.
const S8 = CELL;   // unidade -> px
function pathPoly(g, pts) { g.beginPath(); g.moveTo(pts[0][0] * S8, pts[0][1] * S8); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * S8, pts[i][1] * S8); g.closePath(); }
function pathLine(g, p) { g.beginPath(); g.moveTo(p[0][0] * S8, p[0][1] * S8); for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; g.quadraticCurveTo(p[i][0] * S8, p[i][1] * S8, mx * S8, my * S8); } const l = p[p.length - 1]; g.lineTo(l[0] * S8, l[1] * S8); }
const bbox = pts => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0 * S8, y0 * S8, x1 * S8, y1 * S8]; };
const BIOMES = [["floresta", "grass_dark"], ["pantano", "swamp_red"], ["minas", "earth"], ["serraLeste", "stone_dark"], ["montanhas", "snow"], ["ruinas", "ruins"]];
let BOX = null;
const EDGE = {};
function edgeBlobs(k, pts) {
  if (EDGE[k]) return EDGE[k]; const out = []; let n = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t < d; t += 3) { const h = hash(n++, k.length * 97), x = a[0] + (b[0] - a[0]) * t / d, y = a[1] + (b[1] - a[1]) * t / d, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, off = ((h % 1000) / 1000 - .5) * 16;
    out.push([(x + nx * off) * S8, (y + ny * off) * S8, (5 + (h >>> 12) % 26)]);
    if ((h >>> 22) % 5 === 0) { const far = (((h >>> 4) % 1000) / 1000 - .5) * 48; out.push([(x + nx * far) * S8, (y + ny * far) * S8, 3 + (h >>> 8) % 9]); } } }
  return (EDGE[k] = out);
}
function region(g, pts, pat, rect, k) {
  // borda viva: bolhas de tamanhos variados entram e saem do contorno, mais umas manchas soltas
  g.fillStyle = pat; pathPoly(g, pts); g.fill();
  const [x0, y0, x1, y1] = [g.__ox - 200, g.__oy - 200, g.__ox + CH * T + 200, g.__oy + CH * T + 200];
  g.beginPath(); for (const [x, y, r] of edgeBlobs(k, pts)) { if (x < x0 || x > x1 || y < y0 || y > y1) continue; g.moveTo(x + r, y); g.arc(x, y, r, 0, 6.283); } g.fill();
}
function buildChunk(cx, cy) {
  if (cy * CH >= IY) return buildInteriorChunk(cx, cy);
  if (!BOX) BOX = Object.fromEntries(BIOMES.map(([k]) => [k, bbox(REG[k])]));
  const c = canvas(CH * T, CH * T), g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  const ox = cx * CH * T, oy = cy * CH * T, W = CH * T, pad = 60;
  const hit = ([x0, y0, x1, y1]) => x1 > ox - pad && x0 < ox + W + pad && y1 > oy - pad && y0 < oy + W + pad;
  g.translate(-ox, -oy); g.__ox = ox; g.__oy = oy;
  g.fillStyle = A.pat.grass; g.fillRect(ox, oy, W, W);
  // plantações
  for (const fm of FARMS) { if (!fm.kept || !fm.kept.length) continue; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [lx, ly] of fm.kept) { x0 = Math.min(x0, lx - 19); x1 = Math.max(x1, lx + 19); y0 = Math.min(y0, ly - 14); y1 = Math.max(y1, ly + 14); }
    const big = Math.max(x1 - x0, y1 - y0) * S8; if (!hit([fm.x * S8 - big, fm.y * S8 - big, fm.x * S8 + big, fm.y * S8 + big])) continue;
    g.save(); g.translate(fm.x * S8, fm.y * S8); g.rotate(fm.rot); g.fillStyle = A.pat.dirt; g.fillRect(x0 * S8, y0 * S8, (x1 - x0) * S8, (y1 - y0) * S8); g.strokeStyle = "#6b4a2c"; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect(x0 * S8 + 2, y0 * S8 + 2, (x1 - x0) * S8 - 4, (y1 - y0) * S8 - 4); g.setLineDash([]); g.restore(); }
  for (const f of FIELDS) { if (!hit([(f.x - 40) * S8, (f.y - 40) * S8, (f.x + 40) * S8, (f.y + 40) * S8])) continue; g.save(); g.translate(f.x * S8, f.y * S8); g.rotate(f.rot); g.fillStyle = "#5a3c22"; g.fillRect(-f.w / 2 * S8 - 2, -f.h / 2 * S8 - 2, f.w * S8 + 4, f.h * S8 + 4); g.fillStyle = A.pat[{ trigo: "wheat", verde: "wheat2", terra: "soil", repolho: "cabbage" }[f.kind]]; g.fillRect(-f.w / 2 * S8, -f.h / 2 * S8, f.w * S8, f.h * S8); g.restore(); }
  // biomas
  for (const [k, tex] of BIOMES) if (hit(BOX[k])) region(g, REG[k], A.pat[tex], BOX[k], k);
  // estradas: borda escura, terra, franja (não entram na vila, que tem ruas próprias)
  g.save(); g.beginPath(); g.rect(ox - 100, oy - 100, W + 200, W + 200); g.moveTo(VILA.cx * S8 + VILA.rx * S8 - 6, VILA.cy * S8); g.ellipse(VILA.cx * S8, VILA.cy * S8, VILA.rx * S8 - 6, VILA.ry * S8 - 6, 0, 0, 6.283, true); g.closePath(); g.clip("evenodd");
  g.lineCap = "round"; g.lineJoin = "round";
  const JUNCS = []; for (const r of ROADS) for (const pt of [r[0], r[r.length - 1]]) if (ROADS.filter(q => q.some(v => Math.hypot(v[0] - pt[0], v[1] - pt[1]) < 2)).length > 1 && !JUNCS.some(j => Math.hypot(j[0] - pt[0], j[1] - pt[1]) < 2)) JUNCS.push(pt);
  const vis = ROADS.filter(r => hit(bbox(r)));
  for (const [style, w, a] of [["rgba(50,35,18,.4)", 7.6, 1], ["dirt", 6, 1], ["dirt", 7, .35]]) { g.globalAlpha = a; g.strokeStyle = style === "dirt" ? A.pat.dirt : style; g.fillStyle = g.strokeStyle; g.lineWidth = w * S8; for (const r of vis) { pathLine(g, r); g.stroke(); } for (const [x, y] of JUNCS) { g.beginPath(); g.arc(x * S8, y * S8, (w / 2 + 4) * S8, 0, 6.283); g.fill(); } }
  g.globalAlpha = 1;
  g.restore();
  // vila: gramado interno e ruas de pedra
  const vb = [(VILA.cx - VILA.rx) * S8, (VILA.cy - VILA.ry) * S8, (VILA.cx + VILA.rx) * S8, (VILA.cy + VILA.ry) * S8];
  if (hit(vb)) {
    g.fillStyle = A.pat.grass_vila; g.beginPath(); g.ellipse(VILA.cx * S8, VILA.cy * S8, VILA.rx * S8, VILA.ry * S8, 0, 0, 6.283); g.fill();
    g.strokeStyle = "rgba(40,30,20,.35)"; g.lineWidth = (VILA_ST.w + 1.5) * S8; g.lineCap = "round";
    const streets = () => { for (const l of VILA_ST.lines) { g.beginPath(); g.moveTo(l[0][0] * S8, l[0][1] * S8); g.lineTo(l[1][0] * S8, l[1][1] * S8); g.stroke(); } g.beginPath(); g.ellipse(VILA_ST.ring.cx * S8, VILA_ST.ring.cy * S8, VILA_ST.ring.rx * S8, VILA_ST.ring.ry * S8, 0, 0, 6.283); g.stroke(); };
    streets(); g.beginPath(); g.fillStyle = "rgba(40,30,20,.35)"; g.arc(VILA_ST.plaza.cx * S8, VILA_ST.plaza.cy * S8, (VILA_ST.plaza.r + 1) * S8, 0, 6.283); g.fill();
    g.strokeStyle = A.pat.cobble; g.lineWidth = VILA_ST.w * S8; streets();
    g.fillStyle = A.pat.plaza; g.beginPath(); g.arc(VILA_ST.plaza.cx * S8, VILA_ST.plaza.cy * S8, VILA_ST.plaza.r * S8, 0, 6.283); g.fill();
    g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 3; g.beginPath(); g.arc(VILA_ST.plaza.cx * S8, VILA_ST.plaza.cy * S8, (VILA_ST.plaza.r - 3) * S8, 0, 6.283); g.stroke();
  }
  // rios e lagos: margem de terra, água, brilho
  { const cs = RIVERS.filter(r => hit(bbox(r.pts))).flatMap(r => riverCurves(r)); const lk = LAKE_POLYS.filter(L => hit(bbox(L.pts).map((v, i) => v + (i < 2 ? -80 : 80))));
    g.lineCap = "round";
    for (const [extra, style] of [[5.5, "#6b5233"], [2.8, "#4a7a3e"], [0, "water"], [-2.6, "deep"]]) {
      const st = style === "water" ? A.pat.water : style === "deep" ? "rgba(20,50,80,.35)" : style; g.strokeStyle = st; g.fillStyle = st;
      for (const c of cs) { const w = c.w + extra; if (w <= 0) continue; g.lineWidth = w * S8; g.beginPath(); g.moveTo(c.a[0] * S8, c.a[1] * S8); g.quadraticCurveTo(c.c[0] * S8, c.c[1] * S8, c.b[0] * S8, c.b[1] * S8); g.stroke(); }
      for (const L of lk) { const snow = U.region[Math.round(L.y) * DW + Math.round(L.x)] === R.MONTANHAS; g.save(); g.lineJoin = "round";
        if (extra > 0) { g.strokeStyle = g.fillStyle = snow ? (extra > 4 ? "#b9d3e2" : "#e4f1f8") : st; g.lineWidth = extra * 2 * S8; pathPoly(g, L.pts); g.stroke(); g.fill(); }
        else if (extra === 0) { pathPoly(g, L.pts); g.fill(); if (snow) { g.strokeStyle = "rgba(235,246,252,.85)"; g.lineWidth = 6; pathPoly(g, L.pts); g.stroke(); } }
        else { const inner = L.pts.map(([px, py]) => [L.x + (px - L.x) * .55, L.y + (py - L.y) * .55]); pathPoly(g, inner); g.fill(); }
        g.restore(); }
    } }
  // pontes
  for (const bd of BRIDGES) { const L = bd.len * S8, Wd = bd.w * S8; if (!hit([bd.x * S8 - L, bd.y * S8 - L, bd.x * S8 + L, bd.y * S8 + L])) continue;
    g.save(); g.translate(bd.x * S8, bd.y * S8); g.rotate(bd.ang);
    g.fillStyle = "rgba(0,0,0,.32)"; g.fillRect(-L / 2 + 4, -Wd / 2 + 8, L, Wd);
    g.fillStyle = "#7a5530"; g.fillRect(-L / 2, -Wd / 2, L, Wd);
    for (let x = -L / 2; x < L / 2; x += 9) { g.fillStyle = (Math.round(x / 9) % 2) ? "#9a6e40" : "#8a6238"; g.fillRect(x, -Wd / 2 + 4, 8, Wd - 8); g.fillStyle = "#5a3c20"; g.fillRect(x + 8, -Wd / 2 + 4, 1, Wd - 8); }
    g.fillStyle = "#4a3018"; g.fillRect(-L / 2, -Wd / 2, L, 5); g.fillRect(-L / 2, Wd / 2 - 5, L, 5);
    g.fillStyle = "#6b4a2c"; for (const sx of [-L / 2, -L / 6, L / 6, L / 2 - 6]) { g.fillRect(sx, -Wd / 2 - 4, 6, 9); g.fillRect(sx, Wd / 2 - 5, 6, 9); }
    g.restore(); }
  // detalhes miúdos por cima: tufos, pedrinhas, neve brilhando
  for (let i = 0; i < 160; i++) { const h = hash(cx * 977 + i, cy * 131 + i * 7), x = ox + h % W, y = oy + (h >>> 9) % W, ux = Math.floor(x / S8), uy = Math.floor(y / S8); if (ux < 0 || uy < 0 || ux >= DW || uy >= DH) continue; const j = uy * DW + ux; if (U.water[j] || U.road[j]) continue; const reg = U.region[j];
    if (reg === R.CAMPOS || reg === R.FLORESTA || reg === R.VILA) { g.fillStyle = reg === R.FLORESTA ? "#2f5f2a" : "#5d9a3a"; g.fillRect(x, y, 2, 5); g.fillRect(x + 3, y + 1, 2, 4); g.fillRect(x - 3, y + 2, 2, 3); }
    else if (reg === R.MONTANHAS) { g.fillStyle = "rgba(255,255,255,.9)"; g.fillRect(x, y, 2, 2); }
    else if (reg === R.PANTANO) { g.fillStyle = "rgba(25,30,30,.5)"; g.beginPath(); g.ellipse(x, y, 10 + h % 10, 5, 0, 0, 6.283); g.fill(); }
    else { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x, y, 3, 2); } }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
function buildInteriorChunk(cx, cy) {
  const c = canvas(CH * T, CH * T), g = c.getContext("2d"); g.imageSmoothingEnabled = false; const ox = cx * CH * T, oy = cy * CH * T;
  g.fillStyle = "#0b0910"; g.fillRect(0, 0, c.width, c.height); g.translate(-ox, -oy);
  for (const r of Object.values(ROOMS)) { g.fillStyle = A.pat[r.floor] || A.pat.cobble; g.fillRect(r.x * T, r.y * T, r.w * T, r.h * T); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(r.x * T, (r.y + 1) * T, r.w * T, 10); }
  for (const [x, y] of LAVA) { if (x * T < ox - T || x * T > ox + CH * T || y * T < oy - T || y * T > oy + CH * T) continue; g.fillStyle = A.pat.lava; g.fillRect(x * T, y * T, T, T); }
  if (LAVA.length) { let x0 = 1e9, x1 = 0, ys = new Set(); for (const [x, y] of LAVA) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ys.add(y); } const r = ROOMS.dragao, mid = r.y + r.h / 2; g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x0 * T, (Math.ceil(mid) - 3) * T + 6, (x1 - x0 + 1) * T, 5 * T); g.fillStyle = A.pat.bridge; g.fillRect(x0 * T, (Math.ceil(mid) - 3) * T, (x1 - x0 + 1) * T, 5 * T); g.fillStyle = "#3a2414"; g.fillRect(x0 * T, (Math.ceil(mid) - 3) * T, (x1 - x0 + 1) * T, 5); g.fillRect(x0 * T, (Math.ceil(mid) + 2) * T - 5, (x1 - x0 + 1) * T, 5); }
  g.setTransform(1, 0, 0, 1, 0, 0); return c;
}
export function chunkAt(cx, cy) {
  const k = cx + "," + cy; let c = chunks.get(k);
  if (!c) { c = buildChunk(cx, cy); chunks.set(k, c); if (chunks.size > 140) chunks.delete(chunks.keys().next().value); }
  else { chunks.delete(k); chunks.set(k, c); }
  return c;
}
export function drawGround(g, camX, camY, VW, VH) {
  const x0 = Math.floor(camX / (CH * T)), y0 = Math.floor(camY / (CH * T)), x1 = Math.floor((camX + VW) / (CH * T)), y1 = Math.floor((camY + VH) / (CH * T));
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { if (cx < 0 || cy < 0 || cx * CH >= MW || cy * CH >= MHA) continue; g.drawImage(chunkAt(cx, cy), cx * CH * T, cy * CH * T, CH * T + 1, CH * T + 1); }
}

// ---------- sprites tingidos ----------
const TINTS = {
  snow: (r, g, b, a) => [mix(r, 235, .45), mix(g, 242, .45), mix(b, 250, .5)],
  ice: (r, g, b) => { const l = lum(r, g, b); return [l * .6 + 40, l * .85 + 50, l + 70]; },
  void: (r, g, b) => { const l = lum(r, g, b); return [l * .55 + 30, l * .4 + 18, l * .8 + 50]; },
  swamp: (r, g, b) => [r * .9 + 20, g * .7, b * .5],
  flash: () => [255, 255, 255],
  copper: (r, g, b) => { const l = lum(r, g, b); return [l * .9 + 70, l * .55 + 25, l * .35 + 10]; },
  iron: (r, g, b) => { const l = lum(r, g, b); return [l * .75 + 40, l * .62 + 30, l * .55 + 28]; },
  silver: (r, g, b) => { const l = lum(r, g, b); return [l * .6 + 110, l * .62 + 115, l * .65 + 125]; },
  mithril: (r, g, b) => { const l = lum(r, g, b); return [l * .45 + 50, l * .7 + 90, l * .8 + 120]; },
  deep: (r, g, b) => { const l = lum(r, g, b); return [l * .55 + 40, l * .3 + 15, l * .7 + 50]; },
  ancient: (r, g, b) => [r * .6 + 40, g * .9 + 10, b * .6 + 30],
  goblin: (r, g, b) => { const l = lum(r, g, b); return [l * .55 + 30, l * .9 + 30, l * .4 + 10]; },
  fire: (r, g, b) => { const l = lum(r, g, b); return [Math.min(255, l * 1.1 + 70), l * .55 + 10, l * .2]; },
  ember: (r, g, b) => { const l = lum(r, g, b); return [l * .55 + 25, l * .4 + 12, l * .35 + 10]; },
};
function sprite(name, tint) {
  const im = A.sp[name]; if (!im || !tint) return im;
  const k = name + "|" + tint; if (!A.tint[k]) A.tint[k] = recolor(im, TINTS[tint]);
  return A.tint[k];
}
function blit(g, name, cx, by, scale = 1, mirror = false, tint = null) {
  const im = sprite(name, tint); if (!im) return false;
  const w = im.width * scale, h = im.height * scale;
  if (mirror) { g.save(); g.translate(cx, 0); g.scale(-1, 1); g.drawImage(im, -w / 2, by - h, w, h); g.restore(); } else g.drawImage(im, Math.round(cx - w / 2), Math.round(by - h), w, h);
  return true;
}
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
function shadow(g, cx, by, rx, ry = rx * .4, a = .28) { g.fillStyle = `rgba(10,8,14,${a})`; g.beginPath(); g.ellipse(cx, by - ry * .5, rx, ry, 0, 0, 6.283); g.fill(); }

// ---------- objetos ----------
function roofTower(g, x, by, w, h, wall, roof, ruin) {
  rect(g, x - w / 2, by - h, w, h, wall); rect(g, x - w / 2, by - h, 3, h, "rgba(0,0,0,.18)"); rect(g, x + w / 2 - 4, by - h, 4, h, "rgba(255,255,255,.08)");
  for (let yy = by - h + 8; yy < by - 4; yy += 8) rect(g, x - w / 2, yy, w, 1, "rgba(0,0,0,.15)");
  if (ruin) { for (let i = 0; i < w; i += 6) rect(g, x - w / 2 + i, by - h - (i % 12 ? 3 : 7), 4, 7, wall); return; }
  g.fillStyle = roof; g.beginPath(); g.moveTo(x - w / 2 - 4, by - h); g.lineTo(x, by - h - w * .9); g.lineTo(x + w / 2 + 4, by - h); g.closePath(); g.fill();
  g.fillStyle = "rgba(0,0,0,.2)"; g.beginPath(); g.moveTo(x, by - h - w * .9); g.lineTo(x + w / 2 + 4, by - h); g.lineTo(x + 2, by - h); g.closePath(); g.fill();
  rect(g, x - 3, by - h + 10, 6, 8, "#2a2030");
}
export function drawObject(g, o) {
  const cx = (o.x + .5) * T, by = (o.y + 1) * T;
  switch (o.kind) {
    case "tree": { const big = ["oak", "pine", "willow", "dead", "tree_round"].includes(o.sprite); shadow(g, cx + 4, by - 2, (big ? 18 : 11) * (o.big || 1)); if (!blit(g, o.sprite, cx, by + 2, o.big || 1, hash(o.x, o.y) % 2 === 0, o.tint)) { rect(g, cx - 3, by - 18, 6, 16, "#4a3320"); g.fillStyle = "#2f6a2a"; g.beginPath(); g.arc(cx, by - 26, 14, 0, 6.283); g.fill(); } break; }
    case "peak": { const h = hash(o.x, o.y), w = 30 + h % 14, hh = 34 + (h >>> 6) % 20; shadow(g, cx + 6, by, w * .7); g.fillStyle = "#7d8a98"; g.beginPath(); g.moveTo(cx - w, by); g.lineTo(cx - 2, by - hh); g.lineTo(cx + w, by); g.closePath(); g.fill(); g.fillStyle = "#5d6875"; g.beginPath(); g.moveTo(cx - 2, by - hh); g.lineTo(cx + w, by); g.lineTo(cx + 4, by); g.closePath(); g.fill(); g.fillStyle = "#f4f8fb"; g.beginPath(); g.moveTo(cx - w * .42, by - hh * .55); g.lineTo(cx - 2, by - hh); g.lineTo(cx + w * .4, by - hh * .5); g.lineTo(cx + 6, by - hh * .45); g.lineTo(cx - 4, by - hh * .6); g.closePath(); g.fill(); break; }
    case "ruinwall": { const h = hash(o.x, o.y), w = 26, hh = 18 + h % 22; shadow(g, cx + 4, by, 16); rect(g, cx - w / 2, by - hh, w, hh, "#5c4d6c"); rect(g, cx - w / 2, by - hh, w, 3, "#7e6e90"); for (let yy = by - hh + 6; yy < by; yy += 6) rect(g, cx - w / 2, yy, w, 1, "#463a54"); rect(g, cx - w / 2 + (h % 10), by - hh - 5, 7, 5, "#5c4d6c"); break; }
    case "wall": { rect(g, cx - 16, by - 38, 32, 38, "#a79b86"); rect(g, cx - 16, by - 38, 32, 4, "#c9bea6"); for (let yy = by - 30; yy < by; yy += 8) { rect(g, cx - 16, yy, 32, 1, "#7d7364"); const off = ((yy / 8) % 2) * 8; for (let xx = -16 + off; xx < 16; xx += 16) rect(g, cx + xx, yy - 7, 1, 7, "#7d7364"); } for (let xx = -16; xx < 16; xx += 10) rect(g, cx + xx, by - 44, 6, 6, "#a79b86"); rect(g, cx - 16, by - 4, 32, 4, "rgba(0,0,0,.25)"); break; }
    case "tower": { shadow(g, cx + 6, by, 26, 10); roofTower(g, cx, by, 44, 64, o.ruin ? "#6c5c7c" : "#c4b9a2", o.ruin ? "#3a2c48" : "#2f4f8f", o.ruin); if (o.gate) { rect(g, cx - 9, by - 22, 18, 22, "#3a2a1a"); rect(g, cx - 7, by - 20, 14, 20, "#5e4022"); } break; }
    case "castle": { const s = o.small ? .8 : 1, w = 280 * s, h = 120 * s; shadow(g, cx + 10, by, w * .55, 16); rect(g, cx - w / 2, by - h, w, h, "#d8cfbb"); rect(g, cx - w / 2, by - h, w, 6, "#ece4d2"); for (let yy = by - h + 14; yy < by; yy += 12) rect(g, cx - w / 2, yy, w, 1, "rgba(0,0,0,.12)"); for (let xx = -w / 2; xx < w / 2; xx += 14) rect(g, cx + xx, by - h - 8, 8, 8, "#d8cfbb");
      for (const [dx, th] of [[-w / 2, h + 40], [w / 2, h + 40], [-w / 4, h + 70], [w / 4, h + 70], [0, h + 110]]) roofTower(g, cx + dx, by, dx === 0 ? 56 : 44, th * s, "#e9e1cf", "#2f4f8f");
      rect(g, cx - 18 * s, by - 46 * s, 36 * s, 46 * s, "#3a2a1a"); rect(g, cx - 14 * s, by - 42 * s, 28 * s, 42 * s, "#7a2a2a"); rect(g, cx - 1, by - 42 * s, 2, 42 * s, "#3a2a1a"); break; }
    case "darktower": { g.fillStyle = "rgba(170,100,255,.22)"; g.beginPath(); g.arc(cx, by - 90, 70, 0, 6.283); g.fill(); shadow(g, cx + 8, by, 40, 12); for (const [dx, th, w] of [[-34, 110, 30], [34, 110, 30], [0, 160, 40]]) { rect(g, cx + dx - w / 2, by - th, w, th, "#3b2f4b"); rect(g, cx + dx - w / 2, by - th, 4, th, "#2a2036"); g.fillStyle = "#241c30"; g.beginPath(); g.moveTo(cx + dx - w / 2 - 4, by - th); g.lineTo(cx + dx, by - th - 34); g.lineTo(cx + dx + w / 2 + 4, by - th); g.closePath(); g.fill(); rect(g, cx + dx - 3, by - th + 20, 6, 12, "#c48bff"); rect(g, cx + dx - 3, by - th + 50, 6, 12, "#9c6ee0"); } break; }
    case "node": { const n = o.node, empty = n.remaining <= 0 && n.refill_at && new Date(n.refill_at) > new Date(); g.globalAlpha = empty ? .4 : 1;
      if (n.kind === "pesca") { const t = performance.now() / 600; g.strokeStyle = "rgba(230,245,255,.8)"; g.lineWidth = 2; for (let k = 0; k < 3; k++) { const rr = ((t + k / 3) % 1) * 14 + 3; g.globalAlpha = (empty ? .3 : 1) * (1 - ((t + k / 3) % 1)); g.beginPath(); g.ellipse(cx, by - 14, rr, rr * .45, 0, 0, 6.283); g.stroke(); } g.globalAlpha = 1; rect(g, cx - 1, by - 30, 2, 14, "#6b4a2c"); rect(g, cx - 3, by - 16, 6, 4, "#d84a3a"); break; }
      shadow(g, cx + 4, by, n.kind.startsWith("veio") || n.kind === "rocha" ? 16 : 14);
      blit(g, o.sprite, cx, by + 2, n.kind === "carvalho_antigo" ? 1.25 : n.kind.startsWith("veio") ? 1.15 : 1, false, o.tint);
      if (n.kind.startsWith("veio")) { const col = { veio_cobre: "#e08a3a", veio_ferro: "#c9b8a8", veio_prata: "#f2f6ff", veio_mitril: "#7fe8ff", veio_profundo: "#c48bff" }[n.kind]; for (let k = 0; k < 4; k++) { const h = hash(o.x * 7 + k, o.y); rect(g, cx - 12 + h % 22, by - 30 + (h >>> 5) % 20, 3, 3, col); } }
      if (n.kind === "erva" && !empty) { const tt = performance.now() / 400; g.fillStyle = "rgba(255,255,200,.8)"; g.fillRect(cx - 6 + Math.sin(tt) * 4, by - 26, 2, 2); }
      g.globalAlpha = 1; break; }
    case "monolith": { shadow(g, cx + 3, by, 10, 4); rect(g, cx - 7, by - 34, 14, 34, "#6e6a62"); rect(g, cx - 7, by - 34, 3, 34, "#57534c"); rect(g, cx - 4, by - 26, 8, 2, "#8cf0c8"); rect(g, cx - 2, by - 20, 4, 2, "#8cf0c8"); break; }
    case "altar": { shadow(g, cx + 16, by, 26, 7); rect(g, cx - 12, by - 22, 56, 22, "#7a766c"); rect(g, cx - 12, by - 22, 56, 5, "#a39e92"); const t = performance.now() / 500; g.fillStyle = `rgba(140,240,200,${.35 + Math.sin(t) * .15})`; g.beginPath(); g.arc(cx + 16, by - 30, 10, 0, 6.283); g.fill(); rect(g, cx + 14, by - 34, 4, 8, "#d8fff0"); break; }
    case "portal": { const t = performance.now() / 900; shadow(g, cx, by, 44, 10); rect(g, cx - 44, by - 96, 14, 96, "#5c5568"); rect(g, cx + 30, by - 96, 14, 96, "#5c5568"); rect(g, cx - 48, by - 106, 96, 14, "#6c6478"); g.save(); g.beginPath(); g.ellipse(cx, by - 48, 28, 44, 0, 0, 6.283); g.clip(); const gr = g.createRadialGradient(cx, by - 48, 2, cx, by - 48, 46); gr.addColorStop(0, "rgba(200,170,255,.9)"); gr.addColorStop(1, "rgba(60,30,110,.9)"); g.fillStyle = gr; g.fillRect(cx - 30, by - 94, 60, 92); g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, by - 48, 8 + k * 9, t + k, t + k + 3.5); g.stroke(); } g.restore(); g.strokeStyle = "#c9b27a"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 30, by - 70); g.lineTo(cx + 30, by - 26); g.moveTo(cx + 30, by - 70); g.lineTo(cx - 30, by - 26); g.stroke(); break; }
    case "iwall": { const st = o.style, base = st === "wood" ? ["#6b4a2c", "#4a3320", "#8a6438"] : st === "cave" ? ["#3a2e2a", "#241c1a", "#4e403a"] : ["#7d7364", "#585044", "#a79b86"];
      if (o.top) { rect(g, cx - 16, by - 52, 32, 52, base[0]); rect(g, cx - 16, by - 52, 32, 6, base[2]); for (let yy = by - 44; yy < by; yy += 10) rect(g, cx - 16, yy, 32, 1, base[1]); rect(g, cx - 16, by - 4, 32, 4, "rgba(0,0,0,.35)"); }
      else if (o.side) { rect(g, cx - 16, by - 40, 32, 40, base[1]); rect(g, cx - 12, by - 40, 24, 40, base[0]); }
      else { rect(g, cx - 16, by - 18, 32, 18, base[0]); rect(g, cx - 16, by - 18, 32, 4, base[2]); }
      break; }
    case "exit": { g.fillStyle = "rgba(255,210,120,.25)"; g.fillRect(cx - 16, by - 32, 32, 32); g.fillStyle = "#ffd27a"; g.font = "900 12px Nunito"; g.textAlign = "center"; g.fillText("SAÍDA", cx, by - 12); break; }
    case "furn": { shadow(g, cx + 4, by, 14, 5); const big = ["bar", "barrel_rack", "fireplace", "weapon_rack", "bookshelf", "throne", "table", "cart"].includes(o.sprite); if (!blit(g, o.sprite, cx + ((o.fw || 1) - 1) * 16, by + 2, 1)) rect(g, cx - 12, by - 20, 24 + ((o.fw || 1) - 1) * 32, 20, big ? "#6b4a2c" : "#8a6438"); break; }
    case "building": {
      if (o.sprite === "windmill") { shadow(g, cx + 6, by, 22, 8); rect(g, cx - 14, by - 56, 28, 56, "#e2d6bf"); rect(g, cx - 14, by - 56, 4, 56, "#b8ab92"); g.fillStyle = "#8a3a2a"; g.beginPath(); g.moveTo(cx - 18, by - 56); g.lineTo(cx, by - 78); g.lineTo(cx + 18, by - 56); g.fill(); g.strokeStyle = "#5a3e22"; g.lineWidth = 4; const a = (performance.now() / 1600) % 6.283; for (let k = 0; k < 4; k++) { const aa = a + k * 1.5708; g.beginPath(); g.moveTo(cx, by - 60); g.lineTo(cx + Math.cos(aa) * 40, by - 60 + Math.sin(aa) * 40); g.stroke(); } rect(g, cx - 5, by - 16, 10, 16, "#5e4022"); break; }
      const big = ["house", "house2", "house_thatch", "house_thatch2", "tent", "mine", "barn", "tavern", "witch_hut", "cave_entrance", "ice_cave", "wolf_den", "watchtower"].includes(o.sprite); shadow(g, cx + 6, by - 2, big ? 48 : 14, big ? 12 : 6);
      const alias = { ice_cave: ["cave_entrance", "ice"], anvil_forge: ["anvil", null] }[o.sprite] || [o.sprite, null];
      if (!blit(g, alias[0], cx, by + 4, 1, false, alias[1])) { if (big) rect(g, cx - 30, by - 44, 60, 44, "#7a5a3a"); }
      if (o.door) { g.fillStyle = "rgba(255,210,120,.9)"; g.font = "900 11px Nunito"; g.textAlign = "center"; g.fillText("▼", cx, by + 14); }
      break; }
  }
}
export function drawProps(g, x0, y0, x1, y1) {
  for (const p of props) { if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue; const im = A.sp[p.kind]; if (im) g.drawImage(im, Math.round((p.x + .5) * T - im.width / 2), Math.round((p.y + 1) * T - im.height - 1)); }
}

// ---------- criaturas e personagens ----------
export function drawMon(g, m) {
  const mt = MONS[m.type], s = mt.scale || (m.boss ? 1.6 : 1);
  // avanço curto na direção do alvo durante o ataque
  const k = m.atkT > 0 ? Math.sin((1 - m.atkT / .3) * Math.PI) : 0, lx = (m.atkDx || 0) * k * 7, ly = (m.atkDy || 0) * k * 7;
  const cx = (m.x + .5) * T + lx, by = (m.y + .5) * T + 14 + ly;
  shadow(g, cx, by + 1, m.boss ? 18 : 11, m.boss ? 6 : 4);
  const bob = m.moving ? Math.round(Math.sin(m.anim * 9) * 1) : Math.round(Math.sin(performance.now() / 400 + m.x) * .6);
  if (!blit(g, mt.sprite, cx, by + bob, s, m.face < 0, mt.tint)) { g.fillStyle = "#6b5a4a"; g.beginPath(); g.arc(cx, by - 10, 9, 0, 6.283); g.fill(); }
  if (m.hitT > 0) { g.globalAlpha = Math.min(1, m.hitT / .15) * .85; blit(g, mt.sprite, cx, by + bob, s, m.face < 0, "flash"); g.globalAlpha = 1; }
}
export function drawUnit(g, e) {
  const atk = e.atkT > 0 ? Math.min(3, Math.floor((1 - e.atkT / (e.atkDur || .36)) * 4)) : -1;
  const breath = !e.moving && atk < 0 && Math.sin(performance.now() / 520 + (e.seed || 0)) > .55 ? -1 : 0;
  const cx = (e.x + .5) * T, by = (e.y + .5) * T + 16 + breath;
  shadow(g, cx, by - breath, 10, 4, .32);
  const frame = e.moving ? Math.floor(e.anim * 2.2) % 6 : -1;
  const sp = charSprite(e.voc, e.king, e.dir || "down", frame, e.seed || 0, atk, e.hitT > 0);
  g.drawImage(sp, Math.round(cx - sp.width / 2), Math.round(by - sp.height));
}
export function drawMonGhost(g, m) { drawMon(g, { ...m, hitT: 0, atkT: 0, moving: false }); }
export { CH };
