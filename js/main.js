import { TICK, HUNTS, HOME, DEPOT } from "./data.js";
import { genMap, walk, huntAt, inRect } from "./world.js";
import { S, P, newPlayer, makeBots, spawnAll, playerTick, monTick, botTick, marketTick, pvpWeekTick, warTick, refreshMarket, offlineReport, save, load, log, emit, huntInfo, fmt } from "./sim.js";
import { loadAssets, drawGround, drawOver } from "./art.js";
import { render, resize, tileAt, cv } from "./render.js";
import { renderAll, renderFeed, bindUI, showCreate, showReport, toast, closeModal } from "./ui.js";
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
  if (!p.route.length && p.task !== "idle") { p.route = [{ x: 17, y: 4 }, { x: 25, y: 4 }, { x: 25, y: 9 }, { x: 17, y: 9 }]; log("Rota inicial: Campo dos Ratos. Abra o Mapa pra escolher outra hunt ou desenhe a sua."); }
  bindUI(toggleRoute);
  const rep = away > 0 ? offlineReport(away) : null;
  if (rep) { log(`Voltou depois de ${rep.hours < 1 ? Math.round(rep.hours * 60) + " min" : rep.hours.toFixed(1) + " h"}: +${fmt(rep.exp)} exp, +${fmt(rep.gold)} gold.`); showReport(rep); }
  else if (!away) log(`Bem-vindo a ${p.king === "grey" ? "Greyhold" : p.king === "ash" ? "Ashvale" : "Thornmere"}, ${p.name}. Seu ${p.voc} caça sozinho; você decide onde e com quem briga.`);
  $("repClose").addEventListener("click", () => $("report").hidden = true);
  cv.addEventListener("pointerdown", ev => {
    const { x, y } = tileAt(ev);
    if (S.routeMode) { if (!walk(x, y)) return toast("Esse tile não dá pra andar", true); if (p.route.length >= 8) return toast("Máximo de 8 pontos", true); p.route.push({ x, y }); return; }
    const h = huntAt(x, y); if (h) { const i = huntInfo(h, p); toast(`${h.name}: ${i.m.name} lv ${i.m.lvl}, ${fmt(i.goldH)} gold/h cheia, ${i.occ} ocupante(s)`); } else if (inRect(CAPITAL, x, y)) toast("Capital: depósito, loja, bênção. Ninguém te ataca aqui.");
  });
  renderAll(); requestAnimationFrame(frame);
  window.addEventListener("beforeunload", save); document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
}
function toggleRoute() { const p = P(); S.routeMode = !S.routeMode; $("btnRoute").textContent = S.routeMode ? "Começar a caçar" : "Desenhar rota"; if (S.routeMode) { p.route = []; p.wp = 0; p.path = []; } else if (!p.route.length) toast("Rota vazia. Marque ao menos 1 ponto.", true); else { p.wp = 0; p.path = []; p.task = "route"; log(`Rota com ${p.route.length} pontos salva.`); } }
let acc = 0, last = performance.now();
function frame(t) {
  const dt = Math.min(200, t - last); last = t; acc += dt * S.speed; let n = 0;
  while (acc >= TICK && n++ < 8) { acc -= TICK; S.t++; playerTick(); monTick(); botTick(); if (S.t % 10 === 0) { marketTick(); pvpWeekTick(); warTick(); } if (S.t % 5 === 0) renderAll(); if (S.t % 25 === 0) save(); const p = P(); if (p.idleAfter && p.task === "route" && inRect(CAPITAL, p.x, p.y)) { p.task = "idle"; p.idleAfter = false; log("Parado na capital."); } }
  render(); requestAnimationFrame(frame);
}
boot();
