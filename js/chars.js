// Personagens em pixel art montados por camadas: corpo, roupa da vocação, cor do reino, arma. 4 direções x 6 quadros de caminhada.
// Base 16x24 px com contorno, ampliada 2x (32x48). Cache por combinação.
import { KING } from "./data.js";

const SKIN = ["#e8b48a", "#c98d62", "#a0673f", "#f0c9a0"], HAIR = ["#3a2415", "#e8a84a", "#2b2b2b", "#b8552e", "#d8c070", "#5a3a2a"];
const OUTFIT = {
  knight: { body: "#9aa3ad", body2: "#6c7580", legs: "#4a4f58", helm: "#b8c0c8", cape: true },
  paladin: { body: "#7a5a34", body2: "#5a4024", legs: "#4a3a28", hood: "#3f6a3a" },
  sorcerer: { body: "#3b2f6b", body2: "#2a2050", legs: "#2a2050", robe: true, hat: "#2b2350" },
  druid: { body: "#5d7a3a", body2: "#43592a", legs: "#43592a", robe: true, hood: "#4b6a2e" },
  // NPCs
  banqueiro: { body: "#c18b36", body2: "#8a6224", legs: "#4a3a28", robe: true, hat: "#5a3a18" },
  mercador: { body: "#a8462f", body2: "#7a3020", legs: "#4a3a28" },
  sacerdote: { body: "#e8dfc9", body2: "#b8ad94", legs: "#b8ad94", robe: true, hood: "#d8cfb6" },
  ferreiro: { body: "#5a4636", body2: "#3a2c20", legs: "#2e2a26", apron: true },
  guarda: { body: "#8a929c", body2: "#5c636c", legs: "#3e434a", helm: "#a0a8b0", spear: true },
};
const cache = new Map();
// linha de pixels a partir de um pivô, num ângulo
function ray(g, x, y, ang, len, c, w = 1) { for (let i = 0; i < len; i++) { g.fillStyle = c; g.fillRect(Math.round(x + Math.cos(ang) * i), Math.round(y + Math.sin(ang) * i), w, w); } }
function attackWeapon(g, voc, dir, atk, ox, oy, K, F) {
  const side = dir === "left" || dir === "right";
  const hx = side ? (dir === "right" ? ox + 11 : ox + 5) : ox + 13, hy = oy + 13, fa = Math.atan2(F[1], F[0]);
  if (voc === "knight") {
    const ang = fa + [-2.3, -1.1, .15, .55][atk];
    ray(g, hx, hy, ang, 10, "#e6eaee"); ray(g, hx + Math.cos(ang), hy + Math.sin(ang) + 1, ang, 8, "#9aa3ad");
    ray(g, hx - Math.sin(ang) * 2, hy + Math.cos(ang) * 2, ang - 1.5708, 4, "#8a6a3a");
    g.fillStyle = "#d9a877"; g.fillRect(hx - 1, hy - 1, 2, 2);
    if (dir !== "up") { const sx = side ? (dir === "right" ? ox + 3 : ox + 11) : ox + 1; g.fillStyle = K.tunic; g.fillRect(sx, oy + 11, 4, 5); g.fillStyle = K.light; g.fillRect(sx + 1, oy + 12, 2, 3); }
  } else if (voc === "paladin") {
    const cx = hx + F[0] * 3, cy = hy - 2 + F[1] * 3, px = -F[1], py = F[0], pull = [1, 3, 0, 0][atk];
    for (let k = -5; k <= 5; k++) { const cur = (1 - (k / 5) ** 2) * 2; g.fillStyle = "#8a6a3a"; g.fillRect(Math.round(cx + px * k + F[0] * cur), Math.round(cy + py * k + F[1] * cur), 1, 1); }
    g.fillStyle = "#e8dfc9"; for (let k = -5; k <= 5; k++) { const t = 1 - Math.abs(k) / 5; g.fillRect(Math.round(cx + px * k - F[0] * pull * t), Math.round(cy + py * k - F[1] * pull * t), 1, 1); }
    if (atk <= 1) ray(g, cx - F[0] * pull, cy - F[1] * pull, fa, 8, "#d8dde2");
  } else {
    const ang = atk <= 1 ? -Math.PI / 2 + (dir === "left" ? -.25 : .25) : fa, len = 13, orb = voc === "druid" ? ["#7ec850", "#e4ffc0"] : ["#a98bd6", "#f4e8ff"];
    ray(g, hx, hy + 2, ang, len, voc === "druid" ? "#6b4a2c" : "#4a3a5a");
    const ex = Math.round(hx + Math.cos(ang) * len), ey = Math.round(hy + 2 + Math.sin(ang) * len), r = atk === 1 ? 2 : 1;
    g.fillStyle = orb[0]; g.fillRect(ex - r, ey - r, r * 2 + 1, r * 2 + 1); g.fillStyle = orb[1]; g.fillRect(ex, ey, 1, 1);
  }
}

function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function outline(src) {
  const w = src.width, h = src.height, g = src.getContext("2d"), d = g.getImageData(0, 0, w, h), o = new ImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d.data[i + 3] > 0) { o.data.set(d.data.slice(i, i + 4), i); continue; }
    let edge = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && d.data[(yy * w + xx) * 4 + 3] > 0) edge = true; }
    if (edge) { o.data[i] = 22; o.data[i + 1] = 16; o.data[i + 2] = 20; o.data[i + 3] = 255; }
  }
  g.putImageData(o, 0, 0); return src;
}

// desenha uma pose em 18x26 (1 px de margem pro contorno)
function pose(voc, king, dir, f, seed = 0, atk = -1) {
  const c = document.createElement("canvas"); c.width = 18; c.height = 26; const g = c.getContext("2d");
  const O = OUTFIT[voc] || OUTFIT.knight, K = KING[king] || KING.grey, skin = SKIN[seed % SKIN.length], hair = HAIR[(seed >> 2) % HAIR.length];
  const ph = f / 6 * Math.PI * 2, step = Math.round(Math.sin(ph) * 2), bob = (f % 3 === 1) ? -1 : 0, moving = f >= 0;
  const FV = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[dir] || [0, 1];
  const lunge = atk === 1 || atk === 2 ? 1 : 0;
  const ox = 1 + FV[0] * lunge, oy = 1 + (moving ? bob : 0) + FV[1] * lunge;
  const side = dir === "left" || dir === "right";
  // capa (atrás)
  if (O.cape && dir !== "up") px(g, ox + 4, oy + 9, 8, 9, K.dark);
  if (O.cape && dir === "up") px(g, ox + 3, oy + 9, 10, 11, K.tunic);
  // pernas
  if (!O.robe) {
    if (side) { px(g, ox + 6 + step, oy + 17, 2, 5, O.legs); px(g, ox + 8 - step, oy + 17, 2, 5, O.body2); px(g, ox + 6 + step, oy + 21, 3, 2, "#2a1d12"); px(g, ox + 8 - step, oy + 21, 3, 2, "#2a1d12"); }
    else { const l = moving ? Math.max(0, step) : 0, r = moving ? Math.max(0, -step) : 0; px(g, ox + 5, oy + 17, 3, 5 - l, O.legs); px(g, ox + 9, oy + 17, 3, 5 - r, O.legs); px(g, ox + 5, oy + 21 - l, 3, 2, "#2a1d12"); px(g, ox + 9, oy + 21 - r, 3, 2, "#2a1d12"); }
  } else {
    px(g, ox + 4, oy + 15, 9, 7, O.body2); px(g, ox + 4, oy + 21, 9, 1, O.body);
    if (moving) { px(g, ox + 5 + Math.max(0, step), oy + 22, 3, 1, "#2a1d12"); px(g, ox + 9 - Math.max(0, -step), oy + 22, 3, 1, "#2a1d12"); }
    else { px(g, ox + 5, oy + 22, 3, 1, "#2a1d12"); px(g, ox + 9, oy + 22, 3, 1, "#2a1d12"); }
  }
  // tronco
  px(g, ox + 4, oy + 9, 9, 8, O.body); px(g, ox + 4, oy + 15, 9, 2, O.body2);
  if (O.apron) px(g, ox + 6, oy + 11, 5, 7, "#7a5a3a");
  // faixa do reino no peito
  if (!side) px(g, ox + 5, oy + 10, 7, 2, dir === "up" ? K.dark : K.tunic); else px(g, ox + 6, oy + 10, 4, 2, K.tunic);
  px(g, ox + 4, oy + 15, 9, 1, "#2a1d12");                       // cinto
  // braços
  const sw = moving ? Math.round(Math.sin(ph + Math.PI) * 1.5) : 0;
  if (side) { px(g, ox + 7 - sw, oy + 10, 3, 6, O.body2); px(g, ox + 7 - sw, oy + 15, 3, 2, skin); }
  else { px(g, ox + 2, oy + 10 + sw, 2, 6, O.body2); px(g, ox + 13, oy + 10 - sw, 2, 6, O.body2); px(g, ox + 2, oy + 15 + sw, 2, 2, skin); px(g, ox + 13, oy + 15 - sw, 2, 2, skin); }
  // cabeça
  px(g, ox + 5, oy + 2, 7, 7, skin);
  if (dir === "down") { px(g, ox + 6, oy + 5, 1, 2, "#1a1210"); px(g, ox + 10, oy + 5, 1, 2, "#1a1210"); px(g, ox + 5, oy + 1, 7, 3, hair); px(g, ox + 4, oy + 2, 1, 4, hair); px(g, ox + 12, oy + 2, 1, 4, hair); }
  if (dir === "up") { px(g, ox + 5, oy + 1, 7, 7, hair); }
  if (side) { const e = dir === "right" ? 10 : 6; px(g, ox + e, oy + 5, 1, 2, "#1a1210"); px(g, ox + 5, oy + 1, 7, 3, hair); px(g, dir === "right" ? ox + 5 : ox + 10, oy + 2, 2, 5, hair); }
  // chapéus e elmos
  if (O.helm) { px(g, ox + 4, oy, 9, 4, O.helm); px(g, ox + 4, oy + 4, 1, 4, O.helm); px(g, ox + 12, oy + 4, 1, 4, O.helm); if (dir === "down") px(g, ox + 8, oy + 4, 1, 3, O.helm); px(g, ox + 8, oy - 1, 1, 2, K.color); }
  if (O.hood) { px(g, ox + 4, oy, 9, 4, O.hood); px(g, ox + 4, oy + 3, 1, 6, O.hood); px(g, ox + 12, oy + 3, 1, 6, O.hood); if (dir === "up") px(g, ox + 5, oy + 3, 7, 6, O.hood); }
  if (O.hat) { px(g, ox + 3, oy + 2, 11, 2, O.hat); px(g, ox + 5, oy - 1, 7, 3, O.hat); px(g, ox + 7, oy - 3, 3, 2, O.hat); px(g, ox + 5, oy + 1, 7, 1, K.tunic); }
  // armas
  if (atk >= 0 && ["knight", "paladin", "sorcerer", "druid"].includes(voc)) attackWeapon(g, voc, dir, atk, ox, oy, K, FV);
  else {
  const hand = side ? (dir === "right" ? ox + 11 : ox + 4) : ox + 14;
    if (voc === "knight") { if (!side || dir === "right") { px(g, hand, oy + 6, 1, 9, "#d8dde2"); px(g, hand - 1, oy + 14, 3, 1, "#8a6a3a"); } if (dir !== "up") { const sx = side ? (dir === "right" ? ox + 3 : ox + 11) : ox + 1; px(g, sx, oy + 11, 4, 5, K.tunic); px(g, sx + 1, oy + 12, 2, 3, K.light); } }
    if (voc === "paladin") { const bx = side ? (dir === "right" ? ox + 12 : ox + 3) : ox + 14; px(g, bx, oy + 7, 1, 10, "#8a6a3a"); px(g, bx + (dir === "left" ? -1 : 1), oy + 8, 1, 8, "#e8dfc9"); if (dir === "up") px(g, ox + 6, oy + 9, 5, 2, "#8a6a3a"); }
    if (voc === "sorcerer" || voc === "druid") { const sx = side ? (dir === "right" ? ox + 12 : ox + 4) : ox + 14; px(g, sx, oy + 4, 1, 14, voc === "druid" ? "#6b4a2c" : "#4a3a5a"); px(g, sx - 1, oy + 2, 3, 3, voc === "druid" ? "#7ec850" : "#a98bd6"); }
  }
  if (O.spear) { px(g, ox + 14, oy - 2, 1, 18, "#8a6a3a"); px(g, ox + 13, oy - 3, 3, 2, "#d8dde2"); }
  return outline(c);
}

export function charSprite(voc, king, dir, frame, seed = 0, atk = -1, flash = false) {
  const key = `${voc}|${king}|${dir}|${frame}|${seed}|${atk}|${flash}`; let c = cache.get(key);
  if (!c && flash) { const base = charSprite(voc, king, dir, frame, seed, atk); c = document.createElement("canvas"); c.width = base.width; c.height = base.height; const g = c.getContext("2d"); g.drawImage(base, 0, 0); g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(255,90,90,.75)"; g.fillRect(0, 0, c.width, c.height); cache.set(key, c); return c; }
  if (!c) { const p = pose(voc, king, dir, atk >= 0 ? -1 : frame, seed, atk); c = document.createElement("canvas"); c.width = 36; c.height = 52; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(p, 0, 0, 36, 52); cache.set(key, c); }
  return c;
}
