// Fabricação simples: uma tela só. Esquerda: o que você tem (materiais com quantidade). Direita: o que dá pra fabricar,
// com cada material "precisa × / tem" (verde = ok, vermelho = falta), nível do ofício, ferramenta e gold.
// O botão só acende com tudo atendido. Usa as receitas e o servidor de sempre (craft_start / craft_finish);
// material por categoria é escolhido sozinho (o que você tem mais), técnica "segura".
import { S, applyServer } from "./sim.js";
import { CAT } from "./progress.js";
import { ITEMS, RARITY } from "./data.js";
import { api } from "./net.js";
import { toast, renderAll } from "./ui.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tname = id => CAT.templates[id]?.name || ITEMS[id]?.name || id;
const ticon = id => { const n = CAT.templates[id]?.icon || ITEMS[id]?.icon || "orb"; return `<img class="ic" src="assets/sprites/${n}.png" alt="" onerror="this.style.visibility='hidden'">`; };
const CATN = { barra: "Barra (qualquer)", madeira: "Madeira (qualquer)", gema: "Gema lapidada (qualquer)", couro: "Couro (qualquer)", minerio: "Minério (qualquer)" };
const PART = { lamina: "Lâmina", guarda: "Guarda", empunhadura: "Empunhadura", pomo: "Pomo", cabeca: "Cabeça de picareta", cabeca_machado: "Cabeça de machado", cabeca_foice: "Lâmina de foice" };
const KIND = [["todas", "Tudo"], ["refino", "Refino"], ["componente", "Componentes"], ["equipamento", "Equipamentos"], ["consumivel", "Consumíveis"], ["montagem", "Montagem"]];
let F = { kind: "todas", onlyReady: false, q: "" };

const have = t => S.stacks.filter(s => s.t === t).reduce((a, s) => a + s.qty, 0);
const lvl = id => S.profs.find(p => p.id === id)?.level || 1;
const pname = id => S.profs.find(p => p.id === id)?.name || id;
const hasTool = kind => S.inventory.some(i => ["equip", "bag", "protected"].includes(i.container) && ((CAT.templates[i.template]?.props?.tool) === kind || i.roll?.tool === kind));
// avalia uma receita: linhas de requisito + escolhas automáticas pro servidor
function evaluate(r) {
  const lines = [], choices = []; let ok = true;
  for (const inp of r.inputs || []) {
    if (inp.t) { const h = have(inp.t), good = h >= inp.q; ok = ok && good; lines.push({ icon: ticon(inp.t), name: tname(inp.t), need: inp.q, have: h, good }); choices.push({}); }
    else if (inp.cat) { const opts = {}; for (const s of S.stacks) if (s.cat === inp.cat && (!inp.only || inp.only.includes(s.t))) opts[s.t] = (opts[s.t] || 0) + s.qty;
      const best = Object.entries(opts).sort((a, b) => b[1] - a[1])[0], h = best ? best[1] : 0, good = h >= inp.q; ok = ok && good;
      lines.push({ icon: best ? ticon(best[0]) : "", name: inp.only ? "Barra nobre" : (CATN[inp.cat] || inp.cat), sub: best ? `usa ${tname(best[0])}` : "", need: inp.q, have: h, good }); choices.push(best ? { t: best[0] } : {}); }
    else if (inp.part) { const parts = S.inventory.filter(i => i.container === "bag" && i.roll?.part === inp.part), good = parts.length > 0; ok = ok && good;
      lines.push({ icon: "", name: PART[inp.part] || inp.part, need: 1, have: parts.length, good }); choices.push(parts[0] ? { item: parts[0].id } : {}); }
  }
  const lvOk = lvl(r.profession_id) >= r.req_level, toolOk = !r.tool || hasTool(r.tool), goldOk = (S.gold || 0) >= (r.gold_cost || 0);
  return { lines, choices, ok: ok && lvOk && toolOk && goldOk, lvOk, toolOk, goldOk, matsOk: ok };
}
const outName = r => r.output?.t ? tname(r.output.t) : r.output?.part ? (PART[r.output.part] || "peça") : r.output?.pots ? `${r.output.pots} poções` : "a mesma barra, mais pura";

export function renderCrafting(box, only) {
  const recs = CAT.recipes.filter(r => r.kind !== "modular" && (!only || only.includes(r.profession_id)) && (F.kind === "todas" || r.kind === F.kind) && (!F.q || (r.name + " " + outName(r)).toLowerCase().includes(F.q.toLowerCase())));
  const evals = recs.map(r => ({ r, e: evaluate(r) })).filter(x => !F.onlyReady || x.e.ok).sort((a, b) => (b.e.ok - a.e.ok) || (a.r.req_level - b.r.req_level));
  const mats = Object.values(S.stacks.reduce((m, s) => { (m[s.t] = m[s.t] || { t: s.t, qty: 0 }).qty += s.qty; return m; }, {})).sort((a, b) => tname(a.t).localeCompare(tname(b.t)));
  const now = Date.now();
  box.innerHTML = `<div class="cr">
    <aside class="cr-inv"><h4>Seu inventário</h4><p class="muted">${S.carry ? `Carga ${Math.round(S.carry.used)} / ${S.carry.cap} kg · ` : ""}${Number(S.gold || 0).toLocaleString("pt-BR")} gold</p>
      <div class="cr-mats">${mats.length ? mats.map(m => `<div class="cr-mat">${ticon(m.t)}<span>${esc(tname(m.t))}</span><b>${m.qty}</b></div>`).join("") : `<p class="muted">Sem materiais. Colete (Minerar/Cortar/Colher/Pescar) ou cace.</p>`}</div>
      <h4>Trabalhos (${S.craftJobs.length}/3)</h4><div class="cr-jobs">${S.craftJobs.length ? S.craftJobs.map(j => { const left = Math.max(0, (new Date(j.ready_at) - now) / 1000), r = CAT.recipes.find(x => x.id === j.recipe_id);
        return `<div class="cr-job"><span>${esc(r?.name || j.recipe_id)}</span>${left > 0 ? `<small>${Math.ceil(left)} s</small>` : `<button class="primary" data-collect="${j.id}">Coletar</button>`}</div>`; }).join("") : `<p class="muted">Nada fabricando.</p>`}</div>
      <p class="muted"><a href="#" id="crAdv">Modo avançado (técnicas, pureza e forja por peças)</a></p></aside>
    <section class="cr-list"><div class="cr-filters">${KIND.map(([k, l]) => `<button data-kind="${k}" class="${F.kind === k ? "on" : ""}">${l}</button>`).join("")}
      <label class="cr-ready"><input type="checkbox" id="crReady" ${F.onlyReady ? "checked" : ""}> Só o que já dá pra fazer</label><input id="crQ" placeholder="buscar…" value="${esc(F.q)}"></div>
      <div class="cr-cards">${evals.map(({ r, e }) => `<div class="cr-card ${e.ok ? "ready" : ""}">
        <div class="cr-head">${r.output?.t ? ticon(r.output.t) : `<span class="ic"></span>`}<div><b>${esc(r.name)}</b><small>${esc(pname(r.profession_id))} · ${r.seconds}s${r.output?.q > 1 ? ` · rende ${r.output.q}` : ""}</small></div><span class="cr-badge ${e.ok ? "ok" : "no"}">${e.ok ? "Pode fabricar" : "Falta algo"}</span></div>
        <div class="cr-req">${e.lines.map(l => `<div class="cr-line ${l.good ? "ok" : "no"}">${l.icon}<span>${l.need}× ${esc(l.name)}${l.sub ? ` <small>${esc(l.sub)}</small>` : ""}</span><b>tem ${l.have}${l.good ? " ✓" : ` · faltam ${l.need - l.have}`}</b></div>`).join("")}
          ${!e.lvOk ? `<div class="cr-line no"><span>Requer ${esc(pname(r.profession_id))} nível ${r.req_level}</span><b>você: ${lvl(r.profession_id)}</b></div>` : ""}
          ${r.tool ? `<div class="cr-line ${e.toolOk ? "ok" : "no"}"><span>Ferramenta: ${esc(r.tool)}</span><b>${e.toolOk ? "✓" : "falta"}</b></div>` : ""}
          ${r.gold_cost ? `<div class="cr-line ${e.goldOk ? "ok" : "no"}"><span>Custo: ${r.gold_cost} gold</span><b>${e.goldOk ? "✓" : "gold insuficiente"}</b></div>` : ""}</div>
        <div class="cr-foot"><span>Resultado: <b>${esc(outName(r))}</b></span><button class="primary" data-make="${r.id}" ${e.ok ? "" : "disabled"}>Fabricar</button></div></div>`).join("") || `<p class="muted">Nenhuma receita com esse filtro.</p>`}</div></section></div>`;
  box.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { F.kind = b.dataset.kind; renderCrafting(box, only); });
  $("crReady").onchange = e => { F.onlyReady = e.target.checked; renderCrafting(box, only); };
  $("crQ").oninput = e => { F.q = e.target.value; clearTimeout(F.t); F.t = setTimeout(() => { renderCrafting(box, only); const q = $("crQ"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
  $("crAdv").onclick = ev => { ev.preventDefault(); import("./progress.js").then(m => m.renderWorkshop(box, only)); };
  box.querySelectorAll("[data-make]").forEach(b => b.onclick = async () => { const r = CAT.recipes.find(x => x.id === b.dataset.make), e = evaluate(r); if (!e.ok) return; b.disabled = true;
    try { const res = await api.craftStart(r.id, "segura", 1, e.choices); applyServer(res.state || res); toast(`${r.name}: começou (${r.seconds}s)`); renderAll(); } catch (er) { toast(er.message, true); } renderCrafting(box, only); });
  box.querySelectorAll("[data-collect]").forEach(b => b.onclick = async () => { b.disabled = true;
    try { const r = await api.craftFinish(b.dataset.collect); if (r.state) applyServer(r.state); const x = r.result || {};
      toast(r.fail ? "Falhou: metade dos materiais voltou." : x.dmin ? `Pronto: ${x.name} (${RARITY[x.rarity]?.name || ""})` : x.t ? `Pronto: ${x.q}× ${tname(x.t)}` : x.pots ? `+${x.pots} poções` : "Pronto!", !!r.fail); renderAll(); }
    catch (er) { toast(er.message, true); } renderCrafting(box, only); });
  // contagem regressiva dos trabalhos
  clearTimeout(F.timer); if (S.craftJobs.some(j => new Date(j.ready_at) > Date.now())) F.timer = setTimeout(() => { if (document.body.contains(box) && box.querySelector(".cr")) renderCrafting(box, only); }, 1000);
}
