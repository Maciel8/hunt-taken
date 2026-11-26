// Floresta dos Ancestrais: altar do Ancião (guardião mítico de Eldoria) e portal selado do Reino Espiritual.
// O servidor confere requisitos (nível 18 e 30 Ents), tempo mínimo de luta e resultado; aqui é a encenação.
import { MONS, HUNTS } from "./data.js";
import { S, P, log, applyServer, EXTRA_HUNTS } from "./sim.js";
import { api } from "./net.js";
import { toast } from "./ui.js";
import { burst, ring } from "./fx.js";

const $ = id => document.getElementById(id);
const M = { run: null, mon: null, started: 0 };
export const ALTAR = () => { const h = HUNTS.find(x => x.id === "ancestrais"); return { x: h.cx, y: h.cy - 2 }; };
export async function openAltar() {
  if ((S.world?.id || 1) > 1) return import("./worlds.js").then(m => m.openWorldBosses());
  let r; try { r = await api.mythic("requisitos"); } catch (e) { return toast(e.message, true); }
  const ok = r.level >= r.level_req && r.ents >= r.ents_req, el = $("npcBox");
  el.innerHTML = `<div class="npc-head"><div class="altar-ic"></div><div><h3>Altar do Ancião</h3><p>Guardião mítico de Eldoria. Atrás dele, o portal do Reino Espiritual continua selado.</p></div></div>
    <div class="row"><span>Nível</span><b style="color:${r.level >= r.level_req ? "var(--green)" : "var(--red)"}">${r.level} / ${r.level_req}</b></div>
    <div class="row"><span>Ents ancestrais derrotados</span><b style="color:${r.ents >= r.ents_req ? "var(--green)" : "var(--red)"}">${r.ents} / ${r.ents_req}</b></div>
    <div class="row"><span>Seu poder</span><b>${r.power} <small class="muted">(o Ancião pede uns ${r.power_ref})</small></b></div>
    <div class="row"><span>Primeiro a vencer</span><b>${r.first ? r.first.character_name + " · " + new Date(r.first.achieved_at).toLocaleDateString("pt-BR") : "ninguém ainda"}</b></div>
    <p class="muted">Vitória: Selo de Eldoria, 3.000 gold, 5 gemas e 40 mil de exp. O selo é a primeira peça pra abrir o portal (fase das dimensões). O Ancião descansa 12 h depois de cada derrota.</p>
    <div class="actions"><button class="primary" id="mythGo" ${ok ? "" : "disabled"}>Desafiar o Ancião</button><button data-close-npc="1">Agora não</button></div>`;
  $("npcModal").hidden = false;
  $("mythGo").onclick = () => { $("npcModal").hidden = true; challenge(); };
}
async function challenge() {
  let r; try { r = await api.mythic("desafiar"); } catch (e) { return toast(e.message, true); }
  M.run = r.run; M.started = Date.now();
  const a = ALTAR(), p = P(), h = { id: "mitico", cx: a.x, cy: a.y, r: 6, respawn: 1e12 };
  if (!EXTRA_HUNTS.find(x => x.id === "mitico")) EXTRA_HUNTS.push(h);
  const hit = Math.max(4, (p.atk || 30) * .9 - 10), hp = Math.round(hit * 40);
  M.mon = { hunt: "mitico", type: "anciao", x: a.x, y: a.y - 1, hp, hpMax: hp, alive: true, respawnAt: 1e15, cd: 0, face: -1, boss: true, path: [], speed: .8, anim: 0, moving: false, think: 1, home: h, dungeon: true };
  S.mons.push(M.mon); p.huntId = "mitico"; p.task = "hunt"; p.inDungeon = true;
  toast("O Ancião desperta!"); log("Você desafiou o Ancião da Floresta.", "bad");
}
// a cada tick: quando o Ancião cai (ou passa o tempo mínimo), o servidor decide
export async function mythicTick() {
  if (!M.run || M.busy) return;
  const dead = !M.mon.alive, elapsed = (Date.now() - M.started) / 1000;
  if (!dead && elapsed < 60) return;
  if (elapsed < 41) return;                       // servidor exige 40 s de luta
  M.busy = true;
  try {
    const r = await api.mythic("resolver"); if (r.state) applyServer(r.state);
    const p = P(); p.inDungeon = false; p.task = "idle"; p.huntId = null; S.mons = S.mons.filter(m => m !== M.mon);
    $("repSub").textContent = r.win ? (r.first ? "Você é o PRIMEIRO a derrotar o Ancião da Floresta!" : "O Ancião se curva. O selo é seu.") : `O Ancião resistiu. Seu poder foi ${r.power}, ele pedia ${r.need}.`;
    $("repGrid").innerHTML = r.win ? [["Selo de Eldoria", "+1"], ["Gold", "+3.000"], ["Gemas", "+5"], ["Exp", "+40.000"]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("") : "";
    $("repNotes").textContent = r.win ? "O selo foi pra sua mochila de materiais." : "Melhore atributos e equipamento e tente de novo.";
    $("report").hidden = false; if (r.win) { burst(p, "#ffbf3a", 30, 4); ring(p, "#ffbf3a"); }
    M.run = null; M.mon = null;
  } catch (e) { if (!/não acabou/.test(e.message)) { toast(e.message, true); M.run = null; } }
  finally { M.busy = false; }
}
