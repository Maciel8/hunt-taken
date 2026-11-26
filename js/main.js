// Boot em modo servidor: Supabase Auth → personagem → estado do servidor → animação local só visual.
import { TICK, HUNTS, HOME } from "./data.js";
import { buildWorld, huntAt, inVila, NPCS } from "./world.js";
import { S, P, newPlayer, spawnAll, playerTick, monTick, applyServer, log, fmt, walkTo, updateMovement, npcTick, keys } from "./sim.js";
import { loadAssets, A } from "./art.js";
import { loadContinent, registerContent } from "./continent.js";
import { startPositionReports, playerAt, clickPlayer, loadCities } from "./cities.js";
import { render, resize, tileAt, cv, cam, miniHit, miniWheel, viewSize, zoomBy, screenAt, hover } from "./render.js";
import { renderAll, renderFeed, bindUI, showCreate, showReports, toast, showHuntPop, hideHuntPop, act, openModal } from "./ui.js";
import { showAuth, showNewPassword } from "./authui.js";
import { api, auth } from "./net.js";
import { bindChat, bindNpc, npcDialog, loadQuests, bindQuestbar } from "./social.js";
import { useDoor, leaveRoom, dungeonTick } from "./dungeon.js";
import { startPresence, updateOthers } from "./presence.js";
import { loadCatalog } from "./progress.js";
import { checkNotices } from "./notify.js";
import { setPingHandler } from "./presence.js";
import { openAltar, mythicTick, ALTAR } from "./mythic.js";
import { loadNodes, nodeAt, startGather, gatherTick, startNodePolling, stop as stopGather, gatherNearest } from "./gather.js";
import { objects, DOORS, interiorAt } from "./world.js";
import { ITEMS, RARITY } from "./data.js";
import { burst, ring } from "./fx.js";

const $ = id => document.getElementById(id);
S.listeners.push((ev, d) => { if (ev === "door") useDoor(d); if (ev === "toast") toast(d.msg, d.bad); if (ev === "feed") renderFeed(); if (ev === "ui") renderAll(); if (ev === "arrive") act(() => api.startHunt(d), `Caçando em ${HUNTS.find(h => h.id === d)?.name}`); if (ev === "leave") act(() => api.returnHome()); });
const loading = (on, msg) => { $("loading").hidden = !on; if (msg) $("loadingMsg").textContent = msg; };

async function boot() {
  loading(true, "carregando o mundo…");
  await loadAssets(); let ver = "dev"; try { ver = (await (await fetch("version.json", { cache: "no-store" })).json()).v || "dev"; } catch (e) { } await loadContinent(A.tex, ver); buildWorld(); registerContent(); resize(); window.addEventListener("resize", resize); try { new ResizeObserver(() => resize()).observe(cv.parentElement); } catch (e) { }
  // link de recuperação de senha
  if (location.search.includes("reset=1") || location.hash.includes("type=recovery")) { loading(false); return showNewPassword(() => boot()); }
  const s = await auth.session();
  loading(false);
  if (!s) return showAuth(() => boot());
  loading(true, "buscando seu personagem…");
  let st; try { st = await api.state(); } catch (e) { loading(false); toast(e.message, true); return showAuth(() => boot()); }
  loading(false);
  if (!st.character) return showCreate(st2 => enter(st2));
  enter(st);
}
let started = false;
function enter(st) {
  const c = st.character;
  if (!S.p) S.p = newPlayer(c.name, c.vocation, c.kingdom);
  applyServer(st); spawnAll();
  startPresence(c.id);
  checkNotices();
  { const n = (S.trades || []).filter(t => !t.mine).length, k = (S.clanInvites || []).length; if (n) log(`Você tem ${n} proposta(s) de troca esperando. Veja em Trocas.`, "good"); if (k) log(`Você tem ${k} convite(s) de clã. Veja na aba Clã.`, "good"); }
  setPingHandler(async () => { try { applyServer(await api.state()); checkNotices(); renderAll(); } catch (e) { } });
  if (!started) { document.getElementById("gatherBar").addEventListener("click", e => { const b = e.target.closest("[data-gprof]"); if (b) { hideHuntPop(); gatherNearest(b.dataset.gprof); } }); }
  if (!started) { started = true; loadCatalog().then(() => renderAll()); loadNodes(); startNodePolling(); startPositionReports(); loadCities(); bindUI(); bindCanvas(); bindChat(); bindNpc(); bindQuestbar(() => renderAll()); loadQuests().then(() => renderAll()); renderAll(); requestAnimationFrame(frame); loop(); }
  const rep = (st.reports || []).filter(r => !r.seen);
  if (rep.length) { showReports(rep); api.reportsSeen().catch(() => {}); log(`Voltou: +${fmt(rep.reduce((a, r) => a + Number(r.exp), 0))} exp, +${fmt(rep.reduce((a, r) => a + Number(r.gold_in), 0))} gold enquanto estava fora.`); }
  else if (c.task === "idle") log(`Bem-vindo, ${c.name}. Abra o Mapa ou clique numa área pra escolher onde caçar.`);
  $("repClose").onclick = () => $("report").hidden = true;
}
// a cada 20 s: simula no servidor e recarrega o estado (o servidor é a autoridade)
async function loop() {
  try { const r = await api.simulate(); if (r && r.ended) toast("Caça encerrada pelo seu comportamento. Veja o relatório.", true); if (r && r.events?.length) r.events.forEach(e => log(e, "info")); const st = await api.state(); applyServer(st); checkNotices(); if (r && r.drops && r.drops.length) showDrops(r.drops); if (r && (r.deaths > 0)) log(`Você morreu ${r.deaths}× na última etapa.`, "bad"); }
  catch (e) { if (/Sessão expirou/.test(e.message)) { toast(e.message, true); return showAuth(() => boot()); } }
  setTimeout(loop, document.hidden ? 60000 : 20000);
}
function showDrops(drops) {
  for (const d of drops) { const it = S.inventory.find(i => i.id === d.id), rar = RARITY[it?.rarity || 0], name = (ITEMS[d.template]?.name || d.template) + (it?.rarity ? ` (${rar.name})` : "");
    log(`Drop: <b style="color:${rar.color}">${name}</b>`, "good"); toast(`Drop: ${name}`); burst(P(), rar.color, 16, 3); ring(P(), rar.color); }
}
document.addEventListener("visibilitychange", async () => { if (!document.hidden && S.p) { try { await api.simulate(); applyServer(await api.state()); } catch (e) { } } });
const KEYMAP = { w: "w", a: "a", s: "s", d: "d", arrowup: "w", arrowleft: "a", arrowdown: "s", arrowright: "d" };
function bindKeys() {
  const typing = () => { const el = document.activeElement; return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
  window.addEventListener("keydown", e => { const k = KEYMAP[e.key.toLowerCase()]; if (!k || typing() || !document.querySelector("#modal[hidden]")) return; keys.add(k); cam.follow = true; e.preventDefault(); });
  window.addEventListener("keyup", e => { const k = KEYMAP[e.key.toLowerCase()]; if (k) keys.delete(k); });
  window.addEventListener("blur", () => keys.clear());
}
function bindCanvas() {
  bindKeys();
  // arrastar com um dedo/mouse move a câmera; dois dedos dão zoom em pinça; roda do mouse dá zoom no cursor
  const pts = new Map(); let drag = null, pinch = null;
  cv.addEventListener("pointerdown", ev => { cv.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, screenAt(ev)); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; } else drag = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y, moved: false }; });
  cv.addEventListener("pointermove", ev => {
    if (!pts.has(ev.pointerId)) { const { x, y } = tileAt(ev), nd = nodeAt(x, y); if (nd !== hover.node) { hover.node = nd; cv.style.cursor = nd ? "pointer" : ""; } return; } pts.set(ev.pointerId, screenAt(ev));
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (d > 10) { zoomBy(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch.d = d; } return; }
    if (!drag) return; const r = cv.getBoundingClientRect(), k = cv.width / r.width / cam.zoom; const dx = (ev.clientX - drag.x) * k, dy = (ev.clientY - drag.y) * k;
    if (Math.abs(dx) + Math.abs(dy) > 6 / cam.zoom) { drag.moved = true; cam.follow = false; cam.x = drag.cx - dx; cam.y = drag.cy - dy; }
  });
  const up = ev => {
    pts.delete(ev.pointerId); if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
    const d = drag; drag = null; if (!d || d.moved || ev.type === "pointercancel") return;
    const m = miniHit(ev); if (m) { const { VW, VH } = viewSize(); cam.follow = false; cam.x = m.x - VW / 2; cam.y = m.y - VH / 2; return; }
    const { x, y } = tileAt(ev);
    // portas: clicou numa construção com entrada, anda até a porta e entra
    const door = objects.find(o => o.door && x >= o.x - Math.floor(((o.fw || 1) - 1) / 2) - 1 && x <= o.x - Math.floor(((o.fw || 1) - 1) / 2) + (o.fw || 1) && y >= o.y - (o.fh || 1) - 2 && y <= o.y + 1);
    if (door) { const d = DOORS.find(q => q.room === door.door); if (d) { hideHuntPop(); const p = P(); if (Math.hypot(p.x - d.outside.x, p.y - d.outside.y) < 2.5) useDoor(door.door); else if (walkTo(d.outside.x, d.outside.y)) { p.pendingDoor = door.door; toast("Indo até a entrada"); } return; } }
    const al = ALTAR(); if (Math.abs(al.x - x) <= 2 && Math.abs(al.y - y) <= 2) { hideHuntPop(); openAltar(); return; }
    const nd = nodeAt(x, y); if (nd) { hideHuntPop(); startGather(nd); return; }
    if (P().task === "gather") stopGather();
    const ex = objects.find(o => o.kind === "exit" && Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
    if (ex) { leaveRoom(ex.room); return; }
    const npc = NPCS.find(n => Math.abs(n.x - x) <= 1 && Math.abs(n.y - y) <= 1);
    if (npc) { hideHuntPop(); npcDialog(npc); return; }
    const pl = playerAt(x, y); if (pl) { hideHuntPop(); clickPlayer(pl); return; }
    const h = huntAt(x, y);
    if (h && P().huntId !== h.id && P().task !== "walk") { showHuntPop(h, ev.clientX, ev.clientY); return; }
    hideHuntPop();
    if (walkTo(x, y)) { if (inVila(x, y)) toast("Indo pra Vila de Arken. Zona segura."); } else toast("Não dá pra andar até aí.", true);
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", ev => { ev.preventDefault(); if (miniWheel(ev)) return; const s = screenAt(ev); zoomBy(Math.exp(-ev.deltaY * .0015), s.x, s.y); }, { passive: false });
  document.getElementById("btnZoomIn").addEventListener("click", () => zoomBy(1.25));
  document.getElementById("btnZoomOut").addEventListener("click", () => zoomBy(.8));
}
let acc = 0, last = performance.now();
function frame(t) {
  const dt = Math.min(100, t - last); last = t; acc += dt; let n = 0;
  updateMovement(dt / 1000); updateOthers(dt / 1000);
  while (acc >= TICK && n++ < 8) { acc -= TICK; S.t++; playerTick(); monTick(); npcTick(); dungeonTick(); gatherTick(); mythicTick(); if (S.t % 5 === 0) renderAll(); }
  render(dt / 1000); requestAnimationFrame(frame);
}
// versão nova publicada: recarrega sozinho (quem fica com a versão antiga não aparece pros outros)
let VERSION = null;
async function checkVersion() {
  try { const v = (await (await fetch("version.json", { cache: "no-store" })).json()).v; if (VERSION === null) VERSION = v; else if (v !== VERSION) { toast("Versão nova do jogo. Recarregando…"); setTimeout(() => location.reload(), 1500); } } catch (e) { }
}
checkVersion(); setInterval(checkVersion, 60000);
if (location.hostname === "127.0.0.1") window.HT = { S, cam };
boot();
