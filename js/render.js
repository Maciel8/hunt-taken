// Render do mapa: câmera, camadas, rota, rótulos, minimapa, números de dano.
import { T, MW, MH, HUNTS, CAPITAL, MONS, KING } from "./data.js";
import { huntAt } from "./world.js";
import { S, fx, occupantsOf } from "./sim.js";
import { base, over, mini, drawUnit, drawMon } from "./art.js";

export const cv = document.getElementById("view"), cx = cv.getContext("2d");
let VW = cv.width, VH = cv.height;
export const cam = { x: 0, y: 0 };
export function resize() { const r = cv.parentElement.getBoundingClientRect(); cv.width = Math.max(640, Math.floor(r.width)); cv.height = Math.floor(cv.width * 0.62); VW = cv.width; VH = cv.height; }
const sx = v => v - cam.x, sy = v => v - cam.y;
function label(text, x, y, color, size = 11) { cx.font = `800 ${size}px Nunito, sans-serif`; cx.textAlign = "center"; const w = cx.measureText(text).width + 10; cx.fillStyle = "rgba(14,10,18,.78)"; cx.fillRect(Math.round(x - w / 2), Math.round(y - size - 2), Math.round(w), size + 6); cx.fillStyle = color; cx.fillText(text, Math.round(x), Math.round(y)); }

export function render() {
  const P = S.p;
  const tx = Math.max(0, Math.min(P.x * T + T / 2 - VW / 2, MW * T - VW)), ty = Math.max(0, Math.min(P.y * T + T / 2 - VH / 2, MH * T - VH));
  cam.x += (tx - cam.x) * .15; cam.y += (ty - cam.y) * .15;
  const cxr = Math.round(cam.x), cyr = Math.round(cam.y); cam.x = cxr; cam.y = cyr;
  cx.imageSmoothingEnabled = false; cx.setTransform(1, 0, 0, 1, 0, 0);
  cx.drawImage(base, cxr, cyr, VW, VH, 0, 0, VW, VH);
  cx.save(); cx.translate(-cxr, -cyr);
  const ents = [];
  for (const m of S.mons) if (m.alive) ents.push({ y: m.y, d: () => drawMon(cx, m) });
  for (const b of S.bots) ents.push({ y: b.y, d: () => drawUnit(cx, b, b.voc, false) });
  if (P.dead === 0 || Math.floor(S.t) % 2) ents.push({ y: P.y, d: () => drawUnit(cx, P, P.voc, true) });
  ents.sort((a, b) => a.y - b.y).forEach(e => e.d());
  if (P.immune > 0) { cx.strokeStyle = "rgba(255,255,255,.7)"; cx.lineWidth = 1; cx.strokeRect(P.x * T + 3.5, P.y * T + 1.5, 25, 29); }
  cx.drawImage(over, cxr, cyr, VW, VH, cxr, cyr, VW, VH);
  cx.restore();
  // rota
  if (P.route.length) {
    cx.strokeStyle = "rgba(255,246,232,.85)"; cx.lineWidth = 2; cx.setLineDash([3, 5]); cx.beginPath();
    P.route.forEach((w, i) => { const x = sx(w.x * T + 16), y = sy(w.y * T + 16); i ? cx.lineTo(x, y) : cx.moveTo(x, y); });
    if (P.route.length > 1) cx.lineTo(sx(P.route[0].x * T + 16), sy(P.route[0].y * T + 16)); cx.stroke(); cx.setLineDash([]);
    P.route.forEach((w, i) => { const x = sx(w.x * T + 16), y = sy(w.y * T + 16); cx.fillStyle = "#15120f"; cx.beginPath(); cx.arc(x, y, 9, 0, 7); cx.fill(); cx.fillStyle = i === P.wp ? "#5df2c2" : "#fff6e8"; cx.beginPath(); cx.arc(x, y, 7, 0, 7); cx.fill(); cx.fillStyle = "#15120f"; cx.font = "900 10px Nunito"; cx.textAlign = "center"; cx.fillText(String(i + 1), x, y + 3.5); });
  }
  for (const b of S.bots) label(`${b.name} · ${b.lvl}`, sx(b.x * T + 16), sy(b.y * T) - 2, KING[b.king].color);
  label(`${P.name} · ${P.lvl}`, sx(P.x * T + 16), sy(P.y * T) - 2, KING[P.king].color);
  for (const m of S.mons) if (m.alive && (m.hp < MONS[m.type].hp || m.boss)) { const x = sx(m.x * T + 4), y = sy(m.y * T + 30); cx.fillStyle = "#15120f"; cx.fillRect(x - 1, y - 1, 26, 5); cx.fillStyle = m.boss ? "#ffcf5a" : "#e33"; cx.fillRect(x, y, 24 * m.hp / MONS[m.type].hp, 3); if (m.boss) label(MONS[m.type].name, sx(m.x * T + 16), sy(m.y * T) - 18, "#ffcf5a"); }
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t--; if (f.t <= 0) { fx.splice(i, 1); continue; } cx.font = "900 12px Nunito"; cx.textAlign = "center"; const x = sx(f.x * T + 16), y = sy(f.y * T) - 6 - (8 - f.t) * 1.5; cx.fillStyle = "#15120f"; cx.fillText(f.v, x + 1, y + 1); cx.fillStyle = f.c; cx.fillText(f.v, x, y); }
  for (const h of HUNTS) { const o = occupantsOf(h.id).length; label(`${h.name} · ${o}`, sx(h.door[0] * T + 16), sy(h.door[1] * T) - 34, o >= 3 ? "#ff8a8a" : o === 2 ? "#ffd27a" : "#fff6e8"); }
  label("Capital · zona segura", sx((CAPITAL.x + 5.5) * T), sy((CAPITAL.y + 8.5) * T) + 4, "#9cc3ff");
  // minimapa
  const mw = mini.width, mh = mini.height, mx = VW - mw - 8, my = 8;
  cx.fillStyle = "rgba(14,10,18,.85)"; cx.fillRect(mx - 3, my - 3, mw + 6, mh + 6); cx.drawImage(mini, mx, my);
  for (const h of HUNTS) { const o = occupantsOf(h.id).length; cx.fillStyle = o >= 3 ? "rgba(255,80,80,.55)" : o === 2 ? "rgba(255,200,80,.5)" : "rgba(93,242,194,.25)"; cx.fillRect(mx + h.rect.x * 2, my + h.rect.y * 2, h.rect.w * 2, h.rect.h * 2); }
  cx.fillStyle = "#fff"; cx.fillRect(mx + P.x * 2 - 1, my + P.y * 2 - 1, 3, 3);
  cx.strokeStyle = "rgba(255,255,255,.6)"; cx.strokeRect(mx + cxr / T * 2 + .5, my + cyr / T * 2 + .5, VW / T * 2, VH / T * 2);
  // log de combate
  cx.font = "700 11px Nunito"; cx.textAlign = "left";
  S.clog.slice(0, 4).forEach((l, i) => { const y = VH - 12 - i * 18; const w = cx.measureText(l.msg).width + 12; cx.fillStyle = "rgba(14,10,18,.7)"; cx.fillRect(8, y - 12, w, 16); cx.fillStyle = l.kind === "kill" ? "#ffe6a8" : "#cfd6e0"; cx.fillText(l.msg, 14, y); });
  if (S.routeMode) { cx.fillStyle = "rgba(14,10,18,.85)"; cx.fillRect(0, 0, VW, 26); cx.fillStyle = "#5df2c2"; cx.font = "900 13px Nunito"; cx.textAlign = "left"; cx.fillText("Modo rota: toque nos tiles (até 8). Toque em Começar a caçar quando terminar.", 10, 17); }
}
export function tileAt(ev) { const r = cv.getBoundingClientRect(); const kx = cv.width / r.width, ky = cv.height / r.height; return { x: Math.floor(((ev.clientX - r.left) * kx + cam.x) / T), y: Math.floor(((ev.clientY - r.top) * ky + cam.y) / T) }; }
