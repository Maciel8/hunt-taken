// Interface (modo servidor): painéis leem o estado vindo do servidor; ações chamam RPC e reaplicam o estado.
import { HOME } from "./data.js";
import { TOWNS, MW, MH } from "./data.js";
import { drawContinentMap, cityAtMap, cityPanel, bindCityPanel } from "./cities.js";
import { zoneInfo } from "./continent.js";
import { KING, VOC, MONS, ITEMS, RARITY, HUNTS, REGIONS, CAPITAL, ECON, WAR, TIERS, expFor, ZONES, zoneOf, CAPITAL_NAME } from "./data.js";
import { inRect, inVila, VILA, freeTile } from "./world.js";
import { REG } from "./geo.js";
import { ring, burst } from "./fx.js";
import { walkTo } from "./sim.js";
import { S, P, fmt, now, hpMax, manaMax, atkOf, defOf, power, expMult, lootMult, huntInfo, occupantsOf, huntStateOf, territoryOf, applyServer, goHunt, tierOf, arenaFight, donateWar, simulateWar, kingdomPower, dominant, log, emit } from "./sim.js";
import { A } from "./art.js";
import { api, auth } from "./net.js";
import { renderQuests, renderClan, renderTrades, questClick, questBtn, renderQuestbar, bindQuestbar, talkById } from "./social.js";
import { renderBestiary } from "./progress.js";
import { notifOn, notifPerm, enableNotif, disableNotif } from "./notify.js";
import { renderChar, renderProfs, renderWorkshop, refreshJobs, materialsHtml, stackCard, craftedLines, craftedActions, itemActionClick } from "./progress.js";
import { cam } from "./render.js";
import { renderMarket } from "./market2.js";
import { renderWallet } from "./wallet.js";
import { openWorlds, applyWorld, loadWorlds } from "./worlds.js";

const $ = id => document.getElementById(id);
let toastTimer;
export function toast(msg, bad) { const el = $("toast"); el.textContent = msg; el.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = "toast", 2600); }
const icon = name => A.sp[name] ? `<img class="ic" src="assets/sprites/${name}.png" alt="">` : `<span class="ic ph"></span>`;
const tpl = id => ITEMS[id] || { name: id, icon: "orb" };
const esc2 = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const itemLabel = it => `${tpl(it.template).name}${it.rarity ? " (" + RARITY[it.rarity].name + ")" : ""}`;
const rollTxt = it => Object.entries(it.roll || {}).map(([k, v]) => `+${v} ${k}`).join(" ");
const POP = { abundante: ["Abundante", "var(--mint)"], pressionada: ["Pressionada", "var(--gold)"], escassa: ["Escassa", "#ff9a5a"], colapso: ["Colapso", "var(--red)"] };
const TERR = { livre: ["Livre", "var(--muted)"], disputada: ["Disputada", "var(--gold)"], dominada: ["Dominada", "var(--mint)"] };

// chama RPC, aplica estado, mostra erro
export async function act(fn, okMsg) {
  try { const st = await fn(); if (st && st.character) applyServer(st); else if (st && st.state) applyServer(st.state); if (okMsg) toast(okMsg); renderAll(); return st; }
  catch (e) { toast(e.message || "erro", true); return null; }
}

export function renderAll() { if (!S.p) return; applyWorld(); renderQuestbar(); renderProfile(); renderField(); renderEquip(); renderHunt(); renderBehavior(); renderFeed(); renderEvent(); if (openTab && !["map", "equip", "quests", "clan", "trades", "market", "char", "profs", "workshop", "bestiary", "wallet", "shop"].includes(openTab)) renderTab(openTab); if (openTab === "workshop") refreshJobs(); const cb = document.querySelector("[data-tab=char]"); if (cb) cb.classList.toggle("ping", (S.pointsFree || 0) > 0 || (P().lvl >= 5 && (!P().classId || P().classId === "aventureiro"))); }

function renderProfile() {
  const p = P(); const a = p.expCur ?? expFor(p.lvl), b = p.expNext ?? expFor(p.lvl + 1);
  $("pname").textContent = p.name; $("pking").textContent = "Casa " + KING[p.king].name; $("pking").style.color = KING[p.king].color; $("pvoc").textContent = VOC[p.voc].name;
  $("plvl").textContent = p.lvl; $("pexp").textContent = `${fmt(p.exp - a)} / ${fmt(b - a)} xp`; $("expbar").style.width = Math.max(0, Math.min(100, (p.exp - a) / Math.max(1, b - a) * 100)) + "%";
  $("pgold").textContent = fmt(S.gold); $("pgems").textContent = fmt(S.gems || 0); $("ppots").textContent = p.pots; $("pusdt").textContent = (S.usdtEquiv || 0).toFixed(2); startAvatar();
  const boosts = [];
  for (const e of S.events) if (!e.hunt_id) boosts.push([e.payload?.name || "Evento", `+${Math.round((e.payload?.exp || 0) * 100)}% exp, +${Math.round((e.payload?.loot || 0) * 100)}% loot`, "mint"]);
  for (const e of S.events) if (e.hunt_id) { const h = HUNTS.find(x => x.id === e.hunt_id); boosts.push([e.payload?.name || e.type, `em ${h ? h.name : e.hunt_id}`, "gold"]); }
  boosts.push([KING[p.king].name, KING[p.king].bonus, "king"]);
  if (p.lvl < S.medianRival) boosts.push(["Boost de alcance", `×2 exp até o level ${Math.round(S.medianRival)}, mediana dos jogadores da semana`, "mint"]);
  if (p.premium) boosts.push(["Premium", "24 h off-line, taxa 3%", "gold"]);
  $("boosts").innerHTML = boosts.map(([a, b, c]) => `<div class="boost ${c}"><b>${a}</b><span>${b}</span></div>`).join("");
  $("multExp").textContent = `×${expMult(p).toFixed(2)}`; $("multLoot").textContent = `×${lootMult(p).toFixed(2)}`;
}
function renderField() {
  const p = P();
  $("hp").textContent = `${Math.floor(p.hp)} / ${hpMax(p)}`; $("hpbar").style.width = Math.max(0, Math.min(100, p.hp / hpMax(p) * 100)) + "%";
  $("mana").textContent = `${Math.floor(p.mana)} / ${manaMax(p)}`; $("manabar").style.width = Math.max(0, Math.min(100, p.mana / manaMax(p) * 100)) + "%";
  $("skSword").textContent = p.skills.sword; $("skDist").textContent = p.skills.distance; $("skMagic").textContent = p.skills.magic; $("skShield").textContent = p.skills.shield;
  const cs = S.cstats || {}; $("atk").textContent = cs.dps ?? Math.round(atkOf(p)); $("def").textContent = cs.def ?? Math.round(defOf(p)); $("pow").textContent = cs.crit != null ? cs.crit + "%" : Math.round(power(p)); if ($("dodge")) $("dodge").textContent = (cs.dodge ?? 0) + "%"; if ($("carry")) $("carry").textContent = `${S.carry?.used ?? 0}/${S.carry?.cap ?? 0} kg`; if ($("pclass")) $("pclass").textContent = (S.cls?.name || "Aventureiro") + (S.spec ? " · " + S.spec.name : "");
  const bag = S.inventory.filter(i => i.container === "bag").length, prot = S.inventory.filter(i => i.container === "protected").length;
  $("bag").textContent = `${bag} / ${ECON.BAG_CAP}${prot ? " +" + prot + "🔒" : ""}`; $("bless").textContent = p.bless ? "sim" : "não";
  $("btnBless").disabled = p.bless || S.gold < ECON.BLESS_COST || p.task !== "idle";
  const hh = p.huntId && HUNTS.find(x => x.id === p.huntId);
  $("task").textContent = p.task === "idle" ? (inVila(p.x, p.y) ? "na " + CAPITAL_NAME : "parado") : p.task === "walk" ? "andando" : p.task === "goto" ? `indo pra ${hh ? hh.name : "hunt"}` : `caçando em ${hh ? hh.name : "hunt"}`;
  $("btnIdle").textContent = p.task === "idle" ? "Escolher hunt" : "Voltar pra vila"; $("task").title = $("task").textContent;
}
function renderEquip() {
  $("equip").innerHTML = ["weapon", "shield", "armor", "helmet", "ring", "amulet", "tool"].map(s => { const it = S.inventory.find(i => i.container === "equip" && i.slot === s); return `<div class="slot" data-slot="${s}" title="${it ? itemLabel(it) : SLOTN[s]}">${it ? icon(tpl(it.template).icon) : `<span class="ph">${SLOTN[s]}</span>`}${it ? `<i style="background:${RARITY[it.rarity].color}"></i>` : ""}</div>`; }).join("");
}
function renderHunt() {
  const p = P(); const hh = p.huntId ? HUNTS.find(x => x.id === p.huntId) : null;
  if (p.inDungeon) { const alive = S.mons.filter(m => m.dungeon && m.alive && m.hunt === p.huntId).length; $("huntName").textContent = "Caverna do Dragão"; $("huntStats").innerHTML = `<div class="row"><span>Sala</span><b>${p.huntId.replace("dg", "")} de 4</b></div><div class="row"><span>Inimigos na sala</span><b>${alive}</b></div><p class="muted">Limpe a sala. O servidor decide a etapa pelo seu poder.</p><div class="actions"><button id="btnDgLeave">Sair da caverna</button></div>`; $("occupants").innerHTML = ""; const b = $("btnDgLeave"); if (b) b.onclick = () => import("./dungeon.js").then(m => m.leaveRoom("dragao")); return; }
  if (!hh) { $("huntName").textContent = "Fora de hunt"; $("huntStats").innerHTML = `<div class="muted">Escolha uma hunt no Mapa ou clique numa área do mapa.</div>`; $("occupants").innerHTML = ""; return; }
  const i = huntInfo(hh, p), occ = occupantsOf(hh.id), hs = huntStateOf(hh.id), te = territoryOf(hh.id);
  $("huntName").textContent = hh.name;
  $("huntStats").innerHTML = `<div class="row"><span>Gold/h (sua parte)</span><b>${fmt(i.goldH * i.share)}</b></div><div class="row"><span>Exp/h</span><b>${fmt(i.expH * i.share)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>População</span><b style="color:${POP[hs.state][1]}">${POP[hs.state][0]} ${Math.round(hs.population)}%</b></div><div class="row"><span>Território</span><b style="color:${TERR[te.state][1]}">${TERR[te.state][0]}${te.top ? " · " + (te.top.id === p.serverId ? "você" : "outro jogador") + " " + Math.round(te.top.influence) : ""}</b></div><div class="row"><span>Risco de morte</span><b>${Math.round(i.danger * 100)}%</b></div>${S.session ? `<small class="muted">Nesta sessão</small><div class="sess"><span>${fmt(S.session.totals?.exp || 0)} exp</span><span>${fmt(S.session.totals?.gold || 0)} gold</span><span>${S.session.totals?.kills || 0} abates</span></div>` : ""}`;
  $("occupants").innerHTML = occ.map(o => o.type === "char" && o.id === p.serverId ? `<div class="occ"><i class="dot" style="background:${KING[o.kingdom].color}"></i><span class="name">${o.name} (você)</span></div>` : `<div class="occ"><i class="dot" style="background:${KING[o.kingdom].color}"></i><span class="name">${o.name} · lv ${o.level} · ${VOC[o.vocation]?.name || ""} <small class="muted">online</small></span></div>`).join("");
}
function renderBehavior() { const b = P().behavior || {}; $("bPostura").value = b.postura || "equilibrada"; $("bAlvo").value = b.alvo || "proximo"; $("bPocao").value = b.pocao ?? 50; $("bPocaoV").textContent = (b.pocao ?? 50) + "%"; $("bRecuo").value = String(b.recuo ?? 20); $("bRepo").value = b.reposicao || "mochila"; $("bObj").value = b.objetivo || "exp"; $("bPots").value = b.pots_buy ?? 10; }
export function renderFeed() { $("feed").innerHTML = S.feed.slice(0, 40).map(f => { const txt = String(f.msg).replace(/<[^>]+>/g, ""); return `<li title="${txt.replace(/"/g, "&quot;")}"><time>${f.t}</time><i class="fi ${f.kind || ""}"></i><span>${f.msg}</span></li>`; }).join(""); }
const SLOTN = { weapon: "arma", shield: "escudo", armor: "armadura", helmet: "elmo", ring: "anel", amulet: "amuleto", tool: "ferramenta" };
// retrato do personagem: sprite real em zoom 3×, respirando/andando
let avatarRaf = 0, avatarKey = "";
function startAvatar() { const p = P(), k = p.voc + p.king + (p.seed || 0); if (avatarRaf && k === avatarKey) return; avatarKey = k; cancelAnimationFrame(avatarRaf); const c = $("avatar"); if (!c) return; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; let t0 = 0;
  const loop = t => { avatarRaf = requestAnimationFrame(loop); if (t - t0 < 120 || !window.__charSprite) return; t0 = t; const q = P(); if (!q) return; const fr = q.moving ? Math.floor(t / 120) % 6 : -1, bob = q.moving ? 0 : Math.round(Math.sin(t / 400)); g.clearRect(0, 0, 56, 56); g.drawImage(window.__charSprite(q.voc, q.king, "down", fr, q.seed || 0), 4, -2 + bob, 48, 69); };
  avatarRaf = requestAnimationFrame(loop); }
function renderEvent() { const e = S.events.find(x => !x.hunt_id); const el = $("eventBar"); if (!e) { el.hidden = true; return; } el.hidden = false; const left = new Date(e.ends_at) - now(); const hh = Math.floor(left / 3600000), mm = Math.floor(left % 3600000 / 60000); el.textContent = `EVENTO: ${e.payload?.name || e.type} · +${Math.round((e.payload?.exp || 0) * 100)}% exp · +${Math.round((e.payload?.loot || 0) * 100)}% loot · ${hh}h ${String(mm).padStart(2, "0")}m`; }

// ---------- abas ----------
let openTab = null;
export function openModal(tab) { openTab = tab; $("modal").hidden = false; renderTab(tab); }
export function closeModal() { openTab = null; $("modal").hidden = true; }
async function renderTab(tab) {
  setTimeout(paintDoll, 0);
  const p = P(); const box = $("modalBody"); $("modalTitle").textContent = { wallet: "Carteira (USDT)", bestiary: "Bestiário", char: "Personagem", profs: "Ofícios", workshop: "Oficina", quests: "Missões", clan: "Clã", trades: "Trocas entre jogadores", map: "Mapa", market: "Market", equip: "Equipamento e mochila", ranks: "Ranks", arena: "Arena ranqueada (protótipo local)", war: "Guerra das Casas (protótipo local)", session: "Sessão", settings: "Conta e ajustes" }[tab];
  if (tab === "map") {
    mapMode = (P().x < 0 || P().y < 0 || P().x >= 300 || (P().y >= 200 && P().y < 4816)) ? "continent" : mapMode;
    box.innerHTML = `<div class="mapmode"><button data-mm="heart" class="${mapMode === "heart" ? "on" : ""}">Arken e arredores</button><button data-mm="continent" class="${mapMode === "continent" ? "on" : ""}">Continente</button></div><div class="mapsel"><div class="list">${REGIONS.map(r => `<div class="region ${p.lvl >= r.lvl ? "" : "locked"}" data-region="${r.id}"><div class="rh">${r.name} <small>${r.realm} · ${r.tier} · nível ${r.lvl}+</small> <span class="zone ${r.zone}">${ZONES[r.zone].name}</span></div>${HUNTS.filter(x => x.region === r.id).map(x => { const i = huntInfo(x, p), hs = huntStateOf(x.id), te = territoryOf(x.id), ev = S.events.find(e => e.hunt_id === x.id); return `<div class="hunt" data-hunt="${x.id}"><div><b>${x.name}</b>${ev ? ` <i class="tag good">${ev.payload?.name || ev.type}</i>` : ""}<small>${i.m.name} lv ${i.m.lvl} · <span style="color:${POP[hs.state][1]}">${POP[hs.state][0]}</span> · <span style="color:${TERR[te.state][1]}">${TERR[te.state][0]}</span></small></div><div class="hn"><b>${fmt(i.goldH)}</b><small>gold/h</small></div></div>`; }).join("")}</div>`).join("")}</div><div class="mapside"><canvas id="worldMap" width="900" height="600"></canvas><div class="analyser" id="analyser"><div class="muted">Passe o mouse numa região ou área de caça. O mapa mostra onde fica e você pode se teleportar.</div></div></div></div>`;
    sel = { region: regionOfPlayer(), hunt: P().huntId };
    box.querySelectorAll("[data-mm]").forEach(b => b.addEventListener("click", () => { mapMode = b.dataset.mm; box.querySelectorAll("[data-mm]").forEach(x => x.classList.toggle("on", x === b)); drawWorldMap(); }));
    drawWorldMap();
    box.querySelectorAll(".hunt").forEach(el => { const go = () => { const hh0 = HUNTS.find(h => h.id === el.dataset.hunt); sel = { region: hh0.region, hunt: el.dataset.hunt }; if (hh0.city) mapMode = "continent"; drawWorldMap(); showAnalyser(el.dataset.hunt); }; el.addEventListener("mouseenter", go); el.addEventListener("click", go); });
    box.querySelectorAll(".rh").forEach(el => el.addEventListener("click", () => { const r = el.parentElement.dataset.region; sel = { region: r, hunt: null }; drawWorldMap(); showRegion(r); }));
    const cvm = $("worldMap");
    cvm.addEventListener("click", ev => { const r = cvm.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * 1200, y = (ev.clientY - r.top) / r.height * 800;
      if (mapMode === "continent") { const c = cityAtMap((ev.clientX - r.left) / r.width * cvm.width, (ev.clientY - r.top) / r.height * cvm.height, cvm.width, cvm.height); if (c) { sel = { region: c.id, hunt: null }; drawWorldMap(); showRegion(c.id); } return; } let best = null, bd = 30; for (const h of HUNTS) { const d = Math.hypot(h.cx * 4 - x, h.cy * 4 - y); if (d < bd) { bd = d; best = h; } } if (best) { sel = { region: best.region, hunt: best.id }; drawWorldMap(); showAnalyser(best.id); } else { const reg = regionAtDesign(x, y); sel = { region: reg, hunt: null }; drawWorldMap(); showRegion(reg); } });
    animMap();
  } else if (tab === "shop") { /* a loja desenha a si mesma (shops.js) */
  } else if (tab === "market") { renderMarket(box);
  } else if (tab === "wallet") { renderWallet(box);
  } else if (tab === "market_old") {
    box.innerHTML = `<div class="tabs2"><button data-sub="npc" class="on">Loja (NPC)</button><button data-sub="players">Mercado de jogadores</button><button data-sub="sell">Vender / anunciar</button></div><div id="sub"><div class="muted">carregando…</div></div>`;
    const sub = async s => { box.querySelectorAll("[data-sub]").forEach(b => b.classList.toggle("on", b.dataset.sub === s)); const el = $("sub");
      if (s === "npc") el.innerHTML = `<p class="muted">Compra só na capital. ${p.task !== "idle" ? "Você está fora da capital." : ""}</p><div class="grid3">${["potion", "espada_aco", "escudo_madeira", "escudo_aco", "armadura_couro", "armadura_aco", "capacete_aco", "arco"].map(id => { const d = ITEMS[id]; return `<div class="card2">${icon(d.icon)}<b>${d.name}</b><small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""}${d.heal ? "cura " + d.heal : ""}${d.voc ? " · " + d.voc.map(v => VOC[v].name).join("/") : ""}</small><div class="price">${fmt(d.price)} gold</div><button data-buy="${id}" ${p.task !== "idle" ? "disabled" : ""}>Comprar${id === "potion" ? " ×5" : ""}</button></div>`; }).join("")}</div>`;
      else if (s === "players") { el.innerHTML = `<div class="muted">carregando…</div>`; const ls = await api.market().catch(() => []); el.innerHTML = `<p class="muted">Mercado da comunidade. Cada anúncio é em gold ou em gemas. Taxa de 5% pro vendedor. Compra e venda são atômicas no servidor.</p><div class="grid3">${ls.map(l => { const d = tpl(l.item.template); return `<div class="card2"><span class="rar" style="color:${RARITY[l.item.rarity].color}">${RARITY[l.item.rarity].name}</span>${icon(d.icon)}<b>${d.name}</b><small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""} ${rollTxt(l.item)}</small><small>de <span style="color:${KING[l.seller_kingdom]?.color || "#fff"}">${l.seller}</span></small><div class="price">${l.currency === "gems" ? "💎 " + fmt(l.price) + " gemas" : "🪙 " + fmt(l.price) + " gold"}</div>${l.mine ? `<button data-cancel="${l.id}">Cancelar</button>` : `<button data-buylist="${l.id}">Comprar</button>`}</div>`; }).join("") || '<div class="muted">Nenhum anúncio aberto.</div>'}</div>`; }
      else { const mine = S.inventory.filter(i => i.container === "bag" || i.container === "protected"); el.innerHTML = `<p class="muted">Vender pro NPC paga o preço tabelado na hora. Anunciar põe no mercado da comunidade por 7 dias, em gold ou gemas.</p><div class="grid3">${mine.map(it => { const d = tpl(it.template); return `<div class="card2"><span class="rar" style="color:${RARITY[it.rarity].color}">${RARITY[it.rarity].name}${it.container === "protected" ? " 🔒" : ""}</span>${icon(d.icon)}<b>${d.name}</b><small>NPC paga ${fmt(it.value)}</small><button data-sell="${it.id}">Vender ${fmt(it.value)}</button><div class="listf"><input type="number" min="1" value="${it.value * 3}" id="lp-${it.id}"><select id="lc-${it.id}"><option value="gold">gold</option><option value="gems">gemas</option></select><button data-list="${it.id}">Anunciar</button></div></div>`; }).join("") || '<div class="muted">Mochila vazia.</div>'}</div>`; }
    };
    box.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => sub(b.dataset.sub))); sub("npc");
  } else if (tab === "equip") {
    const eq = sl => S.inventory.find(i => i.container === "equip" && i.slot === sl), bag = S.inventory.filter(i => i.container === "bag"), prot = S.inventory.filter(i => i.container === "protected");
    const slotHtml = (it, extra = "") => it ? `<button class="slotv r${it.rarity}" data-item="${it.id}" ${extra} title="${itemLabel(it)}">${icon(tpl(it.template).icon)}${it.container === "protected" ? '<i class="lock">🔒</i>' : ""}</button>` : `<div class="slotv empty" ${extra}></div>`;
    const doll = [["helmet", "Elmo"], ["weapon", "Arma"], ["armor", "Armadura"], ["shield", "Escudo"], ["ring", "Anel"], ["amulet", "Amuleto"], ["tool", "Ferramenta"]].map(([sl, n]) => `<div class="dslot ds-${sl}"><small>${n}</small>${eq(sl) ? slotHtml(eq(sl)) : `<div class="slotv empty"></div>`}</div>`).join("");
    box.innerHTML = `<div class="inv"><div class="dollbox"><div class="doll">${doll}<div class="dollfig">${charImg(p)}</div></div><div class="row"><span>Ataque</span><b>${Math.round(atkOf(p))}</b></div><div class="row"><span>Defesa</span><b>${Math.round(defOf(p))}</b></div><div class="row"><span>Poder</span><b>${Math.round(power(p))}</b></div><div class="row"><span>Gold</span><b style="color:var(--gold)">${fmt(S.gold)}</b></div><div class="row"><span>Gemas</span><b style="color:#7fd8ff">${fmt(S.gems || 0)}</b></div></div>
      <div><h4>Mochila ${bag.length}/${ECON.BAG_CAP}</h4><div class="bag">${Array.from({ length: ECON.BAG_CAP }, (_, i) => slotHtml(bag[i])).join("")}</div>
      <h4>Protegidos ${prot.length}/5 <small class="muted">não caem na morte</small></h4><div class="bag prot">${Array.from({ length: 5 }, (_, i) => slotHtml(prot[i])).join("")}</div>
      ${materialsHtml()}
      <div class="itemcard" id="itemCard"><div class="muted">Clique num item ou material pra ver os atributos e o que dá pra fazer com ele.</div></div></div></div>`;
  } else if (tab === "bestiary") { renderBestiary(box);
  } else if (tab === "char") { renderChar(box);
  } else if (tab === "profs") { renderProfs(box);
  } else if (tab === "workshop") { renderWorkshop(box);
  } else if (tab === "quests") { renderQuests(box);
  } else if (tab === "clan") { renderClan(box);
  } else if (tab === "trades") { renderTrades(box);
  } else if (tab === "ranks") {
    box.innerHTML = `<p class="muted">Só contas reais. ${S.online} jogador(es) online agora.</p><div class="split"><div><h4>Por level</h4>${S.ranking.map((r, i) => `<div class="row"><span>${i + 1}. <i class="dot" style="background:${KING[r.kingdom].color}"></i> ${r.name}${r.name === p.name ? " (você)" : ""} <small>${VOC[r.vocation]?.name || ""}</small></span><b>${r.level}</b></div>`).join("") || '<div class="muted">Ninguém ainda.</div>'}</div><div><h4>Território (influência)</h4>${HUNTS.map(h => { const te = territoryOf(h.id); return `<div class="row"><span>${h.name}</span><b style="color:${TERR[te.state][1]}">${TERR[te.state][0]}${te.top ? " · " + (te.top.id === p.serverId ? "você" : "outro jogador") : ""}</b></div>`; }).join("")}</div></div>`;
  } else if (tab === "arena") {
    const t = S.pvp.tactic, tier = TIERS[tierOf(S.pvp.rating)];
    box.innerHTML = `<p class="warn">Arena ainda roda só no seu navegador (fase 7 do plano). Rating não vai pro servidor.</p><div class="split"><div><h4>Sua tática (secreta)</h4><label>Beber poção abaixo de <b id="tPotV">${t.potionAt}%</b><input type="range" min="10" max="90" value="${t.potionAt}" id="tPot"></label><label>Recuar pra curar abaixo de <b id="tRetV">${t.retreatAt}%</b><input type="range" min="0" max="60" value="${t.retreatAt}" id="tRet"></label><label>Abertura <select id="tOpen"><option value="forte" ${t.opener === "forte" ? "selected" : ""}>Golpe forte</option><option value="normal" ${t.opener === "normal" ? "selected" : ""}>Normal</option></select></label><label>Postura <select id="tStance"><option value="equilibrado" ${t.stance === "equilibrado" ? "selected" : ""}>Equilibrada</option><option value="agressivo" ${t.stance === "agressivo" ? "selected" : ""}>Agressiva</option><option value="defensivo" ${t.stance === "defensivo" ? "selected" : ""}>Defensiva</option></select></label><div class="row"><span>Rating</span><b>${S.pvp.rating} · ${tier[0]}</b></div><div class="row"><span>Vitórias / derrotas</span><b>${S.pvp.wins} / ${S.pvp.losses}</b></div></div><div><h4>Desafiar</h4>${S.bots.map((b, i) => b.player ? "" : `<div class="row"><span><i class="dot" style="background:${KING[b.king].color}"></i> ${b.name} <small>lv ${b.lvl} · ${b.rating}</small></span><button data-fight="${i}">Lutar</button></div>`).join("")}<div id="fightLog">${S.pvp.log.slice(0, 3).map(l => `<div class="flog ${l.win ? "good" : "bad"}"><b>${l.t} vs ${l.vs}: ${l.win ? "vitória" : "derrota"} (${l.delta > 0 ? "+" : ""}${l.delta})</b>${l.lines.slice(-4).map(x => `<small>${x}</small>`).join("")}</div>`).join("")}</div></div></div>`;
    $("tPot").oninput = e => { t.potionAt = +e.target.value; $("tPotV").textContent = t.potionAt + "%"; }; $("tRet").oninput = e => { t.retreatAt = +e.target.value; $("tRetV").textContent = t.retreatAt + "%"; }; $("tOpen").onchange = e => t.opener = e.target.value; $("tStance").onchange = e => t.stance = e.target.value;
  } else if (tab === "war") {
    const left = S.war.next - now(), d = Math.floor(left / 86400000), hh = Math.floor(left % 86400000 / 3600000), mm = Math.floor(left % 3600000 / 60000), dom = dominant();
    box.innerHTML = `<p class="warn">Guerra ainda roda só no seu navegador (fase 7 do plano).</p><div class="row"><span>Próxima guerra</span><b>${d}d ${hh}h ${mm}m (sábado 15:00)</b></div><div class="row"><span>Reino dominante</span><b>${dom ? KING[dom].name : "nenhum"}</b></div><div class="terr">${WAR.territories.map(t => `<div class="t" style="border-color:${KING[S.war.owner[t]].color}"><b>${t}</b><small style="color:${KING[S.war.owner[t]].color}">${KING[S.war.owner[t]].name}</small></div>`).join("")}</div>${Object.keys(KING).map(k => `<div class="row"><span><i class="dot" style="background:${KING[k].color}"></i> ${KING[k].name}</span><b>${fmt(S.war.supplies[k])} suprimentos · poder ${fmt(kingdomPower(k))}</b></div>`).join("")}<div class="actions"><button id="btnSimWar" class="danger">Simular a guerra agora</button></div>`;
    $("btnSimWar").onclick = () => { simulateWar(); renderTab("war"); };
  } else if (tab === "session") {
    const t = S.session?.totals || {}, since = S.session ? (now() - new Date(S.session.started_at)) / 3600000 : 0, hrs = Math.max(1 / 60, since);
    box.innerHTML = S.session ? `<p class="muted">Sessão atual em ${HUNTS.find(h => h.id === S.session.hunt_id)?.name || "hunt"}, começou às ${new Date(S.session.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Números calculados pelo servidor.</p><div class="grid3">${[["Tempo", `${Math.floor(hrs)}h ${Math.floor(hrs % 1 * 60)}m`], ["Exp", fmt(t.exp || 0)], ["Exp/h", fmt((t.exp || 0) / hrs)], ["Gold", fmt(t.gold || 0)], ["Gold/h", fmt((t.gold || 0) / hrs)], ["Abates", t.kills || 0], ["Mortes", t.deaths || 0], ["Poções", t.pots || 0], ["Drops raros", t.drops || 0]].map(([a, b]) => `<div class="card2"><b class="big">${b}</b><small>${a}</small></div>`).join("")}</div>` : `<div class="muted">Sem sessão ativa. Totais de vida: ${fmt(p.killsTotal || 0)} abates, ${p.deathsTotal || 0} mortes.</div>`;
  } else if (tab === "settings") {
    const s = await auth.session();
    box.innerHTML = `<div class="row"><span>Conta</span><b>${s?.user?.email || "—"}</b></div><div class="row"><span>Personagem</span><b>${p.name} · ${S.cls?.name || "Aventureiro"} · Casa ${KING[p.king].name}</b></div><div class="row"><span>Avisos de troca e convite de clã</span><button id="btnNotif">${notifOn() ? (notifPerm() === "granted" ? "Ligados" : "Ligados na tela · ativar no navegador") : "Desligados"}</button></div><div class="actions"><button id="btnLogout">Sair da conta</button></div><p class="muted">Seu progresso fica no servidor. Pode entrar de qualquer dispositivo com o mesmo e-mail.</p>`;
    $("btnNotif").onclick = async () => { if (notifOn() && notifPerm() !== "default") disableNotif(); else await enableNotif(); renderTab("settings"); };
    $("btnLogout").onclick = async () => { await auth.signOut(); location.reload(); };
  }
}
// ---------- mapa-múndi da aba Mapa ----------
let sel = { region: null, hunt: null }, mapRaf = 0;
const REGION_POLY = { floresta: [REG.floresta], pantano: [REG.pantano], minas: [REG.minas, REG.serraLeste], montanhas: [REG.montanhas], ruinas: [REG.ruinas] };
const REGION_TP = { vila: "Vila de Arken", campos: "Aldeia do Celeiro", floresta: "Forte Cinzento", pantano: "Vau dos Juncos", minas: "Acampamento Mineiro", montanhas: "Posto da Serra", ruinas: "Portão Partido" };
function regionOfPlayer() { const p = P(); if (p.x < 0 || p.y < 0 || p.x >= 300 || (p.y >= 200 && p.y < 4816)) { const z = zoneInfo(p.x, p.y); if (z.city) return z.city.id; } return inVila(p.x, p.y) ? "vila" : (HUNTS.find(h => h.id === p.huntId)?.region || "campos"); }
function pointIn(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function regionAtDesign(x, y) { if (((x - VILA.cx) / VILA.rx) ** 2 + ((y - VILA.cy) / VILA.ry) ** 2 < 1) return "vila"; for (const k of ["ruinas", "montanhas", "minas", "pantano", "floresta"]) if (REGION_POLY[k].some(p => pointIn(p, x, y))) return k; return "campos"; }
function regionPath(g, id, keep) {
  if (!keep) g.beginPath();
  if (id === "vila") { g.ellipse(VILA.cx, VILA.cy, VILA.rx, VILA.ry, 0, 0, 6.283); return; }
  if (id === "campos") { g.rect(0, 0, 1200, 800); for (const k of ["floresta", "pantano", "minas", "montanhas", "ruinas"]) for (const p of REGION_POLY[k]) { g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]); g.closePath(); } g.moveTo(VILA.cx + VILA.rx, VILA.cy); g.ellipse(VILA.cx, VILA.cy, VILA.rx, VILA.ry, 0, 0, 6.283, true); return; }
  for (const p of REGION_POLY[id] || []) { g.moveTo(p[0][0], p[0][1]); for (const q of p) g.lineTo(q[0], q[1]); g.closePath(); }
}
let mapMode = "heart";
function drawWorldMap() {
  const c = $("worldMap"); if (!c || !A.paint) return; const g = c.getContext("2d"), k = c.width / 1200, t = performance.now() / 1000;
  if (mapMode === "continent") { const m = drawContinentMap(g, c.width, c.height, sel.region, t); if (m) for (const h of HUNTS) if (h.city) { const on = h.id === sel.hunt; g.fillStyle = ["#7fd07a", "#f0c24a", "#e0524a"][h.ring - 1]; g.strokeStyle = "#171522"; g.lineWidth = 1.5; g.beginPath(); g.arc(m.tx(h.cx), m.ty(h.cy), on ? 6 : 4, 0, 6.283); g.fill(); g.stroke(); } return; }
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(A.paint, 0, 0, c.width, c.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  if (sel.region && !REGIONS.find(x => x.id === sel.region)?.city) {
    // escurece tudo e devolve o brilho da região escolhida
    g.save(); g.fillStyle = "rgba(10,8,14,.6)"; g.beginPath(); g.rect(0, 0, 1200, 800); regionPath(g, sel.region, true); g.fill("evenodd"); g.restore();
    g.save(); regionPath(g, sel.region); g.strokeStyle = "#f2c46b"; g.lineWidth = 4; g.shadowColor = "#ffcf5a"; g.shadowBlur = 18; g.stroke(); g.restore();
  }
  for (const h of HUNTS) { if (h.city) continue; const x = h.cx * 4, y = h.cy * 4, on = h.id === sel.hunt, inReg = h.region === sel.region, z = REGIONS.find(r => r.id === h.region).zone;
    if (on) { g.strokeStyle = "rgba(255,210,120,.9)"; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 18 + Math.sin(t * 4) * 4, 0, 6.283); g.stroke(); }
    g.fillStyle = { protegida: "#7aa0b8", conflito: "#c4504f", guerra: "#a98bd6", segura: "#7ea06a" }[z]; g.globalAlpha = inReg || on || !sel.region ? 1 : .45; g.strokeStyle = "#171522"; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, on ? 13 : 10, 0, 6.283); g.fill(); g.stroke();
    g.fillStyle = "#171522"; g.font = "800 10px JetBrains Mono, monospace"; g.textAlign = "center"; g.fillText(String(MONS[h.mon].lvl), x, y + 3.5); g.globalAlpha = 1; }
  for (const tw of TOWNS) { g.fillStyle = "#f3ead6"; g.strokeStyle = "#171522"; g.lineWidth = 2; g.beginPath(); g.moveTo(tw.x, tw.y - 8); g.lineTo(tw.x + 7, tw.y + 5); g.lineTo(tw.x - 7, tw.y + 5); g.closePath(); g.fill(); g.stroke(); }
  // você
  const p = P(); g.fillStyle = "#fff"; g.beginPath(); g.arc(p.x * 4, p.y * 4, 7, 0, 6.283); g.fill(); g.fillStyle = KING[p.king].color; g.beginPath(); g.arc(p.x * 4, p.y * 4, 4.5, 0, 6.283); g.fill();
  // placa da região
  if (sel.region && !REGIONS.find(x => x.id === sel.region)?.city) { const r = REGIONS.find(x => x.id === sel.region); g.setTransform(1, 0, 0, 1, 0, 0); g.font = "700 20px Cinzel, serif"; const w = g.measureText(r.name).width + 36; g.fillStyle = "rgba(10,8,14,.88)"; g.fillRect(14, 14, w, 50); g.strokeStyle = "#C18B36"; g.lineWidth = 2; g.strokeRect(15, 15, w - 2, 48); g.fillStyle = "#f3ead6"; g.textAlign = "left"; g.fillText(r.name, 32, 42); g.font = "700 12px Cinzel, serif"; g.fillStyle = "#d9c79b"; g.fillText(`level ${r.lvl}+ · ${ZONES[r.zone].name}`, 32, 58); }
}
function animMap() { cancelAnimationFrame(mapRaf); const loop = () => { if (openTab !== "map" || !$("worldMap")) return; drawWorldMap(); mapRaf = requestAnimationFrame(loop); }; mapRaf = requestAnimationFrame(loop); }
function showRegion(id) {
  if (REGIONS.find(x => x.id === id)?.city) { $("analyser").innerHTML = cityPanel(id); bindCityPanel($("analyser")); return; }
  const r = REGIONS.find(x => x.id === id), town = TOWNS.find(t => t.name === REGION_TP[id]), hs = HUNTS.filter(h => h.region === id);
  $("analyser").innerHTML = `<h4>${r.name} <span class="zone ${r.zone}">${ZONES[r.zone].name}</span></h4><p class="muted">${ZONES[r.zone].desc}</p><div class="row"><span>Nível recomendado</span><b>${r.lvl}+</b></div><div class="row"><span>Áreas de caça</span><b>${hs.length}</b></div>${hs.map(h => `<div class="row"><small>${h.name}</small><small>${MONS[h.mon].name} lv ${MONS[h.mon].lvl}</small></div>`).join("")}<div class="actions"><button class="primary" data-tp-town="${town.name}">Teleportar pra ${town.name}</button></div>`;
}
export function teleportTo(x, y) { const p = P(); ring(p, "#a98bd6"); burst(p, "#c9a8ff", 14, 3); p.x = x; p.y = y; p.path = []; p.target = null; ring(p, "#a98bd6"); burst(p, "#c9a8ff", 14, 3); cam.follow = true; cam.init = false; }
import("./chars.js").then(m => { window.__charSprite = m.charSprite; });
function paintDoll() { const c = document.querySelector(".dollc"); if (!c || !window.__charSprite) return; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height); g.drawImage(window.__charSprite(c.dataset.voc, c.dataset.king, "down", -1, P().seed || 0), 0, 0, 72, 104); }
function charImg(p) { return `<canvas class="dollc" width="72" height="104" data-voc="${p.voc}" data-king="${p.king}"></canvas>`; }
export function showItemCard(id) {
  const it = S.inventory.find(i => i.id === id); const el = $("itemCard"); if (!it || !el) return; const d = tpl(it.template), p = P(), can = d.slot && (!d.voc || d.voc.includes(p.voc) || d.props?.wtype);
  const R = RARITY[it.rarity];
  el.innerHTML = `<div class="ic-head"><div class="slotv r${it.rarity}">${icon(d.icon)}</div><div><b style="color:${R.color}">${esc2(it.roll?.custom_name || it.roll?.name || d.name)}</b>${it.roll?.custom_name ? `<small>${esc2(it.roll.name)}</small>` : ""}<small>${R.name}${d.slot ? " · " + (SLOTN[d.slot] || d.slot) : d.mat ? " · material" : ""}</small></div></div>
    ${d.atk ? `<div class="row"><span>Ataque</span><b>${d.atk}${it.roll?.atk ? " +" + it.roll.atk : ""}</b></div>` : ""}${d.def ? `<div class="row"><span>Defesa</span><b>${d.def}${it.roll?.def ? " +" + it.roll.def : ""}</b></div>` : ""}${it.roll?.skill ? `<div class="row"><span>Skill</span><b>+${it.roll.skill}</b></div>` : ""}${d.voc ? `<div class="row"><span>Vocação</span><b>${d.voc.map(v => VOC[v].name).join(", ")}</b></div>` : ""}<div class="row"><span>NPC paga</span><b style="color:var(--gold)">${fmt(it.value)}</b></div>
    ${craftedLines(it)}${it.roll?.realm ? `<div class="row"><small>Fabricado em</small><small>${esc2(it.roll.realm)}</small></div>` : ""}<div class="actions">${craftedActions(it)}${it.roll?.maker && !it.roll?.custom_name && ((it.roll.quality || 0) >= 80 || it.rarity >= 4) ? `<input id="rnName" maxlength="28" placeholder="nome do equipamento" style="width:150px"><button data-rename="${it.id}">Dar nome</button>` : ""}${it.container === "equip" ? `<button data-uneq="${d.slot}">Tirar</button>` : `${can ? `<button class="primary" data-eq="${it.id}">Equipar</button>` : ""}<button data-prot="${it.id}" data-on="${it.container === "protected" ? 0 : 1}">${it.container === "protected" ? "Desproteger" : "Proteger"}</button><button data-sell="${it.id}">Vender ${fmt(it.value)}</button>${d.slot ? `<button data-list="${it.id}" data-fair="${it.value * 3}">Anunciar</button>` : ""}`}</div>`;
}
function showAnalyser(id) {
  const p = P(), hh = HUNTS.find(x => x.id === id), i = huntInfo(hh, p), occ = occupantsOf(id), d = i.m.drop, hs = huntStateOf(id), te = territoryOf(id), ev = S.events.find(e => e.hunt_id === id);
  $("analyser").innerHTML = `<h4>${hh.name} <span class="zone ${zoneOf(hh)}">${ZONES[zoneOf(hh)].name}</span></h4><p class="muted">${ZONES[zoneOf(hh)].desc}</p><div class="row"><span>${i.m.name} lv ${i.m.lvl}</span><b>${i.m.hp} hp · ${i.m.atk} atk</b></div><div class="row"><span>População</span><b style="color:${POP[hs.state][1]}">${POP[hs.state][0]} ${Math.round(hs.population)}%</b></div><div class="row"><span>Território</span><b style="color:${TERR[te.state][1]}">${TERR[te.state][0]}</b></div>${te.list.slice(0, 3).map(x => `<div class="row"><small>${x.id === p.serverId ? "você" : "outro jogador"} (${KING[x.kingdom]?.name})</small><small>${Math.round(x.influence)} influência</small></div>`).join("")}${ev ? `<div class="row"><span>Evento</span><b style="color:var(--gold)">${ev.payload?.name || ev.type}</b></div>` : ""}<div class="row"><span>Gold/h cheia</span><b>${fmt(i.goldH)}</b></div><div class="row"><span>Exp/h cheia</span><b>${fmt(i.expH)}</b></div><div class="row"><span>Com ${i.occ} ocupante(s)</span><b>${fmt(i.goldH * i.share)} gold/h · ${fmt(i.expH * i.share)} exp/h</b></div><div class="row"><span>Poções/h</span><b>${Math.round(i.potsH)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>Risco de morte</span><b style="color:${i.danger > .4 ? "var(--red)" : i.danger > .15 ? "var(--gold)" : "var(--mint)"}">${Math.round(i.danger * 100)}%</b></div><div class="row"><span>Drop raro</span><b>${d ? `${ITEMS[d.item].name} (${(d.chance * 100 * (hh.rare || 1)).toFixed(1)}%)` : "nenhum"}</b></div><div class="row"><span>Ocupantes</span><b>${occ.map(o => o.name).join(", ") || "ninguém"}</b></div>${i.lvlOk ? "" : `<p class="warn">Seu level ${p.lvl} é baixo pra essa hunt (ideal ${Math.ceil(i.m.lvl * .6)}+). Rende metade.</p>`}<div class="actions"><button data-go="${id}" class="primary">${p.huntId === id ? "Já é sua hunt" : "Ir andando e caçar"}</button><button data-tp="${id}">Teleportar e caçar</button></div>`;
}
export function showHuntPop(hh, clientX, clientY) {
  const p = P(), i = huntInfo(hh, p), occ = occupantsOf(hh.id), el = $("huntPop"), wrap = el.parentElement.getBoundingClientRect(), hs = huntStateOf(hh.id), te = territoryOf(hh.id);
  el.innerHTML = `<div class="ph"><b>${hh.name}</b><button data-close="1" class="x">✕</button></div><div class="row"><span>${i.m.name} lv ${i.m.lvl}</span><b>${i.m.hp} hp</b></div><div class="row"><span>Zona</span><b style="color:${ZONES[zoneOf(hh)].color}">${ZONES[zoneOf(hh)].name}</b></div><div class="row"><span>População</span><b style="color:${POP[hs.state][1]}">${POP[hs.state][0]}</b></div><div class="row"><span>Território</span><b style="color:${TERR[te.state][1]}">${TERR[te.state][0]}</b></div><div class="row"><span>Gold/h</span><b>${fmt(i.goldH * i.share)}</b></div><div class="row"><span>Exp/h</span><b>${fmt(i.expH * i.share)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>Risco</span><b>${Math.round(i.danger * 100)}%</b></div><div class="row"><span>Ocupantes</span><b>${occ.map(o => o.name).join(", ") || "ninguém"}</b></div>${i.lvlOk ? "" : `<div class="warn">Level baixo pra cá (ideal ${Math.ceil(i.m.lvl * .6)}+)</div>`}<button data-go="${hh.id}" class="primary" style="width:100%;margin-top:6px">${p.huntId === hh.id ? "Já é sua hunt" : "Caçar aqui"}</button>`;
  el.hidden = false; const x = Math.min(clientX - wrap.left + 8, wrap.width - 230), y = Math.min(clientY - wrap.top + 8, wrap.height - 260); el.style.left = Math.max(8, x) + "px"; el.style.top = Math.max(8, y) + "px";
}
export function hideHuntPop() { $("huntPop").hidden = true; }

// ---------- eventos ----------
export function bindUI() {
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.tab)));
  $("modalClose").addEventListener("click", closeModal); $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  $("modalBody").addEventListener("click", async e => {
    const qg = e.target.closest("button[data-qg]"); if (qg) { closeModal(); return questBtn(qg); }
    const tq = e.target.closest("button[data-talkq]"); if (tq) { closeModal(); return talkById(tq.dataset.talkq); }
    const qb = e.target.closest("button[data-q]"); if (qb) { await questClick(qb); renderQuestbar(); return renderTab("quests"); }
    const sk = e.target.closest(".slotv[data-stack]"); if (sk) { $("modalBody").querySelectorAll(".slotv.sel").forEach(x => x.classList.remove("sel")); sk.classList.add("sel"); $("itemCard").innerHTML = stackCard(sk.dataset.stack); return; }
    const sb2 = e.target.closest("button[data-sellstack]"); if (sb2) { const [t, pur] = sb2.dataset.sellstack.split("|"); return act(() => api.sellStack(t, +pur, +($("sellQ")?.value || 1)).then(x => { toast(`+${x.gold} gold`); return x.state; })).then(() => renderTab("equip")); }
    const ia = e.target.closest("button[data-ia]"); if (ia) { await itemActionClick(ia); return renderTab("equip"); }
    const rn = e.target.closest("button[data-rename]"); if (rn) { const nm = ($("rnName")?.value || "").trim(); if (!nm) return toast("Escreva o nome no campo ao lado.", true); return act(() => api.renameItem(rn.dataset.rename, nm), "Nome gravado").then(() => renderTab("equip")); }
    const sl = e.target.closest(".slotv[data-item]"); if (sl) { $("modalBody").querySelectorAll(".slotv.sel").forEach(x => x.classList.remove("sel")); sl.classList.add("sel"); return showItemCard(sl.dataset.item); }
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.go) { if (P().huntId === b.dataset.go) return closeModal(); closeModal(); const st = await act(() => api.startHunt(b.dataset.go)); if (st) { goHunt(b.dataset.go); } return; }
    if (b.dataset.tp) { const h = HUNTS.find(x => x.id === b.dataset.tp); closeModal(); const st = P().huntId === h.id ? true : await act(() => api.startHunt(h.id)); if (st) { const f = freeTile({ ...h, r: h.r * .5 }); teleportTo(f.x, f.y); goHunt(h.id); toast(`Teleportado pra ${h.name}`); } return; }
    if (b.dataset.tpTown) { const t = TOWNS.find(x => x.name === b.dataset.tpTown); closeModal(); if (P().task === "hunt" || P().task === "goto") await act(() => api.returnHome()); P().task = "idle"; P().huntId = null; teleportTo(t.tx, t.ty + 3); toast(`Teleportado pra ${t.name}`); return; }
    if (b.dataset.buy) return act(() => api.buyShop(b.dataset.buy, b.dataset.buy === "potion" ? 5 : 1), "Comprado").then(() => renderTab("market"));
    if (b.dataset.buylist) return act(() => api.buyListing(b.dataset.buylist), "Comprado").then(() => renderTab("market"));
    if (b.dataset.cancel) return act(() => api.cancelListing(b.dataset.cancel), "Anúncio cancelado").then(() => renderTab("market"));
    if (b.dataset.sell) return act(() => api.sellNpc(b.dataset.sell), "Vendido").then(() => renderTab("market"));
    if (b.dataset.list) { const pr = document.getElementById("lp-" + b.dataset.list), cu = document.getElementById("lc-" + b.dataset.list); if (!pr) { openModal("market"); return setTimeout(() => document.querySelector("[data-sub=sell]")?.click(), 50); } return act(() => api.listItem(b.dataset.list, Math.floor(+pr.value), cu.value), "Anunciado").then(() => renderTab("market")); }
    if (b.dataset.eq) return act(() => api.equip(b.dataset.eq), "Equipado").then(() => renderTab("equip"));
    if (b.dataset.sell && openTab === "equip") return act(() => api.sellNpc(b.dataset.sell), "Vendido").then(() => renderTab("equip"));
    if (b.dataset.uneq) return act(() => api.unequip(b.dataset.uneq)).then(() => renderTab("equip"));
    if (b.dataset.prot) return act(() => api.protect(b.dataset.prot, b.dataset.on === "1")).then(() => renderTab("equip"));
    if (b.dataset.fight) { const r = arenaFight(S.bots[+b.dataset.fight]); toast(r.win ? `Venceu (+${r.delta})` : `Perdeu (${r.delta})`, !r.win); renderTab("arena"); }
  });
  if (false) $("occupants").addEventListener("click", async e => { const b = e.target.closest("button[data-bot]"); if (!b) return; b.disabled = true; const r = await act(() => api.challenge(b.dataset.bot)); if (r) { toast(r.win ? `HUNT TAKEN: você expulsou o rival (+${r.gold} gold)` : `Perdeu o desafio: expulso da hunt`, !r.win); log(r.win ? `Você expulsou um rival da hunt. +${r.gold} gold.` : `Você foi expulso da hunt pelo rival.`, r.win ? "good" : "bad"); if (!r.win) { P().task = "idle"; } } });
  $("btnBless").addEventListener("click", () => act(() => api.buyBless(), "Bênção comprada"));
  const goVila = () => act(() => api.returnHome(), "Voltando pra Vila de Arken").then(r => { if (r) walkTo(HOME.x, HOME.y); });
  $("btnDeposit").addEventListener("click", goVila);
  $("btnIdle").addEventListener("click", () => { if (P().task === "idle") openModal("map"); else goVila(); });
  $("btnCenter").addEventListener("click", () => { cam.follow = true; toast("Seguindo o personagem"); });
  $("btnMapTab").addEventListener("click", () => openModal("map"));
  $("worldBtn").addEventListener("click", () => openWorlds()); loadWorlds();
  // painéis recolhíveis (lembra a escolha)
  document.querySelectorAll(".panel.collapsible").forEach(pn => { try { if (localStorage.getItem("ht_col_" + pn.id) === "1") pn.classList.add("collapsed"); } catch (e) { }
    pn.querySelector("h2").addEventListener("click", () => { pn.classList.toggle("collapsed"); try { localStorage.setItem("ht_col_" + pn.id, pn.classList.contains("collapsed") ? "1" : "0"); } catch (e) { } }); });
  $("huntPop").addEventListener("click", async e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.go) { hideHuntPop(); if (P().huntId === b.dataset.go) return; const st = await act(() => api.startHunt(b.dataset.go)); if (st) goHunt(b.dataset.go); } if (b.dataset.close) hideHuntPop(); });
  $("equip").addEventListener("click", () => openModal("equip"));
  // comportamento de caça: salva no servidor ao mudar
  let bt; const saveB = () => { clearTimeout(bt); bt = setTimeout(() => act(() => api.setBehavior({ postura: $("bPostura").value, alvo: $("bAlvo").value, pocao: +$("bPocao").value, recuo: +$("bRecuo").value, reposicao: $("bRepo").value, objetivo: $("bObj").value, pots_buy: +$("bPots").value }).then(b => { P().behavior = b; return null; }), "Comportamento salvo"), 500); };
  ["bPostura", "bAlvo", "bRecuo", "bRepo", "bObj", "bPots"].forEach(id => $(id).addEventListener("change", saveB));
  $("bPocao").addEventListener("input", e => { $("bPocaoV").textContent = e.target.value + "%"; }); $("bPocao").addEventListener("change", saveB);
  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => { const pr = PRESETS[b.dataset.preset]; $("bPostura").value = pr.postura; $("bAlvo").value = pr.alvo; $("bPocao").value = pr.pocao; $("bPocaoV").textContent = pr.pocao + "%"; $("bRecuo").value = String(pr.recuo); $("bRepo").value = pr.reposicao; $("bObj").value = pr.objetivo; saveB(); }));
}
const PRESETS = {
  seguro: { postura: "defensiva", alvo: "fraco", pocao: 60, recuo: 30, reposicao: "mochila", objetivo: "exp" },
  equilibrado: { postura: "equilibrada", alvo: "proximo", pocao: 50, recuo: 20, reposicao: "mochila", objetivo: "exp" },
  ganancioso: { postura: "agressiva", alvo: "raro", pocao: 40, recuo: 10, reposicao: "pocao", objetivo: "materiais" },
  gold: { postura: "equilibrada", alvo: "fraco", pocao: 50, recuo: 20, reposicao: "mochila", objetivo: "gold" },
};

// ---------- criação de personagem e relatório ----------
export function showCreate(onDone) {
  const el = $("create"); el.hidden = false;
  el.querySelector("#cVoc").innerHTML = Object.entries(VOC).map(([k, v]) => `<label class="pick"><input type="radio" name="voc" value="${k}" ${k === "knight" ? "checked" : ""}><b>${v.name}</b><small>${v.desc}</small></label>`).join("");
  el.querySelector("#cKing").innerHTML = Object.entries(KING).map(([k, v]) => `<label class="pick"><input type="radio" name="king" value="${k}" ${k === "grey" ? "checked" : ""}><b style="color:${v.color}">${v.name}</b><small>${v.bonus}</small></label>`).join("");
  el.querySelector("#cGo").onclick = async () => { const name = el.querySelector("#cName").value.trim(); const voc = el.querySelector("input[name=voc]:checked").value, king = el.querySelector("input[name=king]:checked").value; el.querySelector("#cMsg").textContent = ""; try { const st = await api.createCharacter(name, voc, king); el.hidden = true; onDone(st); } catch (e) { el.querySelector("#cMsg").textContent = e.message; } };
}
export function showReports(reports) {
  if (!reports.length) return;
  const sum = k => reports.reduce((a, r) => a + Number(r[k] || 0), 0), hours = reports.reduce((a, r) => a + (new Date(r.to_at) - new Date(r.from_at)) / 3600000, 0), drops = reports.reduce((a, r) => a.concat(r.drops || []), []), events = reports.reduce((a, r) => a.concat(r.events || []), []);
  document.querySelector("#report h3").textContent = "Relatório de volta"; $("repSub").textContent = `${hours < 1 ? Math.round(hours * 60) + " min" : hours.toFixed(1) + " h"} caçando enquanto você estava fora`;
  $("repGrid").innerHTML = [["Exp", "+" + fmt(sum("exp"))], ["Gold", "+" + fmt(sum("gold_in"))], ["Abates", fmt(sum("kills"))], ["Drops raros", drops.length], ["Mortes", sum("deaths")], ["Poções", "-" + sum("pots")]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("");
  $("repNotes").innerHTML = (events.length ? events.slice(-5).map(e => `<div>• ${e}</div>`).join("") : "Sem incidentes.") + (drops.length ? `<div>Drops: ${drops.map(d => tpl(d.template).name).join(", ")}</div>` : "");
  $("report").hidden = false;
}
