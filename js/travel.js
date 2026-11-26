// Viagem pelo mapa: duas opções pra qualquer destino (área de caça, cidade, covil de chefe).
// 1) Viagem rápida: 2 diamantes, o servidor só cobra se a viagem acontecer (fast_travel).
// 2) Ir a pé (grátis): a rota aparece no mapa (linha dourada com setas e bandeira no destino); o personagem anda de verdade,
//    respeitando colisão. Dá pra seguir com WASD ou clicando no caminho; a rota acompanha e some ao chegar.
import { S, goHunt, log, applyServer } from "./sim.js";
import { HUNTS, T } from "./data.js";
import { findPath } from "./world.js";
import { rpc } from "./net.js";
import { cities, CONT } from "./continent.js";
export const TRAVEL_GEMS = 2;
export const ROUTE = { on: false, x: 0, y: 0, label: "", stops: [], kind: null, id: null };

export function destOf(kind, id) {
  if (kind === "hunt") { const h = HUNTS.find(x => x.id === id); return h && { x: h.cx, y: h.cy, label: h.name }; }
  if (kind === "city") { const c = cities().find(x => x.id === id); return c && { x: c.heart ? 52 : c.x, y: c.heart ? 42 : c.y + 3, label: c.name }; }
  if (kind === "boss") { const b = (CONT.net?.bosses || []).find(x => x.id === id); return b && { x: b.x, y: b.y + 8, label: b.name }; }
  return null;
}
const toastUi = async (msg, bad) => { const { toast } = await import("./ui.js"); toast(msg, bad); };

// aviso de cobrança: mostra custo, saldo e saldo depois; só cobra se a pessoa confirmar (o servidor cobra só se a viagem acontecer)
function confirmPay(label) {
  return new Promise(res => {
    const gems = Number(S.gems || 0), ok = gems >= TRAVEL_GEMS, el = document.createElement("div"); el.className = "paywall";
    el.innerHTML = `<div class="paybox"><h3>Viagem rápida paga</h3><p>Ir até <b>${label}</b> na hora custa <b class="cost">${TRAVEL_GEMS} 💎 diamantes</b>.</p>
      <div class="payrows"><div><span>Seus diamantes</span><b>${gems} 💎</b></div><div class="${ok ? "" : "bad"}"><span>Depois da viagem</span><b>${gems - TRAVEL_GEMS} 💎</b></div></div>
      <p class="muted">Quer economizar? Ir a pé é grátis: a rota aparece no mapa.</p>
      <div class="payact"><button data-a="walk">Ir a pé (grátis)</button><button class="primary" data-a="pay" ${ok ? "" : "disabled"}>${ok ? `Pagar ${TRAVEL_GEMS} 💎 e viajar` : "Diamantes insuficientes"}</button></div>
      <button class="x paywall-x" data-a="no">×</button></div>`;
    document.body.appendChild(el);
    const done = v => { el.remove(); res(v); };
    el.onclick = e => { const b = e.target.closest("[data-a]"); if (b) done(b.dataset.a); else if (e.target === el) done("no"); };
  });
}
// viagem rápida (diamantes): o servidor valida saldo e destino numa transação só
export async function fastTravel(kind, id, btn) {
  const d = destOf(kind, id); if (!d) return;
  const choice = await confirmPay(d.label);
  if (choice === "walk") return walkRoute(kind, id);
  if (choice !== "pay") return;
  if (btn) btn.disabled = true;
  try {
    const st = await rpc("fast_travel", { p_kind: kind, p_target: id }); applyServer(st);
    const p = S.p; p.x = st.travel.x; p.y = st.travel.y; p.path = []; p.target = null; p.manual = false;
    if (kind === "hunt") { p.huntId = id; p.task = "hunt"; } else { p.task = "idle"; p.huntId = null; }
    ROUTE.on = false;
    const ui = await import("./ui.js"); ui.closeModal(); document.getElementById("npcModal").hidden = true; ui.teleportTo(p.x, p.y); ui.toast(`Viagem rápida até ${d.label} (−${st.travel.cost} 💎)`); ui.renderAll();
    log(`Viagem rápida até ${d.label}.`);
  } catch (e) { toastUi(e.message, true); if (btn) btn.disabled = false; }
}
// ir a pé: calcula a rota de verdade (colisão, pontes, estradas); se não existir, avisa
export async function walkRoute(kind, id) {
  const d = destOf(kind, id); if (!d) return false; const p = S.p;
  const path = findPath(p.x, p.y, d.x, d.y);
  if (!path) { toastUi(`Não existe rota a pé até ${d.label}. Tente a viagem rápida.`, true); return false; }
  // estava caçando em outro lugar: encerra aquela caçada no servidor (sem teleporte) antes de sair andando
  if (S.server && p.huntId && p.huntId !== id && (p.task === "hunt" || p.task === "goto")) { try { applyServer(await rpc("return_home")); } catch (e) { } }
  ROUTE.on = true; ROUTE.x = d.x; ROUTE.y = d.y; ROUTE.label = d.label; ROUTE.kind = kind; ROUTE.id = id;
  ROUTE.stops = [...path.map(q => [q.x, q.y]), ...((path.rest && path.rest.stops) || []).map(s => [s.x, s.y])];
  if (kind === "hunt") { goHunt(id); p.path = path; } else { p.huntId = null; p.task = "walk"; p.path = path; p.target = null; }
  const ui = await import("./ui.js"); ui.closeModal(); document.getElementById("npcModal").hidden = true; ui.toast(`Rota até ${d.label}: siga a linha dourada (WASD ou clique no caminho)`);
  return true;
}
// ir a pé até um ponto (vilas do coração)
export async function walkPoint(x, y, label) {
  const p = S.p, path = findPath(p.x, p.y, x, y);
  if (!path) { toastUi(`Não existe rota a pé até ${label}.`, true); return false; }
  ROUTE.on = true; ROUTE.x = x; ROUTE.y = y; ROUTE.label = label; ROUTE.kind = "point"; ROUTE.id = null;
  ROUTE.stops = [...path.map(q => [q.x, q.y]), ...((path.rest && path.rest.stops) || []).map(s => [s.x, s.y])];
  p.huntId = null; p.task = "walk"; p.path = path; p.target = null; toastUi(`Rota até ${label}: siga a linha dourada`); return true;
}
export function cancelRoute() { ROUTE.on = false; ROUTE.stops = []; }
// a cada quadro: tira os pontos que já ficaram pra trás e encerra ao chegar
export function routeTick() {
  if (!ROUTE.on || !S.p) return; const p = S.p;
  // a rota real vai sendo calculada enquanto anda: a linha acompanha o caminho de verdade (e avisa enquanto calcula)
  if (p.path && (p.path.length || p.path.rest)) { const R = p.path.rest; ROUTE.stops = [...p.path.map(q => [q.x, q.y]), ...((R && R.stops) || []).map(s => [s.x, s.y]), ...(R && R.job ? [[R.jobTarget.x, R.jobTarget.y]] : [])]; ROUTE.busy = !!(R && R.job); }
  // não existe caminho a pé (área cercada por serra/água): para, avisa e sugere a viagem rápida
  if (p.path && p.path.noRoute && !p.path.length) { ROUTE.on = false; p.path = []; p.task = "idle"; p.huntId = null; toastUi(`Não há caminho a pé até ${ROUTE.label} (área cercada por serra ou água). Use a viagem rápida (${TRAVEL_GEMS} 💎).`, true); return; }
  if (ROUTE.busy && !ROUTE.busyWarned) { ROUTE.busyWarned = true; toastUi("Calculando o caminho pela mata (contornando serras e lagos)…"); }
  while (ROUTE.stops.length > 1 && Math.hypot(ROUTE.stops[0][0] - p.x, ROUTE.stops[0][1] - p.y) < 5) ROUTE.stops.shift();
  // andando com WASD pode pular trechos: avança até o ponto mais perto dos próximos
  let best = 0, bd = Infinity; for (let i = 0; i < Math.min(ROUTE.stops.length, 30); i++) { const d = Math.hypot(ROUTE.stops[i][0] - p.x, ROUTE.stops[i][1] - p.y); if (d < bd) { bd = d; best = i; } }
  if (best > 0) ROUTE.stops.splice(0, best);
  if (Math.hypot(ROUTE.x - p.x, ROUTE.y - p.y) < 5) { ROUTE.on = false; toastUi(`Chegou em ${ROUTE.label}`); }
}
// desenho no mundo: linha tracejada com setas a cada ~4 tiles e bandeira no destino
export function drawRoute(g, t) {
  if (!ROUTE.on || !S.p) return; const p = S.p, pts = [[p.x, p.y], ...ROUTE.stops, [ROUTE.x, ROUTE.y]];
  g.save(); g.lineCap = "round"; g.lineJoin = "round";
  g.strokeStyle = "rgba(20,14,6,.55)"; g.lineWidth = 9; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo((x + .5) * T, (y + .5) * T) : g.moveTo((x + .5) * T, (y + .5) * T)); g.stroke();
  g.strokeStyle = "#ffd25a"; g.lineWidth = 5; g.setLineDash([18, 12]); g.lineDashOffset = -t * 40; g.stroke(); g.setLineDash([]);
  // setas
  let acc = 0; g.fillStyle = "#fff3c4";
  for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay); if (!L) continue; const ang = Math.atan2(by - ay, bx - ax);
    for (let s = (4 - acc % 4); s < L; s += 4) { const x = (ax + (bx - ax) * s / L + .5) * T, y = (ay + (by - ay) * s / L + .5) * T; g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(8, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore(); }
    acc += L; if (i > 60) break; }
  // bandeira no destino
  const fx = (ROUTE.x + .5) * T, fy = (ROUTE.y + .5) * T, w = Math.sin(t * 4) * 3; g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(fx, fy + 2, 12, 5, 0, 0, 6.283); g.fill();
  g.fillStyle = "#4a3220"; g.fillRect(fx - 2, fy - 46, 4, 48); g.fillStyle = "#ffd25a"; g.beginPath(); g.moveTo(fx + 2, fy - 46); g.lineTo(fx + 30 + w, fy - 38); g.lineTo(fx + 2, fy - 28); g.closePath(); g.fill();
  g.restore();
}
// botões das duas opções (usados no mapa, no painel de caça e nos covis)
export const travelButtons = (kind, id, walkLabel = "Ir a pé (grátis)") =>
  `<button data-walk="${kind}:${id}" class="walkbtn">🥾 ${walkLabel}</button><button class="primary paybtn" data-fast="${kind}:${id}" title="Viagem paga: ${TRAVEL_GEMS} diamantes">⚡ Viagem rápida <span class="paytag">PAGA · ${TRAVEL_GEMS} 💎</span></button>`;
export function bindTravelButtons(root, after) {
  root.querySelectorAll("[data-fast]").forEach(b => b.onclick = () => { const [k, ...r] = b.dataset.fast.split(":"); after?.(); fastTravel(k, r.join(":"), b); });
  root.querySelectorAll("[data-walk]").forEach(b => b.onclick = () => { const [k, ...r] = b.dataset.walk.split(":"); after?.(); walkRoute(k, r.join(":")); });
}
