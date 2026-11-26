// Lojas da cidade: cada estabelecimento tem catálogo, o que compra, serviços e a oficina da sua profissão.
// Forja modular com prévia calculada pelo servidor (mesma conta da fabricação), Centro de Processamento em lote,
// Armazém, Encantador e conserto. Tudo validado no servidor.
import { ITEMS, RARITY } from "./data.js";
import { S, P, fmt, applyServer } from "./sim.js";
import { api } from "./net.js";
import { act, toast, renderAll, openModal } from "./ui.js";
import { A } from "./art.js";
import { CAT, renderWorkshop } from "./progress.js";
import { renderCrafting } from "./crafting.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ico = n => A.sp[n] ? `<img class="ic" src="assets/sprites/${n}.png" alt="">` : `<span class="ic ph"></span>`;
const tn = t => CAT.templates[t]?.name || ITEMS[t]?.name || t;
const ti = t => ico(CAT.templates[t]?.icon || ITEMS[t]?.icon || "orb");
const SVC = { buy: "Comprar", sell: "Vender", modular: "Fabricar", craft: "Oficina", repair: "Consertar", process: "Processar pedras", storage: "Armazém", enchant: "Encantar", market: "Market" };
const CATN = { arma: "Armas", armadura: "Armaduras", escudo: "Escudos", equipamento: "Equipamento", ferramenta: "Ferramentas", barra: "Barras", bruto: "Bruto", refinado: "Concentrados", madeira: "Madeira", gema: "Gemas", couro: "Couro", organico: "Orgânicos", fio: "Fios", nucleo: "Núcleos", reagente: "Reagentes", pedra: "Pedras", componente: "Peças", consumivel: "Consumíveis", acessorio: "Acessórios" };
const DB = { types: null, slots: null, mprops: null };
async function loadDB() { if (DB.types) return; const [t, s, m] = await Promise.all([api.table("equipment_types"), api.table("equipment_slots"), api.table("material_props")]); DB.types = t.sort((a, b) => a.sort - b.sort); DB.slots = s; DB.mprops = Object.fromEntries(m.map(x => [x.template_id, x])); }
const gemQ = pur => { const q = [[97, "Perfeita"], [85, "Excepcional"], [70, "Superior"], [55, "Lapidada"], [40, "Comum"], [26, "Imperfeita"], [13, "Bruta"], [0, "Fragmentada"]]; return q.find(([m]) => pur >= m)[1]; };

let SH = { id: null, data: null, tab: null };
export async function openShop(id) {
  openModal("shop"); const box = $("modalBody"); box.innerHTML = `<div class="muted">carregando…</div>`;
  try { SH.data = await api.shopView(id); } catch (e) { box.innerHTML = esc(e.message); return; }
  SH.id = id; const sh = SH.data.shop; $("modalTitle").textContent = sh.name;
  if (sh.services.length === 1 && sh.services[0] === "market") { openModal("market"); return; }
  SH.tab = SH.tab && sh.services.includes(SH.tab) ? SH.tab : sh.services[0];
  draw(box);
}
function draw(box) {
  const sh = SH.data.shop;
  box.innerHTML = `<p class="muted">${esc(sh.description)} <small>Preços de ${esc(SH.data.world)}. Caixa de compra: ${fmt(SH.data.budget)} gold.</small></p>
    <div class="tabs2">${sh.services.map(s => `<button data-st="${s}" class="${SH.tab === s ? "on" : ""}">${SVC[s] || s}</button>`).join("")}</div><div id="shopBody"></div>`;
  box.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { SH.tab = b.dataset.st; draw(box); });
  const el = $("shopBody");
  ({ buy: drawBuy, sell: drawSell, modular: drawForge, craft: el2 => renderCrafting(el2, sh.professions), repair: drawRepair, process: drawProcess, storage: drawStorage, enchant: drawEnchant, market: () => openModal("market") })[SH.tab](el, box);
}
async function refresh(box) { try { SH.data = await api.shopView(SH.id); } catch (e) { } draw(box); }

// ---------- comprar ----------
let F = { cat: "", rar: -1 };
function drawBuy(el, box) {
  const items = SH.data.items, cats = [...new Set(items.map(i => i.category))];
  const list = items.filter(i => (!F.cat || i.category === F.cat) && (F.rar < 0 || i.rarity === F.rar));
  el.innerHTML = `<div class="mfilters"><select id="fCat"><option value="">Todas as categorias</option>${cats.map(c => `<option value="${c}" ${F.cat === c ? "selected" : ""}>${CATN[c] || c}</option>`).join("")}</select><select id="fRar"><option value="-1">Qualquer raridade</option>${RARITY.map((r, i) => `<option value="${i}" ${F.rar === i ? "selected" : ""}>${r.name}</option>`).join("")}</select></div>
    <div class="grid3">${list.map(i => `<div class="card2"><span class="rar" style="color:${RARITY[i.rarity].color}">${RARITY[i.rarity].name}</span>${ico(i.icon)}<b>${esc(i.name)}</b><small>${CATN[i.category] || i.category}${i.atk ? " · atk " + i.atk : ""}${i.def ? " · def " + i.def : ""}${i.stock != null ? ` · estoque ${i.stock}` : ""}</small><div class="price">${fmt(i.price)} gold${i.stackable ? " cada" : ""}</div>
      <div class="listf">${i.stackable || i.t === "potion" ? `<input type="number" min="1" value="${i.t === "potion" ? 5 : 1}" id="bq-${i.t}">` : ""}<button class="primary" data-sbuy="${i.t}" ${i.stock === 0 ? "disabled" : ""}>Comprar</button></div></div>`).join("") || '<div class="muted">Nada com esse filtro.</div>'}</div>`;
  $("fCat").onchange = e => { F.cat = e.target.value; drawBuy(el, box); }; $("fRar").onchange = e => { F.rar = +e.target.value; drawBuy(el, box); };
  el.querySelectorAll("[data-sbuy]").forEach(b => b.onclick = () => { const t = b.dataset.sbuy; act(() => api.shopBuy(SH.id, t, +(el.querySelector(`#bq-${t}`)?.value || 1)), "Comprado").then(() => refresh(box)); });
}
// ---------- vender ----------
function accepts(t) { const tp = CAT.templates[t] || {}; return SH.data.buys.some(r => r === "any" || r === "cat:" + tp.category || r === "tpl:" + t || (r === "tag:gem" && tp.props?.gem) || (r === "tag:treat" && tp.props?.treat_to)) && tp.category !== "artefato"; }
function drawSell(el, box) {
  const items = S.inventory.filter(i => (i.container === "bag" || i.container === "protected") && accepts(i.template)), stacks = S.stacks.filter(s => accepts(s.t));
  el.innerHTML = `<p class="muted">${esc(SH.data.shop.name)} compra: ${SH.data.buys.map(r => r === "any" ? "de tudo" : r.startsWith("cat:") ? (CATN[r.slice(4)] || r.slice(4)) : r.startsWith("tag:") ? (r === "tag:gem" ? "gemas brutas" : "partes de criatura") : tn(r.slice(4))).join(", ")}.${SH.data.shop.sell_mult < 1 ? ` Paga ${Math.round(SH.data.shop.sell_mult * 100)}% do valor.` : ""}</p>
    <div class="grid3">${items.map(it => `<div class="card2"><span class="rar" style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name}</span>${ti(it.template)}<b>${esc(it.roll?.custom_name || it.roll?.name || tn(it.template))}</b><small>vale ~${fmt(Math.floor(it.value * SH.data.shop.sell_mult))} gold</small><button data-ssell="${it.id}">Vender</button></div>`).join("")}
    ${stacks.map((s, k) => `<div class="card2">${ti(s.t)}<b>${esc(tn(s.t))} ×${s.qty}</b><small>${s.purity}% · ${CAT.templates[s.t]?.props?.gem || CAT.templates[s.t]?.category === "gema" ? gemQ(s.purity) : s.band || ""}</small><div class="listf"><input type="number" min="1" max="${s.qty}" value="${s.qty}" id="sq${k}"><button data-ssk="${k}">Vender</button></div></div>`).join("")}</div>${!items.length && !stacks.length ? '<p class="muted">Você não tem nada que essa loja compre.</p>' : ""}`;
  el.querySelectorAll("[data-ssell]").forEach(b => b.onclick = () => act(() => api.shopSell(SH.id, { item: b.dataset.ssell }).then(x => { toast(`+${fmt(x.gold)} gold`); return x.state; })).then(() => refresh(box)));
  el.querySelectorAll("[data-ssk]").forEach(b => b.onclick = () => { const s = stacks[+b.dataset.ssk]; act(() => api.shopSell(SH.id, { t: s.t, purity: s.purity, qty: +$("sq" + b.dataset.ssk).value }).then(x => { toast(`+${fmt(x.gold)} gold`); return x.state; })).then(() => refresh(box)); });
}
// ---------- forja modular com prévia ----------
let FG = { type: null, sel: {}, ench: "" }, prevT = 0;
async function drawForge(el, box) {
  await loadDB(); const types = DB.types.filter(t => SH.data.shop.equip_types.includes(t.id));
  if (!FG.type || !types.find(t => t.id === FG.type)) { FG.type = types[0]?.id; FG.sel = {}; }
  const et = DB.types.find(t => t.id === FG.type), slots = DB.slots.filter(s => s.type_id === FG.type).sort((a, b) => a.sort - b.sort);
  const plv = S.profs.find(p => p.id === et.profession_id)?.level || 1;
  const modTxt = (t, sl) => { const m = DB.mprops[t]?.mods || {}; return Object.entries(sl.weights || {}).filter(([k]) => m[k] != null || (k === "def" && m.dmg != null) || (k === "eff" && m.dmg != null) || (k === "speed" && m.aspd != null)).map(([k, w]) => { const v = (m[k] ?? (k === "def" || k === "eff" ? m.dmg : k === "speed" ? m.aspd : 0)) * w; return v ? `${v > 0 ? "+" : ""}${+v.toFixed(1)}${k === "crit" ? "pp" : "%"} ${{ dmg: "dano", dur: "durab.", aspd: "vel.", magic: "magia", acc: "prec.", crit: "crít.", def: "def.", hp: "vida", mdef: "res.mág.", dodge: "esq.", eff: "efic.", speed: "vel." }[k] || k}` : ""; }).filter(Boolean).join(", "); };
  const opts = sl => { const ok = S.stacks.filter(s => { const tp = CAT.templates[s.t]; return tp && sl.accepts.includes(tp.category) && (!sl.only_ids || sl.only_ids.includes(s.t)) && (tp.category === "gema" || DB.mprops[s.t]); });
    const parts = S.inventory.filter(i => i.container === "bag" && i.roll?.part && (i.roll.part === sl.slot || (sl.slot === "cabeca" && i.roll.part === "cabeca")));
    return `<option value="">${sl.required ? "— escolha —" : "— nenhum —"}</option>${ok.map(s => { const req = DB.mprops[s.t]?.req_level || 1; return `<option value="${s.t}|${s.purity}" ${FG.sel[sl.slot] === s.t + "|" + s.purity ? "selected" : ""} ${req > plv ? "disabled" : ""}>${esc(tn(s.t))} ${s.purity}%${CAT.templates[s.t]?.category === "gema" ? " " + gemQ(s.purity) : ""} (${s.qty}/${sl.qty})${req > plv ? ` · pede nível ${req}` : ""} ${modTxt(s.t, sl) ? "· " + modTxt(s.t, sl) : ""}</option>`; }).join("")}${parts.map(i => `<option value="item:${i.id}" ${FG.sel[sl.slot] === "item:" + i.id ? "selected" : ""}>Peça pronta: ${esc(i.roll.mat_name)} q${i.roll.quality}</option>`).join("")}`; };
  const enchs = CAT.ench.filter(e => e.slot);
  el.innerHTML = `<div class="forge"><div class="ftypes">${types.map(t => `<button class="recipe ${t.id === FG.type ? "sel" : ""} ${plv < t.req_level && t.id === FG.type ? "locked" : ""}" data-ftype="${t.id}"><b>${esc(t.name)}</b><small>${esc((S.profs.find(p => p.id === t.profession_id) || {}).name || t.profession_id)} ${t.req_level}</small></button>`).join("")}</div>
    <div><p class="muted">${esc(et.description || "")} Cada componente usa o material que você escolher; materiais diferentes mudam atributos diferentes.</p>
      ${slots.map(sl => `<label class="auto fslot"><span>${esc(sl.name)}${sl.required ? "" : " <small>(opcional)</small>"} <small class="muted">×${sl.qty}</small></span><select data-fs="${sl.slot}">${opts(sl)}</select></label>`).join("")}
      ${et.kind !== "tool" ? `<label class="auto fslot"><span>Encantamento <small>(opcional)</small></span><select id="fEnch"><option value="">— nenhum —</option>${enchs.map(e => `<option value="${e.id}" ${FG.ench === e.id ? "selected" : ""}>${esc(e.name)} I · ${e.cost.q}× ${esc(tn(e.cost.t))} + ${e.cost.gold} gold</option>`).join("")}</select></label>` : ""}
      <div id="fPrev" class="fprev"><div class="muted">escolha os componentes…</div></div>
      <div class="actions"><button class="primary" id="fGo" disabled>Fabricar</button></div></div></div>`;
  el.querySelectorAll("[data-ftype]").forEach(b => b.onclick = () => { FG.type = b.dataset.ftype; FG.sel = {}; drawForge(el, box); });
  el.querySelectorAll("[data-fs]").forEach(s => s.onchange = () => { FG.sel[s.dataset.fs] = s.value; preview(); });
  if ($("fEnch")) $("fEnch").onchange = e => { FG.ench = e.target.value; };
  const slotsArg = () => { const o = {}; for (const [k, v] of Object.entries(FG.sel)) { if (!v) continue; if (v.startsWith("item:")) o[k] = { item: v.slice(5) }; else { const [t, pur] = v.split("|"); o[k] = { t, purity: +pur }; } } return o; };
  const preview = () => { clearTimeout(prevT); prevT = setTimeout(async () => { let r; try { r = await api.forgePreview(FG.type, slotsArg()); } catch (e) { $("fPrev").innerHTML = `<p class="warn">${esc(e.message)}</p>`; $("fGo").disabled = true; return; } showPrev(r); }, 150); };
  const showPrev = r => { const e = r.expected, lo = r.low, hi = r.high, base = et.base;
    const line = (k, n, fmtv = v => v) => e[k] == null ? "" : (() => { const bv = base[k], d = bv != null && k !== "crit" && k !== "acc" ? (e[k] / bv - 1) * 100 : (k === "crit" || k === "acc") && bv != null ? e[k] - bv : null; const cls = d == null ? "" : d > 0.05 ? "pos" : d < -0.05 ? "neg" : ""; return `<div class="row"><span>${n}</span><b class="${cls}">${fmtv(e[k])}${lo[k] != null && lo[k] !== hi[k] ? ` <small class="muted">(${fmtv(lo[k])}–${fmtv(hi[k])})</small>` : ""}${d != null && Math.abs(d) > 0.05 ? ` <small class="${cls}">${d > 0 ? "+" : ""}${d.toFixed(k === "crit" || k === "acc" ? 1 : 0)}${k === "crit" || k === "acc" ? "pp" : "%"}</small>` : ""}</b></div>`; })();
    $("fPrev").innerHTML = `<h4>${esc(e.name)}</h4>${line("dmg", "Dano")}${line("matk", "Ataque mágico")}${line("aspd", "Velocidade", v => (+v).toFixed(2) + "×")}${line("crit", "Crítico", v => v + "%")}${line("acc", "Precisão")}${line("def", "Defesa")}${line("hp", "Vida")}${line("mdef", "Res. mágica")}${line("dodge", "Esquiva", v => v + "%")}${line("eff", "Eficiência", v => (+v).toFixed(2) + "×")}${line("speed", "Velocidade de coleta", v => (+v).toFixed(2) + "×")}${line("tier", "Nível da ferramenta")}${line("dur", "Durabilidade", v => Math.round(v))}
      ${e.magic_aff ? `<div class="row"><span>Afinidade mágica</span><b class="pos">+${e.magic_aff}%</b></div>` : ""}${Object.keys(e).filter(k => k.startsWith("elem_")).map(k => `<div class="row"><span>Dano de ${k.slice(5)}</span><b class="pos">+${e[k]}</b></div>`).join("")}
      ${e.gem ? `<div class="row"><span>Gema</span><b>${esc(e.gem.name)} · ${esc(e.gem.quality)}</b></div>` : ""}
      <div class="row"><span>Qualidade prevista</span><b>${r.quality} <small class="muted">(${r.quality_low}–${r.quality_high}, raridade sorteada pela qualidade)</small></b></div>
      <div class="row"><span>${esc((S.profs.find(p => p.id === r.prof) || {}).name || r.prof)}</span><b class="${r.prof_level >= r.req_level ? "pos" : "neg"}">${r.prof_level} / ${r.req_level}</b></div>
      <div class="row"><span>Custo · tempo</span><b>${fmt(r.gold)} gold · ${r.seconds} s</b></div>
      ${r.missing.length ? `<div class="warn">${r.missing.map(m => esc(m.why)).join("<br>")}</div>` : ""}`;
    $("fGo").disabled = !r.ok; };
  $("fGo").onclick = () => act(() => api.forgeStart(FG.type, slotsArg(), FG.ench || null), "Fabricação iniciada: veja na Oficina").then(r => { if (r) { FG.sel = {}; drawForge(el, box); } });
  if (Object.keys(FG.sel).length) preview();
}
// ---------- conserto ----------
function drawRepair(el, box) {
  const tools = SH.id === "ferramentas", list = S.inventory.filter(i => ["bag", "equip", "protected"].includes(i.container) && i.roll?.maxdur && i.roll.dur < i.roll.maxdur && ((CAT.templates[i.template]?.slot === "tool") === tools));
  el.innerHTML = `<p class="muted">Consertar custa gold e reduz um pouco a durabilidade máxima.</p>${list.map(i => `<div class="row">${ti(i.template)}<span>${esc(i.roll?.custom_name || i.roll?.name || tn(i.template))}</span><b>${Math.round(i.roll.dur)}/${i.roll.maxdur}</b><button data-fix="${i.id}">Consertar</button></div>`).join("") || '<p class="muted">Nada precisando de conserto.</p>'}`;
  el.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => act(() => api.itemAction(b.dataset.fix, "consertar"), "Consertado").then(() => drawRepair(el, box)));
}
// ---------- encantador ----------
function drawEnchant(el, box) {
  const list = S.inventory.filter(i => ["bag", "equip", "protected"].includes(i.container) && CAT.templates[i.template]?.slot && CAT.templates[i.template].slot !== "tool");
  const enchs = CAT.ench.filter(e => e.slot), R = ["", "I", "II", "III", "IV", "V"];
  el.innerHTML = `<p class="muted">Cada equipamento tem 2 espaços: um prefixo e um sufixo. Repetir o mesmo encanto sobe o nível (até V); outro no mesmo espaço substitui.</p>
    ${list.map(i => { const en = i.roll?.enchants || {}; return `<div class="order"><div class="row">${ti(i.template)}<b>${esc(i.roll?.custom_name || i.roll?.name || tn(i.template))}</b><small>${["prefixo", "sufixo"].map(s => en[s] ? `${esc(en[s].name)} ${R[en[s].tier]}` : `${s} vazio`).join(" · ")}</small></div>
      <div class="row"><select data-ensel="${i.id}">${enchs.map(e => { const cur = en[e.slot], t = cur && cur.id === e.id ? cur.tier + 1 : 1; return t > 5 ? "" : `<option value="${e.id}">${e.slot === "prefixo" ? "Prefixo" : "Sufixo"}: ${esc(e.name)} ${R[t]} · ${e.cost.q * t}× ${esc(tn(e.cost.t))} + ${e.cost.gold * t} gold</option>`; }).join("")}</select><button class="primary" data-ench="${i.id}">Encantar</button></div></div>`; }).join("") || '<p class="muted">Nenhum equipamento.</p>'}`;
  el.querySelectorAll("[data-ench]").forEach(b => b.onclick = () => act(() => api.itemAction(b.dataset.ench, "encantar", { ench: el.querySelector(`[data-ensel="${b.dataset.ench}"]`).value }).then(x => x.state), "Encantado").then(() => drawEnchant(el, box)));
}
// ---------- Centro de Processamento ----------
let PR = { stone: null, method: "comum", qty: 10 };
async function drawProcess(el, box) {
  let v; try { v = await api.processingView(); } catch (e) { el.innerHTML = esc(e.message); return; }
  if (!PR.stone || !v.stones.find(s => s.id === PR.stone)) PR.stone = (v.stones.find(s => s.have > 0) || v.stones[0]).id;
  const st = v.stones.find(s => s.id === PR.stone), mt = v.methods.find(m => m.id === PR.method) || v.methods[0], pr = st.probs[mt.id];
  const qty = Math.max(1, Math.min(st.have || 1, PR.qty)), cost = mt.cost * qty, secs = Math.max(3, Math.min(3600, qty * mt.secs / (1 + v.level * 0.01)));
  const pct = p => p >= 0.01 ? (p * 100).toFixed(1) + "%" : p >= 0.0001 ? (p * 100).toFixed(3) + "%" : "1 em " + fmt(Math.round(1 / p));
  const okM = m => v.level >= m.req_level && (!m.only_stones || m.only_stones.includes(st.id));
  el.innerHTML = `<p class="muted">A pedra bruta não mostra o que tem dentro. Cada pedra é uma tentativa: pode sair minério, gema, resíduo ou nada, e a pedra é gasta de qualquer jeito. Processamento mineral nível <b>${v.level}</b>.</p>
    <div class="split"><div><h4>Pedra</h4>${v.stones.map(s => `<button class="recipe ${s.id === st.id ? "sel" : ""} ${s.have ? "" : "locked"}" data-pst="${s.id}"><b>${esc(s.name)}</b><small>${esc(s.origin)} · você tem ${fmt(s.have)}</small></button>`).join("")}</div>
      <div><h4>Método</h4>${v.methods.map(m => `<label class="pkg ${okM(m) ? "" : "locked"}"><input type="radio" name="pm" value="${m.id}" ${m.id === mt.id ? "checked" : ""} ${okM(m) ? "" : "disabled"}><span><b>${esc(m.name)}</b><br><small class="muted">${esc(m.description)} ${m.cost} gold/pedra · nível ${m.req_level}</small></span></label>`).join("")}
        <h4>Quantidade</h4><div class="qbtns">${[1, 10, 100, 1000].map(n => `<button data-pq="${n}" ${n > st.have ? "disabled" : ""}>${fmt(n)}</button>`).join("")}<button data-pq="${st.have}" ${!st.have ? "disabled" : ""}>Máximo (${fmt(st.have)})</button><input type="number" id="pQty" min="1" max="${st.have}" value="${qty}"></div>
        <div class="order"><div class="row"><span>Pedra</span><b>${esc(st.name)} · ${esc(st.origin)}</b></div><div class="row"><span>Quantidade</span><b>${fmt(qty)}</b></div><div class="row"><span>Método</span><b>${esc(mt.name)}</b></div><div class="row"><span>Custo total</span><b>${fmt(cost)} gold</b></div><div class="row"><span>Tempo</span><b>${secs < 60 ? Math.round(secs) + " s" : Math.round(secs / 60) + " min"}</b></div>
          <div class="row"><span>Requisitos</span><b class="${okM(mt) ? "pos" : "neg"}">Processamento ${mt.req_level}${mt.only_stones ? " · só pedra dimensional/primordial" : ""}</b></div></div>
        <div class="actions"><button class="primary" id="pGo" ${!st.have || !okM(mt) || qty > st.have ? "disabled" : ""}>Processar ${fmt(qty)}</button></div></div></div>
    <h4>Possíveis resultados (${esc(mt.name)})</h4><div class="probs">${pr.entries.map(e => `<div class="row"><span style="color:${RARITY[e.rarity || 0].color}">${esc(e.name)}</span><b>${pct(e.p)}</b></div>`).join("")}<div class="row"><span class="muted">Nada (pedra descartada)</span><b>${pct(pr.none)}</b></div></div>
    <h4>Seus lotes</h4>${v.jobs.map(j => { const left = Math.max(0, (new Date(j.ready_at) - Date.now()) / 1000); return `<div class="row"><span>${fmt(j.qty)}× ${esc(j.stone)} · ${esc(j.method)}</span>${j.status === "ativo" ? (left > 0 ? `<small>${Math.ceil(left)} s</small>` : `<button class="primary" data-pfin="${j.id}">Receber</button>`) : `<button data-prep='${esc(JSON.stringify(j.report))}'>Relatório</button>`}</div>`; }).join("") || '<p class="muted">Nenhum ainda.</p>'}`;
  el.querySelectorAll("[data-pst]").forEach(b => b.onclick = () => { PR.stone = b.dataset.pst; drawProcess(el, box); });
  el.querySelectorAll("input[name=pm]").forEach(b => b.onchange = () => { PR.method = b.value; drawProcess(el, box); });
  el.querySelectorAll("[data-pq]").forEach(b => b.onclick = () => { PR.qty = +b.dataset.pq; drawProcess(el, box); });
  $("pQty").onchange = e => { PR.qty = +e.target.value; drawProcess(el, box); };
  $("pGo").onclick = () => act(() => api.processStart(st.id, mt.id, qty), "Processando…").then(() => drawProcess(el, box));
  el.querySelectorAll("[data-pfin]").forEach(b => b.onclick = async () => { try { const r = await api.processFinish(b.dataset.pfin); applyServer(r.state); renderAll(); showReport(r.report); } catch (e) { toast(e.message, true); } drawProcess(el, box); });
  el.querySelectorAll("[data-prep]").forEach(b => b.onclick = () => showReport(JSON.parse(b.dataset.prep)));
  if (v.jobs.some(j => j.status === "ativo")) setTimeout(() => { if (SH.tab === "process" && $("pGo")) drawProcess(el, box); }, 3000);
}
function showReport(r) {
  const mats = Object.entries(r.materials || {}).sort((a, b) => b[1].rarity - a[1].rarity);
  document.querySelector("#report h3").textContent = "Relatório do processamento"; $("repSub").textContent = `${fmt(r.qty)}× ${r.stone} · ${r.method}`;
  $("repGrid").innerHTML = [["Processadas", fmt(r.qty)], ["Sem nada", fmt(r.lost)], ["Custo", fmt(r.cost) + " gold"], ["Valor estimado", fmt(r.value) + " gold"], ["Exp de Processamento", "+" + fmt(r.exp)], ["Nível", r.level]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("");
  $("repNotes").innerHTML = mats.map(([t, m]) => `<div class="repmat ${m.rarity >= 4 ? "rare" : ""}" style="color:${RARITY[m.rarity].color}">${m.rarity >= 4 ? "★ " : ""}${esc(m.name)} ×${fmt(m.qty)} <small>${RARITY[m.rarity].name} · ~${fmt(m.value)} gold</small></div>`).join("") || "Nenhum material desta vez.";
  $("report").hidden = false;
}
// ---------- Armazém ----------
async function drawStorage(el, box, data) {
  let w = data; if (!w) { try { w = await api.warehouse("ver"); } catch (e) { el.innerHTML = esc(e.message); return; } }
  const bag = S.inventory.filter(i => i.container === "bag"), run = (a, args, msg) => api.warehouse(a, args).then(r => { applyServer(r.state); renderAll(); toast(msg); drawStorage(el, box, r); }).catch(e => toast(e.message, true));
  el.innerHTML = `<p class="muted">O que fica no armazém não pesa na carga nem cai na morte. Itens: ${w.items.length}/${w.cap}.</p><div class="split">
    <div><h4>Mochila</h4>${bag.map(i => `<div class="row">${ti(i.template)}<span>${esc(i.roll?.custom_name || i.roll?.name || tn(i.template))}</span><button data-wgi="${i.id}">Guardar</button></div>`).join("") || '<p class="muted">Vazia.</p>'}
      ${S.stacks.map((s, k) => `<div class="row">${ti(s.t)}<span>${esc(tn(s.t))} ${s.purity}% ×${s.qty}</span><input type="number" min="1" max="${s.qty}" value="${s.qty}" id="wq${k}" style="width:64px"><button data-wgs="${k}">Guardar</button></div>`).join("")}</div>
    <div><h4>Armazém</h4>${w.items.map(i => `<div class="row">${ti(i.template)}<span>${esc(i.roll?.custom_name || i.roll?.name || tn(i.template))}</span><button data-wri="${i.id}">Retirar</button></div>`).join("")}
      ${w.stacks.map((s, k) => `<div class="row">${ti(s.t)}<span>${esc(s.name)} ${s.purity}% ×${s.qty}</span><input type="number" min="1" max="${s.qty}" value="${s.qty}" id="wr${k}" style="width:64px"><button data-wrs="${k}">Retirar</button></div>`).join("") || (w.items.length ? "" : '<p class="muted">Vazio.</p>')}</div></div>`;
  el.querySelectorAll("[data-wgi]").forEach(b => b.onclick = () => run("guardar_item", { item: b.dataset.wgi }, "Guardado"));
  el.querySelectorAll("[data-wri]").forEach(b => b.onclick = () => run("retirar_item", { item: b.dataset.wri }, "Retirado"));
  el.querySelectorAll("[data-wgs]").forEach(b => { const s = S.stacks[+b.dataset.wgs]; b.onclick = () => run("guardar_pilha", { t: s.t, purity: s.purity, qty: +$("wq" + b.dataset.wgs).value }, "Guardado"); });
  el.querySelectorAll("[data-wrs]").forEach(b => { const s = w.stacks[+b.dataset.wrs]; b.onclick = () => run("retirar_pilha", { t: s.t, purity: s.purity, qty: +$("wr" + b.dataset.wrs).value }, "Retirado"); });
}
