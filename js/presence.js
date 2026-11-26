// Jogadores reais no mapa: cada navegador publica a posição real do próprio personagem no canal em tempo real do Supabase
// e desenha os outros exatamente onde eles estão, com o movimento suavizado. Ninguém é inventado: quem fecha o jogo some.
import { sb } from "./net.js";
import { S, P } from "./sim.js";

let onPing = null;
export const setPingHandler = f => { onPing = f; };
export function pingPlayer(name) { try { ch?.send({ type: "broadcast", event: "ping", payload: { to: name } }); } catch (e) { } }
let ch = null, last = { x: 0, y: 0, dir: "", atk: 0, t: 0 }, myId = null;
const others = new Map();            // id -> entidade desenhável
S.others = [];

function upsert(d) {
  if (!d || d.id === myId) return;
  if ((d.world || 1) !== (S.world?.id || 1)) { others.delete(d.id); S.others = [...others.values()]; return; }   // outro mundo: não aparece aqui
  let o = others.get(d.id);
  if (!o) { o = { id: d.id, x: d.x, y: d.y, tx: d.x, ty: d.y, path: [], anim: 0, moving: false, dir: d.dir || "down", hitT: 0, atkT: 0 }; others.set(d.id, o); }
  Object.assign(o, { name: d.name, king: d.king, voc: d.voc, lvl: d.lvl, seed: d.seed || 0, tx: d.x, ty: d.y, dir: d.dir || o.dir, seen: performance.now() });
  if (Math.hypot(o.tx - o.x, o.ty - o.y) > 10) { o.x = o.tx; o.y = o.ty; }       // teleporte ou entrada em sala
  if (d.atk && d.atk !== o.lastAtk) { o.lastAtk = d.atk; o.atkT = o.atkDur = .36; }
  S.others = [...others.values()];
}
function payload() { const p = P(); return { id: myId, name: p.name, king: p.king, voc: p.voc, lvl: p.lvl, seed: p.seed || 0, x: +p.x.toFixed(2), y: +p.y.toFixed(2), dir: p.dir, atk: p.atkSeq || 0, world: S.world?.id || 1 }; }

export function startPresence(charId) {
  if (ch) return; myId = charId;
  ch = sb.channel("mundo", { config: { presence: { key: charId }, broadcast: { self: false } } });
  ch.on("broadcast", { event: "pos" }, ({ payload }) => upsert(payload));
  // aviso leve: outro jogador mandou troca ou convite pra este personagem; busca o estado no servidor na hora
  ch.on("broadcast", { event: "ping" }, ({ payload }) => { if (payload?.to && P() && payload.to.toLowerCase() === P().name.toLowerCase() && onPing) onPing(); });
  ch.on("presence", { event: "sync" }, () => {
    const st = ch.presenceState(), ids = new Set(Object.keys(st));
    for (const [id, list] of Object.entries(st)) if (id !== myId) upsert(list[0]);
    for (const id of [...others.keys()]) if (!ids.has(id)) others.delete(id);
    S.others = [...others.values()]; S.onlineNow = ids.size;
  });
  ch.on("presence", { event: "leave" }, ({ key }) => { others.delete(key); S.others = [...others.values()]; });
  ch.subscribe(async status => { if (status === "SUBSCRIBED") { await ch.track(payload()); send(true); } });
  setInterval(() => send(false), 250);
  setInterval(() => { if (ch) ch.track(payload()); }, 15000);      // presença renovada (quem entra depois vê a posição)
  window.addEventListener("beforeunload", () => { try { ch.untrack(); } catch (e) { } });
}
function send(force) {
  if (!ch || !P()) return; const p = P(), now = performance.now();
  const moved = Math.abs(p.x - last.x) > .05 || Math.abs(p.y - last.y) > .05 || p.dir !== last.dir || (p.atkSeq || 0) !== last.atk;
  if (!force && !moved && now - last.t < 2000) return;
  last = { x: p.x, y: p.y, dir: p.dir, atk: p.atkSeq || 0, t: now };
  ch.send({ type: "broadcast", event: "pos", payload: payload() });
}
// movimento suave até a última posição recebida; some quem ficou 20 s sem sinal
export function updateOthers(dt) {
  const now = performance.now();
  for (const o of others.values()) {
    if (now - (o.seen || now) > 20000) { others.delete(o.id); continue; }
    const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
    if (d > .02) { const step = Math.min(d, Math.max(3.6, d * 5) * dt); o.x += dx / d * step; o.y += dy / d * step; o.anim += step; o.moving = true; }
    else o.moving = false;
    if (o.atkT > 0) o.atkT -= dt; if (o.hitT > 0) o.hitT -= dt;
  }
  S.others = [...others.values()];
}
