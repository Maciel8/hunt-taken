// Coleta no mapa: depósitos vêm do servidor (posição, estado), o jogador anda até o depósito e coleta em ciclo até esgotar ou parar.
// Tempo, rendimento, achados raros e experiência são todos decididos pelo servidor (gather_start / gather_finish).
import { RARITY } from "./data.js";
import { S, P, log, applyServer, walkTo } from "./sim.js";
import { putObj, objects, walk } from "./world.js";
import { api } from "./net.js";
import { toast } from "./ui.js";
import { burst, ring, later } from "./fx.js";
import { resetBucket } from "./render.js";
import { CAT } from "./progress.js";

export const NODES = new Map();
const LOOK = { rocha: ["boulder", null], veio_cobre: ["boulder", "copper"], veio_ferro: ["boulder", "iron"], veio_prata: ["boulder", "silver"], veio_mitril: ["boulder", "mithril"], veio_profundo: ["boulder", "deep"], arvore: ["oak", null], carvalho_antigo: ["oak", "ancient"], erva: ["berry_bush", null], pesca: [null, null] };
export async function loadNodes() {
  let list; try { list = await api.nodes(); } catch (e) { return; }
  for (const n of list) {
    let o = NODES.get(n.id);
    if (!o) {
      // se a posição caiu em água ou obstáculo, encosta no tile livre mais próximo (o servidor só usa o id)
      let x = n.x, y = n.y; if (n.kind !== "pesca" && !walk(x, y)) { outer: for (let r = 1; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(x + dx, y + dy)) { x += dx; y += dy; break outer; } }
      o = { x, y, kind: "node", node: n, sprite: LOOK[n.kind]?.[0], tint: LOOK[n.kind]?.[1], solid: n.kind !== "pesca" && n.kind !== "erva" };
      NODES.set(n.id, o); putObj(o);
    }
    o.node = n;
  }
  resetBucket();
}
// --- leitura amigável: o que é, se dá pra coletar agora e por quê não ---
export const PROF_VERB = { mineracao: "Minerar", lenharia: "Cortar", agricultura: "Colher", pesca: "Pescar" };
export const TOOL_ICON = { picareta: "pickaxe", machado: "axe", foice: "sickle", vara: "rod" };
const TOOL_NAME = { picareta: "picareta", machado: "machado", foice: "foice", vara: "vara de pesca" };
export function bestTool(kind) {
  let best = null; for (const i of S.inventory) { if (!["bag", "equip", "protected"].includes(i.container)) continue; const pr = CAT.templates[i.template]?.props || {}; if ((pr.tool || i.roll?.tool) !== kind) continue;
    const t = { tier: +(i.roll?.tier ?? pr.tier ?? 1), dur: +(i.roll?.dur ?? pr.dur ?? 100) }; if (!best || t.tier > best.tier) best = t; } return best; }
export function nodeStatus(o) {
  const n = o.node, lvl = (S.profs || []).find(p => p.id === n.prof)?.level || 1, tool = bestTool(n.tool);
  const empty = n.remaining <= 0 && n.refill_at && new Date(n.refill_at) > new Date();
  if (empty) return { ok: false, state: "empty", why: `esgotado, volta em ${Math.ceil((new Date(n.refill_at) - Date.now()) / 1000)} s` };
  if (n.owner === "forte" && !(S.fortOwner && S.clan && S.fortOwner.tag === S.clan.tag)) return { ok: false, state: "locked", why: "só o clã que domina o Forte" };
  if (lvl < n.req) return { ok: false, state: "locked", why: `precisa de ${PROFN[n.prof] || n.prof} nível ${n.req} (você tem ${lvl})` };
  if (!tool) return { ok: false, state: "locked", why: `precisa de ${TOOL_NAME[n.tool] || n.tool}` };
  if (tool.tier < n.tool_tier) return { ok: false, state: "locked", why: `ferramenta fraca: precisa de nível ${n.tool_tier}` };
  if (tool.dur <= 0) return { ok: false, state: "locked", why: "ferramenta quebrada: conserte na Mochila" };
  if (S.carry && S.carry.used >= S.carry.cap) return { ok: false, state: "locked", why: "carga cheia: venda ou guarde materiais" };
  return { ok: true, state: "ok", why: "clique pra " + (PROF_VERB[n.prof] || "coletar").toLowerCase() };
}
const PROFN = { mineracao: "Mineração", lenharia: "Lenharia", agricultura: "Agricultura", pesca: "Pesca" };
// o depósito utilizável mais perto (por profissão, ou do mesmo tipo do atual)
export function nearestNode(filter) { const p = P(); let best = null, bd = 1e9; for (const o of NODES.values()) { if (!filter(o.node) || !nodeStatus(o).ok) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } } return best; }
export function gatherNearest(prof) {
  const o = nearestNode(n => n.prof === prof);
  if (!o) { const any = [...NODES.values()].filter(x => x.node.prof === prof).map(x => nodeStatus(x).why); return toast(any.length ? `Nenhum depósito disponível agora: ${any.find(w => !w.startsWith("esgotado")) || "todos esgotados"}` : "Nenhum depósito encontrado.", true); }
  startGather(o);
}
export const nodeAt = (x, y) => { for (const o of NODES.values()) if (Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1) return o; return null; };

const G = { node: null, job: null, until: 0, busy: false };
export function startGather(o) {
  const p = P(); const n = o.node; const st = nodeStatus(o);
  if (!st.ok && st.state !== "empty") return toast(`${n.name}: ${st.why}`, true);
  if (n.remaining <= 0 && n.refill_at && new Date(n.refill_at) > new Date()) return toast(`${n.name} esgotado. Volta em ${Math.ceil((new Date(n.refill_at) - Date.now()) / 1000)} s.`, true);
  G.node = o; G.job = null;
  const d = Math.hypot(p.x - o.x, p.y - o.y);
  const reach = n.kind === "pesca" ? 4.5 : 1.6;
  if (d > reach) {
    // lugares em volta do depósito, do mais perto pro mais longe; o primeiro com caminho ganha
    const spots = []; for (let r = 1; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = o.x + dx, y = o.y + dy; if (walk(x, y)) spots.push([x, y, Math.hypot(dx, dy) + Math.hypot(x - p.x, y - p.y) * .02]); }
    spots.sort((a, b) => a[2] - b[2]);
    if (!spots.slice(0, 14).some(([x, y]) => walkTo(x, y))) return toast("Não dá pra chegar até esse depósito.", true);
    p.pendingGather = o; toast(`Indo até ${n.name}`); return; }
  begin();
}
async function begin() {
  const o = G.node; if (!o || G.busy) return; G.busy = true; const p = P();
  try {
    const r = await api.gatherStart(o.node.id); G.job = r.job; G.until = Date.now() + r.seconds * 1000; p.gathering = { node: o, until: G.until, total: r.seconds * 1000 }; p.task = "gather";
    const dx = o.x - p.x, dy = o.y - p.y; p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  } catch (e) {
    // esgotou no servidor: segue pro próximo do mesmo tipo em vez de parar
    if (/esgotado/.test(e.message)) { o.node.remaining = 0; o.node.refill_at = new Date(Date.now() + 300000).toISOString(); const nx = nearestNode(n => n.kind === o.node.kind && n.id !== o.node.id); if (nx) { G.busy = false; toast(`${o.node.name} esgotado. Indo pro próximo.`); return startGather(nx); } }
    toast(e.message, true); stop(); } finally { G.busy = false; }
}
async function finish() {
  if (!G.job || G.busy) return; G.busy = true; const p = P(), o = G.node;
  try {
    const r = await api.gatherFinish(G.job); applyServer(r.state); G.job = null;
    for (const g of r.got) { const rar = g.rarity || 0, nm = CAT.templates[g.t]?.name || g.t; if (g.bonus || rar >= 2) { log(`<b style="color:${RARITY[rar].color}">${nm}</b> ${g.bonus ? "(achado)" : ""} · ${g.purity}% de pureza`, "good"); toast(`Achado: ${nm} (${RARITY[rar].name})`); burst(o, RARITY[rar].color, 18, 3); ring(o, RARITY[rar].color); } }
    S.clog.unshift({ msg: r.got.map(g => `+${g.q} ${CAT.templates[g.t]?.name || g.t}`).join(", "), kind: "kill", t: S.t }); S.clog.length = Math.min(S.clog.length, 6);
    o.node.remaining = Math.max(0, o.node.remaining - 1);
    if (o.node.remaining <= 0) { o.node.refill_at = new Date(Date.now() + 300000).toISOString(); const nx = nearestNode(n => n.kind === o.node.kind) || nearestNode(n => n.prof === o.node.prof);
      if (nx) { log(`${o.node.name} esgotou. Indo pro próximo: ${nx.node.name}.`, "info"); p.task = "idle"; p.gathering = null; later(.4, () => startGather(nx)); } else { toast(`${o.node.name} esgotou e não há outro disponível agora.`); stop(); } return; }
    later(.2, () => { if (G.node === o && p.task === "gather") begin(); });     // continua coletando sozinho
  } catch (e) { toast(e.message, true); stop(); } finally { G.busy = false; }
}
export function stop() { const p = P(); G.node = null; G.job = null; if (p) { p.gathering = null; if (p.task === "gather") p.task = "idle"; } api.gatherCancel().catch(() => { }); }
// chamado a cada tick
export function gatherTick() {
  const p = P(); if (!p) return;
  if (p.pendingGather && !p.path.length && p.task !== "walk") { const o = p.pendingGather; p.pendingGather = null; G.node = o; begin(); return; }
  if (p.task === "walk" && p.pendingGather && !p.path.length) { const o = p.pendingGather; p.pendingGather = null; G.node = o; p.task = "idle"; begin(); return; }
  if (p.task !== "gather" || !G.job) return;
  if (p.path.length || p.manual) { stop(); return; }
  p.atkT = p.atkDur = .36;                       // animação de golpe (picareta, machado, foice)
  if (Date.now() >= G.until) finish();
}
// a cada 30 s, atualiza estado dos depósitos (esgotados e de volta)
export function startNodePolling() { setInterval(loadNodes, 30000); }
