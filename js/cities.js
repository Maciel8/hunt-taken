// Cidades e PvP por anéis (cliente). Regras e resultados vêm do servidor:
// report_position (zona/anel, quem está por perto), pvp_toggle, pvp_resolve (duelo), travel_city, bank_action, cities_view.
import { rpc } from "./net.js";
import { S, log } from "./sim.js";
import { T, ZONES, KING, IY } from "./data.js";
import { CONT, cities, zoneInfo, zoneKey } from "./continent.js";
import { OX, OY, ringRadius, HEART, cityInside, regionName } from "./terrain.js";
import { inHeart, zoneAt as heartZoneAt, regionAt } from "./world.js";
import { toast, renderAll } from "./ui.js";
import { travelButtons, bindTravelButtons, TRAVEL_GEMS } from "./travel.js";
const $ = id => document.getElementById(id);
export const PV = { view: null, sending: false, lastSent: null, cities: null };

// ---------- posição (a cada 3 s; o servidor guarda e devolve zona, PvP e quem está perto) ----------
export function startPositionReports() { setInterval(report, 3000); report(); bindHud(); }
export async function report() {
  const p = S.p; if (!p || PV.sending || !S.server) return; const x = Math.round(p.x), y = Math.round(p.y);
  PV.sending = true;
  try { const r = await rpc("report_position", { p_x: x, p_y: y }); PV.view = r; PV.lastSent = { x, y }; renderZone(); }
  catch (e) { } finally { PV.sending = false; }
}
// ---------- HUD: zona atual + botão PvP ----------
function localZone() {
  const p = S.p; if (!p) return null; const x = Math.floor(p.x), y = Math.floor(p.y);
  if (y >= IY) return { key: "anel1", name: "Interior", ring: 1 };
  const z = zoneInfo(x, y), ring = z.ring;
  if (inHeart(x, y)) { const hz = heartZoneAt(x, y); return { key: hz, name: regionAt(x, y).name, ring: 1, heart: true }; }
  if (z.city && !z.city.heart && cityInside(z.city, x, y) < 1.02) return { key: "anel1", name: z.city.name, ring: 1 };
  return { key: zoneKey(ring), name: `${regionName(z)} · Tier ${ring}`, ring };
}
export function renderZone() {
  const el = $("zoneBox"); if (!el) return; const z = localZone(); if (!z) return;
  const v = PV.view, on = !!(v && v.pvp), forced = z.ring === 3, safe = z.ring === 1;
  const Z = ZONES[z.key] || ZONES.selvagem;
  $("zoneName").textContent = z.name; $("zoneName").style.color = Z.color; $("zoneName").title = Z.desc;
  const b = $("pvpBtn"); b.disabled = safe || forced; b.classList.toggle("on", on || forced); b.classList.toggle("safe", safe);
  b.textContent = safe ? "Zona Segura" : forced ? "PvP LIBERADO" : on ? "PvP ATIVADO" : "PvP DESATIVADO";
  b.title = safe ? "Zona segura: ninguém ataca aqui." : forced ? "Anel 3: PvP obrigatório (menos contra o próprio clã). +80% exp, +60% loot." : on ? `Ligado: +20% exp e +15% loot no anel 2. Pra desligar: 60 s sem lutar${v && v.off_in ? ` (faltam ${v.off_in} s)` : ""}.` : "Ligue pra ganhar +20% exp e +15% loot no anel 2. Outros com PvP ligado podem te atacar.";
}
function bindHud() {
  const b = $("pvpBtn"); if (!b || b.dataset.bound) return; b.dataset.bound = 1;
  b.addEventListener("click", async () => { const on = !(PV.view && PV.view.pvp);
    try { PV.view = { ...PV.view, ...(await rpc("pvp_toggle", { p_on: on })) }; toast(on ? "PvP ligado: +20% exp e +15% loot no anel 2" : "PvP desligado"); renderZone(); } catch (e) { toast(e.message, true); } });
  setInterval(renderZone, 1000);
}
// ---------- jogadores: clicar em outro jogador abre o duelo ----------
export function playerAt(x, y) { return (S.others || []).find(o => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1.4); }
export function clickPlayer(o) {
  const near = (PV.view && PV.view.near || []).find(n => n.id === o.id), me = PV.view || {}, z = localZone();
  const can = near && z && z.ring > 1 && !near.ally && near.ring !== 1 && (near.ring === 3 || z.ring === 3 || (near.pvp && me.pvp));
  const why = !near ? "longe demais ou sem posição recente" : z.ring === 1 || near.ring === 1 ? "zona segura" : near.ally ? "é do seu clã" : !can ? "os dois precisam estar com PvP ligado (fora do anel 3)" : "";
  const el = $("npcBox");
  el.innerHTML = `<h3>${o.name || "Jogador"} <small class="muted">nível ${o.lvl || near?.level || "?"}${near?.clan ? " · [" + near.clan + "]" : ""}</small></h3>
    <p class="muted">${can ? "Duelo resolvido pelo servidor pelo poder de cada um. Quem perde volta pra cidade, perde parte do gold que não está no banco e 1 item fora dos espaços protegidos (a Bênção salva o item)." : "Não dá pra atacar agora: " + why + "."}</p>
    <div class="talkopts">${can ? `<button class="primary" id="duelGo">Desafiar ${o.name || ""}</button>` : ""}<button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  const go = $("duelGo"); if (go) go.onclick = async () => { go.disabled = true;
    try { const r = await rpc("pvp_resolve", { p_target: o.id }); PV.view = { ...PV.view, ...r }; $("npcModal").hidden = true;
      const msg = r.won ? `Vitória sobre ${r.loser}${r.rewarded ? `: +${r.gold} gold${r.item ? " e 1 item" : ""}` : " (sem prêmio: mesma dupla há pouco)"}` : `Derrota para ${r.winner}: −${r.gold} gold${r.item ? " e 1 item" : ""}. Você voltou pra cidade.`;
      toast(msg, !r.won); log(msg, r.won ? "kill" : "dmg"); if (!r.won) { const p = S.p; p.x = r.zone ? p.x : p.x; await refreshAfterLoss(); } }
    catch (e) { toast(e.message, true); go.disabled = false; } };
}
async function refreshAfterLoss() { try { const st = await rpc("get_state"); const { applyServer } = await import("./sim.js"); const c = st.character; const p = S.p; p.placed = true; p.x = c.x; p.y = c.y; p.path = []; p.task = "idle"; p.huntId = null; applyServer(st); renderAll(); } catch (e) { } }
// ---------- NPCs: banco, viagem, porto ----------
export async function npcAct(npc) {
  if (npc.act === "bank") return openBank(npc);
  if (npc.act === "travel") return openTravel();
  if (npc.act === "port") return import("./worlds.js").then(m => m.openWorlds());
  if (npc.act === "boat") return openBoat(npc);
}
async function openBank(npc) {
  const el = $("npcBox"), w = S.p; const banked = PV.view?.banked ?? 0;
  el.innerHTML = `<h3>${npc.title}</h3><p class="muted">Gold no banco não se perde em duelo. Gold na mão perde 10% (anel 2) ou 20% (anel 3) quando você cai em PvP.</p>
    <div class="row"><span>Na mão</span><b id="bkHand">${Math.floor(S.gold ?? w.gold ?? 0).toLocaleString("pt-BR")}</b></div><div class="row"><span>No banco</span><b id="bkBank">${Number(banked).toLocaleString("pt-BR")}</b></div>
    <label class="auto"><span>Valor</span><input type="number" id="bkAmt" min="1" step="1" placeholder="gold"></label>
    <div class="talkopts"><button class="primary" data-bk="depositar">Depositar</button><button data-bk="tudo">Depositar tudo</button><button data-bk="sacar">Sacar</button><button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  el.querySelectorAll("[data-bk]").forEach(b => b.onclick = async () => {
    const all = b.dataset.bk === "tudo", amt = all ? Math.floor(S.gold ?? 0) : Math.floor(+$("bkAmt").value || 0);
    try { const r = await rpc("bank_action", { p_action: all ? "depositar" : b.dataset.bk, p_amount: amt }); PV.view = { ...PV.view, banked: r.banked }; S.gold = r.gold; if (S.p) S.p.gold = r.gold;
      $("bkHand").textContent = Number(r.gold).toLocaleString("pt-BR"); $("bkBank").textContent = Number(r.banked).toLocaleString("pt-BR"); toast("Banco atualizado"); renderAll(); }
    catch (e) { toast(e.message, true); } });
}
export async function loadCities() { try { PV.cities = await rpc("cities_view"); } catch (e) { PV.cities = null; } return PV.cities; }
export async function openTravel() {
  const list = await loadCities() || cities().map(c => ({ id: c.id, name: c.name, spec: c.spec }));
  const el = $("npcBox");
  el.innerHTML = `<h3>Viagens</h3><p class="muted">Duas formas de ir: <b>a pé, grátis</b> (a rota aparece no mapa) ou <b>viagem rápida por ${TRAVEL_GEMS} 💎 diamantes</b> (você confirma antes de pagar).</p>
    <div class="citylist">${list.map(c => `<div class="cityrow"><div><b>${c.name}</b><small>${c.spec || ""}</small>${c.owner ? `<small>Anel 3 dominado por [${c.owner.tag}] ${c.owner.name}</small>` : `<small>Anel 3 sem dono</small>`}</div><div class="mv-actions">${travelButtons("city", c.id, "A pé")}</div></div>`).join("")}</div>
    <div class="talkopts"><button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  bindTravelButtons(el);
}
// ---------- mapa do continente (aba Mapa) ----------
export function drawContinentMap(g, W, H, sel, t) {
  if (!CONT.overview) return null; const s = Math.min(W, H) / 1000, ox = (W - 1000 * s) / 2, oy = (H - 1000 * s) / 2;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#12233f"; g.fillRect(0, 0, W, H); g.imageSmoothingEnabled = true; g.drawImage(CONT.overview, ox, oy, 1000 * s, 1000 * s);
  const tx = x => ox + (x + OX) / 10 * s, ty = y => oy + (y + OY) / 10 * s;
  for (const c of cities()) {
    for (let k = 3; k >= 1; k--) { if (c.heart && k === 1) continue; g.beginPath(); for (let a = 0; a <= 6.3; a += .08) { const R = ringRadius(c, k, a); let px, py;
        if (c.heart) { const cx = HEART.x + HEART.w / 2, cy = HEART.y + HEART.h / 2, ex = Math.cos(a), ey = Math.sin(a), tt = Math.min(Math.abs(HEART.w / 2 / (ex || 1e-9)), Math.abs(HEART.h / 2 / (ey || 1e-9))); px = cx + ex * (tt + R); py = cy + ey * (tt + R); }
        else { px = c.x + Math.cos(a) * R; py = c.y + Math.sin(a) * R; }
        a ? g.lineTo(tx(px), ty(py)) : g.moveTo(tx(px), ty(py)); }
      g.closePath(); g.strokeStyle = ["rgba(127,208,122,.9)", "rgba(240,194,74,.75)", "rgba(224,82,74,.75)"][k - 1]; g.lineWidth = sel === c.id ? 2.5 : 1.2; g.stroke(); }
    const x = tx(c.heart ? 150 : c.x), y = ty(c.heart ? 100 : c.y);
    g.fillStyle = sel === c.id ? "#ffd27a" : "#f3ead6"; g.strokeStyle = "#171522"; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 8, y + 6); g.lineTo(x - 8, y + 6); g.closePath(); g.fill(); g.stroke();
    g.font = "800 12px Nunito, sans-serif"; g.textAlign = "center"; g.lineWidth = 3; g.strokeStyle = "rgba(10,8,14,.85)"; g.strokeText(c.name, x, y - 13); g.fillStyle = "#fff6e8"; g.fillText(c.name, x, y - 13);
  }
  const p = S.p; if (p) { const pulse = 5 + Math.sin(t * 4) * 1.5; g.fillStyle = "#fff"; g.beginPath(); g.arc(tx(p.x), ty(p.y), pulse, 0, 6.283); g.fill(); g.fillStyle = KING[p.king]?.color || "#c33"; g.beginPath(); g.arc(tx(p.x), ty(p.y), pulse - 2, 0, 6.283); g.fill(); }
  return { tx, ty, s, ox, oy };
}
export function cityAtMap(mx, my, W, H) { const s = Math.min(W, H) / 1000, ox = (W - 1000 * s) / 2, oy = (H - 1000 * s) / 2; let best = null, bd = 24;
  for (const c of cities()) { const x = ox + ((c.heart ? 150 : c.x) + OX) / 10 * s, y = oy + ((c.heart ? 100 : c.y) + OY) / 10 * s, d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = c; } } return best; }
export function cityPanel(id) {
  const c = (PV.cities || []).find(x => x.id === id) || cities().find(x => x.id === id); if (!c) return "";
  const prices = (c.prices || []).map(p => `<span class="tag">${p.label} +${Math.round((p.mult - 1) * 100)}%</span>`).join(" ");
  return `<h4>${c.name}</h4><p class="muted">${c.spec || ""}</p>${prices ? `<p>${prices}</p>` : ""}
    <div class="row"><span>Anel 1</span><small>seguro, sem PvP</small></div><div class="row"><span>Anel 2</span><small>+30% exp, +25% drop · PvP por escolha</small></div><div class="row"><span>Anel 3</span><small>PvP total · +80% exp, +60% loot · elites e depósitos exclusivos</small></div>
    <div class="row"><span>Domínio do anel 3</span><b>${c.owner ? `[${c.owner.tag}] ${c.owner.name}` : "ninguém"}</b></div>
    <div class="mv-actions">${travelButtons("city", c.id)}</div>`;
}
export function bindCityPanel(root) { bindTravelButtons(root); }

// ---------- barqueiro: travessia da lagoa e viagem entre portos/lagoas ----------
const boatCost = (a, b) => a.lake && a.lake === b.lake ? 15 : Math.max(50, Math.min(250, Math.round(50 + Math.hypot(a.x - b.x, a.y - b.y) / 40)));
export function openBoat(npc) {
  const all = CONT.net?.boats || [], here = all.find(b => b.id === npc.port); if (!here) return;
  const cross = all.filter(b => b.lake && b.lake === here.lake && b.id !== here.id), others = all.filter(b => b.id !== here.id && !(b.lake && b.lake === here.lake)).map(b => ({ b, d: Math.hypot(b.x - here.x, b.y - here.y) })).sort((a, b) => a.d - b.d);
  const row = (b, extra) => `<div class="cityrow"><div><b>${b.name}</b><small>${extra}</small></div><button data-boat="${b.id}">${boatCost(here, b)} gold</button></div>`;
  const el = $("npcBox");
  el.innerHTML = `<div class="npc-head"><div><h3>Barqueiro · ${here.name}</h3><p class="muted">Rotas Fluviais & Marítimas. Atravessar a lagoa custa 15 gold; viagens entre portos e lagoas, de 50 a 250 gold pela distância.</p></div></div>
    ${cross.length ? `<h4>Atravessar</h4><div class="citylist">${cross.map(b => row(b, "margem oposta, na hora")).join("")}</div>` : ""}
    <h4>Viagem rápida</h4><div class="citylist">${others.slice(0, 40).map(({ b, d }) => row(b, `${Math.round(d)} tiles · ${b.lake ? "lagoa" : "mar"}`)).join("")}</div>
    <div class="talkopts"><button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  el.querySelectorAll("[data-boat]").forEach(btn => btn.onclick = async () => { btn.disabled = true;
    try { const r = await rpc("boat_travel", { p_from: here.id, p_to: btn.dataset.boat }); const p = S.p; p.x = r.x; p.y = r.y; p.path = []; p.task = "idle"; p.target = null; p.huntId = null;
      const { cam } = await import("./render.js"); cam.init = false; cam.follow = true; $("npcModal").hidden = true; toast(`${r.to}: chegou de barco (−${r.cost} gold)`); renderAll(); }
    catch (e) { toast(e.message, true); btn.disabled = false; } });
}
