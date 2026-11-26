// Social e história: chat (global, comércio, clã), clãs, trocas entre jogadores, missões e diálogo dos NPCs.
import { KING, VOC, ITEMS, RARITY, HUNTS, REGIONS, MONS } from "./data.js";
import { S, P, fmt, goHunt, walkTo, log } from "./sim.js";
import { NPCS, huntAt } from "./world.js";
import { api } from "./net.js";
import { act, toast, openModal, closeModal } from "./ui.js";
import { A } from "./art.js";
import { pingPlayer } from "./presence.js";
import { TALK, THANKS } from "./questtalk.js";

const $ = id => document.getElementById(id);
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tpl = id => ITEMS[id] || { name: id, icon: "orb" };
const icon = name => A.sp[name] ? `<img class="ic" src="assets/sprites/${name}.png" alt="">` : `<span class="ic ph"></span>`;

// ---------- chat ----------
const chat = { channel: "global", world: 1, last: { global: 0, comercio: 0, cla: 0, mundo: 0 }, msgs: { global: [], comercio: [], cla: [], mundo: [] }, unread: { global: 0, comercio: 0, cla: 0, mundo: 0 }, timer: 0 };
export function bindChat() {
  document.querySelectorAll("[data-chat]").forEach(b => b.addEventListener("click", () => { chat.channel = b.dataset.chat; chat.unread[chat.channel] = 0; renderChat(); }));
  $("chatForm").addEventListener("submit", async e => { e.preventDefault(); const inp = $("chatInput"), body = inp.value.trim(); if (!body) return; if (chat.channel === "cla" && !S.clan) return toast("Você não está num clã.", true); inp.value = ""; try { await api.sendChat(chat.channel, body); pollChat(); } catch (err) { toast(err.message, true); inp.value = body; } });
  pollChat(); chat.timer = setInterval(pollChat, 3000);
}
async function pollChat() {
  if ((S.world?.id || 1) !== chat.world) { chat.world = S.world?.id || 1; chat.msgs.mundo = []; chat.last.mundo = 0; }   // trocou de mundo: canal Mundo recomeça
  for (const ch of ["global", "comercio", "cla", "mundo"]) {
    if (ch === "cla" && !S.clan) continue;
    if (ch !== chat.channel && Math.random() < .6) continue;          // canais em segundo plano atualizam menos
    try { const list = await api.getChat(ch, chat.last[ch]); if (list.length) { chat.msgs[ch].push(...list); chat.msgs[ch] = chat.msgs[ch].slice(-120); chat.last[ch] = list[list.length - 1].id; if (ch !== chat.channel) chat.unread[ch] += list.length; } } catch (e) { }
  }
  renderChat();
}
function renderChat() {
  document.querySelectorAll("[data-chat]").forEach(b => { const ch = b.dataset.chat; b.classList.toggle("on", ch === chat.channel); b.querySelector("i").textContent = chat.unread[ch] ? chat.unread[ch] : ""; });
  const box = $("chatLog"); if (!box) return; const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
  box.innerHTML = chat.msgs[chat.channel].map(m => `<li><time>${new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time> <b style="color:${KING[m.kingdom]?.color || "#fff"}">${m.clan_tag ? `[${esc(m.clan_tag)}] ` : ""}${esc(m.name)}</b>: ${esc(m.body)}</li>`).join("") || `<li class="muted">${chat.channel === "cla" && !S.clan ? "Entre num clã pra usar este canal." : "Nenhuma mensagem ainda. Diga oi."}</li>`;
  if (atBottom) box.scrollTop = box.scrollHeight;
}

// ---------- missões ----------
export let QUESTS = [];
const STORY = {
  q1_ratos: "Os ratos tomaram os celeiros na saída da vila. Limpe o Celeiros de Arken antes que comam o inverno inteiro.",
  q2_javalis: "Preciso de presas pra forjar escudos. Os javalis da Orla dos Carvalhos estão gordos este ano.",
  q3_bandidos: "Bandidos ergueram uma torre na estrada sul. Caravanas somem por lá. Derrube o bando.",
  q4_teias: "A seda da Ravina das Teias vale ouro no mercado. Mas as aranhas não vão entregar de graça.",
  q5_uivos: "Algo deixou os lobos da Clareira dos Uivos agitados. Diminua a matilha e veja o que os assusta.",
  q6_bruxa: "Os lobos fugiam de uma maldição. Ela vem da Cabana da Bruxa, no fundo do Pântano Vermelho.",
  q7_minas: "Antes de morrer, a bruxa falou de algo que acordou embaixo das minas. Desça e descubra.",
  q8_dragao: "Não era nas minas. A fera mora na montanha. Entre na Caverna do Dragão e termine isso.",
};
export async function loadQuests() { try { QUESTS = await api.quests(); } catch (e) { QUESTS = []; } }
const qp = id => S.quests.find(q => q.id === id);
export function questsFor(giver) {
  const p = P();
  return QUESTS.filter(d => d.giver === giver).filter(d => { const st = qp(d.id); if (st?.status === "entregue") return false; if (st) return true; return p.lvl >= d.min_level && (!d.requires || qp(d.requires)?.status === "entregue"); });
}

// ---------- guia da missão: o que fazer, onde, e o passo atual ----------
const CAVE = { x: 205, y: 24, name: "Caverna do Dragão", where: "Montanhas Gélidas, a leste da Caverna Congelada" };
export function questInfo(d) {
  const st = qp(d.id), status = st?.status || "nova";
  const h = HUNTS.find(x => x.id === d.target), reg = h && REGIONS.find(r => r.id === h.region), mon = h && MONS[h.mon];
  let what, where, lvl;
  if (d.kind === "dungeon") { what = "Vencer Ignaroth, o Dragão, no fim da Caverna do Dragão"; where = `${CAVE.name} · ${CAVE.where}`; lvl = d.min_level; }
  else { what = `Derrotar ${d.goal} ${mon?.name || d.target}`; where = h ? `${h.name} · ${reg?.name || ""}${reg?.realm ? " (" + reg.realm + ")" : ""}` : d.target; lvl = mon?.lvl; }
  const step = status === "nova" ? `Aceite aqui ou fale com o ${d.giver} na Vila de Arken.`
    : status === "ativa" ? (d.kind === "dungeon" ? `Vá até a ${CAVE.name} e clique na entrada. Precisa da chave de obsidiana, que cai das salas.` : `Vá até ${h?.name || d.target} e deixe caçar. Só contam abates nessa área, inclusive off-line.`)
    : status === "pronta" ? `Pronta! Volte e entregue ao ${d.giver} (ou clique em Entregar).` : "Entregue.";
  return { st, status, what, where, lvl, step, hunt: h, prog: st ? st.progress : 0 };
}
function goQuest(d) {
  const i = questInfo(d);
  if (d.kind === "dungeon") { const p = P(); p.huntId = null; p.task = "idle"; if (!walkTo(CAVE.x, CAVE.y)) return toast("Não achei caminho até a caverna.", true); toast("Indo até a Caverna do Dragão"); return; }
  if (!i.hunt) return;
  const p = P();
  if (p.huntId === i.hunt.id) {
    // o servidor já marca a caça aqui; se o boneco não está lá caçando, leva ele até a área
    if (p.task === "hunt" && huntAt(p.x, p.y)?.id === i.hunt.id) return toast(`Você já está caçando em ${i.hunt.name}.`);
    p.manual = false; p.pendingGather = null; goHunt(i.hunt.id); return;
  }
  act(() => api.startHunt(i.hunt.id)).then(st => { if (st) { goHunt(i.hunt.id); toast(`Indo caçar em ${i.hunt.name}`); } });
}
function goGiver(d) {
  const n = NPCS.find(x => x.title === d.giver && x.y < 200); if (!n) return;
  const p = P(); p.huntId = null; p.task = "idle";
  if (!walkTo(n.x, n.y + 1)) return toast("Não achei caminho até o NPC.", true); toast(`Indo falar com o ${d.giver}`);
  // ao chegar perto do NPC, a conversa abre sozinha
  clearInterval(goGiver.t); goGiver.t = setInterval(() => { const q = P(); if (!q || q.task !== "walk" && Math.hypot(q.x - n.x, q.y - n.y) > 3) return clearInterval(goGiver.t); if (Math.hypot(q.x - n.x, q.y - n.y) <= 2.2) { clearInterval(goGiver.t); questTalk(QUESTS.find(x => x.id === d.id) || d); } }, 300);
}

// ---------- conversa da missão com o NPC ----------
function drawFace(npc) { if (!npc) return; import("./chars.js").then(m => { const c = $("npcFace"); if (!c) return; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 72, 104); g.drawImage(m.charSprite(npc.voc, npc.king, "down", -1, 3), 0, 0, 72, 104); }); }
const rewardOf = d => [d.reward_gold ? `${fmt(d.reward_gold)} gold` : "", d.reward_exp ? `${fmt(d.reward_exp)} exp` : "", d.reward_gems ? `${d.reward_gems} gemas` : "", d.reward_item ? tpl(d.reward_item).name : ""].filter(Boolean).join(" · ");
export function questTalk(d, phase) {
  const npc = NPCS.find(n => n.title === d.giver && n.y < 200), t = TALK[d.id] || {}, i = questInfo(d), el = $("npcBox");
  const st = phase || i.status;
  let lines = [], opts = [], extra = "";
  if (st === "nova") { lines = t.start || [STORY[d.id]]; extra = guideBox(i, d); opts = [["aceitar", t.yes || "Aceito.", true], ["fechar", t.no || "Agora não."]]; }
  else if (st === "aceito") { lines = [THANKS.aceitar]; extra = guideBox(i, d); opts = [["ir", d.kind === "dungeon" ? "Vou até a caverna agora." : "Vou caçar agora.", true], ["fechar", "Até logo."]]; }
  else if (st === "ativa") { lines = t.mid || [i.step]; extra = guideBox(i, d) + `<div class="row"><span>Progresso</span><b>${i.prog}/${d.goal}</b></div><div class="bar"><i style="width:${Math.min(100, Math.round(i.prog / d.goal * 100))}%"></i></div>`; opts = [["ir", d.kind === "dungeon" ? "Vou até a caverna agora." : "Vou caçar agora.", true], ["desistir", "Quero desistir dessa missão."], ["fechar", "Até logo."]]; }
  else if (st === "pronta") { lines = ["E então? Terminou o que eu pedi?"]; opts = [["entregar", "Terminei. Aqui está.", true], ["fechar", "Ainda não, volto já."]]; }
  else if (st === "fim") { lines = t.end || ["Obrigado."]; extra = `<div class="talkreward">Recompensa recebida: <b>${rewardOf(d)}</b></div>`;
    const nx = QUESTS.find(q => q.requires === d.id); if (nx) extra += `<p class="muted">Próxima missão: <b>${esc(nx.title)}</b> com o ${esc(nx.giver)} · nível ${nx.min_level}+</p>`;
    opts = nx && P().lvl >= nx.min_level ? [["proxima", nx.giver === d.giver ? "Tem mais trabalho pra mim?" : `Vou falar com o ${nx.giver}.`, true], ["fechar", "Até logo."]] : [["fechar", "Até logo.", true]]; }
  else if (st === "desistiu") { lines = [THANKS.desistir]; opts = [["fechar", "Até logo.", true]]; }
  el.innerHTML = `<div class="npc-head"><canvas id="npcFace" width="72" height="104"></canvas><div><h3>${esc(d.giver)}</h3><small class="muted">${esc(d.title)} · capítulo ${d.chapter}</small></div></div>
    <div class="talk">${lines.map((l, k) => `<p class="say" style="animation-delay:${k * .35}s">${esc(l)}</p>`).join("")}</div>${extra}
    <div class="talkopts">${opts.map(([a, txt, main]) => `<button class="reply ${main ? "main" : ""}" data-talk="${a}">» ${esc(txt)}</button>`).join("")}</div>`;
  $("npcModal").hidden = false; drawFace(npc);
  el.querySelectorAll("[data-talk]").forEach(b => b.onclick = async ev => {
    ev.stopPropagation(); const a = b.dataset.talk;
    if (a === "fechar") { $("npcModal").hidden = true; return; }
    if (a === "ir") { $("npcModal").hidden = true; return goQuest(d); }
    if (a === "proxima") { const nx = QUESTS.find(q => q.requires === d.id); if (nx.giver === d.giver) return questTalk(nx); $("npcModal").hidden = true; return goGiver(nx); }
    const r = await act(() => api.questAction(d.id, a), null); if (!r) return;
    renderQuestbar(); questTalk(d, a === "aceitar" ? "aceito" : a === "entregar" ? "fim" : "desistiu");
  });
}
const guideBox = (i, d) => `<div class="qguide"><div class="row"><span>O que fazer</span><b>${esc(i.what)}</b></div><div class="row"><span>Onde</span><b>${esc(i.where)}${i.lvl ? ` · nível ${i.lvl}` : ""}</b></div><div class="row"><span>Recompensa</span><b>${rewardOf(d)}</b></div></div>`;
export function talkById(id) { const d = QUESTS.find(x => x.id === id); if (d) questTalk(d); }
export const questDefs = () => QUESTS;
export function questBtn(b) { const d = QUESTS.find(x => x.id === b.dataset.qg); if (!d) return; if (b.dataset.qw === "npc") goGiver(d); else goQuest(d); }
// barra de tarefas sobre o mapa: missões em andamento e a próxima disponível
let qbMin = false; try { qbMin = localStorage.getItem("ht_qb_min") === "1"; } catch (e) { }
export function renderQuestbar() {
  const el = document.getElementById("questbar"); if (!el || !S.p) return;
  if (!QUESTS.length) { el.hidden = true; return; }
  const p = P(), act2 = QUESTS.filter(d => ["ativa", "pronta"].includes(qp(d.id)?.status));
  const next = act2.length ? null : QUESTS.find(d => !qp(d.id) && p.lvl >= d.min_level && (!d.requires || qp(d.requires)?.status === "entregue"));
  const lockedNext = act2.length || next ? null : QUESTS.find(d => !qp(d.id) && (!d.requires || qp(d.requires)?.status === "entregue"));
  const head = `<div class="qbh"><b>Missões</b><span><button data-qbmin="1" title="${qbMin ? "Mostrar" : "Esconder"}">${qbMin ? "▸" : "▾"}</button></span></div>`;
  if (qbMin) { el.innerHTML = head + (act2.length ? `<small class="muted">${act2.length} em andamento${act2.some(d => qp(d.id).status === "pronta") ? " · uma pronta pra entregar" : ""}</small>` : ""); el.hidden = false; return; }
  const row = d => { const i = questInfo(d), pct = Math.min(100, Math.round(i.prog / d.goal * 100)), ready = i.status === "pronta";
    return `<div class="qbi ${ready ? "ready" : ""}"><div class="row"><b>${esc(d.title)}</b><small>${ready ? "pronta" : `${i.prog}/${d.goal}`}</small></div><small>${esc(i.what)}</small><small class="muted">📍 ${esc(i.where)}</small><div class="bar"><i style="width:${pct}%"></i></div><small class="step">${esc(i.step)}</small><div class="qba">${ready ? `<button class="primary" data-talkq="${d.id}">Entregar</button><button data-qg="${d.id}" data-qw="npc">Ir até o ${esc(d.giver)}</button>` : `<button class="primary" data-qg="${d.id}" data-qw="go">${d.kind === "dungeon" ? "Ir até a caverna" : p.huntId === i.hunt?.id && p.task === "hunt" && huntAt(p.x, p.y)?.id === i.hunt.id ? "Caçando aqui" : p.huntId === i.hunt?.id && p.task === "goto" ? "A caminho" : "Ir caçar"}</button>`}</div></div>`; };
  let body = act2.map(row).join("");
  if (next) { const i = questInfo(next); body = `<div class="qbi new"><div class="row"><b>Nova: ${esc(next.title)}</b><small>Cap. ${next.chapter}</small></div><small>${esc(i.what)}</small><small class="muted">📍 ${esc(i.where)}</small><small class="step">${esc(i.step)}</small><div class="qba"><button class="primary" data-talkq="${next.id}">Conversar e aceitar</button><button data-qg="${next.id}" data-qw="npc">Ir até o ${esc(next.giver)}</button></div></div>`; }
  if (lockedNext) body = `<small class="muted">Próxima missão "${esc(lockedNext.title)}" libera no nível ${lockedNext.min_level}.</small>`;
  if (!body) body = `<small class="muted">Todas as missões da história foram feitas.</small>`;
  el.innerHTML = head + body; el.hidden = false;
}
export function bindQuestbar(after) {
  const el = document.getElementById("questbar"); if (!el) return;
  el.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.qbmin) { qbMin = !qbMin; try { localStorage.setItem("ht_qb_min", qbMin ? "1" : "0"); } catch (x) { } return renderQuestbar(); }
    if (b.dataset.qg) return questBtn(b);
    if (b.dataset.talkq) return talkById(b.dataset.talkq);
    if (b.dataset.q) { await questClick(b); renderQuestbar(); after && after(); }
  });
}
const KIND = { kill: "Derrotar em", drop: "Coletar em", dungeon: "Vencer", visit: "Visitar" };
function questLine(d) {
  const st = qp(d.id), prog = st ? st.progress : 0, pct = Math.round(prog / d.goal * 100);
  const reward = [d.reward_gold ? `${fmt(d.reward_gold)} gold` : "", d.reward_exp ? `${fmt(d.reward_exp)} exp` : "", d.reward_gems ? `${d.reward_gems} gemas` : "", d.reward_item ? tpl(d.reward_item).name : ""].filter(Boolean).join(" · ");
  const btn = !st ? `<button class="primary" data-q="${d.id}" data-qa="aceitar">Aceitar</button>` : st.status === "pronta" ? `<button class="primary" data-talkq="${d.id}">Entregar</button>` : st.status === "ativa" ? `<button class="primary" data-qg="${d.id}" data-qw="go">${d.kind === "dungeon" ? "Ir até a caverna" : "Ir caçar"}</button> <button data-q="${d.id}" data-qa="desistir">Desistir</button>` : `<span class="tag good">feita</span>`;
  return `<div class="quest ${st?.status || "nova"}"><div class="qh"><b>${esc(d.title)}</b><small>Cap. ${d.chapter} · ${esc(d.giver)} · level ${d.min_level}+</small></div><p>${STORY[d.id] || ""}</p>${(i => `<div class="qguide"><div class="row"><span>O que fazer</span><b>${esc(i.what)}</b></div><div class="row"><span>Onde</span><b>${esc(i.where)}${i.lvl ? ` · nível ${i.lvl}` : ""}</b></div><div class="row"><span>Agora</span><b class="step">${esc(i.step)}</b></div></div>`)(questInfo(d))}<div class="row"><span>Progresso</span><b>${prog}/${d.goal}</b></div><div class="bar"><i style="width:${pct}%"></i></div><div class="row"><small>Recompensa</small><small>${reward}</small></div><div class="actions">${btn}</div></div>`;
}
export function renderQuests(box) {
  if (!QUESTS.length) { box.innerHTML = `<div class="muted">carregando…</div>`; loadQuests().then(() => renderQuests(box)); return; }
  const p = P(), chapters = [...new Set(QUESTS.map(q => q.chapter))];
  box.innerHTML = `<p class="muted">A história de Arken. Fale com o NPC indicado ou aceite aqui. O progresso conta quando você caça na área certa, inclusive off-line.</p>${chapters.map(ch => `<h4>Capítulo ${ch}</h4><div class="quests">${QUESTS.filter(q => q.chapter === ch).map(d => { const st = qp(d.id), locked = !st && (p.lvl < d.min_level || (d.requires && qp(d.requires)?.status !== "entregue")); return locked ? `<div class="quest locked"><div class="qh"><b>${esc(d.title)}</b><small>bloqueada · level ${d.min_level}+${d.requires ? " · depois de " + esc(QUESTS.find(x => x.id === d.requires)?.title) : ""}</small></div></div>` : questLine(d); }).join("")}</div>`).join("")}`;
}
export async function questClick(b) { await act(() => api.questAction(b.dataset.q, b.dataset.qa), b.dataset.qa === "entregar" ? "Missão entregue" : b.dataset.qa === "aceitar" ? "Missão aceita" : "Missão abandonada"); }

// ---------- diálogo de NPC ----------
const GREET = { Taverneiro: "Senta aí. Aqui se ouve de tudo, até sobre o dragão da montanha.", Comandante: "Este forte será disputado pelos clãs nas guerras agendadas. Prepare o seu.", Fazendeira: "Os ratos comem tudo que a gente planta. Obrigada por ajudar.", Guarda: "Fique atento lá fora. Precisa de algo?", Ferreiro: "Aço bom não sai de graça.", Mercador: "Poções, armas, o que precisar.", Sacerdote: "Que a luz de Arken te guie.", Banqueiro: "Seu ouro está seguro comigo." };
export async function npcDialog(npc) {
  if (!QUESTS.length) await loadQuests();
  const list = questsFor(npc.title), el = $("npcBox");
  el.innerHTML = `<div class="npc-head"><canvas id="npcFace" width="72" height="104"></canvas><div><h3>${npc.title}</h3><p>${GREET[npc.title] || ""}</p></div></div>${list.length ? `<div class="talkopts">${list.map(d => { const stt = qp(d.id)?.status; return `<button class="reply main" data-talkq="${d.id}">» ${stt === "pronta" ? "Terminei: " : stt === "ativa" ? "Sobre: " : "Tem trabalho? "}${esc(d.title)}</button>`; }).join("")}</div>` : `<p class="muted">Nada pra você agora.</p>`}<div class="actions">${npc.tab && npc.tab !== "bless" ? `<button data-open="${npc.tab}">${npc.tab === "market" ? "Abrir loja" : "Abrir mochila"}</button>` : ""}${npc.tab === "bless" ? `<button data-bless="1">Comprar bênção (200)</button>` : ""}<button data-close-npc="1">Até logo</button></div>`;
  $("npcModal").hidden = false;
  import("./chars.js").then(m => { const c = $("npcFace"), g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(m.charSprite(npc.voc, npc.king, "down", -1, 3), 0, 0, 72, 104); });
}
export function bindNpc() {
  $("npcModal").addEventListener("click", async e => {
    if (e.target === $("npcModal")) return ($("npcModal").hidden = true);
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.closeNpc) $("npcModal").hidden = true;
    if (b.dataset.open) { $("npcModal").hidden = true; openModal(b.dataset.open); }
    if (b.dataset.bless) { $("npcModal").hidden = true; act(() => api.buyBless(), "Bênção comprada"); }
    if (b.dataset.talkq) return talkById(b.dataset.talkq);
    if (b.dataset.qg) { $("npcModal").hidden = true; return questBtn(b); }
    if (b.dataset.q) { await questClick(b); $("npcModal").hidden = true; renderQuestbar(); }
  });
}

// ---------- clãs ----------
export async function renderClan(box) {
  const c = S.clan;
  if (!c) {
    box.innerHTML = `<div class="split"><div><h4>Fundar um clã</h4><p class="muted">Pede level 10. Paga em gold ou em gemas, você escolhe. Você vira o líder.</p><label class="auto"><span>Nome</span><input id="clName" maxlength="24" type="text"></label><label class="auto"><span>Sigla (2 a 4)</span><input id="clTag" maxlength="4" type="text" style="text-transform:uppercase"></label><label class="auto"><span>Descrição</span><input id="clDesc" maxlength="200" type="text"></label><div class="actions"><button class="primary" id="clCreate">Fundar por 1.000 gold</button><button class="primary" id="clCreateG">Fundar por 10 gemas</button></div></div><div>${(S.clanInvites || []).length ? `<h4>Convites pra você</h4>${S.clanInvites.map(i => `<div class="row"><span><b>[${esc(i.tag)}] ${esc(i.name)}</b><br><small>${i.members} membro(s) · convite de ${esc(i.by || "líder")}</small></span><span><button class="primary" data-inv="aceitar_convite" data-c="${i.clan_id}">Entrar</button> <button data-inv="recusar_convite" data-c="${i.clan_id}">Recusar</button></span></div>`).join("")}` : ""}<h4>Clãs de Arken</h4><div id="clList" class="muted">carregando…</div></div></div>`;
    const found = pay => act(() => api.createClan($("clName").value, $("clTag").value.toUpperCase(), $("clDesc").value, pay), "Clã fundado").then(() => renderClan(box));
    $("clCreate").onclick = () => found("gold"); $("clCreateG").onclick = () => found("gemas");
    box.querySelectorAll("[data-inv]").forEach(b => b.onclick = () => act(() => api.clanAction(b.dataset.inv, b.dataset.c), b.dataset.inv === "aceitar_convite" ? "Você entrou no clã" : "Convite recusado").then(() => renderClan(box)));
    const list = await api.clans().catch(() => []);
    $("clList").innerHTML = list.map(x => `<div class="row"><span><b>[${esc(x.tag)}] ${esc(x.name)}</b><br><small>${x.members} membro(s) · líder ${esc(x.leader)} · poder ${x.power}</small></span><button data-clan-req="${x.id}">Pedir pra entrar</button></div>`).join("") || "Nenhum clã ainda. Seja o primeiro.";
    box.querySelectorAll("[data-clan-req]").forEach(b => b.onclick = () => act(() => api.clanAction("pedir", b.dataset.clanReq), "Pedido enviado"));
    return;
  }
  const lead = c.role !== "membro";
  box.innerHTML = `<div class="split"><div><h3>[${esc(c.tag)}] ${esc(c.name)}</h3><p class="muted">${esc(c.description) || "Sem descrição."}</p><div class="row"><span>Seu cargo</span><b>${c.role}</b></div><div class="row"><span>Membros</span><b>${c.members.length}/50</b></div><p class="muted">O canal Clã no chat é só de vocês.</p><div class="actions"><button class="danger" id="clLeave">Sair do clã</button></div>
    ${lead ? `<h4>Convidar jogador</h4><div class="row"><input id="clInvName" type="text" maxlength="24" placeholder="nome do personagem" style="flex:1"><button class="primary" id="clInvite">Convidar</button></div>${(S.clanSent || []).length ? `<small class="muted">Convites pendentes:</small>${S.clanSent.map(x => `<div class="row"><span>${esc(x.name)} · lv ${x.level}</span><button data-cl="cancelar_convite" data-t="${esc(x.name)}">Cancelar</button></div>`).join("")}` : ""}` : ""}
    ${lead && c.requests.length ? `<h4>Pedidos</h4>${c.requests.map(r => `<div class="row"><span>${esc(r.name)} · lv ${r.level}</span><span><button data-cl="aceitar" data-t="${esc(r.name)}">Aceitar</button> <button data-cl="recusar" data-t="${esc(r.name)}">Recusar</button></span></div>`).join("")}` : ""}</div>
    <div><h4>Membros</h4>${c.members.map(m => `<div class="row"><span><i class="dot" style="background:${m.online ? "#7ee07e" : "#555"}"></i> ${esc(m.name)} <small>${VOC[m.vocation]?.name || ""} · lv ${m.level} · ${m.role}</small></span><span>${c.role === "lider" && m.role !== "lider" ? `<button data-cl="promover" data-t="${esc(m.name)}">Oficial</button> <button data-cl="liderar" data-t="${esc(m.name)}">Passar liderança</button>` : ""}${lead && m.role === "membro" ? ` <button data-cl="expulsar" data-t="${esc(m.name)}">Expulsar</button>` : ""}</span></div>`).join("")}</div></div>`;
  box.insertAdjacentHTML("beforeend", `<div id="clVault" class="clvault"><div class="muted">carregando cofre…</div></div>`); renderClanVault($("clVault"), box);
  $("clLeave").onclick = () => act(() => api.clanAction("sair"), "Você saiu do clã").then(() => renderClan(box));
  if ($("clInvite")) $("clInvite").onclick = () => { const n = $("clInvName").value.trim(); if (!n) return toast("Digite o nome do jogador.", true); act(() => api.clanAction("convidar", n), "Convite enviado pra " + n).then(r => { if (r) pingPlayer(n); renderClan(box); }); };
  box.querySelectorAll("[data-cl]").forEach(b => b.onclick = () => act(() => api.clanAction(b.dataset.cl, b.dataset.t), "Feito").then(() => renderClan(box)));
}

// ---------- trocas ----------
let TR_OPEN = null;
const ROMAN2 = ["", "I", "II", "III", "IV", "V"];
const sideItems = list => list.map(i => `<span class="slotv r${i.rarity}" title="${esc(i.roll?.name || tpl(i.template).name)}">${icon(tpl(i.template).icon)}</span>`).join("");
const sideStacks = list => list.map(st => `<span class="chip">${esc(tpl(st.t).name)} ×${st.qty} <small>${st.purity}%</small></span>`).join("");
const sideMoney = (g, m) => `${g ? `<span class="chip gold">🪙 ${fmt(g)}</span>` : ""}${m ? `<span class="chip gem">💎 ${fmt(m)}</span>` : ""}`;
export function renderTrades(box) {
  const open = S.trades.filter(t => t.mode === "bilateral"), legacy = S.trades.filter(t => t.mode !== "bilateral");
  if (TR_OPEN && open.find(t => t.id === TR_OPEN)) return renderTradeDetail(box, open.find(t => t.id === TR_OPEN));
  TR_OPEN = null;
  const tline = t => `<div class="trade"><div class="row"><b>${t.mine ? "Você → " + esc(t.to) : esc(t.from) + " → você"}</b><small>${new Date(t.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</small></div><div class="tradeitems">${sideItems(t.items)}${sideMoney(t.offer_gold, t.offer_gems)}</div><div class="row"><small>Pede em troca</small><b>${t.want_gold ? fmt(t.want_gold) + " gold " : ""}${t.want_gems ? t.want_gems + " gemas" : ""}${!t.want_gold && !t.want_gems ? "nada (presente)" : ""}</b></div><div class="actions">${t.mine ? `<button data-tr="${t.id}" data-ta="cancelar">Cancelar</button>` : `<button class="primary" data-tr="${t.id}" data-ta="aceitar">Aceitar</button><button data-tr="${t.id}" data-ta="recusar">Recusar</button>`}</div></div>`;
  const bline = t => { const meA = t.mine, myOk = meA ? t.accepted_a : t.accepted_b, hisOk = meA ? t.accepted_b : t.accepted_a, other = meA ? t.to : t.from;
    return `<div class="trade"><div class="row"><b>Troca com ${esc(other)}</b><small>${myOk ? "você confirmou" : "falta você confirmar"} · ${hisOk ? esc(other) + " confirmou" : "falta " + esc(other)}</small></div><div class="actions"><button class="primary" data-topen="${t.id}">Abrir mesa</button></div></div>`; };
  box.innerHTML = `<div class="split"><div><h4>Nova troca</h4><p class="muted">Abre uma mesa com o outro jogador. Os dois colocam itens, materiais, gold e gemas. Tudo o que entra na mesa fica guardado pelo servidor. Se qualquer lado muda a oferta, as duas confirmações caem. A troca só acontece quando os dois confirmam a mesma versão.</p><label class="auto"><span>Com (nome do personagem)</span><input id="trTo" type="text" maxlength="14"></label><div class="actions"><button class="primary" id="trOpen">Abrir mesa de troca</button></div></div>
    <div><h4>Mesas abertas (${open.length})</h4>${open.map(bline).join("") || '<p class="muted">Nenhuma.</p>'}${legacy.length ? `<h4>Propostas antigas (${legacy.length})</h4>${legacy.map(tline).join("")}` : ""}</div></div>`;
  $("trOpen").onclick = () => { const to = $("trTo").value.trim(); if (!to) return toast("Digite o nome do jogador.", true); act(() => api.tradeOpen(to).then(r => { TR_OPEN = r.trade; return r; }), "Mesa aberta").then(r => { if (r) { pingPlayer(to); renderTrades(box); } }); };
  box.querySelectorAll("[data-topen]").forEach(b => b.onclick = () => { TR_OPEN = b.dataset.topen; renderTrades(box); });
  box.querySelectorAll("[data-tr]").forEach(b => b.onclick = () => act(() => api.closeTrade(b.dataset.tr, b.dataset.ta), b.dataset.ta === "aceitar" ? "Troca concluída" : "Troca encerrada").then(() => renderTrades(box)));
}
function renderTradeDetail(box, t) {
  const meA = t.mine, other = meA ? t.to : t.from;
  const mine = { items: meA ? t.items : t.to_items_list, stacks: meA ? t.from_stacks : t.to_stacks, gold: meA ? t.offer_gold : t.to_gold, gems: meA ? t.offer_gems : t.to_gems, ok: meA ? t.accepted_a : t.accepted_b };
  const his = { items: meA ? t.to_items_list : t.items, stacks: meA ? t.to_stacks : t.from_stacks, gold: meA ? t.to_gold : t.offer_gold, gems: meA ? t.to_gems : t.offer_gems, ok: meA ? t.accepted_b : t.accepted_a };
  const bag = S.inventory.filter(i => i.container === "bag" || i.container === "protected"), picked = new Set(mine.items.map(i => i.id));
  const stackOpts = S.stacks.concat(mine.stacks.map(x => ({ t: x.t, purity: x.purity, qty: 0 })));
  box.innerHTML = `<div class="row"><button data-tback="1">← Mesas</button><b>Mesa de troca com ${esc(other)} · versão ${t.version}</b></div>
    <div class="split tradebox"><div class="tside"><h4>Você oferece ${mine.ok ? '<i class="tag good">confirmado</i>' : ""}</h4>
      <small class="muted">Itens (clique pra marcar; os que já estão na mesa aparecem marcados)</small><div class="bag pick">${mine.items.map(i => `<button class="slotv r${i.rarity} sel" data-pick="${i.id}" title="${esc(i.roll?.name || tpl(i.template).name)}">${icon(tpl(i.template).icon)}</button>`).join("")}${bag.map(i => `<button class="slotv r${i.rarity}" data-pick="${i.id}" title="${esc(i.roll?.name || tpl(i.template).name)}">${icon(tpl(i.template).icon)}</button>`).join("")}</div>
      <small class="muted">Materiais</small><div id="tStacks">${mine.stacks.map(x => stackRow(stackOpts, x)).join("")}</div><button data-addstack="1">+ material</button>
      <label class="auto"><span>Gold</span><input id="tGold" type="number" min="0" value="${mine.gold}"></label><label class="auto"><span>Gemas</span><input id="tGems" type="number" min="0" value="${mine.gems}"></label>
      <div class="actions"><button id="tSet">Atualizar minha oferta</button></div></div>
    <div class="tside"><h4>${esc(other)} oferece ${his.ok ? '<i class="tag good">confirmado</i>' : ""}</h4><div class="tradeitems">${sideItems(his.items)}${sideStacks(his.stacks)}${sideMoney(his.gold, his.gems)}</div>${!his.items.length && !his.stacks.length && !his.gold && !his.gems ? '<p class="muted">Ainda nada na mesa.</p>' : ""}</div></div>
    <p class="muted">Confirmar vale só pra versão ${t.version}. Se alguém mudar a oferta, as confirmações caem e vocês confirmam de novo.</p>
    <div class="actions"><button class="primary" id="tOk" ${mine.ok ? "disabled" : ""}>${mine.ok ? "Você já confirmou" : "Confirmar troca"}</button><button class="danger" id="tCancel">Desfazer mesa</button></div>`;
  box.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { const id = b.dataset.pick; if (picked.has(id)) picked.delete(id); else if (picked.size < 8) picked.add(id); b.classList.toggle("sel", picked.has(id)); });
  box.querySelector("[data-addstack]").onclick = () => { if (!S.stacks.length) return toast("Sem materiais.", true); $("tStacks").insertAdjacentHTML("beforeend", stackRow(stackOpts, null)); };
  box.querySelector("[data-tback]").onclick = () => { TR_OPEN = null; renderTrades(box); };
  $("tSet").onclick = () => { window.__myTradeAct = Date.now(); const stacks = [...box.querySelectorAll(".srow")].map(r => { const [tt, pur] = r.querySelector("select").value.split("|"); return { t: tt, purity: +pur, qty: +r.querySelector("input").value }; }).filter(x => x.qty > 0);
    act(() => api.tradeSet(t.id, [...picked], stacks, +$("tGold").value || 0, +$("tGems").value || 0), "Oferta atualizada").then(r => { if (r) pingPlayer(other); renderTrades(box); }); };
  $("tOk").onclick = () => (window.__myTradeAct = Date.now(), act(() => api.tradeConfirm(t.id, t.version), "Confirmado").then(r => { if (r) { pingPlayer(other); if (!S.trades.find(x => x.id === t.id)) { TR_OPEN = null; toast("Troca concluída!"); } } renderTrades(box); }));
  $("tCancel").onclick = () => act(() => api.tradeCancel(t.id), "Mesa desfeita, tudo devolvido").then(r => { if (r) pingPlayer(other); TR_OPEN = null; renderTrades(box); });
}
const stackRow = (opts, cur) => `<div class="row srow"><select>${opts.map(o => `<option value="${o.t}|${o.purity}" ${cur && cur.t === o.t && cur.purity === o.purity ? "selected" : ""}>${esc(tpl(o.t).name)} ${o.purity}%${o.qty ? " (" + o.qty + ")" : ""}</option>`).join("")}</select><input type="number" min="0" value="${cur ? cur.qty : 1}" style="width:64px"></div>`;

// ---------- clã 2.0: cofre, imposto, construções e Forte Cinzento ----------
const BN = { forja: "⚒", mina: "⛏", quartel: "⚔", cambio: "⚖" };
export async function renderClanVault(el, box, data) {
  let v = data; if (!v) { try { v = await api.clanVault("ver"); } catch (e) { el.innerHTML = esc(e.message); return; } }
  const lead = v.role !== "membro", cfgB = v.config.buildings, cost = cfgB.cost, maxL = cfgB.max_level;
  const costTxt = l => `${fmt(Math.round(cost.gold_base * Math.pow(l, cost.gold_pow)))} gold · ${cost.tabua_comum * l} tábua · ${cost.pedra * l} pedra · ${cost.barra_ferro * l} barra de ferro${l >= cost.diamante_bruto_from ? ` · ${l - cost.diamante_bruto_from + 1} diamante bruto` : ""}`;
  const run = (a, args, msg) => api.clanVault(a, args).then(r => { if (r.state) applyServerSafe(r.state); toast(msg); renderClanVault(el, box, r); }).catch(e => toast(e.message, true));
  el.innerHTML = `<div class="split"><div><h4>Cofre do clã</h4><div class="row"><span>Gold</span><b>🪙 ${fmt(v.vault?.gold || 0)}</b></div><div class="row"><span>Gemas</span><b>💎 ${fmt(v.vault?.gems || 0)}</b></div>
      <div class="tradeitems">${v.stacks.map(x => `<span class="chip">${esc(tpl(x.t).name)} ×${x.qty} <small>${x.purity}%</small></span>`).join("") || '<span class="muted">Sem materiais.</span>'}</div>
      <div class="row"><input id="cvGold" type="number" min="0" placeholder="gold" style="width:90px"><input id="cvGems" type="number" min="0" placeholder="gemas" style="width:80px"><button id="cvDep">Depositar</button>${lead ? `<button id="cvSaq">Sacar</button>` : ""}</div>
      <div class="row"><select id="cvStack">${S.stacks.map(x => `<option value="${x.t}|${x.purity}">${esc(tpl(x.t).name)} ${x.purity}% (${x.qty})</option>`).join("")}</select><input id="cvQty" type="number" min="1" value="1" style="width:64px"><button id="cvDepS">Depositar material</button></div>
      ${lead ? `<div class="row"><select id="cvVStack">${v.stacks.map(x => `<option value="${x.t}|${x.purity}">${esc(tpl(x.t).name)} ${x.purity}% (${x.qty})</option>`).join("")}</select><button id="cvSaqS">Sacar material</button></div>` : ""}
      <h4>Imposto de caça</h4><p class="muted">Parte do gold que cada membro ganha caçando vai direto pro cofre.</p><div class="row"><span>Alíquota</span><b>${v.tax_pct}%</b></div>${v.role === "lider" ? `<div class="row"><input id="cvTax" type="range" min="0" max="${v.config.tax_max}" value="${v.tax_pct}"><b id="cvTaxV">${v.tax_pct}%</b><button id="cvTaxGo">Definir</button></div>` : ""}</div>
    <div><h4>Sede do clã</h4>${["forja", "mina", "quartel", "cambio"].map(b => { const l = v.buildings[b] || 0; return `<div class="order"><div class="row"><b>${BN[b]} ${esc(cfgB[b].name)}</b><small>nível ${l}/${maxL}</small></div><small class="muted">${esc(cfgB[b].bonus)}</small>${l < maxL ? `<small>Próximo nível: ${costTxt(l + 1)}</small>${lead ? `<button data-build="${b}">Construir nível ${l + 1}</button>` : ""}` : '<small class="tag good">máximo</small>'}</div>`; }).join("")}
      <h4>Forte Cinzento</h4><div class="row"><span>Domínio</span><b>${v.fort.owner ? `[${esc(v.fort.owner_tag)}] ${esc(v.fort.owner)}${v.fort.mine ? " (vocês!)" : ""}` : "ninguém"}</b></div><p class="muted">Quem domina coleta o mitril e o diamante do Forte e recebe ${Math.round(0.2 * 100)}% das taxas do Market. Pontos vêm de caçar na Floresta Sombria e de entregar suprimentos ao Comandante.</p>
      ${v.fort.ranking.map((r, i) => `<div class="row"><span>${i + 1}. [${esc(r.tag)}] ${esc(r.clan)}</span><b>${fmt(r.points)}</b></div>`).join("") || '<div class="muted">Sem disputa ainda.</div>'}
      <div class="actions"><button id="cvSup">Entregar suprimentos (${fmt(v.config.fort.supply.gold)} gold + ${v.config.fort.supply.barra_ferro} barras + ${v.config.fort.supply.tabua_comum} tábuas)</button></div></div></div>
    <h4>Histórico do cofre</h4><div class="vlogs">${v.logs.map(l => `<div class="row"><small>${new Date(l.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${esc(l.name || "")}</small><small>${esc(l.action)} ${l.amount != null ? fmt(l.amount) + " " + (l.currency || "") : ""}${l.template_id ? " " + esc(tpl(l.template_id).name || l.template_id) + (l.qty ? " ×" + l.qty : "") : ""}</small></div>`).join("") || '<div class="muted">Vazio.</div>'}</div>`;
  const q = id => el.querySelector("#" + id);
  q("cvDep").onclick = () => run("depositar", { gold: +q("cvGold").value || 0, gems: +q("cvGems").value || 0 }, "Depositado no cofre");
  if (q("cvSaq")) q("cvSaq").onclick = () => run("sacar", { gold: +q("cvGold").value || 0, gems: +q("cvGems").value || 0 }, "Sacado do cofre");
  q("cvDepS").onclick = () => { const [t, pur] = (q("cvStack").value || "|").split("|"); if (!t) return; run("depositar", { t, purity: +pur, qty: +q("cvQty").value }, "Material no cofre"); };
  if (q("cvSaqS")) q("cvSaqS").onclick = () => { const [t, pur] = (q("cvVStack").value || "|").split("|"); if (!t) return; run("sacar", { t, purity: +pur, qty: +q("cvQty").value }, "Material sacado"); };
  if (q("cvTax")) { q("cvTax").oninput = e => q("cvTaxV").textContent = e.target.value + "%"; q("cvTaxGo").onclick = () => run("imposto", { pct: +q("cvTax").value }, "Imposto definido"); }
  el.querySelectorAll("[data-build]").forEach(b => b.onclick = () => run("construir", { building: b.dataset.build }, "Construído!"));
  q("cvSup").onclick = () => run("suprimentos", {}, "Suprimentos entregues ao Comandante");
}
import { applyServer as applyServerSafe } from "./sim.js";
