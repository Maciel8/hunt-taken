// Mercado simples: Comprar (categoria → item → quantidade → confirmar) e Vender (item → quantidade → "você recebe" → confirmar).
// Tudo usa as funções de sempre do servidor (buy_listing, buy_shop, sell_stack, sell_npc); a cotação vem do servidor
// com a mesma conta da venda (market_sell_quote / item_value), então o valor mostrado é o valor pago.
import { ITEMS, RARITY } from "./data.js";
import { S, fmt, applyServer } from "./sim.js";
import { api, rpc } from "./net.js";
import { toast, renderAll } from "./ui.js";
import { A } from "./art.js";
import { CAT } from "./progress.js";
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tn = t => CAT.templates[t]?.name || ITEMS[t]?.name || t;
const icon = t => { const n = ITEMS[t]?.icon || CAT.templates[t]?.icon || "orb"; return A.sp[n] ? `<img class="ic" src="assets/sprites/${n}.png" alt="">` : `<span class="ic ph"></span>`; };
const GROUP = { arma: "Armas", escudo: "Armaduras", armadura: "Armaduras", acessorio: "Acessórios", equipamento: "Armaduras", ferramenta: "Ferramentas", bruto: "Materiais", barra: "Materiais", refinado: "Materiais", madeira: "Materiais", gema: "Materiais", couro: "Materiais", reagente: "Materiais", peixe: "Comida e poções", consumivel: "Comida e poções", erva: "Materiais" };
const grp = t => t === "potion" ? "Comida e poções" : GROUP[CAT.templates[t]?.category] || "Outros";
const NPC_ITEMS = ["potion", "espada_aco", "escudo_madeira", "escudo_aco", "armadura_couro", "armadura_aco", "capacete_aco", "arco", "picareta_ferro"];
const Q = { side: "buy", cat: "Tudo", q: "", sel: null, data: null };
const money = (c, v) => c === "gems" ? `💎 ${fmt(v)}` : `🪙 ${fmt(v)}`;

export async function renderSimpleMarket(el, reload) {
  if (!Q.data || reload) { try { Q.data = await api.market2(); } catch (e) { el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; } }
  el.innerHTML = `<div class="mk"><div class="mk-top"><div class="seg">${[["buy", "Comprar"], ["sell", "Vender"]].map(([k, l]) => `<button data-side="${k}" class="${Q.side === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="mk-bal">Saldo: <b>🪙 ${fmt(S.gold || 0)}</b> · <b>💎 ${fmt(S.gems || 0)}</b></div></div><div id="mkBody"></div></div>`;
  el.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { Q.side = b.dataset.side; Q.sel = null; Q.cat = "Tudo"; renderSimpleMarket(el); });
  (Q.side === "buy" ? drawBuy : drawSell)(el.querySelector("#mkBody"), el);
}
function chips(cats) { return `<div class="mk-cats">${["Tudo", ...cats].map(c => `<button data-cat="${esc(c)}" class="${Q.cat === c ? "on" : ""}">${esc(c)}</button>`).join("")}<input id="mkQ" placeholder="buscar item…" value="${esc(Q.q)}"></div>`; }
function bindChips(box, root, redraw) {
  box.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { Q.cat = b.dataset.cat; Q.sel = null; redraw(box, root); });
  const q = box.querySelector("#mkQ"); q.oninput = () => { Q.q = q.value; clearTimeout(Q.t); Q.t = setTimeout(() => { redraw(box, root); const n = box.querySelector("#mkQ"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}
const match = (t, name) => (Q.cat === "Tudo" || grp(t) === Q.cat) && (!Q.q || name.toLowerCase().includes(Q.q.toLowerCase()));

// ---------- comprar ----------
function drawBuy(box, root) {
  const offers = [
    ...NPC_ITEMS.filter(t => (CAT.templates[t]?.price ?? ITEMS[t]?.price) != null).map(t => ({ key: "npc:" + t, t, name: tn(t), seller: "Loja da capital", avail: Infinity, each: CAT.templates[t]?.price ?? ITEMS[t]?.price, cur: "gold", npc: true })),
    ...Q.data.listings.filter(l => !l.mine).map(l => ({ key: "l:" + l.id, id: l.id, t: l.template, name: l.item?.roll?.name || tn(l.template), seller: l.seller || "Jogador", avail: l.stack ? l.qty : 1, lot: true, each: l.stack ? Math.ceil(l.price / l.qty) : l.price, price: l.price, cur: l.currency, rar: l.item ? l.item.rarity : null, pur: l.stack ? l.purity : null }))];
  const cats = [...new Set(offers.map(o => grp(o.t)))].sort(), list = offers.filter(o => match(o.t, o.name)).sort((a, b) => a.name.localeCompare(b.name) || a.each - b.each);
  box.innerHTML = `${chips(cats)}<div class="mk-split"><div class="mk-list">${list.map(o => `<button class="mk-row ${Q.sel === o.key ? "sel" : ""}" data-pick="${esc(o.key)}">${icon(o.t)}<span><b${o.rar != null ? ` style="color:${RARITY[o.rar]?.color}"` : ""}>${esc(o.name)}</b><small>${esc(o.seller)}${o.pur != null ? ` · ${o.pur}% pureza` : ""}</small></span>
      <span class="mk-q">${o.avail === Infinity ? "à vontade" : `${o.avail} disp.`}</span><b class="mk-p">${money(o.cur, o.each)}${o.lot && o.avail > 1 ? "<small>/un</small>" : ""}</b></button>`).join("") || `<p class="muted">Nada à venda nessa categoria.</p>`}</div>
    <div class="mk-panel" id="mkPanel">${Q.sel ? "" : `<p class="muted">Escolha um item pra ver preço e quantidade.</p>`}</div></div>`;
  bindChips(box, root, drawBuy);
  box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; drawBuy(box, root); });
  const o = offers.find(x => x.key === Q.sel); if (!o) return;
  const P = box.querySelector("#mkPanel"), bal = o.cur === "gems" ? S.gems : S.gold;
  const draw = qty => { const total = o.npc ? o.each * qty : o.price, after = bal - total;
    P.innerHTML = `<div class="mk-head">${icon(o.t)}<div><h4>${esc(o.name)}</h4><small class="muted">${esc(o.seller)}</small></div></div>
      ${o.npc ? `<label class="mk-qty">Quantidade <span><button data-d="-1">−</button><input id="mkN" type="number" min="1" max="${o.t === "potion" ? 50 : 20}" value="${qty}"><button data-d="1">+</button></span></label>` : `<p class="muted">${o.avail > 1 ? `Lote de ${o.avail} unidades (vendido inteiro).` : "Item único."}</p>`}
      <div class="mk-sum"><div><span>Preço</span><b>${money(o.cur, o.each)}${o.npc || o.avail > 1 ? " cada" : ""}</b></div><div><span>Total</span><b>${money(o.cur, total)}</b></div><div class="${after < 0 ? "bad" : ""}"><span>Saldo depois</span><b>${money(o.cur, after)}</b></div></div>
      <button class="primary mk-go" id="mkGo" ${after < 0 ? "disabled" : ""}>${after < 0 ? "Saldo insuficiente" : `Confirmar compra · ${money(o.cur, total)}`}</button>`;
    P.querySelectorAll("[data-d]").forEach(b => b.onclick = () => draw(Math.max(1, Math.min(o.t === "potion" ? 50 : 20, qty + +b.dataset.d))));
    const n = P.querySelector("#mkN"); if (n) n.onchange = () => draw(Math.max(1, Math.min(+n.max, Math.floor(+n.value) || 1)));
    P.querySelector("#mkGo").onclick = async ev => { ev.target.disabled = true;
      try { const st = o.npc ? await api.buyShop(o.t, qty) : await api.buyListing(o.id); applyServer(st.state || st); toast(`Comprado: ${o.npc && qty > 1 ? qty + "× " : ""}${o.name}`); renderAll(); Q.sel = null; renderSimpleMarket(root, true); }
      catch (e) { toast(e.message, true); ev.target.disabled = false; } }; };
  draw(1);
}
// ---------- vender ----------
function drawSell(box, root) {
  const goods = [
    ...S.stacks.filter(s => CAT.templates[s.t]?.category !== "artefato").map(s => ({ key: `s:${s.t}:${s.purity}`, t: s.t, name: tn(s.t), qty: s.qty, pur: s.purity, stack: true })),
    ...S.inventory.filter(i => i.container === "bag").map(i => ({ key: "i:" + i.id, id: i.id, t: i.template, name: i.roll?.name || tn(i.template), qty: 1, rar: i.rarity, value: i.value }))];
  const cats = [...new Set(goods.map(g => grp(g.t)))].sort(), list = goods.filter(g => match(g.t, g.name));
  box.innerHTML = `${chips(cats)}<div class="mk-split"><div class="mk-list">${list.map(g => `<button class="mk-row ${Q.sel === g.key ? "sel" : ""}" data-pick="${esc(g.key)}">${icon(g.t)}<span><b${g.rar != null ? ` style="color:${RARITY[g.rar]?.color}"` : ""}>${esc(g.name)}</b><small>${g.stack ? `${g.pur}% pureza` : RARITY[g.rar]?.name || ""}</small></span><span class="mk-q">tem ${g.qty}</span><b class="mk-p">${g.value != null ? money("gold", g.value) : ""}</b></button>`).join("") || `<p class="muted">Nada pra vender aqui.</p>`}</div>
    <div class="mk-panel" id="mkPanel">${Q.sel ? "" : `<p class="muted">Escolha o que vender. A loja paga na hora; pra pedir seu preço, use “Anunciar” no modo avançado.</p>`}</div></div>`;
  bindChips(box, root, drawSell);
  box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; drawSell(box, root); });
  const g = goods.find(x => x.key === Q.sel); if (!g) return;
  const P = box.querySelector("#mkPanel"); let seq = 0;
  const draw = async qty => {
    P.innerHTML = `<div class="mk-head">${icon(g.t)}<div><h4>${esc(g.name)}</h4><small class="muted">você tem ${g.qty}</small></div></div>
      ${g.stack ? `<label class="mk-qty">Quantidade <span><button data-d="-1">−</button><input id="mkN" type="number" min="1" max="${g.qty}" value="${qty}"><button data-d="1">+</button><button data-all="1">tudo</button></span></label>` : ""}
      <div class="mk-sum"><div><span>Você recebe</span><b id="mkGet">calculando…</b></div><div><span>Saldo depois</span><b id="mkAfter">…</b></div><div><span>Caixa da loja</span><b id="mkBud">…</b></div></div>
      <button class="primary mk-go" id="mkGo" disabled>Confirmar venda</button>`;
    P.querySelectorAll("[data-d]").forEach(b => b.onclick = () => draw(Math.max(1, Math.min(g.qty, qty + +b.dataset.d))));
    const all = P.querySelector("[data-all]"); if (all) all.onclick = () => draw(g.qty);
    const n = P.querySelector("#mkN"); if (n) n.onchange = () => draw(Math.max(1, Math.min(g.qty, Math.floor(+n.value) || 1)));
    const my = ++seq; let get = 0, bud = null;
    try { if (g.stack) { const r = await rpc("market_sell_quote", { p_tpl: g.t, p_purity: g.pur, p_qty: qty }); get = r.gold; bud = r.budget; } else { get = g.value; bud = (await api.npcBudget())?.left; } } catch (e) { if (my === seq) P.querySelector("#mkGet").textContent = e.message; return; }
    if (my !== seq || !P.querySelector("#mkGo")) return;
    const over = bud != null && get > bud;
    P.querySelector("#mkGet").innerHTML = money("gold", get); P.querySelector("#mkAfter").innerHTML = money("gold", (S.gold || 0) + get); P.querySelector("#mkBud").innerHTML = bud != null ? money("gold", bud) : "—";
    const go = P.querySelector("#mkGo"); go.disabled = over || get <= 0; go.textContent = over ? "A loja não tem caixa pra isso agora" : `Confirmar venda · ${g.stack ? qty + "× " : ""}+${fmt(get)} gold`;
    go.onclick = async () => { go.disabled = true;
      try { const st = g.stack ? await api.sellStack(g.t, g.pur, qty) : await api.sellNpc(g.id); applyServer(st.state || st); toast(`Vendido: +${fmt(st.gold ?? get)} gold`); renderAll(); Q.sel = null; renderSimpleMarket(root); }
      catch (e) { toast(e.message, true); go.disabled = false; } };
  };
  draw(g.stack ? g.qty : 1);
}
