// VIP & Passe de Batalha (pagos em diamantes 💎). O servidor decide tudo: preço, tempo, dia da trilha e prêmios.
// VIP: +50% de exp, caça off-line de 24 h, selo 👑 no chat. Renovar soma ao tempo que falta.
// Passe: um resgate por dia (vira à meia-noite de Brasília); faltou um dia, volta pro Dia 1. Premium entrega o grátis + o premium.
import { S, fmt, applyServer } from "./sim.js";
import { rpc, api } from "./net.js";
import { toast, renderAll } from "./ui.js";
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const VIP = { view: null };
const left = until => { if (!until) return null; const ms = new Date(until) - Date.now(); if (ms <= 0) return null; const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`; };
const rw = r => !r ? "" : [r.gold && `🪙 ${fmt(r.gold)}`, r.pots && `🧪 ${r.pots} poções`, r.boost_exp_h && `⚡ exp +50% ${r.boost_exp_h}h`, r.boost_loot_h && `🍀 loot +50% ${r.boost_loot_h}h`, r.vip_days && `👑 ${r.vip_days} dias de VIP`].filter(Boolean).join("<br>");

export async function refreshVip() { try { VIP.view = await rpc("pass_view"); S.vip = VIP.view; } catch (e) { } return VIP.view; }
export async function renderVip(box, given) {
  box.innerHTML = `<p class="muted">carregando…</p>`;
  const v = given || await refreshVip(); if (!v) { box.innerHTML = `<p class="muted">Entre na sua conta pra ver o VIP e o Passe.</p>`; return; }
  const vipLeft = left(v.vip_until), premLeft = left(v.premium_until), resetLeft = left(v.reset_at), nextLeft = left(v.next_day_at);
  box.innerHTML = `<div class="vp">
    <section class="vp-card vip ${vipLeft ? "on" : ""}"><div class="vp-head"><span class="vp-crown">👑</span><div><h3>VIP</h3><p class="muted">${vipLeft ? `Ativo · faltam <b class="vp-tag">${vipLeft}</b>` : "Inativo"}</p></div><div class="vp-bal">💎 <b>${fmt(v.gems || 0)}</b></div></div>
      <ul class="vp-perks"><li><b>+${Math.round((v.vip_exp || .5) * 100)}% de exp</b> em caçadas, mapa aberto e chefes</li><li><b>Caça off-line de 24 h</b> (sem VIP: 12 h) e rendimento off-line maior</li><li><b>Selo 👑 VIP</b> no chat</li><li>Soma com os boosts do passe, eventos e clã</li></ul>
      <div class="vp-plans">${Object.entries(v.vip_prices || {}).map(([d, p]) => `<button class="vp-plan" data-vip="${d}"><b>${d} dias</b><span>💎 ${p}</span></button>`).join("")}</div>
      <p class="muted">Renovar soma ao tempo que você ainda tem. Diamante gasto não volta.</p></section>
    <section class="vp-card pass"><div class="vp-head"><span class="vp-crown">🎟️</span><div><h3>Passe de Batalha</h3><p class="muted">${!v.level_ok ? `Libera no nível ${v.min_level}` : v.claimed_today ? `Resgatado hoje · próximo em <b>${nextLeft}</b>` : `<b>Dia ${v.day}</b> disponível pra resgatar!`}${resetLeft && v.claimed_today ? ` · a sequência zera se não resgatar em ${resetLeft}` : ""}</p></div>
      <button class="primary vp-claim" id="vpClaim" ${v.can_claim ? "" : "disabled"}>${v.can_claim ? `Resgatar Dia ${v.day}` : v.claimed_today ? "Volte amanhã" : "Trancado"}</button></div>
      <div class="vp-prem ${premLeft ? "on" : ""}"><span>${premLeft ? `⭐ <b>Premium ativo</b> · faltam ${premLeft}. Cada resgate entrega o grátis + o Premium.` : `⭐ <b>Passe Premium</b>: ${v.premium_gems} 💎 por 30 dias corridos. Entrega o prêmio grátis + o Premium do dia (15 dias de VIP por ciclo, muito mais gold e boosts longos).`}</span>
        <button data-prem="1" class="${premLeft ? "" : "primary"}">${premLeft ? `Estender +30 dias (💎 ${v.premium_gems})` : `Comprar Premium · 💎 ${v.premium_gems}`}</button></div>
      <p class="muted">Um resgate por dia; o dia vira à meia-noite de Brasília. Se faltar um dia, a trilha volta pro Dia 1. Dias ⭐ 7, 14, 21 e 28 dão mais, e o Dia 30 é o lendário. Nada do passe vai pro mercado.</p>
      <div class="vp-track">${(v.rewards || []).map(r => { const st = r.day < v.day || (r.day === v.day && v.claimed_today) ? "done" : r.day === v.day ? "now" : "";
        return `<div class="vp-day ${st} ${r.star ? "star" : ""} ${r.day === 30 ? "legend" : ""}"><div class="vp-dn">${r.day === 30 ? "👑 " : r.star ? "⭐ " : ""}Dia ${r.day}${st === "done" ? " ✓" : ""}</div><div class="vp-free">${rw(r.free)}</div><div class="vp-pr ${premLeft ? "" : "locked"}"><small>Premium</small>${rw(r.premium)}</div></div>`; }).join("")}</div></section></div>`;
  const now = box.querySelector(".vp-day.now"); if (now) now.scrollIntoView({ block: "nearest", inline: "center" });
  box.querySelectorAll("[data-vip]").forEach(b => b.onclick = () => buy(box, b, "buy_vip", { p_days: +b.dataset.vip }, `VIP de ${b.dataset.vip} dias por 💎 ${v.vip_prices[b.dataset.vip]}`));
  box.querySelector("[data-prem]").onclick = e => buy(box, e.currentTarget, "buy_pass_premium", {}, `Passe Premium (30 dias) por 💎 ${v.premium_gems}`);
  box.querySelector("#vpClaim").onclick = async e => { e.target.disabled = true;
    try { const r = await rpc("pass_claim"); VIP.view = r; S.vip = r; const c = r.claimed; toast(`Dia ${c.day} resgatado!${c.premium ? " (+ Premium)" : ""}`); applyServer(await api.state()); renderAll(); renderVip(box); }
    catch (er) { toast(er.message, true); e.target.disabled = false; } };
}
// compra com confirmação (mostra custo e saldo antes de gastar diamantes)
async function buy(box, btn, fn, args, what) {
  const g = Number(VIP.view?.gems || 0), price = +(what.match(/💎 (\d+)/) || [])[1] || 0;
  const el = document.createElement("div"); el.className = "paywall";
  el.innerHTML = `<div class="paybox"><h3>Confirmar compra</h3><p>${esc(what)}</p><div class="payrows"><div><span>Seus diamantes</span><b>${g} 💎</b></div><div class="${g < price ? "bad" : ""}"><span>Depois</span><b>${g - price} 💎</b></div></div>
    <div class="payact"><button data-a="no">Cancelar</button><button class="primary" data-a="yes" ${g < price ? "disabled" : ""}>${g < price ? "Diamantes insuficientes" : `Pagar 💎 ${price}`}</button></div></div>`;
  document.body.appendChild(el);
  el.onclick = async e => { const a = e.target.closest("[data-a]")?.dataset.a; if (!a && e.target !== el) return; el.remove(); if (a !== "yes") return;
    btn.disabled = true; try { VIP.view = await rpc(fn, args); S.vip = VIP.view; toast("Compra feita!"); applyServer(await api.state()); renderAll(); renderVip(box); } catch (er) { toast(er.message, true); btn.disabled = false; } };
}
