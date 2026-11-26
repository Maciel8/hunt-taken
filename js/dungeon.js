// Portas, interiores e a Caverna do Dragão. O servidor decide cada etapa; aqui ficam a encenação e o combate visual.
import { MONS } from "./data.js";
import { ROOMS, DG_ROOMS, DOORS, openGate, closeGates, walk } from "./world.js";
import { S, P, log, applyServer, EXTRA_HUNTS, dist } from "./sim.js";
import { api } from "./net.js";
import { toast, act } from "./ui.js";
import { projectile, burst, ring, later } from "./fx.js";
import { cam } from "./render.js";

const $ = id => document.getElementById(id);
function place(x, y) { const p = P(); ring(p, "#a98bd6"); p.x = x; p.y = y; p.path = []; p.target = null; ring(p, "#a98bd6"); burst(p, "#c9a8ff", 12, 3); cam.follow = true; cam.init = false; }

// ---------- portas comuns ----------
export async function useDoor(room) {
  const d = DOORS.find(x => x.room === room); if (!d) return;
  if (room === "dragao") return enterDungeon();
  const p = P(); if (p.task === "hunt" || p.task === "goto") await act(() => api.returnHome());
  p.task = "idle"; p.huntId = null; place(d.inside.x, d.inside.y - 1); log(`Você entrou em ${ROOMS[room].name}.`);
}
export async function leaveRoom(room) {
  const d = DOORS.find(x => x.room === room); if (!d) return;
  if (room === "dragao") return leaveDungeon("Você saiu da caverna.");
  place(d.outside.x, d.outside.y + 1); P().task = "idle";
}

// ---------- masmorra ----------
const dg = { run: null, busy: false, fire: 0 };
const roomH = (k) => { const r = ROOMS.dragao, d = DG_ROOMS[k]; return { id: d.id, cx: r.x + Math.round((d.x0 + d.x1) / 2), cy: r.y + Math.floor(r.h / 2), r: 12, respawn: 1e12, name: d.name }; };
function spawnRoom(k) {
  const h = roomH(k), r = ROOMS.dragao; if (!EXTRA_HUNTS.find(x => x.id === h.id)) EXTRA_HUNTS.push(h);
  for (const [type, n] of DG_ROOMS[k].mons) for (let i = 0; i < n; i++) {
    let x, y, tries = 0; do { x = r.x + DG_ROOMS[k].x0 + 4 + Math.floor(Math.random() * (DG_ROOMS[k].x1 - DG_ROOMS[k].x0 - 6)); y = r.y + 3 + Math.floor(Math.random() * (r.h - 6)); } while (!walk(x, y) && tries++ < 80);
    const mt = MONS[type], boss = !!mt.boss;
    // vida visual proporcional ao seu dano: a luta dura alguns segundos por criatura e bem mais no dragão
    const hit = Math.max(4, (P().atk || 30) * .9 - mt.def * .5), hp = Math.round(hit * (boss ? 45 : type.includes("elite") || type.includes("guardiao") ? 12 : 5));
    S.mons.push({ hunt: h.id, type, x, y, hp, hpMax: hp, alive: true, respawnAt: 1e15, cd: 0, face: 1, boss, path: [], speed: mt.speed === 2 ? 2.2 : 1.2, anim: 0, moving: false, think: 1, home: h, dungeon: true });
  }
  const p = P(); p.task = "hunt"; p.huntId = h.id; p.inDungeon = true;
  toast(`${DG_ROOMS[k].name}`); log(`Caverna do Dragão: ${DG_ROOMS[k].name}.`);
}
export async function enterDungeon() {
  const p = P();
  if (p.lvl < 60) return toast("A Caverna do Dragão pede level 60.", true);
  if (p.task === "hunt" || p.task === "goto") await act(() => api.returnHome());
  let r; try { r = await api.dungeon("entrar"); } catch (e) { return toast(e.message, true); }
  if (r.state) applyServer(r.state);
  dg.run = r.run; closeGates(); for (let s = 1; s < dg.run.stage; s++) openGate(s);
  S.mons = S.mons.filter(m => !m.dungeon);
  const k = dg.run.stage - 1, room = ROOMS.dragao, d = DG_ROOMS[k];
  place(room.x + d.x0 + 2, room.y + Math.floor(room.h / 2));
  spawnRoom(k);
}
async function leaveDungeon(msg, abandon = true) {
  const p = P(); if (abandon && dg.run) { try { await api.dungeon("sair"); } catch (e) { } }
  dg.run = null; p.inDungeon = false; p.task = "idle"; p.huntId = null; S.mons = S.mons.filter(m => !m.dungeon);
  const d = DOORS.find(x => x.room === "dragao"); place(d.outside.x, d.outside.y + 1); if (msg) toast(msg);
}
// chamado a cada tick: sala limpa pede a próxima etapa ao servidor; dragão cospe fogo
export function dungeonTick() {
  const p = P(); if (!dg.run || !p.inDungeon) return;
  const room = p.huntId, alive = S.mons.filter(m => m.dungeon && m.hunt === room && m.alive);
  const dragon = alive.find(m => m.type === "dragao");
  if (dragon && --dg.fire <= 0) { dg.fire = 7; const from = { x: dragon.x, y: dragon.y - .6 }; projectile("fire", from, p, () => { burst(p, "#ff7a1a", 14, 3); ring(p, "#ff7a1a"); p.hitT = .2; }); }
  if (alive.length || dg.busy) return;
  dg.busy = true; advance();
}
async function advance() {
  let r;
  try { r = await api.dungeon("avancar"); }
  catch (e) { dg.busy = false; if (/não acabou/.test(e.message)) { toast("Recuperando o fôlego antes da próxima sala…"); setTimeout(() => { if (dg.run) dungeonTick(); }, 3000); return; } toast(e.message, true); return leaveDungeon(null, false); }
  if (r.state) applyServer(r.state);
  if (!r.win) { dg.busy = false; showResult(false, r); return leaveDungeon("Derrota na Caverna do Dragão.", false); }
  if (r.boss) { dg.busy = false; showResult(true, r); later(3, () => leaveDungeon(null, false)); return; }
  openGate(r.stage); dg.run.stage = r.next; if (r.stage === 2) toast("Você pegou a Chave de obsidiana"); log(`Etapa ${r.stage} vencida. +${r.gold} gold. O portão abriu.`, "good");
  spawnRoom(r.next - 1); dg.busy = false;
}
function showResult(win, r) {
  $("repSub").textContent = win ? "Ignaroth caiu. A montanha está em silêncio." : `O poder da etapa ${r.stage} foi maior que o seu.`;
  $("repGrid").innerHTML = win ? [["Gold", "+" + r.gold], ["Gemas", "+" + r.gems], ["Exp", "+" + r.exp.toLocaleString("pt-BR")], ["Drops", r.drops.length]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("") : [["Seu poder", r.power], ["Necessário", r.need]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("");
  $("repNotes").textContent = win ? "Os itens foram pra sua mochila. O dragão volta em 20 horas." : "Você perdeu 10% da barra de exp. Melhore o equipamento e tente de novo.";
  $("report").hidden = false;
}
