// Efeitos de combate em coordenadas do mundo: projéteis, cortes, partículas, mortes e eventos agendados.
import { T } from "./data.js";

const list = [];        // efeitos visuais
const timers = [];      // callbacks em tempo de jogo
let clock = 0;
export const later = (sec, fn) => timers.push({ at: clock + sec, fn });

// projétil: flecha, raio arcano ou raio da natureza. onHit roda quando chega.
export function projectile(kind, from, to, onHit) {
  const d = Math.hypot(to.x - from.x, to.y - from.y), dur = Math.max(.12, d / (kind === "arrow" ? 14 : kind === "fire" ? 7 : 10));
  list.push({ type: "proj", kind, x0: from.x, y0: from.y, to, t: 0, dur, trail: [] });
  later(dur, onHit);
}
export function slash(at, dir, color = "#ffffff") { list.push({ type: "slash", x: at.x, y: at.y, dir, color, t: 0, dur: .22 }); }
export function burst(at, color, n = 8, speed = 2.2) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = speed * (.4 + Math.random() * .8); list.push({ type: "part", x: at.x, y: at.y - .3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2, color, t: 0, dur: .35 + Math.random() * .3, size: 2 + Math.random() * 2 }); } }
export function dying(m, draw) { list.push({ type: "die", m: { ...m }, draw, t: 0, dur: .55 }); }
export function ring(at, color) { list.push({ type: "ring", x: at.x, y: at.y, color, t: 0, dur: .4 }); }

export function updateFx(dt) {
  clock += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= clock) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { } }
  for (let i = list.length - 1; i >= 0; i--) { const e = list[i]; e.t += dt; if (e.type === "part") { e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 6 * dt; } if (e.t >= e.dur) list.splice(i, 1); }
}
const P = v => (v + .5) * T;
export function drawFx(g) {
  for (const e of list) {
    const k = Math.min(1, e.t / e.dur);
    if (e.type === "proj") {
      const tx = e.to.x, ty = e.to.y - .35, x = e.x0 + (tx - e.x0) * k, y = (e.y0 - .35) + (ty - (e.y0 - .35)) * k - Math.sin(k * Math.PI) * (e.kind === "arrow" ? .4 : .15);
      const ang = Math.atan2(ty - e.y0, tx - e.x0);
      if (e.kind === "arrow") { g.save(); g.translate(P(x), P(y)); g.rotate(ang); g.fillStyle = "#6b4a2c"; g.fillRect(-10, -1, 16, 2); g.fillStyle = "#d8dde2"; g.fillRect(6, -2, 4, 4); g.fillStyle = "#e8dfc9"; g.fillRect(-12, -3, 4, 2); g.fillRect(-12, 1, 4, 2); g.restore(); }
      else { const c = e.kind === "nature" ? ["#7ec850", "#d8f5a0"] : e.kind === "fire" ? ["#ff6a1a", "#ffe08a"] : ["#a98bd6", "#f0e0ff"]; e.trail.push([x, y]); if (e.trail.length > 7) e.trail.shift(); e.trail.forEach(([a, b], i) => { g.globalAlpha = i / e.trail.length * .6; g.fillStyle = c[0]; g.beginPath(); g.arc(P(a), P(b), 3 + i * .6, 0, 6.283); g.fill(); }); g.globalAlpha = 1; g.fillStyle = c[0]; g.beginPath(); g.arc(P(x), P(y), 7, 0, 6.283); g.fill(); g.fillStyle = c[1]; g.beginPath(); g.arc(P(x), P(y), 3.5, 0, 6.283); g.fill(); }
    } else if (e.type === "slash") {
      const base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[e.dir] ?? 0, a0 = base - 1.3 + k * .4, a1 = base + 1.3 * k;
      g.save(); g.globalAlpha = 1 - k; g.strokeStyle = e.color; g.lineWidth = 5 * (1 - k) + 1; g.lineCap = "round"; g.beginPath(); g.arc(P(e.x), P(e.y) - 10, 20, a0, a1); g.stroke(); g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 2; g.beginPath(); g.arc(P(e.x), P(e.y) - 10, 16, a0, a1); g.stroke(); g.restore();
    } else if (e.type === "part") { g.globalAlpha = 1 - k; g.fillStyle = e.color; g.fillRect(Math.round(P(e.x)), Math.round(P(e.y)), e.size, e.size); g.globalAlpha = 1; }
    else if (e.type === "ring") { g.globalAlpha = 1 - k; g.strokeStyle = e.color; g.lineWidth = 3; g.beginPath(); g.ellipse(P(e.x), P(e.y) + 10, 6 + k * 22, 3 + k * 9, 0, 0, 6.283); g.stroke(); g.globalAlpha = 1; }
    else if (e.type === "die") { g.save(); g.globalAlpha = 1 - k; const cx = P(e.m.x), cy = P(e.m.y) + 14; g.translate(cx, cy); g.rotate((e.m.face < 0 ? -1 : 1) * k * 1.4); g.scale(1, 1 - k * .5); g.translate(-cx, -cy - k * 6); e.draw(g, e.m); g.restore(); }
  }
}
