// Mundos progressivos (1 a 5): seletor na barra de cima, viagem com requisito, paleta do mapa por mundo,
// criaturas reescaladas pra faixa do mundo e chefes mundiais no altar da Floresta dos Ancestrais.
// O servidor decide tudo (travel_world, world_boss_action); aqui é a interface.
import { MONS } from "./data.js";
import { S, P, fmt, applyServer } from "./sim.js";
import { api } from "./net.js";
import { act, toast, renderAll } from "./ui.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const W = { list: [], cur: 1 };
const BASE = {};   // nível e nome originais das criaturas (Eldoria)

export async function loadWorlds() { try { W.list = await api.worlds(); } catch (e) { W.list = []; } applyWorld(); }
export function worldLevel(w, base) { const x = W.list.find(v => v.id === w); if (!x || w <= 1) return base; const span = (x.level_max ?? x.level_min + 499) - x.level_min + 1; return x.level_min - 1 + Math.ceil(base * span / 100); }
// chamado sempre que o estado chega: troca paleta e reescala as criaturas se o mundo mudou
export function applyWorld() {
  const w = S.world?.id || 1, x = W.list.find(v => v.id === w) || S.world;
  document.body.dataset.palette = x?.palette || "none";
  const btn = $("worldBtn"); if (btn && x) btn.innerHTML = `<b>Mundo ${x.id}</b> <span>${esc(x.name)}</span> ▾`;
  if (W.cur === w && Object.keys(BASE).length) return;
  for (const [id, m] of Object.entries(MONS)) { if (!BASE[id]) BASE[id] = { lvl: m.lvl, name: m.name, hp: m.hp, atk: m.atk, def: m.def, exp: m.exp }; const b = BASE[id];
    const lvl = worldLevel(w, b.lvl), k = b.lvl ? lvl / b.lvl : 1;
    Object.assign(m, { lvl, name: w > 1 ? b.name + (x?.creature_prefix || x?.prefix || "") : b.name, hp: Math.round(b.hp * Math.pow(k, 1.5)), atk: Math.round(b.atk * k), def: Math.round(b.def * k), exp: Math.round(b.exp * Math.pow(k, 1.7)) }); }
  W.cur = w;
}
export async function openWorlds() {
  await loadWorlds();
  const p = P(), el = $("npcBox");
  el.innerHTML = `<h3>Mundos</h3><p class="muted">Cada mundo tem faixa de nível, criaturas, recursos e chefe próprios. Subir pede nível e o artefato do chefe do mundo anterior. Voltar pra mundos abaixo é livre. Acima do teto do mundo a exp cai 85%.</p>
    <div class="worlds">${W.list.map(w => { const here = w.id === (S.world?.id || 1), up = w.id > (S.world?.id || 1), okLvl = p.lvl >= w.req_level, ok = !up || (okLvl && w.has_item);
      return `<div class="world ${here ? "here" : ""} pal-${w.palette}"><div class="row"><b>Mundo ${w.id}: ${esc(w.name)}</b><small>${esc(w.subtitle)}</small></div><small class="muted">${esc(w.description)}</small>
        <div class="row"><span>Níveis</span><b>${w.level_min} a ${w.level_max ?? "∞"}</b></div>
        ${w.req_level ? `<div class="row"><span>Pede</span><b><span style="color:${okLvl ? "var(--green)" : "var(--red)"}">nível ${w.req_level}</span> + <span style="color:${w.has_item ? "var(--green)" : "var(--red)"}">${esc(w.req_item_name)}</span></b></div>` : ""}
        <div class="row"><span>Chefes</span><b>${w.bosses.map(b => esc(b.name)).join(", ") || "O Ancião da Floresta"}</b></div><div class="row"><span>Online aqui</span><b>${w.players}</b></div>
        ${here ? `<span class="tag good">você está aqui</span>` : `<button class="${ok ? "primary" : ""}" data-travel="${w.id}" ${ok ? "" : "disabled"}>Viajar</button>`}</div>`; }).join("")}</div>
    <div class="actions"><button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  el.querySelectorAll("[data-travel]").forEach(b => b.onclick = async () => { const r = await act(() => api.travel(+b.dataset.travel), "Viagem feita"); if (r) { $("npcModal").hidden = true; applyWorld(); const pp = P(); pp.task = "idle"; pp.huntId = null; toast(`Bem-vindo ao Mundo ${S.world?.id}: ${S.world?.name}`); } });
}
// chefes mundiais (Mundo 2+): lista, desafio de 40 s e resultado do servidor
export async function openWorldBosses() {
  let list; try { list = await api.worldBoss("lista"); } catch (e) { return toast(e.message, true); }
  const p = P(), el = $("npcBox");
  el.innerHTML = `<div class="npc-head"><div class="altar-ic"></div><div><h3>Altar dos Guardiões</h3><p>Chefes do Mundo ${S.world?.id}: ${esc(S.world?.name)}. O servidor decide a luta pelo seu poder.</p></div></div>
    ${list.map(b => `<div class="order"><div class="row"><b>${esc(b.name)}</b><small>nível ${b.req_level}+</small></div><small class="muted">${esc(b.description)}</small>
      <div class="row"><span>Seu poder</span><b style="color:${b.power >= b.power_ref ? "var(--green)" : "var(--red)"}">${fmt(b.power)} <small class="muted">(pede ~${fmt(b.power_ref)})</small></b></div>
      <div class="row"><span>Recompensa</span><b>${b.reward_name ? esc(b.reward_name) + " · " : ""}${fmt(b.reward.gold)} gold · ${b.reward.gems} gemas · ${b.reward.diamante || 0} diamante</b></div>
      <div class="row"><span>Primeiro a vencer</span><b>${b.first ? esc(b.first.character_name) : "ninguém ainda"}</b></div>
      ${b.active ? `<button class="primary" data-wbres="${b.id}">Ver resultado da luta</button>` : b.ready_in > 0 ? `<small class="muted">Descansando: volta em ${b.ready_in} h</small>` : `<button class="primary" data-wb="${b.id}" ${p.lvl < b.req_level ? "disabled" : ""}>Desafiar</button>`}</div>`).join("") || '<p class="muted">Nenhum chefe neste mundo.</p>'}
    <div class="actions"><button data-close-npc="1">Fechar</button></div>`;
  $("npcModal").hidden = false;
  el.querySelectorAll("[data-wb]").forEach(b => b.onclick = async () => { try { await api.worldBoss("desafiar", b.dataset.wb); fight(b.dataset.wb, Date.now()); } catch (e) { toast(e.message, true); } });
  el.querySelectorAll("[data-wbres]").forEach(b => b.onclick = () => fight(b.dataset.wbres, Date.now() - 41000));
}
function fight(id, started) {
  const el = $("npcBox");
  const tick = async () => {
    const t = (Date.now() - started) / 1000;
    if (t < 41) { el.innerHTML = `<h3>Luta em andamento</h3><p class="muted">O servidor exige 40 segundos de luta.</p><div class="bar"><i style="width:${Math.min(100, t / 41 * 100)}%"></i></div><p class="mono center">${Math.ceil(41 - t)} s</p>`; return setTimeout(tick, 500); }
    try { const r = await api.worldBoss("resolver", id); if (r.state) applyServer(r.state); renderAll();
      el.innerHTML = r.win ? `<h3>${r.first ? "PRIMEIRO DO SERVIDOR!" : "Vitória"}</h3><p>${esc(r.boss)} caiu.</p><div class="rep"><div><b>${r.reward_name ? esc(r.reward_name) : "—"}</b><small>artefato</small></div><div><b>+${fmt(r.reward.gold)}</b><small>gold</small></div><div><b>+${r.reward.gems}</b><small>gemas</small></div><div><b>+${fmt(r.exp)}</b><small>exp</small></div></div><div class="actions"><button data-close-npc="1" class="primary">Continuar</button></div>`
        : `<h3>Derrota</h3><p>Seu poder foi ${fmt(r.power)}; o chefe pedia ${fmt(r.need)}. Melhore atributos, forja e encantos e tente de novo.</p><div class="actions"><button data-close-npc="1">Fechar</button></div>`;
    } catch (e) { if (/não acabou/.test(e.message)) return setTimeout(tick, 1500); el.innerHTML = `<p>${esc(e.message)}</p><div class="actions"><button data-close-npc="1">Fechar</button></div>`; }
  };
  tick();
}
