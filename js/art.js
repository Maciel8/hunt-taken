// Arte: carrega texturas e sprites gerados (assets/), desenha mapa, objetos e unidades. Tem fallback simples quando falta imagem.
import { T, MW, MH, HUNTS, CAPITAL, DEPOT, MONS, KING, VOC } from "./data.js";
import { map, props, at, walk, groundOf, hash, huntAt, inRect } from "./world.js";
import { S, fx, occupantsOf } from "./sim.js";

export const A = { tex: {}, sp: {}, ready: false };
const TEX = ["grass", "grass_dark", "dirt", "sand", "water", "cobble", "swamp", "rock"];
function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
export async function loadAssets() {
  const texes = await Promise.all(TEX.map(n => loadImg(`assets/tex/${n}.png`)));
  TEX.forEach((n, i) => { if (texes[i]) A.tex[n] = texes[i]; });
  try { const man = await (await fetch("assets/manifest.json")).json(); const imgs = await Promise.all(man.map(m => loadImg(`assets/sprites/${m.file}`))); man.forEach((m, i) => { if (imgs[i]) A.sp[m.name] = imgs[i]; }); } catch (e) { }
  A.ready = true;
}
const FALL = { grass: "#4c8534", grass_dark: "#2f5a2a", dirt: "#8c6b45", sand: "#d9c28a", water: "#1c4b86", cobble: "#8f8a7c", swamp: "#4a6a3a", rock: "#5e5c58" };
const C = { ink: "#15120f", gr1: "#4c8534", gr2: "#41752c", dirt4: "#644727", wat3: "#5f93cf", wat2: "#2a66ad", wood: "#6b4a2c", wood2: "#48301a", wood3: "#8d6843", stone: "#7d7d77", stone2: "#54544e", stone3: "#9f9f98" };
const rect = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function disc(g, cx, cy, r, c) { g.fillStyle = c; for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - w, cy + dy, 2 * w + 1, 1); } }

export const base = document.createElement("canvas"); base.width = MW * T; base.height = MH * T;
export const over = document.createElement("canvas"); over.width = MW * T; over.height = MH * T;
export const mini = document.createElement("canvas"); mini.width = MW * 2; mini.height = MH * 2;

function drawTex(g, name, px, py, x, y) {
  const im = A.tex[name];
  if (!im) { rect(g, px, py, T, T, FALL[name] || "#555"); const h = hash(x, y); for (let i = 0; i < 10; i++) { const k = hash(x * 7 + i, y * 13 + i); g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(px + (k % 32), py + ((k >> 6) % 32), 2, 1); } return; }
  const n = Math.floor(im.width / T) || 1; const sx = (x % n) * T, sy = (y % n) * T;
  g.drawImage(im, sx, sy, T, T, px, py, T, T);
}
export function drawGround() {
  const g = base.getContext("2d"); g.imageSmoothingEnabled = false;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) drawTex(g, groundOf(x, y), x * T, y * T, x, y);
  // bordas: terra dentada e água com contorno
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const gnd = groundOf(x, y), px = x * T, py = y * T, h = hash(x, y);
    if (gnd === "dirt") {
      for (const [dx, dy, side] of [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]]) {
        const ng = groundOf(x + dx, y + dy); if (ng === "dirt" || ng === "water") continue;
        g.save(); g.beginPath();
        for (let i = 0; i < 32; i += 3) { const d = 1 + ((h >> ((i / 3) % 20)) & 3); if (side === 0) g.rect(px + i, py, 3, d); if (side === 1) g.rect(px + i, py + 32 - d, 3, d); if (side === 2) g.rect(px, py + i, d, 3); if (side === 3) g.rect(px + 32 - d, py + i, d, 3); }
        g.clip(); drawTex(g, ng, px, py, x + dx, y + dy); g.restore();
      }
    }
    if (gnd === "water") {
      const n = (dx, dy) => groundOf(x + dx, y + dy) === "water";
      if (!n(0, -1)) { rect(g, px, py, 32, 2, C.dirt4); rect(g, px, py + 2, 32, 2, C.wat3); }
      if (!n(0, 1)) { rect(g, px, py + 30, 32, 2, C.dirt4); rect(g, px, py + 28, 32, 2, C.wat2); }
      if (!n(-1, 0)) { rect(g, px, py, 2, 32, C.dirt4); rect(g, px + 2, py, 2, 32, C.wat3); }
      if (!n(1, 0)) { rect(g, px + 30, py, 2, 32, C.dirt4); rect(g, px + 28, py, 2, 32, C.wat2); }
    }
  }
  // sombras de árvores e rochas no chão
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) { const t = at(x, y); if (t === 3 || t === 8) { g.globalAlpha = .28; disc(g, x * T + 16, y * T + 27, t === 3 ? 13 : 11, C.ink); g.globalAlpha = 1; } }
  // props decorativos rasteiros
  for (const p of props) { const im = A.sp[p.kind]; if (im) g.drawImage(im, p.x * T + 16 - im.width / 2, p.y * T + 30 - im.height); else { disc(g, p.x * T + 16, p.y * T + 20, 6, p.kind.includes("flower") ? "#e2b84a" : "#2b672b"); } }
}
function blit(g, name, cx, by, scale = 1, mirror = false) {
  const im = A.sp[name]; if (!im) return false;
  const w = im.width * scale, h = im.height * scale;
  g.save(); if (mirror) { g.translate(cx, 0); g.scale(-1, 1); g.drawImage(im, -w / 2, by - h, w, h); } else g.drawImage(im, cx - w / 2, by - h, w, h); g.restore(); return true;
}
function drawTreeFallback(g, x, y) { const h = hash(x, y), px = x * T, py = y * T, r = h % 3 === 0 ? 20 : 17, cx = px + 12, cy = py - 2; rect(g, px + 11, py + 10, 10, 20, "#2b1d10"); rect(g, px + 12, py + 10, 7, 20, "#4c351f"); disc(g, cx, cy, r, "#1c4620"); disc(g, cx - 2, cy - 2, r - 3, "#2b672b"); disc(g, cx - 5, cy - 6, r - 8, "#44893a"); }
export function drawOver() {
  const g = over.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, over.width, over.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const t = at(x, y), px = x * T, py = y * T, h = hash(x, y);
    if (t === 3) { const gnd = groundOf(x, y); const name = gnd === "grass_dark" ? (h % 4 === 0 ? "willow" : "pine") : gnd === "swamp" ? (h % 2 ? "willow" : "dead") : gnd === "rock" || gnd === "cobble" ? "dead" : (h % 5 === 0 ? "pine" : "oak"); if (!blit(g, name, px + 16, py + 30, 1)) drawTreeFallback(g, x, y); }
    if (t === 8) { if (!blit(g, "boulder", px + 16, py + 30, 1)) { disc(g, px + 16, py + 19, 12, C.stone2); disc(g, px + 14, py + 17, 10, C.stone); } }
    if (t === 7) { if (!blit(g, "fence", px + 16, py + 30, 1)) { rect(g, px, py + 11, 32, 4, C.wood2); rect(g, px, py + 19, 32, 4, C.wood2); rect(g, px + 4, py + 5, 5, 24, C.wood2); rect(g, px + 20, py + 5, 5, 24, C.wood2); } }
  }
  // casas (3x3 tiles) e barraca
  for (const [hx, hy, nm] of [[3, 2, "house"], [8, 2, "house2"]]) { if (!blit(g, nm, hx * T + 48, hy * T + 96, 1)) { rect(g, hx * T, hy * T + 44, 96, 52, "#8b877d"); rect(g, hx * T - 8, hy * T - 12, 108, 58, "#8d3f2f"); } }
  if (!blit(g, "stall", (DEPOT.x - 1) * T + 32, DEPOT.y * T + 32, 1)) { rect(g, (DEPOT.x - 1) * T + 4, DEPOT.y * T + 12, 56, 20, C.wood2); rect(g, (DEPOT.x - 1) * T, DEPOT.y * T - 18, 64, 12, "#a8322a"); }
  blit(g, "well", 11 * T + 16, 4 * T + 30, 1); blit(g, "lantern", 6 * T + 16, 5 * T + 30, 1); blit(g, "lantern", 10 * T + 16, 8 * T + 30, 1);
  for (const h of HUNTS) { if (!blit(g, "sign", h.door[0] * T + 16, h.door[1] * T + 28, 1)) { const px = h.door[0] * T, py = h.door[1] * T; rect(g, px + 13, py - 20, 6, 26, C.wood2); rect(g, px + 2, py - 30, 28, 16, C.wood2); rect(g, px + 4, py - 28, 24, 12, C.wood); } if (h.mon === "bandido") { blit(g, "tent", h.rect.x * T + 80, h.rect.y * T + 64, 1); blit(g, "campfire", h.rect.x * T + 140, h.rect.y * T + 96, 1); } if (h.region === "minas") blit(g, "mine", h.rect.x * T + 48, h.rect.y * T + 32, 1); }
  const mg = mini.getContext("2d"); mg.imageSmoothingEnabled = true; mg.drawImage(base, 0, 0, mini.width, mini.height); mg.drawImage(over, 0, 0, mini.width, mini.height);
}

// ---------- unidades ----------
function drawHumanFallback(g, e, tunic) { const px = e.x * T, py = e.y * T; rect(g, px + 10, py + 6, 12, 14, tunic); disc(g, px + 16, py + 6, 5, "#d9a877"); rect(g, px + 10, py + 20, 5, 8, "#2a1d12"); rect(g, px + 17, py + 20, 5, 8, "#2a1d12"); }
export function drawUnit(g, e, voc, isPlayer) {
  const px = e.x * T, py = e.y * T, frame = (e.moving > 0 && Math.floor(S.t) % 2 === 0), dir = e.dir || "down";
  g.globalAlpha = .3; disc(g, px + 16, py + 29, 9, "#000"); g.globalAlpha = 1;
  const name = `${voc}_${dir}${frame ? "_walk" : ""}`, alt = `${voc}_${dir}`;
  if (!blit(g, A.sp[name] ? name : alt, px + 16, py + 30 - (frame ? 1 : 0), 1, false)) drawHumanFallback(g, e, KING[e.king].tunic);
  // faixa de cor do reino (ombro)
  rect(g, px + 10, py + 1, 12, 2, KING[e.king].color);
}
export function drawMon(g, m) {
  const mt = MONS[m.type], px = m.x * T, py = m.y * T;
  g.globalAlpha = .3; disc(g, px + 16, py + 29, m.boss ? 14 : 9, "#000"); g.globalAlpha = 1;
  if (!blit(g, mt.sprite, px + 16, py + 30, m.boss ? 1.6 : 1, m.face < 0)) { disc(g, px + 16, py + 18, m.boss ? 14 : 9, m.boss ? "#7a2a2a" : "#6b5a4a"); g.fillStyle = "#fff"; g.font = "700 10px Nunito"; g.textAlign = "center"; g.fillText(mt.name[0], px + 16, py + 22); }
}
