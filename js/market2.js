// Market 2.0: anúncios (item único e pilha de material), ordens de compra com "Vender agora", filtros,
// preço médio das últimas vendas, menor venda e maior compra no card. Tudo passa pelo servidor.
import { ITEMS, RARITY, VOC } from "./data.js";
import { S, P, fmt } from "./sim.js";
import { api } from "./net.js";
import { act, toast } from "./ui.js";
import { A } from "./art.js";
import { CAT } from "./progress.js";
import { renderSimpleMarket } from "./market.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = name => A.sp[name] ? `<img class="ic" src="assets/sprites/${name}.png" alt="">` : `<span class="ic ph"></span>`;
const tn = t => CAT.templates[t]?.name || ITEMS[t]?.name || t;
const ti = t => ITEMS[t]?.icon || CAT.templates[t]?.icon || "orb";
const cur = (c, v) => c === "gems" ? `💎 ${fmt(v)}` : `🪙 ${fmt(v)}`;
const CATN = { arma: "Armas forjadas", armadura: "Armaduras", acessorio: "Anéis e amuletos", escudo: "Escudos", equipamento: "Equipamento", ferramenta: "Ferramentas", bruto: "Material bruto", barra: "Barras", refinado: "Concentrados", madeira: "Madeira", gema: "Gemas", couro: "Couro", reagente: "Reagentes", componente: "Peças", consumivel: "Consumíveis" };
let M = { data: null, sub: "simple", f: { cat: "", rar: 0, tier: 0, pur: 0, ench: "", cur: "" } };

export async function renderMarket(box, sub) {
  if (sub) M.sub = sub; if (M.sub === "npc") M.sub = "buy";
  box.innerHTML = `<div class="tabs2">${[["simple", "Loja e Comunidade"], ["orders", "Ordens de compra"]].map(([k, n]) => `<button data-msub="${k}" class="${M.sub === k ? "on" : ""}">${n}</button>`).join("")}</div><div id="msub"><div class="muted">carregando…</div></div>`;
  box.querySelectorAll("[data-msub]").forEach(b => b.onclick = () => renderMarket(box, b.dataset.msub));
  if (M.sub === "simple") return renderSimpleMarket($("msub"), true);
  try { M.data = await api.market2(); api.marketSeen().catch(() => { }); S.marketNews = 0; } catch (e) { $("msub").innerHTML = esc(e.message); return; }
  const el = $("msub");
  ({ buy: drawBuy, orders: drawOrders, sell: drawSell, mine: drawMine, npc: drawNpc })[M.sub](el, box);
}
function statLine(t) {
  const s = M.data.stats[t]; if (!s) return `<small class="muted">sem histórico</small>`;
  const a = s.avg_gold != null ? `média ${fmt(s.avg_gold)} gold` : s.avg_gems != null ? `média ${s.avg_gems} gemas` : "sem vendas";
  return `<small class="muted">${a} (últimas ${Math.min(20, s.n)}) · menor venda ${s.min_sell_gold != null ? fmt(s.min_sell_gold) + "g" : s.min_sell_gems != null ? s.min_sell_gems + "💎" : "—"} · maior compra ${s.max_buy_gold != null ? fmt(s.max_buy_gold) + "g" : s.max_buy_gems != null ? s.max_buy_gems + "💎" : "—"}</small>`;
}
function filters() {
  const cats = [...new Set(Object.values(CAT.templates).map(t => t.category).filter(c => c && CATN[c]))];
  return `<div class="mfilters"><select data-f="cat"><option value="">Todas as categorias</option>${cats.map(c => `<option value="${c}" ${M.f.cat === c ? "selected" : ""}>${CATN[c]}</option>`).join("")}</select>
    <select data-f="rar">${RARITY.map((r, i) => `<option value="${i}" ${M.f.rar == i ? "selected" : ""}>${i ? r.name + "+" : "Qualquer raridade"}</option>`).join("")}</select>
    <select data-f="tier">${[0, 1, 2, 3, 4, 5].map(t => `<option value="${t}" ${M.f.tier == t ? "selected" : ""}>${t ? "Tier " + t + "+" : "Qualquer tier"}</option>`).join("")}</select>
    <label class="mini">Pureza ≥ <input data-f="pur" type="number" min="0" max="100" value="${M.f.pur}"></label>
    <select data-f="ench"><option value="">Com ou sem encanto</option><option value="sim" ${M.f.ench === "sim" ? "selected" : ""}>Só encantados</option></select>
    <select data-f="cur"><option value="">Gold e gemas</option><option value="gold" ${M.f.cur === "gold" ? "selected" : ""}>Só gold</option><option value="gems" ${M.f.cur === "gems" ? "selected" : ""}>Só gemas</option></select></div>`;
}
function bindFilters(el, box) { el.querySelectorAll("[data-f]").forEach(i => i.onchange = () => { M.f[i.dataset.f] = i.type === "number" || i.dataset.f === "rar" || i.dataset.f === "tier" ? +i.value : i.value; drawBuy(el, box); }); }
function pass(l) {
  const t = CAT.templates[l.template] || {}, rar = l.item ? l.item.rarity : (t.base_rarity || 0);
  if (M.f.cat && t.category !== M.f.cat) return false; if (rar < M.f.rar) return false; if ((t.tier || 1) < M.f.tier) return false;
  if (M.f.pur && (l.stack ? l.purity : l.item?.roll?.purity ?? 0) < M.f.pur) return false;
  if (M.f.ench === "sim" && !(l.item?.roll?.enchants || (l.item?.roll?.ench || []).length)) return false;
  if (M.f.cur && l.currency !== M.f.cur) return false; return true;
}
function drawBuy(el, box) {
  const ls = M.data.listings.filter(pass);
  el.innerHTML = `${filters()}<p class="muted">Compra atômica no servidor. Taxa de venda de ${M.data.fee_pct}% é paga por quem vende.</p><div class="grid3">${ls.map(l => { const rar = l.item ? l.item.rarity : (CAT.templates[l.template]?.base_rarity || 0), R = RARITY[rar];
    return `<div class="card2"><span class="rar" style="color:${R.color}">${R.name}${l.stack ? ` · ${l.purity}% pureza` : ""}</span>${icon(ti(l.template))}<b>${esc(l.item?.roll?.name || tn(l.template))}${l.stack ? ` ×${l.qty}` : ""}</b>${l.item?.roll?.enchants ? `<small style="color:#b48cff">${Object.values(l.item.roll.enchants).map(e => esc(e.name)).join(" · ")}</small>` : ""}${statLine(l.template)}<small>de ${esc(l.seller)}</small><div class="price">${cur(l.currency, l.price)}${l.stack ? ` <small>(${fmt(Math.round(l.price / l.qty))} cada)</small>` : ""}</div>${l.mine ? `<button data-mcancel="${l.id}">Cancelar</button>` : `<button class="primary" data-mbuy="${l.id}">Comprar</button>`}</div>`; }).join("") || '<div class="muted">Nenhum anúncio com esses filtros.</div>'}</div>`;
  bindFilters(el, box);
  el.querySelectorAll("[data-mbuy]").forEach(b => b.onclick = () => act(() => api.buyListing(b.dataset.mbuy), "Comprado").then(() => renderMarket(box)));
  el.querySelectorAll("[data-mcancel]").forEach(b => b.onclick = () => act(() => api.cancelListing(b.dataset.mcancel), "Anúncio cancelado").then(() => renderMarket(box)));
}
function drawOrders(el, box) {
  const tpls = Object.values(CAT.templates).filter(t => !t.deprecated && t.category !== "artefato" && CATN[t.category]).sort((a, b) => a.name.localeCompare(b.name));
  el.innerHTML = `<div class="split"><div><h4>Ordens abertas</h4>${M.data.orders.map(o => { const mine = o.mine, stack = o.kind === "stack";
      const opts = stack ? S.stacks.filter(s => s.t === o.template && s.purity >= o.min_purity) : S.inventory.filter(i => (i.container === "bag" || i.container === "protected") && i.template === o.template && i.rarity >= o.min_rarity);
      return `<div class="order"><div class="row">${icon(ti(o.template))}<b>${esc(tn(o.template))}</b><small>${o.filled}/${o.qty}</small></div><div class="row"><span>${cur(o.currency, o.price_each)} cada${o.min_purity ? ` · pureza ≥ ${o.min_purity}%` : ""}${o.min_rarity ? ` · ${RARITY[o.min_rarity].name}+` : ""}</span><small>de ${esc(o.buyer)}</small></div>
        ${mine ? `<button data-ocancel="${o.id}">Cancelar ordem</button>` : opts.length ? `<div class="row">${stack ? `<select data-opur="${o.id}">${opts.map(s => `<option value="${s.purity}">${s.purity}% (${s.qty})</option>`).join("")}</select><input type="number" min="1" max="${o.qty - o.filled}" value="${Math.min(o.qty - o.filled, opts[0].qty)}" data-oqty="${o.id}" style="width:64px">` : `<select data-oitem="${o.id}">${opts.map(i => `<option value="${i.id}">${esc(i.roll?.name || tn(i.template))} · ${RARITY[i.rarity].name}</option>`).join("")}</select>`}<button class="primary" data-ofill="${o.id}" data-kind="${o.kind}">Vender agora</button></div>` : `<small class="muted">Você não tem esse item.</small>`}</div>`; }).join("") || '<div class="muted">Nenhuma ordem de compra aberta.</div>'}</div>
    <div><h4>Criar ordem de compra</h4><p class="muted">O pagamento fica travado até alguém vender. Taxa de ${M.data.listing_fee_pct}% na criação, não reembolsável.</p>
      <label class="auto"><span>Item</span><select id="oTpl">${tpls.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
      <label class="auto"><span>Quantidade</span><input id="oQty" type="number" min="1" value="10"></label>
      <label class="auto"><span>Preço por unidade</span><input id="oEach" type="number" min="1" value="50"></label>
      <label class="auto"><span>Moeda</span><select id="oCur"><option value="gold">gold</option><option value="gems">gemas</option></select></label>
      <label class="auto"><span>Pureza mínima</span><input id="oPur" type="number" min="0" max="100" value="0"></label>
      <label class="auto"><span>Raridade mínima</span><select id="oRar">${RARITY.map((r, i) => `<option value="${i}">${r.name}</option>`).join("")}</select></label>
      <div id="oSum" class="muted"></div><div class="actions"><button class="primary" id="oGo">Criar ordem</button></div></div></div>`;
  const sum = () => { const tot = +$("oQty").value * +$("oEach").value, fee = Math.ceil(tot * M.data.listing_fee_pct / 100); $("oSum").textContent = `Trava ${fmt(tot)} + taxa ${fmt(fee)} ${$("oCur").value === "gems" ? "gemas" : "gold"}. ${statText($("oTpl").value)}`; };
  ["oQty", "oEach", "oCur", "oTpl"].forEach(i => $(i).oninput = sum); sum();
  $("oGo").onclick = () => act(() => api.createOrder($("oTpl").value, +$("oQty").value, +$("oEach").value, $("oCur").value, +$("oPur").value, +$("oRar").value), "Ordem criada").then(() => renderMarket(box));
  el.querySelectorAll("[data-ocancel]").forEach(b => b.onclick = () => act(() => api.cancelOrder(b.dataset.ocancel), "Ordem cancelada, pagamento devolvido").then(() => renderMarket(box)));
  el.querySelectorAll("[data-ofill]").forEach(b => b.onclick = () => { const id = b.dataset.ofill; const stack = b.dataset.kind === "stack";
    act(() => api.fulfillOrder(id, stack ? +el.querySelector(`[data-oqty="${id}"]`).value : 1, stack ? +el.querySelector(`[data-opur="${id}"]`).value : null, stack ? null : el.querySelector(`[data-oitem="${id}"]`).value), "Vendido pra ordem").then(() => renderMarket(box)); });
}
function statText(t) { const s = M.data.stats[t]; return s && (s.avg_gold != null || s.avg_gems != null) ? `Média recente: ${s.avg_gold != null ? fmt(s.avg_gold) + " gold" : s.avg_gems + " gemas"}.` : "Sem vendas recentes desse item."; }
async function drawSell(el, box) {
  const items = S.inventory.filter(i => i.container === "bag" || i.container === "protected"), stacks = S.stacks.filter(s => CAT.templates[s.t]?.category !== "artefato");
  let bud = null; try { bud = await api.npcBudget(); } catch (e) { }
  el.innerHTML = `<p class="muted">Anunciar custa ${M.data.listing_fee_pct}% do preço na hora (não volta). Quando vender, a taxa é ${M.data.fee_pct}%${M.data.fee_pct < 5 ? ", já reduzida pelo seu Comércio e pelo clã" : ""}. ${bud ? `Caixa do NPC neste mundo: <b>${fmt(bud.left)}</b> de ${fmt(bud.cap)} gold, renova às ${new Date(bud.renews_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
    <h4>Itens</h4><div class="grid3">${items.map(it => `<div class="card2"><span class="rar" style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name}${it.container === "protected" ? " 🔒" : ""}</span>${icon(ti(it.template))}<b>${esc(it.roll?.name || tn(it.template))}</b>${statLine(it.template)}<button data-msell="${it.id}">NPC paga ${fmt(it.value)}</button><div class="listf"><input type="number" min="1" value="${Math.max(1, it.value * 3)}" id="lp-${it.id}"><select id="lc-${it.id}"><option value="gold">gold</option><option value="gems">gemas</option></select><button class="primary" data-mlist="${it.id}">Anunciar</button></div></div>`).join("") || '<div class="muted">Mochila vazia.</div>'}</div>
    <h4>Materiais</h4><div class="grid3">${stacks.map((s, k) => `<div class="card2">${icon(ti(s.t))}<b>${esc(tn(s.t))} ×${s.qty}</b><small>${s.purity}% de pureza</small>${statLine(s.t)}<div class="listf"><input type="number" min="1" max="${s.qty}" value="${s.qty}" id="sq-${k}" title="quantidade"><input type="number" min="1" value="${Math.max(1, Math.round((s.sell || 1) * s.qty * 1.5))}" id="sp-${k}" title="preço total"><select id="sc-${k}"><option value="gold">gold</option><option value="gems">gemas</option></select><button class="primary" data-slist="${k}">Anunciar</button></div></div>`).join("") || '<div class="muted">Sem materiais.</div>'}</div>`;
  el.querySelectorAll("[data-msell]").forEach(b => b.onclick = () => act(() => api.sellNpc(b.dataset.msell), "Vendido").then(() => renderMarket(box, "sell")));
  el.querySelectorAll("[data-mlist]").forEach(b => { const id = b.dataset.mlist; b.onclick = () => act(() => api.listItem(id, Math.floor(+$("lp-" + id).value), $("lc-" + id).value), "Anunciado").then(() => renderMarket(box, "sell")); });
  el.querySelectorAll("[data-slist]").forEach(b => { const k = +b.dataset.slist, s = stacks[k]; b.onclick = () => act(() => api.listStack(s.t, s.purity, +$("sq-" + k).value, Math.floor(+$("sp-" + k).value), $("sc-" + k).value), "Anunciado").then(() => renderMarket(box, "sell")); });
}
function drawMine(el, box) {
  const ls = M.data.listings.filter(l => l.mine), os = M.data.orders.filter(o => o.mine);
  el.innerHTML = `<div class="split"><div><h4>Meus anúncios (${ls.length})</h4>${ls.map(l => `<div class="row">${icon(ti(l.template))}<span>${esc(l.item?.roll?.name || tn(l.template))}${l.stack ? ` ×${l.qty} (${l.purity}%)` : ""}</span><b>${cur(l.currency, l.price)}</b><button data-mcancel="${l.id}">Cancelar</button></div>`).join("") || '<div class="muted">Nenhum.</div>'}</div>
    <div><h4>Minhas ordens de compra (${os.length})</h4>${os.map(o => `<div class="row">${icon(ti(o.template))}<span>${esc(tn(o.template))} ${o.filled}/${o.qty}</span><b>${cur(o.currency, o.price_each)} cada</b><button data-ocancel="${o.id}">Cancelar</button></div>`).join("") || '<div class="muted">Nenhuma.</div>'}</div></div>`;
  el.querySelectorAll("[data-mcancel]").forEach(b => b.onclick = () => act(() => api.cancelListing(b.dataset.mcancel), "Anúncio cancelado").then(() => renderMarket(box, "mine")));
  el.querySelectorAll("[data-ocancel]").forEach(b => b.onclick = () => act(() => api.cancelOrder(b.dataset.ocancel), "Ordem cancelada").then(() => renderMarket(box, "mine")));
}
function drawNpc(el, box) {
  const p = P();
  el.innerHTML = `<p class="muted">Compra só na capital. ${p.task !== "idle" ? "Você está fora da capital." : ""}</p><div class="grid3">${["potion", "espada_aco", "escudo_madeira", "escudo_aco", "armadura_couro", "armadura_aco", "capacete_aco", "arco", "picareta_ferro"].filter(id => ITEMS[id]?.price).map(id => { const d = ITEMS[id]; return `<div class="card2">${icon(d.icon)}<b>${esc(d.name)}</b><small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""}${d.voc ? " · " + d.voc.map(v => VOC[v]?.name).join("/") : ""}</small><div class="price">${fmt(d.price)} gold</div><button data-nbuy="${id}" ${p.task !== "idle" ? "disabled" : ""}>Comprar${id === "potion" ? " ×5" : ""}</button></div>`; }).join("")}</div>`;
  el.querySelectorAll("[data-nbuy]").forEach(b => b.onclick = () => act(() => api.buyShop(b.dataset.nbuy, b.dataset.nbuy === "potion" ? 5 : 1), "Comprado").then(() => renderMarket(box, "npc")));
}
