// Mercado em duas partes (modelo Loja do NPC + Mercado da Comunidade):
// • Loja: compra consumível no preço de catálogo (poção até 9.999 de uma vez) e vende pro NPC. Sem taxa.
// • Comunidade: anúncios de outros jogadores em gold ou diamantes. Sem taxa pra anunciar; comissão paga por quem vende
//   (15% gold / 15% material em diamantes / equipamento em diamantes por faixa 13%·10%·7,5%). Um anúncio por item,
//   preço muda a cada 30 min, 2 min de retenção + sorteio de 3 s, trava de preço, compra em lote dos mais baratos,
//   tabela de preços de 30 dias com atalhos "Menor anúncio" e "Média 7 dias". O servidor valida tudo.
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
const Q = { side: "loja", sub: "buy", cat: "Tudo", q: "", sel: null, board: null, skew: 0 };
const money = (c, v) => c === "gems" ? `💎 ${fmt(v)}` : `🪙 ${fmt(v)}`;
const nowS = () => Date.now() + Q.skew;
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`; };
let root = null, tick = null;

export async function renderSimpleMarket(el, reload) {
  root = el;
  el.innerHTML = `<div class="mk"><div class="mk-top"><div class="seg seg-big">${[["loja", "🏪 Loja (NPC)"], ["comunidade", "🤝 Mercado da Comunidade"]].map(([k, l]) => `<button data-side="${k}" class="${Q.side === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="mk-bal">Saldo: <b>🪙 ${fmt(S.gold || 0)}</b> · <b>💎 ${fmt(S.gems || 0)}</b></div></div>
    <div class="seg">${(Q.side === "loja" ? [["buy", "Comprar"], ["sell", "Vender pro NPC"]] : [["buy", "Comprar"], ["list", "Anunciar"], ["mine", "Meus anúncios"], ["table", "Tabela de preços"]]).map(([k, l]) => `<button data-sub="${k}" class="${Q.sub === k ? "on" : ""}">${l}</button>`).join("")}</div>
    <p class="muted mk-rule">${Q.side === "loja" ? "Balcão do jogo: preço de catálogo, sem taxa. Poções até 9.999 por compra." : "Negócio entre jogadores. Anunciar é grátis; quem vende paga a comissão (15% em gold; em diamantes 15% material, equipamento 13%→10%→7,5% por faixa). Anúncio novo fica 2 min em retenção e quem pedir nos 3 s seguintes entra num sorteio."}</p>
    <div id="mkBody"><p class="muted">carregando…</p></div></div>`;
  el.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { Q.side = b.dataset.side; Q.sub = "buy"; Q.sel = null; Q.cat = "Tudo"; renderSimpleMarket(el, true); });
  el.querySelectorAll("[data-sub]").forEach(b => b.onclick = () => { Q.sub = b.dataset.sub; Q.sel = null; renderSimpleMarket(el, true); });
  const body = el.querySelector("#mkBody");
  if (Q.side === "comunidade" && (reload || !Q.board)) { try { Q.board = await rpc("market_board"); Q.skew = new Date(Q.board.now) - Date.now(); } catch (e) { body.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; } }
  clearInterval(tick);
  if (Q.side === "loja") (Q.sub === "buy" ? npcBuy : npcSell)(body);
  else ({ buy: comBuy, list: comList, mine: comMine, table: comTable })[Q.sub](body);
}
const refresh = () => root && renderSimpleMarket(root, true);
function chips(cats) { return `<div class="mk-cats">${["Tudo", ...cats].map(c => `<button data-cat="${esc(c)}" class="${Q.cat === c ? "on" : ""}">${esc(c)}</button>`).join("")}<input id="mkQ" placeholder="buscar item…" value="${esc(Q.q)}"></div>`; }
function bindChips(box, redraw) {
  box.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { Q.cat = b.dataset.cat; Q.sel = null; redraw(box); });
  const q = box.querySelector("#mkQ"); q.oninput = () => { Q.q = q.value; clearTimeout(Q.t); Q.t = setTimeout(() => { redraw(box); const n = box.querySelector("#mkQ"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
}
const match = (t, name) => (Q.cat === "Tudo" || grp(t) === Q.cat) && (!Q.q || name.toLowerCase().includes(Q.q.toLowerCase()));
const qtyCtl = (v, max) => `<label class="mk-qty">Quantidade <span><button data-d="-10">−10</button><button data-d="-1">−</button><input id="mkN" type="number" min="1" max="${max}" value="${v}"><button data-d="1">+</button><button data-d="10">+10</button></span></label>`;
function bindQty(P, get, max, draw) {
  P.querySelectorAll("[data-d]").forEach(b => b.onclick = () => draw(Math.max(1, Math.min(max, get() + +b.dataset.d))));
  const n = P.querySelector("#mkN"); if (n) n.onchange = () => draw(Math.max(1, Math.min(max, Math.floor(+n.value) || 1)));
}

// ======================= LOJA (NPC) =======================
function npcBuy(box) {
  const offers = NPC_ITEMS.filter(t => (CAT.templates[t]?.price ?? ITEMS[t]?.price) != null).map(t => ({ t, name: tn(t), each: CAT.templates[t]?.price ?? ITEMS[t]?.price, max: t === "potion" ? 9999 : 20 }));
  const list = offers.filter(o => match(o.t, o.name));
  box.innerHTML = `${chips([...new Set(offers.map(o => grp(o.t)))].sort())}<div class="mk-split"><div class="mk-list">${list.map(o => `<button class="mk-row ${Q.sel === o.t ? "sel" : ""}" data-pick="${o.t}">${icon(o.t)}<span><b>${esc(o.name)}</b><small>catálogo</small></span><span class="mk-q">à vontade</span><b class="mk-p">${money("gold", o.each)}</b></button>`).join("")}</div><div class="mk-panel" id="mkPanel"><p class="muted">Escolha um item.</p></div></div>`;
  bindChips(box, npcBuy); box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; npcBuy(box); });
  const o = offers.find(x => x.t === Q.sel); if (!o) return; const P = box.querySelector("#mkPanel");
  const draw = qty => { const total = o.each * qty, after = (S.gold || 0) - total;
    P.innerHTML = `<div class="mk-head">${icon(o.t)}<div><h4>${esc(o.name)}</h4><small class="muted">Loja do jogo · sem taxa</small></div></div>${qtyCtl(qty, o.max)}
      <div class="mk-sum"><div><span>Preço</span><b>${money("gold", o.each)} cada</b></div><div><span>Total</span><b>${money("gold", total)}</b></div><div class="${after < 0 ? "bad" : ""}"><span>Saldo depois</span><b>${money("gold", after)}</b></div></div>
      <button class="primary mk-go" id="mkGo" ${after < 0 ? "disabled" : ""}>${after < 0 ? "Gold insuficiente" : `Confirmar compra · ${money("gold", total)}`}</button>`;
    bindQty(P, () => qty, o.max, draw);
    P.querySelector("#mkGo").onclick = async ev => { ev.target.disabled = true;
      try { const st = await api.buyShop(o.t, qty); applyServer(st.state || st); toast(`Comprado: ${qty}× ${o.name}`); renderAll(); refresh(); } catch (e) { toast(e.message, true); ev.target.disabled = false; } }; };
  draw(o.t === "potion" ? 10 : 1);
}
function myGoods() {
  return [...S.stacks.filter(s => CAT.templates[s.t]?.category !== "artefato").map(s => ({ key: `s:${s.t}:${s.purity}`, t: s.t, name: tn(s.t), qty: s.qty, pur: s.purity, stack: true })),
    ...S.inventory.filter(i => i.container === "bag").map(i => ({ key: "i:" + i.id, id: i.id, t: i.template, name: i.roll?.name || tn(i.template), qty: 1, rar: i.rarity, value: i.value }))];
}
function goodsList(goods, extra = () => "") {
  return goods.map(g => `<button class="mk-row ${Q.sel === g.key ? "sel" : ""}" data-pick="${esc(g.key)}">${icon(g.t)}<span><b${g.rar != null ? ` style="color:${RARITY[g.rar]?.color}"` : ""}>${esc(g.name)}</b><small>${g.stack ? `${g.pur}% pureza` : RARITY[g.rar]?.name || ""}</small></span><span class="mk-q">tem ${g.qty}</span><b class="mk-p">${extra(g)}</b></button>`).join("") || `<p class="muted">Nada aqui.</p>`;
}
function npcSell(box) {
  const goods = myGoods(), list = goods.filter(g => match(g.t, g.name));
  box.innerHTML = `${chips([...new Set(goods.map(g => grp(g.t)))].sort())}<div class="mk-split"><div class="mk-list">${goodsList(list, g => g.value != null ? money("gold", g.value) : "")}</div><div class="mk-panel" id="mkPanel"><p class="muted">Escolha o que vender. O NPC paga na hora, sem taxa.</p></div></div>`;
  bindChips(box, npcSell); box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; npcSell(box); });
  const g = goods.find(x => x.key === Q.sel); if (!g) return; const P = box.querySelector("#mkPanel"); let seq = 0;
  const draw = async qty => {
    P.innerHTML = `<div class="mk-head">${icon(g.t)}<div><h4>${esc(g.name)}</h4><small class="muted">você tem ${g.qty}</small></div></div>${g.stack ? qtyCtl(qty, g.qty) : ""}
      <div class="mk-sum"><div><span>Você recebe</span><b id="mkGet">calculando…</b></div><div><span>Saldo depois</span><b id="mkAfter">…</b></div><div><span>Caixa do NPC</span><b id="mkBud">…</b></div></div><button class="primary mk-go" id="mkGo" disabled>Confirmar venda</button>`;
    bindQty(P, () => qty, g.qty, draw);
    const my = ++seq; let get = 0, bud = null;
    try { if (g.stack) { const r = await rpc("market_sell_quote", { p_tpl: g.t, p_purity: g.pur, p_qty: qty }); get = r.gold; bud = r.budget; } else { get = g.value; bud = (await api.npcBudget())?.left; } } catch (e) { if (my === seq) P.querySelector("#mkGet").textContent = e.message; return; }
    if (my !== seq || !P.querySelector("#mkGo")) return; const over = bud != null && get > bud;
    P.querySelector("#mkGet").innerHTML = money("gold", get); P.querySelector("#mkAfter").innerHTML = money("gold", (S.gold || 0) + get); P.querySelector("#mkBud").innerHTML = bud != null ? money("gold", bud) : "—";
    const go = P.querySelector("#mkGo"); go.disabled = over || get <= 0; go.textContent = over ? "O NPC não tem caixa pra isso agora" : `Confirmar venda · +${fmt(get)} gold`;
    go.onclick = async () => { go.disabled = true; try { const st = g.stack ? await api.sellStack(g.t, g.pur, qty) : await api.sellNpc(g.id); applyServer(st.state || st); toast(`Vendido: +${fmt(st.gold ?? get)} gold`); renderAll(); Q.sel = null; refresh(); } catch (e) { toast(e.message, true); go.disabled = false; } };
  };
  draw(g.stack ? g.qty : 1);
}

// ======================= COMUNIDADE =======================
const cfg = () => Q.board?.cfg || {};
// comissão estimada (o servidor ainda aplica o desconto do Comércio e do Câmbio do clã)
function feeOf(cur, price, unique) { const m = cfg(); if (cur === "gems" && unique) { let f = 0, lo = 0; for (const [cap, pct] of m.fee_gems_item_tiers || []) { const c = cap ?? Infinity; if (price > lo) f += (Math.min(price, c) - lo) * pct / 100; lo = c; } return Math.floor(f); } return Math.floor(price * (cur === "gems" ? m.fee_gems_stack_pct ?? 15 : m.fee_gold_pct ?? 15) / 100); }
const released = l => new Date(l.release_at).getTime() + (cfg().lottery_s || 3) * 1000 <= nowS();
function groups() {
  const G = new Map();
  for (const l of Q.board.listings) { if (l.mine) continue; const k = l.stack ? `s:${l.template}:${l.currency}` : `i:${l.id}`;
    const g = G.get(k) || G.set(k, { key: k, t: l.template, cur: l.currency, stack: l.stack, name: l.stack ? tn(l.template) : (l.item?.roll?.name || tn(l.template)), rar: l.item?.rarity, items: [] }).get(k); g.items.push(l); }
  for (const g of G.values()) { g.items.sort((a, b) => a.unit - b.unit); const rel = g.items.filter(released); g.min = (rel[0] || g.items[0]).unit; g.avail = rel.reduce((a, l) => a + l.qty, 0); g.held = g.items.length - rel.length; g.avg7 = Q.board.stats[`${g.t}:${g.cur}`]?.avg7; }
  return [...G.values()];
}
function comBuy(box) {
  const gs = groups(), list = gs.filter(g => match(g.t, g.name)).sort((a, b) => a.name.localeCompare(b.name) || a.min - b.min);
  box.innerHTML = `${chips([...new Set(gs.map(g => grp(g.t)))].sort())}<div class="mk-split"><div class="mk-list">${list.map(g => `<button class="mk-row ${Q.sel === g.key ? "sel" : ""}" data-pick="${esc(g.key)}">${icon(g.t)}<span><b${g.rar != null ? ` style="color:${RARITY[g.rar]?.color}"` : ""}>${esc(g.name)}</b><small>${g.stack ? `${g.items.length} anúncio(s)` : esc(g.items[0].seller || "")}${g.avg7 ? ` · média 7d ${money(g.cur, g.avg7)}` : ""}${g.held ? ` · ${g.held} em retenção` : ""}</small></span>
      <span class="mk-q">${g.avail} disp.</span><b class="mk-p">${money(g.cur, g.min)}${g.stack ? "<small>/un</small>" : ""}</b></button>`).join("") || `<p class="muted">Ninguém anunciando nessa categoria ainda.</p>`}</div><div class="mk-panel" id="mkPanel"><p class="muted">Escolha um item pra ver preço, quantidade e retenção.</p></div></div>`;
  bindChips(box, comBuy); box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; comBuy(box); });
  const g = gs.find(x => x.key === Q.sel); if (!g) return; const P = box.querySelector("#mkPanel"), bal = g.cur === "gems" ? S.gems : S.gold;
  if (g.stack) {
    const draw = (qty, maxU) => { const rel = g.items.filter(released); let left = qty, cost = 0; for (const l of rel) { if (left <= 0 || l.unit > maxU) break; const q = Math.min(l.qty, left); cost += q * l.unit; left -= q; } const got = qty - left, after = bal - cost;
      P.innerHTML = `<div class="mk-head">${icon(g.t)}<div><h4>${esc(g.name)}</h4><small class="muted">${g.items.length} anúncio(s) · compra em lote dos mais baratos</small></div></div>${qtyCtl(qty, Math.max(1, g.avail))}
        <label class="mk-qty">Pago no máximo por unidade <span><input id="mkMax" type="number" min="1" value="${maxU}" style="width:90px"></span></label>
        <div class="mk-sum"><div><span>Vai comprar</span><b>${got} un</b></div><div><span>Total (menores preços)</span><b>${money(g.cur, cost)}</b></div><div class="${after < 0 ? "bad" : ""}"><span>Saldo depois</span><b>${money(g.cur, after)}</b></div></div>
        ${g.held ? `<p class="muted">${g.held} anúncio(s) ainda em retenção: ${g.items.filter(l => !released(l)).map(l => `${money(g.cur, l.unit)} libera em <b data-rel="${l.release_at}">${mmss(new Date(l.release_at) - nowS())}</b>`).join(", ")}.</p>` : ""}
        <p class="muted">Trava de preço: se alguém subir o preço acima do seu máximo, a compra é recusada; se baixar, você paga o menor.</p>
        <button class="primary mk-go" id="mkGo" ${got < 1 || after < 0 ? "disabled" : ""}>${after < 0 ? "Saldo insuficiente" : got < 1 ? "Nada liberado até esse preço" : `Comprar ${got} un · ${money(g.cur, cost)}`}</button>`;
      bindQty(P, () => qty, Math.max(1, g.avail), q => draw(q, maxU)); P.querySelector("#mkMax").onchange = e => draw(qty, Math.max(1, Math.floor(+e.target.value) || maxU));
      P.querySelector("#mkGo").onclick = async ev => { ev.target.disabled = true;
        try { const r = await rpc("market_buy_bulk", { p_tpl: g.t, p_min_purity: 0, p_qty: qty, p_max_unit: maxU, p_currency: g.cur }); applyServer(r.state); toast(`Comprou ${r.bought} un de ${g.name} em ${r.listings} anúncio(s) por ${money(g.cur, r.spent)}`); renderAll(); Q.sel = null; refresh(); }
        catch (e) { toast(e.message, true); ev.target.disabled = false; } }; };
    draw(Math.min(g.avail || 1, 10), g.min);
  } else {
    const l = g.items[0];
    const draw = () => { const rel = new Date(l.release_at).getTime(), lot = rel + (cfg().lottery_s || 3) * 1000, n = nowS(), after = bal - l.price;
      const phase = n < rel ? "hold" : n < lot ? "lottery" : "open";
      P.innerHTML = `<div class="mk-head">${icon(l.template)}<div><h4 style="color:${RARITY[l.item?.rarity]?.color || "inherit"}">${esc(g.name)}</h4><small class="muted">vendido por ${esc(l.seller || "jogador")}</small></div></div>
        ${statLines(l.item?.roll)}
        <div class="mk-sum"><div><span>Preço</span><b>${money(l.currency, l.price)}</b></div><div class="${after < 0 ? "bad" : ""}"><span>Saldo depois</span><b>${money(l.currency, after)}</b></div></div>
        ${phase === "hold" ? `<p class="mk-hold">⏳ Em retenção: libera em <b>${mmss(rel - n)}</b>. Quem pedir a compra nos primeiros 3 s concorre num sorteio com chance igual.</p>` : phase === "lottery" ? `<p class="mk-hold">🎲 Sorteio aberto agora!</p>` : ""}
        <button class="primary mk-go" id="mkGo" ${after < 0 || phase === "hold" ? "disabled" : ""}>${after < 0 ? "Saldo insuficiente" : phase === "hold" ? `Libera em ${mmss(rel - n)}` : `${phase === "lottery" ? "Entrar no sorteio" : "Comprar"} · ${money(l.currency, l.price)}`}</button>`;
      P.querySelector("#mkGo").onclick = () => buyOne(l, P); };
    draw(); tick = setInterval(() => { if (!document.body.contains(P)) return clearInterval(tick); if (!P.querySelector(".mk-wait")) draw(); }, 500);
  }
}
const statLines = r => !r ? "" : `<div class="mk-stats">${[["dmin", "Dano", v => `${r.dmin}–${r.dmax}`], ["def", "Defesa"], ["hp", "Vida"], ["atk", "Ataque"], ["crit", "Crítico"], ["quality", "Qualidade"], ["tier", "Tier"]].filter(([k]) => r[k] != null).map(([k, n, f]) => `<span>${n} <b>${f ? f(r[k]) : r[k]}</b></span>`).join("")}</div>`;
async function buyOne(l, P) {
  const go = P.querySelector("#mkGo"); go.disabled = true;
  try {
    const r = await rpc("market_buy", { p_listing: l.id, p_max_unit: l.unit, p_qty: l.qty });
    if (!r.pending) { applyServer(r.state); toast(`Comprado: ${tn(l.template)}`); renderAll(); Q.sel = null; return refresh(); }
    clearInterval(tick); const until = new Date(r.resolve_at).getTime();
    const wait = () => { const left = until - nowS(); P.querySelector(".mk-go")?.remove(); let w = P.querySelector(".mk-wait"); if (!w) { w = document.createElement("p"); w.className = "mk-hold mk-wait"; P.appendChild(w); } w.innerHTML = `🎲 Você está no sorteio. Resultado em <b>${mmss(left)}</b>…`; return left; };
    wait(); const iv = setInterval(async () => { if (wait() > 0) return; clearInterval(iv);
      try { const z = await rpc("market_resolve", { p_listing: l.id }); if (z.pending) return setTimeout(() => buyOne(l, P), 800); if (z.state) applyServer(z.state); renderAll();
        toast(z.won ? `🎉 Você ganhou o sorteio: ${tn(l.template)} é seu!` : "Outro jogador ganhou o sorteio. Você não pagou nada.", !z.won); Q.sel = null; refresh(); } catch (e) { toast(e.message, true); refresh(); } }, 300);
  } catch (e) { toast(e.message, true); go.disabled = false; }
}
function comList(box) {
  const goods = myGoods(), list = goods.filter(g => match(g.t, g.name)), open = Q.board.listings.filter(l => l.mine).length, max = cfg().max_listings || 20;
  box.innerHTML = `${chips([...new Set(goods.map(g => grp(g.t)))].sort())}<p class="muted">Anúncios abertos: <b>${open}/${max}</b>. Um anúncio por item: pra mudar o preço, edite em “Meus anúncios” (a cada ${cfg().price_cd_min || 30} min).</p>
    <div class="mk-split"><div class="mk-list">${goodsList(list)}</div><div class="mk-panel" id="mkPanel"><p class="muted">Escolha o que anunciar.</p></div></div>`;
  bindChips(box, comList); box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { Q.sel = b.dataset.pick; comList(box); });
  const g = goods.find(x => x.key === Q.sel); if (!g) return; const P = box.querySelector("#mkPanel");
  const draw = (qty, cur, price) => {
    const others = Q.board.listings.filter(l => !l.mine && l.template === g.t && l.currency === cur), low = others.length ? Math.min(...others.map(l => l.unit)) : null, avg = Q.board.stats[`${g.t}:${cur}`]?.avg7;
    const total = g.stack ? price * qty : price, fee = feeOf(cur, total, !g.stack);
    P.innerHTML = `<div class="mk-head">${icon(g.t)}<div><h4>${esc(g.name)}</h4><small class="muted">você tem ${g.qty}</small></div></div>
      ${g.stack ? qtyCtl(qty, g.qty) : ""}
      <label class="mk-qty">Moeda <span class="seg mini"><button data-cur="gold" class="${cur === "gold" ? "on" : ""}">🪙 Gold</button><button data-cur="gems" class="${cur === "gems" ? "on" : ""}">💎 Diamantes</button></span></label>
      <label class="mk-qty">${g.stack ? "Preço por unidade" : "Preço"} <span><input id="mkPrice" type="number" min="1" value="${price}" style="width:110px"></span></label>
      <div class="mk-short"><button data-set="${low ?? ""}" ${low == null ? "disabled" : ""}>Menor anúncio${low != null ? `: ${money(cur, low)}` : " (nenhum)"}</button><button data-set="${avg ? Math.round(avg) : ""}" ${avg ? "" : "disabled"}>Média 7 dias${avg ? `: ${money(cur, Math.round(avg))}` : " (sem vendas)"}</button></div>
      <div class="mk-sum"><div><span>Comprador paga</span><b>${money(cur, total)}</b></div><div><span>Comissão (paga por você)</span><b>− ${money(cur, fee)}</b></div><div><span>Você recebe</span><b>${money(cur, total - fee)}</b></div></div>
      <p class="muted">Sem taxa pra anunciar. Fica 2 min em retenção antes de poder ser comprado. Se cancelar ou vender, espera 30 min pra anunciar o mesmo item de novo.</p>
      <button class="primary mk-go" id="mkGo" ${open >= max ? "disabled" : ""}>${open >= max ? "Limite de anúncios atingido" : "Publicar anúncio"}</button>`;
    bindQty(P, () => qty, g.qty, q => draw(q, cur, price));
    P.querySelectorAll("[data-cur]").forEach(b => b.onclick = () => draw(qty, b.dataset.cur, price));
    P.querySelector("#mkPrice").onchange = e => draw(qty, cur, Math.max(1, Math.floor(+e.target.value) || 1));
    P.querySelectorAll("[data-set]").forEach(b => b.onclick = () => b.dataset.set && draw(qty, cur, +b.dataset.set));
    P.querySelector("#mkGo").onclick = async ev => { ev.target.disabled = true;
      try { const st = await rpc("market_list", { p_item: g.stack ? null : g.id, p_tpl: g.stack ? g.t : null, p_purity: g.stack ? g.pur : null, p_qty: g.stack ? qty : null, p_price: price, p_currency: cur });
        applyServer(st); toast(`Anunciado: ${g.stack ? qty + "× " : ""}${g.name} (libera em 2 min)`); renderAll(); Q.sel = null; Q.sub = "mine"; refresh(); }
      catch (e) { toast(e.message, true); ev.target.disabled = false; } };
  };
  draw(g.qty, "gold", Math.max(1, Math.round((g.value ?? (CAT.templates[g.t]?.sell || 1) * 2))));
}
function comMine(box) {
  const mine = Q.board.listings.filter(l => l.mine), cd = (cfg().price_cd_min || 30) * 60000;
  box.innerHTML = `<p class="muted">${mine.length}/${cfg().max_listings || 20} anúncios abertos.</p><div class="mk-mine">${mine.map(l => { const next = new Date(l.price_changed_at || l.created_at).getTime() + cd, can = next <= nowS(), rel = new Date(l.release_at).getTime() > nowS();
    return `<div class="mk-row static">${icon(l.template)}<span><b>${esc(l.item?.roll?.name || tn(l.template))}${l.stack ? ` ×${l.qty}` : ""}</b><small>${rel ? `em retenção (libera em ${mmss(new Date(l.release_at) - nowS())})` : "à venda"}</small></span>
      <span class="mk-edit"><input type="number" min="1" value="${l.unit}" data-ep="${l.id}" ${can ? "" : "disabled"}><button data-save="${l.id}" ${can ? "" : "disabled"} title="${can ? "" : "o preço só muda a cada 30 min"}">${can ? "Mudar preço" : `muda em ${mmss(next - nowS())}`}</button></span>
      <b class="mk-p">${money(l.currency, l.unit)}${l.stack ? "<small>/un</small>" : ""}</b><button data-cancel="${l.id}">Cancelar</button></div>`; }).join("") || `<p class="muted">Você não tem anúncios abertos.</p>`}</div>`;
  box.querySelectorAll("[data-save]").forEach(b => b.onclick = async () => { b.disabled = true; try { applyServer(await rpc("market_edit_price", { p_listing: b.dataset.save, p_price: Math.max(1, Math.floor(+box.querySelector(`[data-ep="${b.dataset.save}"]`).value)) })); toast("Preço atualizado"); refresh(); } catch (e) { toast(e.message, true); b.disabled = false; } });
  box.querySelectorAll("[data-cancel]").forEach(b => b.onclick = async () => { b.disabled = true; try { applyServer(await api.cancelListing(b.dataset.cancel)); toast("Anúncio cancelado: o item voltou pra você"); renderAll(); refresh(); } catch (e) { toast(e.message, true); b.disabled = false; } });
}
async function comTable(box) {
  box.innerHTML = `<div class="mk-cats"><input id="mkQ" placeholder="filtrar por item…" value="${esc(Q.q)}"><button id="mkCsv">Exportar .csv</button></div><div id="mkHist"><p class="muted">carregando…</p></div>`;
  let rows = []; try { rows = await rpc("market_history", { p_tpl: null }); } catch (e) { box.querySelector("#mkHist").textContent = e.message; return; }
  const draw = () => { const f = rows.filter(r => !Q.q || tn(r.template || "").toLowerCase().includes(Q.q.toLowerCase()));
    box.querySelector("#mkHist").innerHTML = `<table class="mk-table"><thead><tr><th>Quando</th><th>Item</th><th>Qtd</th><th>Preço/un</th></tr></thead><tbody>${f.slice(0, 300).map(r => `<tr><td>${new Date(r.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(tn(r.template))}${r.purity != null ? ` <small>${r.purity}%</small>` : ""}</td><td>${r.qty}</td><td>${money(r.currency, r.unit)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Sem vendas nos últimos 30 dias.</td></tr>`}</tbody></table>`; return f; };
  draw();
  box.querySelector("#mkQ").oninput = e => { Q.q = e.target.value; draw(); };
  box.querySelector("#mkCsv").onclick = () => { const f = draw(), csv = "quando;item;qtd;preco_un;moeda\n" + f.map(r => [r.at, tn(r.template), r.qty, r.unit, r.currency].join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "precos-mercado.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
}
