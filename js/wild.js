// Mapa aberto + chefes.
// Monstros do mapa aberto: entidades reais do servidor (world_spawns). O cliente só materializa os que estão perto
// do jogador (no máximo ~70 por vez), desenha os vivos e mostra o combate; quem decide vida, dano, drop, exp e
// respawn é o fight_spawn. Raros (4%) têm aura dourada e valem mais.
// Chefes: covis fixos no mapa (bosses); combate por rodadas resolvido no servidor (boss_fight) e reproduzido aqui
// com barra grande de vida, habilidades anunciadas e recompensas.
import { S, fx, applyServer, log, walkTo, dist } from "./sim.js";
import { MONS, T } from "./data.js";
import { CONT } from "./continent.js";
import { rpc, api } from "./net.js";
import { burst, ring, slash, later } from "./fx.js";
import { report } from "./cities.js";
import { travelButtons, bindTravelButtons } from "./travel.js";
import { CAT } from "./progress.js";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const B = 64, NEAR = 70, FAR = 110, MAX = 70;
const W = { grid: null, on: new Map(), dead: new Map(), lastState: 0, busy: false, pending: null };
function index() { if (W.grid || !CONT.net?.spawns) return; W.grid = new Map(); for (const s of CONT.net.spawns) { const k = (s.x >> 6) + "," + (s.y >> 6); (W.grid.get(k) || W.grid.set(k, []).get(k)).push(s); } }
const toast = async (m, bad) => (await import("./ui.js")).toast(m, bad);

// chamado junto com o spawnNear (a cada ~1 s): cria os de perto, tira os de longe
export function wildNear(px, py) {
  index(); if (!W.grid || !S.mk) return;
  for (const [id, m] of W.on) if (Math.hypot(m.sx - px, m.sy - py) > FAR) { W.on.delete(id); const i = S.mons.indexOf(m); if (i >= 0) S.mons.splice(i, 1); }
  const bx = px >> 6, by = py >> 6, cand = [];
  for (let gy = by - 2; gy <= by + 2; gy++) for (let gx = bx - 2; gx <= bx + 2; gx++) for (const s of W.grid.get(gx + "," + gy) || []) { const d = Math.hypot(s.x - px, s.y - py); if (d < NEAR && !W.on.has(s.id) && MONS[s.mon]) cand.push([d, s]); }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, s] of cand) { if (W.on.size >= MAX) break; const mt = MONS[s.mon], until = W.dead.get(s.id) || 0;
    const m = { wild: s.id, rare: !!s.rare, type: s.mon, x: s.x, y: s.y, sx: s.x, sy: s.y, hp: mt.hp, hpMax: Math.round(mt.hp * (s.rare ? 1.7 : 1)), alive: until <= Date.now(), respawnAt: until, cd: 0, face: 1, boss: false, path: [], speed: 1.2, anim: 0, moving: false, think: Math.random() * 5,
      home: { cx: s.x, cy: s.y, r: 4, name: "mapa aberto", id: "wild" } };
    W.on.set(s.id, m); S.mons.push(m); }
  if (Date.now() - W.lastState > 20000 && S.server) { W.lastState = Date.now(); rpc("spawns_state", { p_x: Math.round(px), p_y: Math.round(py) }).then(list => { for (const d of list || []) { const t = new Date(d.until).getTime(); W.dead.set(d.id, t); const m = W.on.get(d.id); if (m) { m.alive = false; m.respawnAt = t; } } }).catch(() => { }); }
}
export const wildAt = (x, y) => { for (const m of W.on.values()) if (m.alive && Math.abs(m.x - x) <= 1 && Math.abs(m.y - y) <= 1.4) return m; return null; };
// clicou num monstro do mapa aberto: anda até ele e luta
export function engageWild(m) {
  const p = S.p; if (W.busy) return;
  if (S.session?.status === "ativa" || p.task === "hunt") { toast("Você está numa caçada: saia dela pra lutar no mapa aberto.", true); return; }
  if (dist(p, m) <= 2.2) return fight(m);
  if (!walkTo(Math.round(m.x), Math.round(m.y))) { toast("Não dá pra chegar até essa criatura.", true); return; }
  W.pending = m; toast(`Indo enfrentar ${MONS[m.type].name}${m.rare ? " (raro)" : ""}`);
}
export function wildTick() { const m = W.pending, p = S.p; if (!m || !p) return; if (!m.alive) { W.pending = null; return; } if (dist(p, m) <= 2.2) { W.pending = null; p.path = []; fight(m); } else if (!p.path.length && p.task !== "walk") W.pending = null; }
async function fight(m) {
  const p = S.p, mt = MONS[m.type]; W.busy = true; m.path = []; m.think = 99;
  // anima a troca de golpes enquanto o servidor resolve
  let anim = true; const swing = () => { if (!anim) return; p.face = m.x >= p.x ? 1 : -1; m.face = -p.face; p.atkT = p.atkDur = .36; slash(m, p.face > 0 ? "right" : "left"); m.hitT = .15; burst(m, "#ffe6a8", 5);
    later(.25, () => { if (!anim) return; m.atkT = .3; m.atkDx = p.x - m.x; m.atkDy = p.y - m.y; p.hitT = .12; }); later(.6, swing); };
  swing();
  try {
    await report();
    const r = await rpc("fight_spawn", { p_spawn: m.wild }); anim = false;
    if (r.won) { m.hp = 0; m.alive = false; m.respawnAt = new Date(r.dead_until).getTime(); W.dead.set(m.wild, m.respawnAt); burst(m, m.rare ? "#ffd25a" : "#ffffff", 14, 3); ring(m, "#ffd25a");
      fx.push({ x: m.x, y: m.y - .6, v: `+${r.exp} exp`, t: 14, c: "#9fe8c9" }); if (r.gold) fx.push({ x: m.x + .5, y: m.y - 1.2, v: `+${r.gold} gold`, t: 14, c: "#ffd25a" });
      const drops = (r.drops || []).map(d => `${d.q ? d.q + "× " : ""}${(await_name(d.template))}`).join(", ");
      log(`Derrotou ${r.creature}${r.rare ? " (raro)" : ""}: +${r.exp} exp, +${r.gold} gold${drops ? " · " + drops : ""}.`, "good");
      if (r.level_up) toast(`Subiu pro nível ${r.level}!`);
    } else { burst(p, "#ff5a5a", 16, 3); log(`${r.creature} venceu. Você voltou pra cidade mais perto.`, "bad"); toast(`Derrota contra ${r.creature}. Volte mais forte.`, true); p.x = r.x; p.y = r.y; p.path = []; (await import("./ui.js")).teleportTo(r.x, r.y); }
    p.hp = r.hp; applyServer(await api.state()); (await import("./ui.js")).renderAll();
  } catch (e) { anim = false; toast(e.message, true); }
  finally { anim = false; W.busy = false; m.think = 2; }
}
const await_name = t => CAT.templates[t]?.name || MONS[t]?.name || t;

// ---------- chefes ----------
export const lairAt = (x, y) => (CONT.net?.bosses || []).find(b => Math.abs(b.x - x) <= 4 && Math.abs(b.y - 4 - y) <= 3);
let BV = null;
export async function openBoss(id) {
  const lair = (CONT.net?.bosses || []).find(b => b.id === id); if (!lair) return;
  try { BV = await rpc("bosses_view"); } catch (e) { BV = BV || []; }
  const b = BV.find(x => x.id === id) || { ...lair, level: lair.lvl, abilities: [], rewards: {} }, p = S.p, near = p && Math.hypot(p.x - b.x, p.y - b.y) <= 12;
  const next = b.next && new Date(b.next) > new Date() ? new Date(b.next) : null, lvl = S.cstats?.level || S.p?.lvl || 1;
  const KN = { golpe: "Golpe pesado", area: "Ataque em área (ignora defesa)", cura: "Se cura", escudo: "Escudo", invocar: "Invoca lacaios", furia: "Fúria" };
  const box = $("npcModal"), body = $("npcBox");
  body.innerHTML = `<button class="x" id="bossX" title="Fechar">×</button><div class="boss">
    <div class="boss-top"><img src="assets/sprites/${esc(lair.sprite || "boss_king")}.png" alt="" class="boss-img"><div><h3>${esc(b.name)}</h3><p class="muted">Chefe nível ${b.level} · requer nível ${b.min_level || 1} · volta a cada ${b.cooldown_h || 6} h</p>
      <div class="boss-stats"><span>❤ ${Number(b.hp || 0).toLocaleString("pt-BR")}</span><span>⚔ ${b.atk ?? "?"}</span><span>🛡 ${b.def ?? "?"}</span></div></div></div>
    <h4>Habilidades</h4><ul class="boss-abs">${(b.abilities || []).map(a => `<li><b>${esc(a.name)}</b> <small>${KN[a.kind] || a.kind}${a.every ? ` · a cada ${a.every} rodadas` : a.below ? ` · abaixo de ${Math.round(a.below * 100)}% da vida` : ""}</small></li>`).join("")}</ul>
    <h4>Recompensas</h4><p>${b.rewards?.gold ? `${Number(b.rewards.gold).toLocaleString("pt-BR")} gold · ` : ""}${b.rewards?.gems ? `${b.rewards.gems} 💎 · ` : ""}${b.rewards?.item ? "item garantido · " : ""}materiais raros</p>
    <div id="bossFight"></div>
    <div class="mv-actions">${next ? `<p class="muted">Você já venceu: volta às ${next.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>` : near ? `<button class="primary danger" id="bossGo" ${lvl < (b.min_level || 1) ? "disabled" : ""}>Enfrentar ${esc(b.name)}</button>` : travelButtons("boss", id, "Ir a pé até o covil (grátis)")}</div></div>`;
  box.hidden = false; bindTravelButtons(body); $("bossX").onclick = () => { box.hidden = true; };
  const go = $("bossGo"); if (go) go.onclick = () => bossFight(id, b, go);
}
async function bossFight(id, b, btn) {
  btn.disabled = true; const el = $("bossFight");
  try {
    await report();
    const r = await rpc("boss_fight", { p_boss: id });
    el.innerHTML = `<div class="boss-bar big"><i id="bhp" style="width:100%"></i><span id="bhpT"></span></div><div class="boss-bar me"><i id="php" style="width:100%"></i><span id="phpT"></span></div><div class="boss-log" id="blog"></div>`;
    const bh = r.boss.hp, ph = r.hp_max, logEl = $("blog");
    for (const [rd, php, bhp, ev] of r.log) {
      $("bhp").style.width = Math.max(0, bhp / bh * 100) + "%"; $("bhpT").textContent = `${r.boss.name} · ${Math.max(0, bhp).toLocaleString("pt-BR")} / ${bh.toLocaleString("pt-BR")}`;
      $("php").style.width = Math.max(0, php / ph * 100) + "%"; $("phpT").textContent = `Você · ${Math.max(0, php)} / ${ph}`;
      if (ev) { logEl.insertAdjacentHTML("afterbegin", `<div><small>R${rd}</small> ${esc(ev)}</div>`); }
      await new Promise(res => setTimeout(res, r.log.length > 60 ? 70 : 140));
    }
    if (r.won) { const rw = r.rewards || {}; logEl.insertAdjacentHTML("afterbegin", `<div class="win">Vitória! +${Number(rw.exp || 0).toLocaleString("pt-BR")} exp, +${Number(rw.gold || 0).toLocaleString("pt-BR")} gold${rw.gems ? `, +${rw.gems} 💎` : ""}${(rw.drops || []).length ? `, ${rw.drops.length} drops` : ""}</div>`); log(`Você derrotou ${r.boss.name}!`, "good"); }
    else { logEl.insertAdjacentHTML("afterbegin", `<div class="lose">Derrota. Você acordou na cidade mais perto. Tente de novo em alguns minutos.</div>`); log(`${r.boss.name} venceu.`, "bad"); const p = S.p; p.x = r.x; p.y = r.y; p.path = []; (await import("./ui.js")).teleportTo(r.x, r.y); }
    applyServer(await api.state()); (await import("./ui.js")).renderAll();
  } catch (e) { toast(e.message, true); btn.disabled = false; }
}
