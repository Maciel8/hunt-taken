// Aba Mapa / Escolher Hunt: uma tela só. Esquerda (60%): mapa-múndi do continente inteiro com zoom e arraste,
// cidades, territórios por risco (verde/âmbar/vermelho), pins de todas as áreas de caça e você. Direita (40%):
// filtros por cidade e risco, cards das áreas de caça e detalhes com "Ir caçar aqui" e "Viajar até a cidade".
import { HUNTS, MONS, KING } from "./data.js";
import { S, huntInfo, fmt } from "./sim.js";
import { CONT, cities } from "./continent.js";
import { OX, OY, SIZE, NET } from "./terrain.js";
import { rpc } from "./net.js";
const $ = id => document.getElementById(id);
const ICON = { arken: "♜", valen: "⚓", khazad: "⚒", solkar: "◆", sylvana: "❦", nocthar: "✦" };
const SHORT = { arken: "Hub e Mercado Central", valen: "Peixes e couros +35%", khazad: "Minérios +30%", solkar: "Gemas +40%", sylvana: "Madeira e ervas +35%", nocthar: "Reagentes +40% · Encanto V" };
const TIER = { 1: ["🟢", "Tier 1", "Seguro", "#4fbf5a"], 2: ["🟡", "Tier 2", "PvP opcional", "#e8a930"], 3: ["🔴", "Tier 3", "PvP livre", "#e0524a"] };
const V = { cx: 0, cy: 0, span: 10000, tcx: 0, tcy: 0, tspan: 10000, city: "all", risk: 0, sel: null, raf: 0, terr: null, drag: null };
let ui = null;

function terrCanvas() {
  if (V.terr || !NET.territory) return V.terr; const t = NET.territory, c = document.createElement("canvas"); c.width = t.w; c.height = t.h; const g = c.getContext("2d"), im = g.createImageData(t.w, t.h);
  const col = [[70, 210, 90], [245, 180, 40], [230, 60, 50]];
  for (let j = 0; j < t.h; j++) { const row = t.rows[j]; for (let i = 0; i < t.w; i++) { const v = row.charCodeAt(i) - 97; if (v < 0) continue; const o = (j * t.w + i) * 4, k = col[v % 3];
    // borda entre territórios (cidade ou nível diferente) mais forte
    const edge = (i > 0 && row.charCodeAt(i - 1) !== row.charCodeAt(i)) || (j > 0 && t.rows[j - 1].charCodeAt(i) !== row.charCodeAt(i));
    im.data[o] = k[0]; im.data[o + 1] = k[1]; im.data[o + 2] = k[2]; im.data[o + 3] = edge ? 150 : 62; } }
  g.putImageData(im, 0, 0); return V.terr = c;
}
const huntsShown = () => HUNTS.filter(h => (V.city === "all" || (h.city || "arken") === V.city || (!h.city && V.city === "arken")) && (!V.risk || (h.ring || 1) === V.risk));

export function renderMapView(box) {
  const p = S.p; if (!V.init) { V.init = true; V.cx = V.tcx = p.x; V.cy = V.tcy = p.y; V.span = V.tspan = 2200; }
  box.innerHTML = `<div class="mv"><div class="mv-map"><canvas id="mvCanvas"></canvas>
      <div class="mv-tools"><button data-mv="all">Ver Continente Todo</button><button data-mv="me">Onde estou</button><button data-mv="in">+</button><button data-mv="out">−</button></div>
      <div class="mv-legend"><span><i style="background:#4fbf5a"></i>Seguro (Tier 1)</span><span><i style="background:#e8a930"></i>PvP opcional (Tier 2)</span><span><i style="background:#e0524a"></i>PvP livre (Tier 3)</span></div></div>
    <div class="mv-side"><div class="mv-filters"><select id="mvCity"><option value="all">Todas as cidades</option>${cities().map(c => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
      <div class="mv-risk">${[[0, "Todos"], [1, "🟢 Seguro"], [2, "🟡 PvP Opcional"], [3, "🔴 PvP Livre"]].map(([v, l]) => `<button data-risk="${v}" class="${V.risk === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div id="mvList" class="mv-list"></div><div id="analyser" class="mv-detail"><p class="muted">Clique numa cidade ou numa área de caça no mapa.</p></div></div></div>`;
  $("mvCity").value = V.city;
  $("mvCity").onchange = e => { V.city = e.target.value; if (V.city !== "all") focusCity(V.city); else showAll(); list(); };
  box.querySelectorAll("[data-risk]").forEach(b => b.onclick = () => { V.risk = +b.dataset.risk; box.querySelectorAll("[data-risk]").forEach(x => x.classList.toggle("on", x === b)); list(); });
  box.querySelectorAll("[data-mv]").forEach(b => b.onclick = () => { const k = b.dataset.mv; if (k === "all") { V.city = "all"; $("mvCity").value = "all"; showAll(); list(); } else if (k === "me") { V.tcx = S.p.x; V.tcy = S.p.y; V.tspan = 900; } else V.tspan = Math.max(250, Math.min(16000, V.tspan * (k === "in" ? .6 : 1.6))); });
  const cv = $("mvCanvas"); bindCanvas(cv); list(); if (V.sel) select(V.sel);
  cancelAnimationFrame(V.raf); const loop = () => { if (!document.body.contains(cv)) return; draw(cv); V.raf = requestAnimationFrame(loop); }; loop();
}
function showAll() { const cv = $("mvCanvas"), a = cv ? cv.width / Math.max(1, cv.height) : 1.4; V.tcx = SIZE / 2 - OX; V.tcy = SIZE / 2 - OY; V.tspan = Math.max(10400, 10400 * a); }
function focusCity(id) { const c = cities().find(x => x.id === id); if (!c) return; V.tcx = c.heart ? 150 : c.x; V.tcy = c.heart ? 100 : c.y; V.tspan = 2600; }
function view(cv) { const W = cv.width, H = cv.height, s = W / V.span; return { W, H, s, tx: x => (x - V.cx) * s + W / 2, ty: y => (y - V.cy) * s + H / 2, wx: px => (px - W / 2) / s + V.cx, wy: py => (py - H / 2) / s + V.cy }; }
function draw(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const k = .18; V.cx += (V.tcx - V.cx) * k; V.cy += (V.tcy - V.cy) * k; V.span += (V.tspan - V.span) * k;
  const g = cv.getContext("2d"), v = view(cv), t = performance.now() / 1000; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#10213d"; g.fillRect(0, 0, v.W, v.H);
  g.imageSmoothingEnabled = true;
  if (CONT.overview) g.drawImage(CONT.overview, 0, 0, 1000, 1000, v.tx(-OX), v.ty(-OY), SIZE * v.s, SIZE * v.s);
  const hm = CONT.heartMid; if (hm) g.drawImage(hm, v.tx(0), v.ty(0), 300 * v.s, 200 * v.s);
  const tc = terrCanvas(); if (tc) { g.imageSmoothingEnabled = v.s * 16 < 3; g.drawImage(tc, v.tx(-OX), v.ty(-OY), tc.width * 16 * v.s, tc.height * 16 * v.s); g.imageSmoothingEnabled = true; }
  // estradas por cima (finas)
  if (CONT.net) { g.strokeStyle = "rgba(150,110,60,.85)"; g.lineWidth = Math.max(1, Math.min(3, v.s * 2)); for (const rd of CONT.net.roads) { g.beginPath(); rd.pts.forEach((p, i) => i ? g.lineTo(v.tx(p[0]), v.ty(p[1])) : g.moveTo(v.tx(p[0]), v.ty(p[1]))); g.stroke(); } }
  // áreas de caça
  const shown = new Set(huntsShown().map(h => h.id)), rad = Math.max(3, Math.min(7, v.s * 14));
  for (const h of HUNTS) { const x = v.tx(h.cx), y = v.ty(h.cy); if (x < -10 || y < -10 || x > v.W + 10 || y > v.H + 10) continue; const on = shown.has(h.id), sel = V.sel === h.id;
    g.globalAlpha = on ? 1 : .25; g.fillStyle = TIER[h.ring || 1][3]; g.strokeStyle = sel ? "#fff" : "#171522"; g.lineWidth = sel ? 3 : 1.5; g.beginPath(); g.arc(x, y, sel ? rad + 3 : rad, 0, 6.283); g.fill(); g.stroke();
    if (sel) { g.strokeStyle = "rgba(255,230,160,.9)"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, rad + 8 + Math.sin(t * 4) * 3, 0, 6.283); g.stroke(); } }
  g.globalAlpha = 1;
  // cidades
  for (const c of cities()) { const x = v.tx(c.heart ? 150 : c.x), y = v.ty(c.heart ? 100 : c.y), on = V.city === c.id;
    g.fillStyle = on ? "#ffd27a" : "#f3ead6"; g.strokeStyle = "#171522"; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, on ? 13 : 11, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = "#171522"; g.font = "900 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ICON[c.id] || "●", x, y + 1);
    g.textBaseline = "alphabetic"; g.font = "800 13px Nunito, sans-serif"; g.lineWidth = 4; g.strokeStyle = "rgba(10,8,14,.9)"; g.strokeText(c.name, x, y - 18); g.fillStyle = "#fff6e8"; g.fillText(c.name, x, y - 18);
    g.font = "700 10.5px Nunito, sans-serif"; g.strokeText(SHORT[c.id] || "", x, y + 26); g.fillStyle = "#ffd27a"; g.fillText(SHORT[c.id] || "", x, y + 26); }
  // você
  const p = S.p; if (p) { const x = v.tx(p.x), y = v.ty(p.y), pr = 6 + Math.sin(t * 4) * 1.5; g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, pr, 0, 6.283); g.fill(); g.fillStyle = KING[p.king]?.color || "#c33"; g.beginPath(); g.arc(x, y, pr - 2.2, 0, 6.283); g.fill(); }
}
function bindCanvas(cv) {
  cv.onwheel = e => { e.preventDefault(); const r = cv.getBoundingClientRect(), v = view(cv), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height, wx = v.wx(px), wy = v.wy(py);
    const f = Math.exp(e.deltaY * .0015), ns = Math.max(250, Math.min(16000, V.tspan * f)); V.tcx = wx + (V.tcx - wx) * ns / V.tspan; V.tcy = wy + (V.tcy - wy) * ns / V.tspan; V.tspan = ns; };
  cv.onpointerdown = e => { V.drag = { x: e.clientX, y: e.clientY, cx: V.tcx, cy: V.tcy, moved: false }; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!V.drag) return; const r = cv.getBoundingClientRect(), s = (cv.width / r.width) * cv.width / V.span / cv.width; const dx = e.clientX - V.drag.x, dy = e.clientY - V.drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) V.drag.moved = true;
    const k = V.span / r.width; V.tcx = V.cx = V.drag.cx - dx * k; V.tcy = V.cy = V.drag.cy - dy * k; };
  cv.onpointerup = e => { const d = V.drag; V.drag = null; if (!d || d.moved) return; const r = cv.getBoundingClientRect(), v = view(cv), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height;
    let best = null, bd = 18 * (cv.width / r.width); for (const c of cities()) { const d2 = Math.hypot(v.tx(c.heart ? 150 : c.x) - px, v.ty(c.heart ? 100 : c.y) - py); if (d2 < bd) { bd = d2; best = { c }; } }
    if (!best) for (const h of huntsShown()) { const d2 = Math.hypot(v.tx(h.cx) - px, v.ty(h.cy) - py); if (d2 < bd) { bd = d2; best = { h }; } }
    if (best && best.c) { V.city = best.c.id; $("mvCity").value = V.city; focusCity(V.city); list(); cityDetail(best.c); }
    else if (best && best.h) select(best.h.id); };
}
function list() {
  const p = S.p, hs = huntsShown().map(h => ({ h, i: huntInfo(h, p) })).sort((a, b) => a.i.m.lvl - b.i.m.lvl), el = $("mvList"); if (!el) return;
  const max = 120, more = hs.length - max;
  el.innerHTML = hs.slice(0, max).map(({ h, i }) => { const T = TIER[h.ring || 1], c = cities().find(x => x.id === (h.city || "arken"));
    return `<div class="mv-card ${V.sel === h.id ? "on" : ""}" data-h="${h.id}"><div class="mv-ct"><b>${h.name}</b><span class="mv-tier" style="--c:${T[3]}">${T[0]} ${T[1]}</span></div>
      <div class="mv-cm"><span>${i.m.name} · nv ${i.m.lvl}</span><span>${c ? c.name : ""}</span></div><div class="mv-cm"><span>Gold/h <b>${fmt(i.goldH * i.share)}</b></span><span>Exp/h <b>${fmt(i.expH * i.share)}</b></span></div></div>`; }).join("") +
    (more > 0 ? `<p class="muted">+${more} áreas: filtre por cidade ou risco.</p>` : "") + (!hs.length ? `<p class="muted">Nenhuma área com esse filtro.</p>` : "");
  el.querySelectorAll("[data-h]").forEach(d => d.onclick = () => { select(d.dataset.h); const h = HUNTS.find(x => x.id === d.dataset.h); V.tcx = h.cx; V.tcy = h.cy; V.tspan = Math.min(V.tspan, 1400); });
}
async function select(id) {
  V.sel = id; document.querySelectorAll(".mv-card").forEach(d => d.classList.toggle("on", d.dataset.h === id));
  const h = HUNTS.find(x => x.id === id); if (!h) return; const ui = await import("./ui.js"); ui.showAnalyser(id);
  const el = $("analyser"), m = MONS[h.mon], T = TIER[h.ring || 1], c = cities().find(x => x.id === (h.city || "arken"));
  el.insertAdjacentHTML("afterbegin", `<div class="mv-badges"><span class="mv-tier" style="--c:${T[3]}">${T[0]} ${T[1]} · ${T[2]}</span>${h.subregion ? `<span class="muted">${h.subregion}</span>` : ""}</div>
    <div class="mv-actions"><button class="primary" data-tp="${h.id}">Ir caçar aqui</button>${c && !c.heart ? `<button data-travel-city="${c.id}">Viajar até ${c.name}</button>` : ""}</div>
    <div class="mv-mon"><div class="row"><span>Atributos</span><b>${m.hp} hp · ${m.atk} atk · ${m.def} def · ${m.exp} exp</b></div>${h.boss && MONS[h.boss] ? `<div class="row"><span>Chefe</span><b>${MONS[h.boss].name} nv ${MONS[h.boss].lvl}</b></div>` : ""}</div>`);
  const b = el.querySelector("[data-travel-city]"); if (b) b.onclick = () => travel(b.dataset.travelCity, b);
}
function cityDetail(c) {
  const el = $("analyser"), hs = HUNTS.filter(h => (h.city || "arken") === c.id), n = [1, 2, 3].map(t => hs.filter(h => (h.ring || 1) === t).length);
  el.innerHTML = `<h4>${ICON[c.id] || ""} ${c.name}</h4><p class="muted">${c.spec || ""}</p>${(c.regions || []).map((r, i) => `<div class="row"><span>${TIER[i + 1][0]} ${r}</span><b>${n[i]} áreas</b></div>`).join("")}
    <div class="mv-actions">${!c.heart ? `<button class="primary" data-travel-city="${c.id}">Viajar até ${c.name}</button>` : ""}<button data-mv-all="1">Ver Continente Todo</button></div>`;
  const b = el.querySelector("[data-travel-city]"); if (b) b.onclick = () => travel(c.id, b);
  el.querySelector("[data-mv-all]").onclick = () => { V.city = "all"; $("mvCity").value = "all"; showAll(); list(); };
}
async function travel(id, b) { b.disabled = true; const { toast, closeModal, renderAll } = await import("./ui.js");
  try { const r = await rpc("travel_city", { p_city: id }); const p = S.p; p.x = r.x; p.y = r.y; p.path = []; p.task = "idle"; p.target = null; p.huntId = null; const { cam } = await import("./render.js"); cam.init = false; cam.follow = true; closeModal(); toast(`Chegou em ${cities().find(c => c.id === id)?.name} (−${r.cost} gold)`); renderAll(); }
  catch (e) { toast(e.message, true); b.disabled = false; } }
