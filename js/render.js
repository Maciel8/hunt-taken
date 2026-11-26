// Render: câmera com mola, chão por pedaços, objetos e unidades ordenados pela profundidade, rótulos, minimapa pintado.
import { T, MW, MH, HUNTS, MONS, KING, ZONES, TOWNS } from "./data.js";
import { objects, huntAt, regionAt, zoneAt, NPCS, ROOMS, interiorAt } from "./world.js";
import { S, fx, occupantsOf } from "./sim.js";
import { A, drawGround, drawObject, drawProps, drawMon, drawUnit, CH } from "./art.js";
import { updateFx, drawFx } from "./fx.js";

export const cv = document.getElementById("view"), cx = cv.getContext("2d");
let VW = cv.width, VH = cv.height;
export const cam = { x: 0, y: 0, follow: true, init: false, zoom: 1, min: .4, max: 2.5 };
// zoom em torno de um ponto da tela (sx, sy); sem ponto, usa o centro
export function zoomBy(f, sx, sy) { const z0 = cam.zoom, z1 = Math.max(cam.min, Math.min(cam.max, z0 * f)); if (z1 === z0) return; if (sx == null) { sx = VW / 2; sy = VH / 2; } const wx = cam.x + sx / z0, wy = cam.y + sy / z0; cam.zoom = z1; cam.x = wx - sx / z1; cam.y = wy - sy / z1; }
const MINI = { w: 210, h: 140 };
export function resize() { const r = cv.parentElement.getBoundingClientRect(); const full = window.innerWidth > 1100 && r.height > 300; cv.width = Math.max(480, Math.floor(r.width)); cv.height = full ? Math.floor(r.height) : Math.floor(cv.width * 0.62); VW = cv.width; VH = cv.height; }
function label(text, x, y, color, size = 11, bg = "rgba(14,10,18,.78)") { cx.font = `800 ${size}px Nunito, sans-serif`; cx.textAlign = "center"; const w = cx.measureText(text).width + 10; cx.fillStyle = bg; cx.fillRect(Math.round(x - w / 2), Math.round(y - size - 2), Math.round(w), size + 6); cx.fillStyle = color; cx.fillText(text, Math.round(x), Math.round(y)); }
function plaque(a, b, x, y) {
  cx.font = "700 18px Cinzel, serif"; const w1 = cx.measureText(a).width; cx.font = "700 12px Cinzel, serif"; const w2 = cx.measureText(b).width; const w = Math.max(w1, w2) + 34, h = 50, x0 = Math.round(x - w / 2), y0 = Math.round(y);
  cx.fillStyle = "rgba(10,8,14,.88)"; cx.fillRect(x0, y0, w, h); cx.strokeStyle = "#C18B36"; cx.lineWidth = 2; cx.strokeRect(x0 + .5, y0 + .5, w - 1, h - 1); cx.strokeStyle = "rgba(193,139,54,.45)"; cx.strokeRect(x0 + 4.5, y0 + 4.5, w - 9, h - 9);
  cx.textAlign = "center"; cx.fillStyle = "#f3ead6"; cx.font = "700 18px Cinzel, serif"; cx.fillText(a, x, y0 + 23); cx.font = "700 12px Cinzel, serif"; cx.fillStyle = "#d9c79b"; cx.fillText(b, x, y0 + 40);
}
// índice espacial dos objetos por pedaço
let bucket = null;
export function resetBucket() { bucket = null; }
function buildBucket() { bucket = new Map(); for (const o of objects) { const k = Math.floor(o.x / CH) + "," + Math.floor(o.y / CH); if (!bucket.has(k)) bucket.set(k, []); bucket.get(k).push(o); } }
let banner = { text: "", sub: "", until: 0, region: null };

export function render(dt) {
  const P = S.p; if (!bucket) buildBucket();
  // câmera: mola com zona morta e leve adianto na direção do movimento
  updateFx(dt);
  const z = cam.zoom, WW = VW / z, WH = VH / z;
  const px = (P.x + .5) * T, py = (P.y + .5) * T;
  if (!cam.init) { cam.x = px - WW / 2; cam.y = py - WH / 2; cam.init = true; }
  if (cam.follow) {
    const lx = (P.vx || 0) * 14, ly = (P.vy || 0) * 14;
    const tx = px + lx - WW / 2, ty = py + ly - WH / 2, k = 1 - Math.exp(-dt * 5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  }
  const room = ROOMS[interiorAt(Math.round(P.x), Math.round(P.y))];
  if (room) { const rx0 = room.x * T, ry0 = room.y * T, rw = room.w * T, rh = room.h * T; cam.x = rw <= WW ? rx0 + rw / 2 - WW / 2 : Math.max(rx0, Math.min(cam.x, rx0 + rw - WW)); cam.y = rh <= WH ? ry0 + rh / 2 - WH / 2 : Math.max(ry0, Math.min(cam.y, ry0 + rh - WH)); }
  else { cam.x = Math.max(0, Math.min(cam.x, MW * T - WW)); cam.y = Math.max(0, Math.min(cam.y, MH * T - WH)); }
  const ox = Math.round(cam.x * z) / z, oy = Math.round(cam.y * z) / z;
  cx.setTransform(1, 0, 0, 1, 0, 0); cx.imageSmoothingEnabled = false;
  cx.fillStyle = "#171522"; cx.fillRect(0, 0, VW, VH);
  cx.save(); cx.setTransform(z, 0, 0, z, -ox * z, -oy * z);
  drawGround(cx, ox, oy, WW, WH);
  const tx0 = Math.floor(ox / T) - 2, ty0 = Math.floor(oy / T) - 2, tx1 = Math.ceil((ox + WW) / T) + 2, ty1 = Math.ceil((oy + WH) / T) + 6;
  drawProps(cx, tx0, ty0, tx1, ty1);
  // área de caça atual: círculo pontilhado dourado
  const hh = P.huntId && HUNTS.find(x => x.id === P.huntId);
  if (hh) { cx.strokeStyle = "rgba(193,139,54,.75)"; cx.lineWidth = 2; cx.setLineDash([8, 8]); cx.beginPath(); cx.arc((hh.cx + .5) * T, (hh.cy + .5) * T, hh.r * T, 0, 6.283); cx.stroke(); cx.setLineDash([]); }
  // lista de profundidade
  const ents = [];
  for (let by = Math.floor(ty0 / CH) - 1; by <= Math.floor(ty1 / CH) + 1; by++) for (let bx = Math.floor(tx0 / CH) - 1; bx <= Math.floor(tx1 / CH) + 1; bx++) { const list = bucket.get(bx + "," + by); if (!list) continue; for (const o of list) if (o.x >= tx0 - 6 && o.x <= tx1 + 6 && o.y >= ty0 && o.y <= ty1 + 4) ents.push({ y: o.y + 1, d: () => drawObject(cx, o) }); }
  for (const m of S.mons) if (m.alive && m.x > tx0 && m.x < tx1 && m.y > ty0 && m.y < ty1) ents.push({ y: m.y + 1, d: () => drawMon(cx, m) });
  for (const n of NPCS) if (n.x > tx0 && n.x < tx1 && n.y > ty0 && n.y < ty1) ents.push({ y: n.y + 1, d: () => drawUnit(cx, n) });
  for (const b of S.others || []) ents.push({ y: b.y + 1, d: () => drawUnit(cx, b) });
  if (P.dead === 0 || Math.floor(S.t) % 2) ents.push({ y: P.y + 1.01, d: () => drawUnit(cx, P) });
  ents.sort((a, b) => a.y - b.y).forEach(e => e.d());
  drawFx(cx);
  // tinta de zona em conflito/guerra perto da câmera (leve)
  cx.restore();
  // rótulos em coordenadas de tela
  const sx = v => (v - ox) * z, sy = v => (v - oy) * z;
  for (const t of TOWNS) { const x = sx((t.tx + .5) * T), y = sy(t.ty * T - 70); if (x > -80 && x < VW + 80 && y > -20 && y < VH + 80) label(t.name, x, y, t.zone === "segura" ? "#a8cc93" : "#cdb6ef", 12); }
  for (const h of HUNTS) { const x = sx((h.cx + .5) * T), y = sy((h.cy - h.r) * T) + 4; if (x < -100 || x > VW + 100 || y < -20 || y > VH + 40) continue; const o = occupantsOf(h.id).length; label(`${h.name} · lv ${MONS[h.mon].lvl}${o ? " · " + o + " online" : ""}`, x, y, "#fff6e8", 11); }
  for (const n of NPCS) { const x = sx((n.x + .5) * T), y = sy((n.y + .5) * T - 38); if (x > -40 && x < VW + 40 && y > -10 && y < VH + 40) label(`NPC · ${n.title}`, x, y, "#ffd27a", 10, "rgba(60,40,10,.85)"); }
  for (const b of S.others || []) label(`${b.name} · ${b.lvl}`, sx((b.x + .5) * T), sy((b.y + .5) * T - 40), KING[b.king].color);
  label(`${P.name} · ${P.lvl}`, sx((P.x + .5) * T), sy((P.y + .5) * T - 40), KING[P.king].color);
  if (P.gathering) { const k = Math.max(0, Math.min(1, 1 - (P.gathering.until - Date.now()) / P.gathering.total)), x = sx((P.x + .5) * T) - 20, y = sy((P.y + .5) * T - 56); cx.fillStyle = "rgba(14,10,18,.85)"; cx.fillRect(x - 2, y - 2, 44, 8); cx.fillStyle = "#C18B36"; cx.fillRect(x, y, 40 * k, 4); label(P.gathering.node.node.name, x + 20, y - 6, "#ffd27a", 10); }
  for (const m of S.mons) if (m.alive && (m.hp < (m.hpMax || MONS[m.type].hp) || m.boss)) { const x = sx((m.x + .5) * T) - 12, y = sy((m.y + .5) * T + 18); cx.fillStyle = "#15120f"; cx.fillRect(x - 1, y - 1, 26, 5); cx.fillStyle = m.boss ? "#ffcf5a" : "#e33"; cx.fillRect(x, y, 24 * Math.max(0, m.hp) / (m.hpMax || MONS[m.type].hp), 3); if (m.boss) label(MONS[m.type].name, x + 12, y - 44, "#ffcf5a"); }
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t -= dt * 10; if (f.t <= 0) { fx.splice(i, 1); continue; } cx.font = "900 12px Nunito"; cx.textAlign = "center"; const x = sx((f.x + .5) * T), y = sy((f.y + .5) * T - 30) - (8 - f.t) * 2; cx.fillStyle = "#15120f"; cx.fillText(f.v, x + 1, y + 1); cx.fillStyle = f.c; cx.fillText(f.v, x, y); }
  // faixa de região ao entrar
  const inside = interiorAt(Math.round(P.x), Math.round(P.y)); const reg = inside ? { id: inside, name: ROOMS[inside].name, zone: ROOMS[inside].dungeon ? "conflito" : "segura" } : regionAt(P.x, P.y); if (reg && banner.region !== reg.id) { const z = inside ? reg.zone : zoneAt(P.x, P.y); if (banner.region !== null) banner = { text: reg.name, sub: inside && ROOMS[inside].dungeon ? "Masmorra" : inside ? "Interior" : ZONES[z].name, until: performance.now() + 3200, region: reg.id }; else banner.region = reg.id; }
  if (performance.now() < banner.until) { cx.globalAlpha = Math.min(1, (banner.until - performance.now()) / 600); plaque(banner.text, banner.sub, VW / 2, 54); cx.globalAlpha = 1; }
  // minimapa: a pintura do mundo (escondido dentro de interiores)
  const mx = VW - MINI.w - 10, my = 10;
  if (room) { label(room.name, VW - 120, 30, "#ffd27a", 12); } else {
  cx.fillStyle = "rgba(10,8,14,.9)"; cx.fillRect(mx - 4, my - 4, MINI.w + 8, MINI.h + 8); cx.strokeStyle = "#C18B36"; cx.lineWidth = 2; cx.strokeRect(mx - 3, my - 3, MINI.w + 6, MINI.h + 6);
  cx.imageSmoothingEnabled = true; if (A.paint) cx.drawImage(A.paint, mx, my, MINI.w, MINI.h); cx.imageSmoothingEnabled = false;
  const kx = MINI.w / MW, ky = MINI.h / MH;
  for (const h of HUNTS) { const o = occupantsOf(h.id).length; if (o) { cx.fillStyle = "#ff8a8a"; cx.fillRect(mx + h.cx * kx - 2, my + h.cy * ky - 2, 4, 4); } }
  cx.strokeStyle = "rgba(255,255,255,.85)"; cx.lineWidth = 1; cx.strokeRect(mx + ox / T * kx + .5, my + oy / T * ky + .5, WW / T * kx, WH / T * ky);
  for (const b of S.others || []) if (b.y < MH) { cx.fillStyle = "#111"; cx.fillRect(mx + b.x * kx - 2, my + b.y * ky - 2, 5, 5); cx.fillStyle = KING[b.king]?.color || "#fff"; cx.fillRect(mx + b.x * kx - 1, my + b.y * ky - 1, 3, 3); }
  cx.fillStyle = "#fff"; cx.fillRect(mx + P.x * kx - 2, my + P.y * ky - 2, 5, 5); cx.fillStyle = KING[P.king].color; cx.fillRect(mx + P.x * kx - 1, my + P.y * ky - 1, 3, 3);
  }
  // log de combate
  cx.font = "700 11px Nunito"; cx.textAlign = "left";
  S.clog.slice(0, 4).forEach((l, i) => { const y = VH - 12 - i * 18; const w = cx.measureText(l.msg).width + 12; cx.fillStyle = "rgba(14,10,18,.7)"; cx.fillRect(8, y - 12, w, 16); cx.fillStyle = l.kind === "kill" ? "#ffe6a8" : "#cfd6e0"; cx.fillText(l.msg, 14, y); });
}
export function miniHit(ev) { const r = cv.getBoundingClientRect(); const kx = cv.width / r.width, ky = cv.height / r.height; const x = (ev.clientX - r.left) * kx, y = (ev.clientY - r.top) * ky; const mx = VW - MINI.w - 10, my = 10; if (x >= mx && x <= mx + MINI.w && y >= my && y <= my + MINI.h) return { x: (x - mx) / MINI.w * MW * T, y: (y - my) / MINI.h * MH * T }; return null; }
export function viewSize() { return { VW: VW / cam.zoom, VH: VH / cam.zoom }; }
export function tileAt(ev) { const r = cv.getBoundingClientRect(); const kx = cv.width / r.width, ky = cv.height / r.height; return { x: Math.floor(((ev.clientX - r.left) * kx / cam.zoom + cam.x) / T), y: Math.floor(((ev.clientY - r.top) * ky / cam.zoom + cam.y) / T) }; }
export function screenAt(ev) { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) * cv.width / r.width, y: (ev.clientY - r.top) * cv.height / r.height }; }
