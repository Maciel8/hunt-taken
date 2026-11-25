import { TICK, HUNTS, HOME, DEPOT } from "./data.js";
import { genMap, walk, huntAt, inRect } from "./world.js";
import { S, P, newPlayer, makeBots, spawnAll, playerTick, monTick, botTick, marketTick, pvpWeekTick, warTick, refreshMarket, offlineReport, save, load, log, emit, huntInfo, fmt, goHunt } from "./sim.js";
import { loadAssets, drawGround, drawOver } from "./art.js";
import { render, resize, tileAt, cv, cam, miniHit, viewSize } from "./render.js";
import { renderAll, renderFeed, bindUI, showCreate, showReport, toast, closeModal, showHuntPop, hideHuntPop } from "./ui.js";
import { CAPITAL } from "./data.js";

const $ = id => document.getElementById(id);
S.listeners.push((ev, d) => { if (ev === "toast") toast(d.msg, d.bad); if (ev === "feed") renderFeed(); if (ev === "ui") renderAll(); });

async function boot() {
  genMap(); await loadAssets(); drawGround(); drawOver(); resize(); window.addEventListener("resize", () => { resize(); });
  const away = load();
  if (!S.p) { showCreate((name, voc, king) => { S.p = newPlayer(name, voc, king); makeBots(); start(0); }); } else { if (!S.bots.length) makeBots(); start(away || 0); }
}
function start(away) {
  const p = P(); spawnAll(); refreshMarket();
  if (!p.huntId && !load_done_flag(p)) { p.huntId = "ratos"; p.task = "goto"; log("Primeira hunt: Campo dos Ratos. Abra o Mapa ou clique numa área pra trocar."); }
  bindUI();
  const rep = away > 0 ? offlineReport(away) : null;
  if (rep) { log(`Voltou depois de ${rep.hours < 1 ? Math.round(rep.hours * 60) + " min" : rep.hours.toFixed(1) + " h"}: +${fmt(rep.exp)} exp, +${fmt(rep.gold)} gold.`); showReport(rep); }
  else if (!away) log(`Bem-vindo a ${p.king === "grey" ? "Greyhold" : p.king === "ash" ? "Ashvale" : "Thornmere"}, ${p.name}. Seu ${p.voc} caça sozinho; você decide onde e com quem briga.`);
  $("repClose").addEventListener("click", () => $("report").hidden = true);
  // câmera: arrastar pra olhar o mapa; clique curto numa hunt abre a ficha; minimapa pula
  let drag = null;
  cv.addEventListener("pointerdown", ev => { drag = { x: ev.clientX, y: ev.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.setPointerCapture(ev.pointerId); });
  cv.addEventListener("pointermove", ev => { if (!drag) return; const r = cv.getBoundingClientRect(), k = cv.width / r.width; const dx = (ev.clientX - drag.x) * k, dy = (ev.clientY - drag.y) * k; if (Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; cam.follow = false; cam.x = drag.cx - dx; cam.y = drag.cy - dy; } });
  cv.addEventListener("pointerup", ev => {
    const d = drag; drag = null; if (!d || d.moved) return;
    const m = miniHit(ev); if (m) { const { VW, VH } = viewSize(); cam.follow = false; cam.x = m.x - VW / 2; cam.y = m.y - VH / 2; return; }
    const { x, y } = tileAt(ev); const h = huntAt(x, y);
    if (h) showHuntPop(h, ev.clientX, ev.clientY); else { hideHuntPop(); if (inRect(CAPITAL, x, y)) toast("Capital: depósito, loja, bênção. Ninguém te ataca aqui."); }
  });
  cv.addEventListener("pointercancel", () => drag = null);
  renderAll(); requestAnimationFrame(frame);
  window.addEventListener("beforeunload", save); document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
}
function load_done_flag(p) { return p.task === "idle" && p.exp > 0; }
let acc = 0, last = performance.now();
function frame(t) {
  const dt = Math.min(200, t - last); last = t; acc += dt * S.speed; let n = 0;
  while (acc >= TICK && n++ < 8) { acc -= TICK; S.t++; playerTick(); monTick(); botTick(); if (S.t % 10 === 0) { marketTick(); pvpWeekTick(); warTick(); } if (S.t % 5 === 0) renderAll(); if (S.t % 25 === 0) save(); const p = P(); if (p.idleAfter && p.task !== "deposit" && inRect(CAPITAL, p.x, p.y)) { p.task = "idle"; p.idleAfter = false; log("Parado na capital."); } }
  render(); requestAnimationFrame(frame);
}
boot();
