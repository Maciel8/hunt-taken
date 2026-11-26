// Telas da expansão: Personagem (atributos, classe, especialização, habilidades), Ofícios, Oficina, materiais e ficha de item fabricado.
// Tudo que muda número passa pelo servidor; aqui só monta formulário e mostra o estado que voltou.
import { RARITY, ATTRS, ITEMS, MONS } from "./data.js";
import { S, P, fmt } from "./sim.js";
import { api } from "./net.js";
import { act, toast } from "./ui.js";
import { A } from "./art.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const CAT = { classes: [], specs: [], recipes: [], ench: [], templates: {} };
export async function loadCatalog() {
  try {
    const [cl, sp, rc, en, tp] = await Promise.all([api.table("classes"), api.table("class_specializations"), api.table("recipes"), api.table("enchantments"), api.table("item_templates", "id,name,slot,atk,def,sell,price,icon,category,stackable,tier,base_rarity,weight,props,req_level,mat,deprecated")]);
    CAT.classes = cl; CAT.specs = sp; CAT.recipes = rc; CAT.ench = en;
    // criaturas: nível, vida e nomes vêm do servidor (a fase 3 mudou os níveis por região)
    try { const cr = await api.table("creatures", "id,name,level,hp,atk,def,exp,gold_min,gold_max,category,family"); for (const c of cr) { if (!MONS[c.id]) continue; Object.assign(MONS[c.id], { name: c.name, lvl: c.level, hp: c.hp, atk: c.atk, def: c.def, exp: c.exp, gold: [c.gold_min, c.gold_max], category: c.category, family: c.family }); } } catch (e) { }
    for (const t of tp) { CAT.templates[t.id] = t; ITEMS[t.id] = Object.assign(ITEMS[t.id] || {}, { name: t.name, icon: t.icon || "orb", slot: t.slot || ITEMS[t.id]?.slot, atk: t.atk, def: t.def, sell: t.sell, price: t.price ?? ITEMS[t.id]?.price, mat: t.mat, cat: t.category, stack: t.stackable, rar: t.base_rarity, props: t.props }); }
  } catch (e) { console.warn("catálogo", e); }
}
const tname = id => CAT.templates[id]?.name || ITEMS[id]?.name || id;
const ticon = id => { const n = CAT.templates[id]?.icon || ITEMS[id]?.icon || "orb"; return A.sp[n] ? `<img class="ic" src="assets/sprites/${n}.png" alt="">` : `<span class="ic ph"></span>`; };
const rcol = r => RARITY[r || 0]?.color || "#aaa";
const bandCol = p => p >= 100 ? "#ff3fd2" : p > 95 ? "#ffbf3a" : p > 80 ? "#a35bff" : p > 60 ? "#4f8cff" : p > 30 ? "#cfd6e0" : "#8a8a8a";

// ---------- Personagem ----------
let pend = {};
export function renderChar(box) {
  const p = P(), st = S.cstats || {}, free = S.pointsFree || 0, used = Object.values(pend).reduce((a, b) => a + b, 0), cls = S.cls || {};
  const attrRow = ([k, n, d]) => `<div class="attr"><span><b>${n}</b><small>${d}</small></span><b class="num">${(p.attrs?.[k] ?? 5) + (pend[k] || 0)}</b><span class="pm"><button data-am="${k}" ${!pend[k] ? "disabled" : ""}>−</button><button data-ap="${k}" ${used >= free ? "disabled" : ""}>+</button></span></div>`;
  const statRow = (n, v, suf = "") => `<div class="row"><span>${n}</span><b>${v ?? "—"}${suf}</b></div>`;
  const classPick = (!p.classId || p.classId === "aventureiro") ? (p.lvl >= 5 ? `<h4>Escolha sua classe</h4><div class="classes">${CAT.classes.filter(c => c.id !== "aventureiro").map(c => `<div class="classcard"><b>${esc(c.name)}</b><small>${esc(c.role)}</small><p>${esc(c.description)}</p><div class="pc"><span class="good">+ ${esc(c.pros)}</span><span class="bad">− ${esc(c.cons)}</span></div><small>Armas: ${c.weapons.join(", ")}</small><div class="specs">${CAT.specs.filter(s => s.class_id === c.id).map(s => `<i>${esc(s.name)}</i>`).join("")}</div><button class="primary" data-class="${c.id}">Ser ${esc(c.name)}</button></div>`).join("")}</div>` : `<p class="muted">Você é Aventureiro. A escolha de classe abre no nível 5.</p>`) : "";
  const specPick = p.classId && p.classId !== "aventureiro" && !p.specId ? (p.lvl >= 30 ? `<h4>Especialização</h4><div class="classes">${CAT.specs.filter(s => s.class_id === p.classId).map(s => `<div class="classcard"><b>${esc(s.name)}</b><p>${esc(s.description)}</p><button class="primary" data-spec="${s.id}">Escolher</button></div>`).join("")}</div>` : `<p class="muted">Especialização no nível 30: ${CAT.specs.filter(s => s.class_id === p.classId).map(s => esc(s.name)).join(", ")}.</p>`) : "";
  box.innerHTML = `<div class="charbox"><div><h4>${esc(cls.name || "Aventureiro")}${S.spec ? " · " + esc(S.spec.name) : ""} · nível ${p.lvl}</h4><p class="muted">${esc(cls.description || "")}</p>
    <h4>Atributos <small class="muted">${free - used} ponto(s) livre(s)</small></h4>${ATTRS.map(attrRow).join("")}
    <div class="actions"><button class="primary" id="apSave" ${!used ? "disabled" : ""}>Confirmar pontos</button><button id="apReset">Redistribuir (${fmt(100 + p.lvl * 40)} gold)</button></div></div>
    <div><h4>Status</h4>${statRow("Dano por segundo", st.dps)}${statRow("Ataque físico", st.patk)}${statRow("Ataque mágico", st.matk)}${statRow("Defesa", st.def)}${statRow("Resistência mágica", st.mdef)}${statRow("Vida", st.hp)}${statRow("Mana", st.mp)}${statRow("Crítico", st.crit, "%")}${statRow("Esquiva", st.dodge, "%")}${statRow("Precisão", st.acc, "%")}${statRow("Velocidade de ataque", st.aspd, "×")}${statRow("Regeneração", st.regen, "/s")}${statRow("Carga", `${S.carry?.used ?? 0} / ${st.carry}`, " kg")}${statRow("Sorte nos achados", st.luck != null ? "+" + Math.round(st.luck * 100) : "—", "%")}
    <p class="muted">Crítico, esquiva e velocidade têm retorno decrescente: cada ponto rende menos que o anterior.</p>
    <h4>Habilidades</h4>${(S.skillsOn || []).map(s => `<div class="skill ${s.on ? "on" : ""}"><b>${esc(s.name)}</b> <small>${s.kind} · nível ${s.req}</small><small>${esc(s.description || "")}</small></div>`).join("") || '<p class="muted">Escolha uma classe pra liberar habilidades.</p>'}</div></div>${classPick}${specPick}`;
  box.querySelectorAll("[data-ap]").forEach(b => b.onclick = () => { pend[b.dataset.ap] = (pend[b.dataset.ap] || 0) + 1; renderChar(box); });
  box.querySelectorAll("[data-am]").forEach(b => b.onclick = () => { pend[b.dataset.am] = Math.max(0, (pend[b.dataset.am] || 0) - 1); renderChar(box); });
  $("apSave").onclick = () => { const send = pend; pend = {}; act(() => api.spendPoints(send), "Atributos distribuídos").then(() => renderChar(box)); };
  $("apReset").onclick = () => act(() => api.resetPoints(), "Pontos devolvidos").then(() => renderChar(box));
  box.querySelectorAll("[data-class]").forEach(b => b.onclick = () => act(() => api.chooseClass(b.dataset.class), "Classe escolhida").then(() => renderChar(box)));
  box.querySelectorAll("[data-spec]").forEach(b => b.onclick = () => act(() => api.chooseSpec(b.dataset.spec), "Especialização escolhida").then(() => renderChar(box)));
}

// ---------- Ofícios ----------
const CATN = { coleta: "Coleta", processo: "Processamento", fabricacao: "Fabricação", servico: "Serviço" };
export function renderProfs(box) {
  const tools = S.inventory.filter(i => (ITEMS[i.template]?.slot === "tool") || i.roll?.tool);
  box.innerHTML = `<p class="muted">Cada ofício sobe de 1 a 100 só com uso. Coleta acontece nos depósitos do mapa: clique numa rocha, veio, árvore, moita ou ponto de pesca. O resto acontece na Oficina.</p>
  <div class="profgrid">${Object.keys(CATN).map(cat => `<div><h4>${CATN[cat]}</h4>${S.profs.filter(p => p.category === cat).map(p => { const pct = p.next > p.cur ? Math.min(100, (p.exp - p.cur) / (p.next - p.cur) * 100) : 100; return `<div class="prof"><div class="row"><b>${esc(p.name)}</b><b>${p.level}</b></div><small>${esc(p.tier)}</small><div class="bar"><i style="width:${pct}%"></i></div></div>`; }).join("")}</div>`).join("")}</div>
  <h4>Ferramentas</h4><div class="tools">${tools.map(i => { const r = i.roll || {}, pr = ITEMS[i.template]?.props || {}, dur = r.dur ?? pr.dur, mx = r.maxdur ?? pr.dur; return `<div class="tool"><span class="slotv r${i.rarity}">${ticon(i.template)}</span><span><b>${esc(r.name || tname(i.template))}</b><small>nível ${r.tier ?? pr.tier ?? 1} · eficiência ${r.eff ?? pr.eff ?? 1}× · velocidade ${r.speed ?? pr.speed ?? 1}×</small><small>durabilidade ${dur ?? "—"}/${mx ?? "—"}</small></span>${dur != null && mx && dur < mx ? `<button data-fix="${i.id}">Consertar</button>` : ""}</div>`; }).join("") || '<p class="muted">Nenhuma. Compre na loja do mercador.</p>'}</div>`;
  box.querySelectorAll("[data-fix]").forEach(b => b.onclick = () => act(() => api.itemAction(b.dataset.fix, "consertar"), "Consertado").then(() => renderProfs(box)));
}

// ---------- Oficina ----------
let selRecipe = null;
// só a lista de trabalhos muda com o tempo; o resto da tela fica parado pro clique não se perder
export function refreshJobs() {
  const el = document.getElementById("jobs"); if (!el) return; const now = Date.now();
  el.querySelectorAll("[data-collect]").forEach(b => { const j = S.craftJobs.find(x => x.id === b.dataset.collect); if (!j) return; const left = Math.max(0, (new Date(j.ready_at) - now) / 1000); b.disabled = left > 0; const sm = b.parentElement.querySelector("small"); if (sm) sm.textContent = left > 0 ? Math.ceil(left) + " s" : "pronto"; });
}
export function renderWorkshop(box) {
  const lvl = id => S.profs.find(p => p.id === id)?.level || 1;
  const groups = {}; for (const r of CAT.recipes) (groups[r.profession_id] = groups[r.profession_id] || []).push(r);
  const pname = id => S.profs.find(p => p.id === id)?.name || id;
  const have = t => S.stacks.filter(s => s.t === t).reduce((a, s) => a + s.qty, 0);
  const now = Date.now();
  box.innerHTML = `<div class="shop"><div class="rlist">${Object.entries(groups).map(([pid, rs]) => `<h4>${esc(pname(pid))} <small class="muted">nível ${lvl(pid)}</small></h4>${rs.sort((a, b) => a.req_level - b.req_level).map(r => `<button class="recipe ${selRecipe === r.id ? "sel" : ""} ${lvl(pid) < r.req_level ? "locked" : ""}" data-rc="${r.id}"><b>${esc(r.name)}</b><small>nível ${r.req_level} · ${r.seconds} s${r.gold_cost ? " · " + r.gold_cost + " gold" : ""}</small></button>`).join("")}`).join("")}</div>
    <div><div id="rcDetail" class="itemcard"><div class="muted">Escolha uma receita.</div></div><h4>Trabalhos (${S.craftJobs.length}/3)</h4><div id="jobs">${S.craftJobs.map(j => { const left = Math.max(0, (new Date(j.ready_at) - now) / 1000); const r = CAT.recipes.find(x => x.id === j.recipe_id); return `<div class="job"><span><b>${esc(r?.name || j.recipe_id)}</b>${j.qty > 1 ? " ×" + j.qty : ""}<small>${left > 0 ? Math.ceil(left) + " s" : "pronto"}</small></span><button ${left > 0 ? "disabled" : ""} class="primary" data-collect="${j.id}">Coletar</button></div>`; }).join("") || '<p class="muted">Nada em andamento.</p>'}</div></div></div>`;
  box.querySelectorAll("[data-rc]").forEach(b => b.onclick = () => { selRecipe = b.dataset.rc; renderWorkshop(box); });
  box.querySelectorAll("[data-collect]").forEach(b => b.onclick = async () => { try { const r = await api.craftFinish(b.dataset.collect); if (r.state) (await import("./sim.js")).applyServer(r.state); showCraftResult(r); } catch (e) { toast(e.message, true); } renderWorkshop(box); });
  if (!selRecipe) return;
  const r = CAT.recipes.find(x => x.id === selRecipe); if (!r) return;
  const det = $("rcDetail"), techs = { segura: "Segura: barata, pureza sobe pouco, quase nunca falha", padrao: "Padrão: custa mais, pureza sobe bem", arriscada: "Arriscada: cara, pode subir muito a pureza, falha mais (devolve metade)" };
  const inputs = r.inputs.map((inp, k) => {
    if (inp.t) return `<div class="row"><span>${ticon(inp.t)} ${esc(tname(inp.t))} ×${inp.q}</span><b style="color:${have(inp.t) >= inp.q ? "var(--green)" : "var(--red)"}">${have(inp.t)}</b></div>`;
    if (inp.cat) { const opts = [...new Set(S.stacks.filter(s => s.cat === inp.cat && (!inp.only || inp.only.includes(s.t))).map(s => s.t))]; return `<div class="row"><span>${inp.q}× ${inp.only ? "barra nobre" : { barra: "barra ou liga", madeira: "madeira", gema: "gema lapidada" }[inp.cat] || inp.cat}</span><select data-ch="${k}">${opts.map(t => `<option value="${t}">${esc(tname(t))} (${have(t)})</option>`).join("") || "<option value=''>nenhuma</option>"}</select></div>`; }
    if (inp.part) { const parts = S.inventory.filter(i => i.container === "bag" && i.roll?.part === inp.part); const pn = { lamina: "Lâmina", guarda: "Guarda", empunhadura: "Empunhadura", pomo: "Pomo", cabeca: "Cabeça de picareta", cabeca_machado: "Cabeça de machado", cabeca_foice: "Lâmina de foice" }[inp.part] || inp.part; return `<div class="row"><span>${pn}</span><select data-part="${k}">${parts.map(i => `<option value="${i.id}">${esc(i.roll.mat_name)} · qualidade ${i.roll.quality}</option>`).join("") || "<option value=''>fabrique primeiro</option>"}</select></div>`; }
  }).join("");
  const out = r.output.t ? tname(r.output.t) : r.output.part ? "uma peça (" + r.output.part + ")" : r.output.pots ? r.output.pots + " poções" : "a mesma barra, mais pura";
  det.innerHTML = `<h4>${esc(r.name)}</h4><p class="muted">${esc(r.description || "")}</p>${inputs}<div class="row"><span>Resultado</span><b>${esc(out)}</b></div>${r.techniques ? `<label class="auto"><span>Técnica</span><select id="rcTech">${Object.entries(techs).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>` : ""}${["refino", "consumivel"].includes(r.kind) ? `<label class="auto"><span>Quantidade</span><input id="rcQty" type="number" min="1" max="20" value="1"></label>` : ""}<div class="actions"><button class="primary" id="rcGo" ${lvl(r.profession_id) < r.req_level ? "disabled" : ""}>${lvl(r.profession_id) < r.req_level ? "Precisa de nível " + r.req_level : "Começar"}</button></div>`;
  $("rcGo").onclick = () => {
    const choices = r.inputs.map((inp, k) => inp.cat ? { t: det.querySelector(`[data-ch="${k}"]`)?.value } : inp.part ? { item: det.querySelector(`[data-part="${k}"]`)?.value } : {});
    act(() => api.craftStart(r.id, $("rcTech")?.value || "segura", +($("rcQty")?.value || 1), choices).then(x => x.state || x), "Trabalho começou").then(() => renderWorkshop(box));
  };
}
function showCraftResult(r) {
  if (r.fail) return toast("Falhou. Metade dos materiais voltou.", true);
  const x = r.result || {};
  if (x.dmin) toast(`Forjou ${x.name}: ${x.dmin}–${x.dmax} de dano, qualidade ${x.quality} (${RARITY[x.rarity]?.name})`);
  else if (x.part) toast(`Peça pronta: ${x.mat_name}, qualidade ${x.quality}`);
  else if (x.pots) toast(`+${x.pots} poções`);
  else if (x.t) toast(`${x.q}× ${tname(x.t)} com ${x.purity}% de pureza${x.sub ? " e pó arcano" : ""}`);
}

// ---------- materiais (na aba Equipamento) e ficha de item fabricado ----------
export function materialsHtml() {
  const c = S.carry || {};
  return `<h4>Materiais <small class="muted">${c.used ?? 0} / ${c.cap ?? 0} kg</small></h4><div class="bag mats">${S.stacks.map(s => `<button class="slotv r${s.rarity || 0}" data-stack="${s.t}|${s.purity}" title="${esc(tname(s.t))} · ${s.band} ${s.purity}%">${ticon(s.t)}<i class="qty">${s.qty}</i><i class="pur" style="background:${bandCol(s.purity)}"></i></button>`).join("") || '<p class="muted">Nenhum material. Colete nos depósitos do mapa.</p>'}</div>`;
}
export function stackCard(key) {
  const [t, pur] = key.split("|"), s = S.stacks.find(x => x.t === t && x.purity === +pur); if (!s) return "";
  const value = Math.floor((CAT.templates[t]?.sell || 0) * (0.6 + s.purity / 100 * 0.6));
  return `<div class="ic-head"><div class="slotv r${s.rarity}">${ticon(t)}</div><div><b style="color:${rcol(s.rarity)}">${esc(tname(t))}</b><small>${RARITY[s.rarity]?.name} · ${s.band} (${s.purity}% de pureza) · ${s.weight} kg cada</small></div></div><div class="row"><span>Quantidade</span><b>${s.qty}</b></div><div class="row"><span>NPC paga</span><b style="color:var(--gold)">${value} gold cada</b></div><div class="actions"><input type="number" id="sellQ" min="1" max="${s.qty}" value="${s.qty}" style="width:70px"><button data-sellstack="${key}">Vender pro NPC</button></div>`;
}
export function craftedLines(it) {
  const r = it.roll || {}; if (!r.maker && !r.components && !r.enchants) return "";
  const comps = r.components ? Object.entries(r.components).map(([k, c]) => `${k}: ${esc(c.mat_name)} (${c.purity}%, q${c.quality})`).join(" · ") : "";
  return `${r.dmin ? `<div class="row"><span>Dano</span><b>${r.dmin}–${r.dmax}</b></div><div class="row"><span>Velocidade</span><b>${r.aspd}×</b></div>` : ""}${r.crit ? `<div class="row"><span>Crítico</span><b>+${r.crit}%</b></div>` : ""}${r.dur != null ? `<div class="row"><span>Durabilidade</span><b>${Math.round(r.dur)}/${r.maxdur}</b></div>` : ""}${r.quality != null ? `<div class="row"><span>Qualidade</span><b>${r.quality}</b></div>` : ""}${r.purity != null ? `<div class="row"><span>Pureza dos materiais</span><b>${r.purity}%</b></div>` : ""}${r.upgrade ? `<div class="row"><span>Aprimoramento</span><b>+${r.upgrade}</b></div>` : ""}${r.sockets ? `<div class="row"><span>Gemas</span><b>${(r.gems || []).length}/${r.sockets}</b></div>` : ""}${(r.ench || []).length ? `<div class="row"><span>Encantos</span><b>${r.ench.map(e => esc(CAT.ench.find(x => x.id === e)?.name || e)).join(", ")}</b></div>` : ""}${encLines(r)}${r.maker ? `<div class="row"><span>Fabricante</span><b>${esc(r.maker)}</b></div><div class="row"><small>Procedência</small><small>${esc(r.origin || "")} · ${r.made_at ? new Date(r.made_at).toLocaleDateString("pt-BR") : ""}</small></div>` : ""}${comps ? `<small class="muted">${comps}</small>` : ""}`;
}
const ROMAN = ["", "I", "II", "III", "IV", "V"];
const FXN = { atk: "ataque", matk: "ataque mágico", crit: "% crítico", aspd_pct: "% velocidade", all_stats: "todos os atributos", luck: "sorte", def: "defesa", hp: "vida", regen: "regeneração", dodge: "% esquiva", elem_fogo: "fogo", elem_gelo: "gelo", elem_sagrado: "sagrado", elem_veneno: "veneno" };
function encLines(r) {
  const en = r.enchants || {}, fx = r.ench_fx || {};
  const extra = [["matk", "Ataque mágico"], ["def", "Defesa"], ["hp", "Vida"], ["mdef", "Resistência mágica"], ["all_stats", "Todos os atributos"], ["luck", "Sorte"]].filter(([k]) => r[k] && !r.dmin || (k === "matk" && r.matk)).map(([k, n]) => `<div class="row"><span>${n}</span><b>+${k === "luck" ? (r[k] * 100).toFixed(2) + "%" : r[k]}</b></div>`).join("");
  const sl = ["prefixo", "sufixo"].filter(k => en[k]).map(k => `<div class="row"><span>${k === "prefixo" ? "Prefixo" : "Sufixo"}</span><b>${esc(en[k].name)} ${ROMAN[en[k].tier]}</b></div>`).join("");
  const fxl = Object.keys(fx).length ? `<small class="muted">Encantos: ${Object.entries(fx).map(([k, v]) => `+${+(+v).toFixed(2)} ${FXN[k] || k}`).join(" · ")}</small>` : "";
  return extra + sl + fxl;
}
function enchOptions(it) {
  const r = it.roll || {}, en = r.enchants || {};
  return CAT.ench.filter(e => e.slot).map(e => { const cur = en[e.slot], tier = cur && cur.id === e.id ? cur.tier + 1 : 1; if (tier > (e.max_tier || 5)) return ""; return `<option value="${e.id}">${e.slot === "prefixo" ? "Prefixo" : "Sufixo"}: ${esc(e.name)} ${ROMAN[tier]}${cur && cur.id !== e.id ? " (substitui " + esc(cur.name) + ")" : ""} · ${e.cost.q * tier}× ${esc(tname(e.cost.t))} + ${e.cost.gold * tier} gold · Encantamento ${e.req_level + (tier - 1) * 10}</option>`; }).join("");
}
export function craftedActions(it) {
  const r = it.roll || {}, tslot = CAT.templates[it.template]?.slot;
  if (!r.components && !r.maxdur && !(tslot && tslot !== "tool")) return "";
  const gems = S.stacks.filter(s => s.cat === "gema");
  return `${r.components ? `<button data-ia="aprimorar" data-it="${it.id}">Aprimorar +${(r.upgrade || 0) + 1}</button><button data-ia="desmontar" data-it="${it.id}">Desmontar</button>` : ""}${r.maxdur && r.dur < r.maxdur ? `<button data-ia="consertar" data-it="${it.id}">Consertar</button>` : ""}${r.sockets && (r.gems || []).length < r.sockets && gems.length ? `<select id="gemSel">${gems.map(g => `<option value="${g.t}|${g.purity}">${esc(tname(g.t))}</option>`).join("")}</select><button data-ia="gema" data-it="${it.id}">Encaixar gema</button>` : ""}${tslot && tslot !== "tool" && CAT.ench.some(e => e.slot) ? `<select id="enchSel">${enchOptions(it)}</select><button data-ia="encantar" data-it="${it.id}">Encantar</button>` : ""}`;
}
export async function itemActionClick(b) {
  const a = b.dataset.ia, id = b.dataset.it; let arg = {};
  if (a === "gema") { const [t, p] = ($("gemSel")?.value || "|").split("|"); arg = { t, purity: +p }; }
  if (a === "encantar") arg = { ench: $("enchSel")?.value };
  const r = await act(() => api.itemAction(id, a, arg).then(x => { if (a === "encantar" && x.tier) toast(`Encanto aplicado: nível ${ROMAN[x.tier]}`); if (a === "aprimorar") toast(x.ok ? "Aprimorado!" : `Não deu desta vez (chance era ${Math.round(x.chance * 100)}%). Só os materiais foram gastos.`, !x.ok); return x.state; }));
  return r;
}

// ---------- Bestiário ----------
const CATC = { comum: "#a8a8a8", incomum: "#5bd16b", rara: "#4f8cff", elite: "#a35bff", miniboss: "#ffbf3a", boss: "#ff4a4a", guardiao: "#3fe6ff" };
const REALMN = { eldoria: "Eldoria", frostheim: "Fronteira de Frostheim", ignareth: "Fronteira de Ignareth", nocthar: "Fronteira de Nocthar" };
export async function renderBestiary(box) {
  box.innerHTML = '<div class="muted">carregando…</div>';
  let list = []; try { list = await api.bestiary(); } catch (e) { box.innerHTML = esc(e.message); return; }
  const kv = o => Object.entries(o || {}).map(([k, v]) => `${k} ${v}%`).join(", ") || "—";
  const groups = {}; for (const c of list) (groups[c.realm || "outros"] = groups[c.realm || "outros"] || []).push(c);
  box.innerHTML = `<p class="muted">Toda criatura que você caçou aparece com o total de abates. As que você ainda não enfrentou ficam com os detalhes ocultos.</p>${Object.entries(groups).map(([rm, cs]) => `<h4>${REALMN[rm] || rm}</h4><div class="beasts">${cs.map(c => { const seen = c.kills > 0; return `<div class="beast ${seen ? "" : "unseen"}"><div class="row"><b>${esc(c.name)}</b><small style="color:${CATC[c.category]}">${c.category} · nível ${c.level}</small></div><small class="muted">${esc((c.family || "").replace(/_/g, " "))} · ${esc((c.biome || "").replace(/_/g, " "))}</small>${seen ? `<p>${esc(c.description || "")}</p><div class="row"><small>Vida ${c.hp} · ataque ${c.atk} · defesa ${c.def}</small><small>${c.exp} exp</small></div><div class="row"><small>Resiste</small><small>${kv(c.resist)}</small></div><div class="row"><small>Fraco contra</small><small>${kv(c.weak)}</small></div><div class="row"><small>Drops</small><small>${c.drops.map(d => esc(d.name) + " " + (d.chance * 100).toFixed(d.chance < .01 ? 2 : 0) + "%").join(", ") || "—"}</small></div>` : `<p class="muted">Ainda não enfrentado.</p>`}<div class="row"><small>Abatidos</small><b>${fmt(c.kills)}</b></div></div>`; }).join("")}</div>`).join("")}`;
}
