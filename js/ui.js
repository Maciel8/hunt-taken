// Interface: colunas, abas/modais, painéis. Só lê o estado e chama funções da simulação.
import { KING, VOC, MONS, ITEMS, RARITY, HUNTS, REGIONS, CAPITAL, ECON, WAR, TIERS, expFor, skillNext } from "./data.js";
import { huntAt, inRect, path } from "./world.js";
import { S, P, fmt, hhmm, now, hpMax, manaMax, atkOf, defOf, power, expMult, lootMult, dominant, medianBotLvl, huntInfo, occupantsOf, playerChallenges, equipItem, unequip, itemName, itemValue, canEquip, buyListing, listItem, buyShop, sellToNpc, buyBless, arenaFight, tierOf, donateWar, simulateWar, kingdomPower, save, resetSave, log, emit, goHunt, goHome } from "./sim.js";
import { cam } from "./render.js";
import { A } from "./art.js";

const $ = id => document.getElementById(id);
const h = (s, ...v) => s.reduce((a, b, i) => a + b + (v[i] ?? ""), "");
let toastTimer;
export function toast(msg, bad) { const el = $("toast"); el.textContent = msg; el.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = "toast", 2400); }
const icon = name => A.sp[name] ? `<img class="ic" src="assets/sprites/${name}.png" alt="">` : `<span class="ic ph"></span>`;

export function renderAll() { renderProfile(); renderField(); renderEquip(); renderHunt(); renderAuto(); renderFeed(); renderEvent(); if (openTab) renderTab(openTab); }

function renderProfile() {
  const p = P(); const a = expFor(p.lvl), b = expFor(p.lvl + 1);
  $("pname").textContent = p.name; $("pking").textContent = KING[p.king].name; $("pking").style.color = KING[p.king].color; $("pvoc").textContent = VOC[p.voc].name;
  $("plvl").textContent = p.lvl; $("pexp").textContent = `${fmt(p.exp - a)} / ${fmt(b - a)} xp`; $("expbar").style.width = Math.max(0, Math.min(100, (p.exp - a) / (b - a) * 100)) + "%";
  $("pgold").textContent = fmt(p.gold); $("ppots").textContent = p.pots;
  const boosts = [];
  if (p.premium) boosts.push(["Premium", "+50% exp, 24 h off-line", "gold"]);
  if (S.event && now() < S.event.until) boosts.push([S.event.name, `+${Math.round(S.event.exp * 100)}% exp, +${Math.round(S.event.loot * 100)}% loot`, "mint"]);
  boosts.push([KING[p.king].name, KING[p.king].bonus, "king"]);
  const dom = dominant(); if (dom) boosts.push([dom === p.king ? "Reino dominante" : `${KING[dom].name} domina`, dom === p.king ? "+15% exp" : "sem bônus pra você", dom === p.king ? "mint" : "muted"]);
  if (p.lvl < medianBotLvl()) boosts.push(["Boost de alcance", `×5 exp até o level ${medianBotLvl()}`, "mint"]);
  const tier = TIERS[tierOf(S.pvp.rating)][0]; if (tierOf(S.pvp.rating) > 0) boosts.push([`Arena ${tier}`, `+${tierOf(S.pvp.rating) * 2}% poder em desafio`, "gold"]);
  $("boosts").innerHTML = boosts.map(([a, b, c]) => `<div class="boost ${c}"><b>${a}</b><span>${b}</span></div>`).join("");
  $("multExp").textContent = `×${expMult(p).toFixed(2)}`; $("multLoot").textContent = `×${lootMult(p).toFixed(2)}`;
}
function renderField() {
  const p = P();
  $("hp").textContent = `${Math.floor(p.hp)} / ${hpMax(p)}`; $("hpbar").style.width = Math.max(0, Math.min(100, p.hp / hpMax(p) * 100)) + "%";
  $("mana").textContent = `${Math.floor(p.mana)} / ${manaMax(p)}`; $("manabar").style.width = Math.max(0, Math.min(100, p.mana / manaMax(p) * 100)) + "%";
  $("skSword").textContent = p.skills.sword; $("skDist").textContent = p.skills.distance; $("skMagic").textContent = p.skills.magic; $("skShield").textContent = p.skills.shield;
  $("atk").textContent = Math.round(atkOf(p)); $("def").textContent = Math.round(defOf(p)); $("pow").textContent = Math.round(power(p));
  $("bag").textContent = `${p.bag.length} / ${ECON.BAG_CAP}`; $("bless").textContent = p.bless ? "sim" : "não";
  $("btnBless").disabled = p.bless || p.gold < ECON.BLESS_COST || !inRect(CAPITAL, p.x, p.y);
  const hh = p.huntId && HUNTS.find(x => x.id === p.huntId);
  $("task").textContent = p.dead > 0 ? "morto, voltando" : p.task === "idle" ? "parado na capital" : p.task === "deposit" ? "indo depositar" : p.task === "goto" ? `indo pra ${hh ? hh.name : "hunt"}` : `caçando em ${hh ? hh.name : "hunt"}`;
  $("btnIdle").textContent = p.task === "idle" ? (p.huntId ? "Voltar pra hunt" : "Escolher hunt") : "Voltar pra capital";
}
function renderEquip() {
  const p = P();
  $("equip").innerHTML = ["weapon", "shield", "armor", "helmet", "ring"].map(s => { const it = p.equip[s]; return `<div class="slot" data-slot="${s}" title="${it ? itemName(it) : s}">${it ? icon(ITEMS[it.id].icon) : `<span class="ph">${{ weapon: "arma", shield: "escudo", armor: "armadura", helmet: "elmo", ring: "anel" }[s]}</span>`}${it ? `<i style="background:${RARITY[it.rar].color}"></i>` : ""}</div>`; }).join("");
}
function renderHunt() {
  const p = P(); const hh = p.lastHunt ? HUNTS.find(x => x.id === p.lastHunt) : null;
  if (!hh) { $("huntName").textContent = p.task === "deposit" ? "Indo depositar" : "Fora de hunt"; $("huntStats").innerHTML = `<div class="muted">Escolha uma hunt no Mapa ou clique numa área do mapa.</div>`; $("occupants").innerHTML = ""; return; }
  const i = huntInfo(hh, p), occ = occupantsOf(hh.id);
  $("huntName").textContent = hh.name;
  $("huntStats").innerHTML = `<div class="row"><span>Gold/h (sua parte)</span><b>${fmt(i.goldH * i.share)}</b></div><div class="row"><span>Exp/h</span><b>${fmt(i.expH * i.share)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>Sua parte do spawn</span><b>${Math.round(i.share * 100)}%</b></div><div class="row"><span>Risco de morte</span><b>${Math.round(i.danger * 100)}%</b></div>`;
  $("occupants").innerHTML = occ.map(o => o === p ? `<div class="occ"><i class="dot" style="background:${KING.grey.color}"></i><span class="name">${p.name} (você)</span></div>` : `<div class="occ"><i class="dot" style="background:${KING[o.king].color}"></i><span class="name">${o.name} · lv ${o.lvl} · ${VOC[o.voc].name}</span><button data-bot="${o.name}" ${o.immune > 0 ? "disabled" : ""}>Desafiar</button></div>`).join("");
}
function renderAuto() { const a = S.auto; $("autoPot").value = a.potionAt; $("autoPotV").textContent = a.potionAt + "%"; $("autoReturn").checked = a.autoReturn; $("autoDeposit").checked = a.autoDeposit; $("autoSell").checked = a.sellLoot; $("autoBuy").value = a.potBuy; }
export function renderFeed() { $("feed").innerHTML = S.feed.slice(0, 30).map(f => `<li><span>${f.t}</span>${f.kind === "bad" ? '<i class="tag bad">!</i> ' : f.kind === "good" ? '<i class="tag good">+</i> ' : ""}${f.msg}</li>`).join(""); }
function renderEvent() { const e = S.event; const el = $("eventBar"); if (!e || now() >= e.until) { el.hidden = true; return; } el.hidden = false; const left = e.until - now(); const hh = Math.floor(left / 3600000), mm = Math.floor(left % 3600000 / 60000); el.textContent = `EVENTO: ${e.name} · +${Math.round(e.exp * 100)}% exp · +${Math.round(e.loot * 100)}% loot · ${hh}h ${String(mm).padStart(2, "0")}m`; }

// ---------- abas (modais) ----------
let openTab = null;
export function openModal(tab) { openTab = tab; $("modal").hidden = false; renderTab(tab); }
export function closeModal() { openTab = null; $("modal").hidden = true; }
function renderTab(tab) {
  const p = P(); const box = $("modalBody"); $("modalTitle").textContent = { map: "Mapa", market: "Market", equip: "Equipamento e mochila", ranks: "Ranks", arena: "Arena ranqueada", war: "Guerra de reinos", session: "Sessão", settings: "Ajustes" }[tab];
  if (tab === "map") {
    box.innerHTML = `<div class="split"><div class="list">${REGIONS.map(r => `<div class="region ${p.lvl >= r.lvl ? "" : "locked"}"><div class="rh">${r.name} <small>level ${r.lvl}+</small></div>${HUNTS.filter(x => x.region === r.id).map(x => { const i = huntInfo(x, p); return `<div class="hunt" data-hunt="${x.id}"><div><b>${x.name}</b><small>${i.m.name} lv ${i.m.lvl}${x.boss ? " · boss" : ""}${x.rare ? " · drops ×" + x.rare : ""}</small></div><div class="hn"><b>${fmt(i.goldH)}</b><small>gold/h</small></div><div class="hn"><b>${i.occ}</b><small>ocup.</small></div></div>`; }).join("")}</div>`).join("")}</div><div class="analyser" id="analyser"><div class="muted">Passe o mouse ou toque numa hunt pra ver quanto rende, o risco e os drops.</div></div></div>`;
    box.querySelectorAll(".hunt").forEach(el => { el.addEventListener("mouseenter", () => showAnalyser(el.dataset.hunt)); el.addEventListener("click", () => showAnalyser(el.dataset.hunt)); });
  } else if (tab === "market") {
    box.innerHTML = `<div class="tabs2"><button data-sub="npc" class="on">Loja (NPC)</button><button data-sub="players">Mercado de jogadores</button><button data-sub="sell">Vender / anunciar</button></div><div id="sub"></div>`;
    const sub = s => { box.querySelectorAll("[data-sub]").forEach(b => b.classList.toggle("on", b.dataset.sub === s)); const el = $("sub"); if (s === "npc") el.innerHTML = `<div class="grid3">${["potion", "espada_aco", "escudo_madeira", "escudo_aco", "armadura_couro", "armadura_aco", "capacete_aco", "arco"].map(id => { const d = ITEMS[id]; return `<div class="card2">${icon(d.icon)}<b>${d.name}</b><small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""}${d.heal ? "cura " + d.heal : ""}${d.voc ? " · " + d.voc.map(v => VOC[v].name).join("/") : ""}</small><div class="price">${fmt(d.price)} gold</div><button data-buy="${id}">Comprar${id === "potion" ? " ×5" : ""}</button></div>`; }).join("")}</div><p class="muted">Bênção: ${ECON.BLESS_COST} gold, só na capital, pelo botão no painel do personagem.</p>`;
      else if (s === "players") el.innerHTML = `<p class="muted">Anúncios de outros jogadores. Taxa de ${Math.round(ECON.MARKET_FEE * 100)}% pro vendedor (${Math.round(ECON.PREMIUM_FEE * 100)}% premium). Preço só muda a cada 30 min.</p><div class="grid3">${S.market.listings.map((l, i) => { const d = ITEMS[l.it.id]; return `<div class="card2"><span class="rar" style="color:${RARITY[l.it.rar].color}">${RARITY[l.it.rar].name}</span>${icon(d.icon)}<b>${d.name}</b><small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""} ${Object.entries(l.it.roll || {}).map(([k, v]) => `+${v} ${k}`).join(" ")}</small><small>de <span style="color:${KING[l.king].color}">${l.seller}</span></small><div class="price">${fmt(l.price)} gold</div><button data-buylist="${i}">Comprar</button></div>`; }).join("")}</div>`;
      else el.innerHTML = `<p class="muted">Mochila: ${p.bag.length}/${ECON.BAG_CAP}. Vender pro NPC paga na hora; anunciar vende quando aparecer comprador (preço justo vende em minutos).</p><div class="grid3">${p.bag.map((it, i) => { const d = ITEMS[it.id], v = itemValue(it); return `<div class="card2"><span class="rar" style="color:${RARITY[it.rar].color}">${RARITY[it.rar].name}</span>${icon(d.icon)}<b>${d.name}</b><small>NPC paga ${fmt(v)}</small><button data-sell="${i}">Vender ${fmt(v)}</button>${d.slot ? `<button data-list="${i}" data-fair="${v * 3}">Anunciar por ${fmt(v * 3)}</button>` : ""}</div>`; }).join("") || '<div class="muted">Mochila vazia.</div>'}</div>${S.market.mine.length ? `<h4>Seus anúncios</h4>${S.market.mine.map(l => `<div class="row"><span>${itemName(l.it)}</span><b>${fmt(l.price)}</b></div>`).join("")}` : ""}`;
    };
    box.querySelectorAll("[data-sub]").forEach(b => b.addEventListener("click", () => sub(b.dataset.sub))); sub("npc");
  } else if (tab === "equip") {
    box.innerHTML = `<div class="split"><div><h4>Equipado</h4>${["weapon", "shield", "armor", "helmet", "ring"].map(s => { const it = p.equip[s]; return `<div class="row eq"><span>${{ weapon: "Arma", shield: "Escudo", armor: "Armadura", helmet: "Elmo", ring: "Anel" }[s]}</span>${it ? `<b style="color:${RARITY[it.rar].color}">${itemName(it)} ${Object.entries(it.roll || {}).map(([k, v]) => `+${v} ${k}`).join(" ")}</b><button data-uneq="${s}">Tirar</button>` : "<span class='muted'>vazio</span>"}</div>`; }).join("")}<div class="row"><span>Ataque</span><b>${Math.round(atkOf(p))}</b></div><div class="row"><span>Defesa</span><b>${Math.round(defOf(p))}</b></div><div class="row"><span>Poder (desafio)</span><b>${Math.round(power(p))}</b></div></div><div><h4>Mochila ${p.bag.length}/${ECON.BAG_CAP}</h4>${p.bag.map((it, i) => { const d = ITEMS[it.id]; return `<div class="row eq"><span style="color:${RARITY[it.rar].color}">${itemName(it)} <small>${d.atk ? "atk " + d.atk : ""}${d.def ? "def " + d.def : ""} ${Object.entries(it.roll || {}).map(([k, v]) => `+${v} ${k}`).join(" ")}</small></span>${canEquip(p, it) ? `<button data-eq="${i}">Equipar</button>` : `<small class="muted">${d.mat ? "material" : "outra vocação"}</small>`}</div>`; }).join("") || '<div class="muted">Vazia.</div>'}</div></div><p class="muted">Todo item raro nasce com atributos sorteados que nunca mudam: ataque, defesa e bônus de skill. Raridade multiplica a base.</p>`;
  } else if (tab === "ranks") {
    const all = [...S.bots.map(b => ({ name: b.name, king: b.king, voc: b.voc, lvl: b.lvl, pow: power(b), rating: b.rating })), { name: p.name + " (você)", king: p.king, voc: p.voc, lvl: p.lvl, pow: power(p), rating: S.pvp.rating }];
    box.innerHTML = `<div class="split"><div><h4>Por level</h4>${all.sort((a, b) => b.lvl - a.lvl).map((r, i) => `<div class="row"><span>${i + 1}. <i class="dot" style="background:${KING[r.king].color}"></i> ${r.name} <small>${VOC[r.voc].name}</small></span><b>${r.lvl}</b></div>`).join("")}</div><div><h4>Arena (rating)</h4>${all.sort((a, b) => b.rating - a.rating).map((r, i) => `<div class="row"><span>${i + 1}. ${r.name}</span><b>${r.rating} <small>${TIERS[tierOf(r.rating)][0]}</small></b></div>`).join("")}<h4>Reinos</h4>${Object.keys(KING).map(k => `<div class="row"><span><i class="dot" style="background:${KING[k].color}"></i> ${KING[k].name}</span><b>${Object.values(S.war.owner).filter(x => x === k).length} territórios · poder ${fmt(kingdomPower(k))}</b></div>`).join("")}</div></div>`;
  } else if (tab === "arena") {
    const t = S.pvp.tactic, tier = TIERS[tierOf(S.pvp.rating)];
    box.innerHTML = `<div class="split"><div><h4>Sua tática (secreta)</h4><label>Beber poção abaixo de <b id="tPotV">${t.potionAt}%</b><input type="range" min="10" max="90" value="${t.potionAt}" id="tPot"></label><label>Recuar pra curar abaixo de <b id="tRetV">${t.retreatAt}%</b><input type="range" min="0" max="60" value="${t.retreatAt}" id="tRet"></label><label>Abertura <select id="tOpen"><option value="forte" ${t.opener === "forte" ? "selected" : ""}>Golpe forte</option><option value="normal" ${t.opener === "normal" ? "selected" : ""}>Normal</option></select></label><label>Postura <select id="tStance"><option value="equilibrado" ${t.stance === "equilibrado" ? "selected" : ""}>Equilibrada</option><option value="agressivo" ${t.stance === "agressivo" ? "selected" : ""}>Agressiva (+20% atk, −20% def)</option><option value="defensivo" ${t.stance === "defensivo" ? "selected" : ""}>Defensiva (−15% atk, +30% def)</option></select></label><div class="row"><span>Rating</span><b>${S.pvp.rating} · ${tier[0]}</b></div><div class="row"><span>Vitórias / derrotas</span><b>${S.pvp.wins} / ${S.pvp.losses}</b></div><p class="muted">Derrota cobra 70% do que a vitória pagaria. Reset parcial toda semana. Cada tier dá +2% de poder no desafio de hunt.</p></div><div><h4>Desafiar</h4>${S.bots.map((b, i) => `<div class="row"><span><i class="dot" style="background:${KING[b.king].color}"></i> ${b.name} <small>lv ${b.lvl} · ${b.rating}</small></span><button data-fight="${i}">Lutar</button></div>`).join("")}<div id="fightLog">${S.pvp.log.slice(0, 3).map(l => `<div class="flog ${l.win ? "good" : "bad"}"><b>${l.t} vs ${l.vs}: ${l.win ? "vitória" : "derrota"} (${l.delta > 0 ? "+" : ""}${l.delta})</b>${l.lines.slice(-4).map(x => `<small>${x}</small>`).join("")}</div>`).join("")}</div></div></div>`;
    $("tPot").oninput = e => { t.potionAt = +e.target.value; $("tPotV").textContent = t.potionAt + "%"; }; $("tRet").oninput = e => { t.retreatAt = +e.target.value; $("tRetV").textContent = t.retreatAt + "%"; }; $("tOpen").onchange = e => t.opener = e.target.value; $("tStance").onchange = e => t.stance = e.target.value;
  } else if (tab === "war") {
    const left = S.war.next - now(), d = Math.floor(left / 86400000), hh = Math.floor(left % 86400000 / 3600000), mm = Math.floor(left % 3600000 / 60000), dom = dominant();
    box.innerHTML = `<div class="row"><span>Próxima guerra</span><b>${d}d ${hh}h ${mm}m (sábado 15:00)</b></div><div class="row"><span>Reino dominante</span><b>${dom ? KING[dom].name + " (+15% exp pro reino)" : "nenhum"}</b></div><div class="terr">${WAR.territories.map(t => `<div class="t" style="border-color:${KING[S.war.owner[t]].color}"><b>${t}</b><small style="color:${KING[S.war.owner[t]].color}">${KING[S.war.owner[t]].name}</small></div>`).join("")}</div><h4>Suprimentos e poder</h4>${Object.keys(KING).map(k => `<div class="row"><span><i class="dot" style="background:${KING[k].color}"></i> ${KING[k].name} <small>${S.bots.filter(b => b.king === k).length + (p.king === k ? 1 : 0)} jogadores</small></span><b>${fmt(S.war.supplies[k])} suprimentos · poder ${fmt(kingdomPower(k))}</b></div>`).join("")}<div class="actions"><button data-donate="100">Doar 100 gold</button><button data-donate="1000">Doar 1.000</button><button data-donate="10000">Doar 10.000</button><button id="btnSimWar" class="danger">Simular a guerra agora (protótipo)</button></div><p class="muted">Cada 10 gold doados viram 1 suprimento. Reino com menos gente ganha multiplicador de poder (até 1,5×). Quem controla 5 dos 9 territórios dá +15% de exp a todos do reino por 7 dias. Morrer na guerra não perde nada.</p>${S.war.last ? `<h4>Última guerra</h4><div class="muted">${Object.entries(S.war.last.res).map(([t, k]) => `${t}: ${KING[k].name}`).join(" · ")}</div>` : ""}`;
    $("btnSimWar").onclick = () => { simulateWar(); renderTab("war"); };
  } else if (tab === "session") {
    const st = S.stats, hrs = Math.max(1 / 60, (now() - st.start) / 3600000);
    box.innerHTML = `<div class="grid3">${[["Tempo", `${Math.floor(hrs)}h ${Math.floor(hrs % 1 * 60)}m`], ["Exp", fmt(st.exp)], ["Exp/h", fmt(st.exp / hrs)], ["Gold bruto", fmt(st.gold)], ["Gold gasto", fmt(st.spent)], ["Líquido/h", fmt((st.gold - st.spent) / hrs)], ["Abates", st.kills], ["Mortes", st.deaths], ["Poções usadas", st.pots], ["Drops raros", st.drops], ["Hunts tomadas", st.taken], ["Vezes expulso", st.lost]].map(([a, b]) => `<div class="card2"><b class="big">${b}</b><small>${a}</small></div>`).join("")}</div><div class="actions"><button id="btnResetSession">Zerar sessão</button></div>`;
    $("btnResetSession").onclick = () => { Object.assign(S.stats, { start: now(), exp: 0, gold: 0, kills: 0, deaths: 0, pots: 0, spent: 0, drops: 0, taken: 0, lost: 0 }); renderTab("session"); };
  } else if (tab === "settings") {
    box.innerHTML = `<div class="row"><span>Premium (demonstração)</span><button id="btnPremium">${p.premium ? "Desativar" : "Ativar"}</button></div><p class="muted">Premium: +50% exp, 24 h de progresso off-line, taxa de market 3%. Nunca dá poder.</p><div class="row"><span>Velocidade do protótipo</span><button id="btnSpeed2">x${S.speed}</button></div><div class="row"><span>Apagar personagem e recomeçar</span><button id="btnReset" class="danger">Apagar</button></div>`;
    $("btnPremium").onclick = () => { p.premium = !p.premium; log(p.premium ? "Premium ativado." : "Premium desativado."); renderAll(); };
    $("btnSpeed2").onclick = () => { S.speed = S.speed === 1 ? 4 : 1; $("btnSpeed").textContent = `x${S.speed}`; renderTab("settings"); };
    $("btnReset").onclick = () => { if ($("btnReset").dataset.sure) { resetSave(); location.reload(); } else { $("btnReset").textContent = "Clique de novo pra confirmar"; $("btnReset").dataset.sure = "1"; } };
  }
}
function showAnalyser(id) {
  const p = P(), hh = HUNTS.find(x => x.id === id), i = huntInfo(hh, p), occ = occupantsOf(id), d = i.m.drop;
  $("analyser").innerHTML = `<h4>${hh.name}</h4><div class="row"><span>${i.m.name} lv ${i.m.lvl}</span><b>${i.m.hp} hp · ${i.m.atk} atk</b></div><div class="row"><span>Gold/h cheia</span><b>${fmt(i.goldH)}</b></div><div class="row"><span>Exp/h cheia</span><b>${fmt(i.expH)}</b></div><div class="row"><span>Com ${i.occ} ocupante(s)</span><b>${fmt(i.goldH * i.share)} gold/h · ${fmt(i.expH * i.share)} exp/h</b></div><div class="row"><span>Poções/h estimadas</span><b>${Math.round(i.potsH)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>Risco de morte</span><b style="color:${i.danger > .4 ? "var(--red)" : i.danger > .15 ? "var(--gold)" : "var(--mint)"}">${Math.round(i.danger * 100)}%</b></div><div class="row"><span>Drop raro</span><b>${d ? `${ITEMS[d.item].name} (${(d.chance * 100 * (hh.rare || 1)).toFixed(1)}%)` : "nenhum"}</b></div>${hh.boss ? `<div class="row"><span>Boss</span><b>${MONS[hh.boss].name} lv ${MONS[hh.boss].lvl}</b></div>` : ""}<div class="row"><span>Ocupantes</span><b>${occ.map(o => o.name).join(", ") || "ninguém"}</b></div>${i.lvlOk ? "" : `<p class="warn">Seu level ${p.lvl} é baixo pra essa hunt (ideal ${Math.ceil(i.m.lvl * .6)}+).</p>`}<div class="actions"><button data-go="${id}" class="primary">Ir caçar aqui</button></div>`;
}

// ---------- eventos ----------
export function bindUI() {
  document.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => openModal(b.dataset.tab)));
  $("modalClose").addEventListener("click", closeModal); $("modal").addEventListener("click", e => { if (e.target === $("modal")) closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  $("modalBody").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return; const p = P();
    if (b.dataset.go) { goHunt(b.dataset.go); closeModal(); }
    if (b.dataset.buy) buyShop(b.dataset.buy, b.dataset.buy === "potion" ? 5 : 1); if (b.dataset.buylist) buyListing(+b.dataset.buylist); if (b.dataset.sell) sellToNpc(+b.dataset.sell); if (b.dataset.list) listItem(+b.dataset.list, Math.floor(+b.dataset.fair));
    if (b.dataset.eq) { equipItem(p, +b.dataset.eq); } if (b.dataset.uneq) { unequip(p, b.dataset.uneq); }
    if (b.dataset.fight) { const r = arenaFight(S.bots[+b.dataset.fight]); toast(r.win ? `Venceu (+${r.delta})` : `Perdeu (${r.delta})`, !r.win); }
    if (b.dataset.donate) donateWar(+b.dataset.donate);
    if (openTab) renderTab(openTab); renderAll();
  });
  $("occupants").addEventListener("click", e => { const b = e.target.closest("button[data-bot]"); if (!b) return; const bot = S.bots.find(x => x.name === b.dataset.bot); if (bot) playerChallenges(bot); });
  $("btnBless").addEventListener("click", () => { buyBless(); renderAll(); });
  $("btnDeposit").addEventListener("click", () => { const p = P(); p.task = "deposit"; p.path = []; p.target = null; toast("Voltando pro depósito"); });
  $("btnIdle").addEventListener("click", () => { const p = P(); if (p.task === "idle") { if (p.huntId) goHunt(p.huntId); else openModal("map"); } else goHome(); renderAll(); });
  $("btnCenter").addEventListener("click", () => { cam.follow = true; toast("Seguindo o personagem"); });
  $("btnMapTab").addEventListener("click", () => openModal("map"));
  $("huntPop").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.go) { goHunt(b.dataset.go); hideHuntPop(); } if (b.dataset.close) hideHuntPop(); });
  $("btnSpeed").addEventListener("click", () => { S.speed = S.speed === 1 ? 4 : 1; $("btnSpeed").textContent = `x${S.speed}`; });
  $("autoPot").addEventListener("input", e => { S.auto.potionAt = +e.target.value; $("autoPotV").textContent = S.auto.potionAt + "%"; });
  $("autoReturn").addEventListener("change", e => S.auto.autoReturn = e.target.checked); $("autoDeposit").addEventListener("change", e => S.auto.autoDeposit = e.target.checked); $("autoSell").addEventListener("change", e => S.auto.sellLoot = e.target.checked); $("autoBuy").addEventListener("change", e => S.auto.potBuy = Math.max(0, Math.min(30, +e.target.value || 0)));
  $("equip").addEventListener("click", () => openModal("equip"));
}

export function showHuntPop(hh, clientX, clientY) {
  const p = P(), i = huntInfo(hh, p), occ = occupantsOf(hh.id), el = $("huntPop"), wrap = el.parentElement.getBoundingClientRect();
  el.innerHTML = `<div class="ph"><b>${hh.name}</b><button data-close="1" class="x">✕</button></div><div class="row"><span>${i.m.name} lv ${i.m.lvl}</span><b>${i.m.hp} hp</b></div><div class="row"><span>Gold/h ${i.occ > 1 ? "(dividido)" : ""}</span><b>${fmt(i.goldH * i.share)}</b></div><div class="row"><span>Exp/h</span><b>${fmt(i.expH * i.share)}</b></div><div class="row"><span>Líquido/h</span><b style="color:${i.netH > 0 ? "var(--mint)" : "var(--red)"}">${fmt(i.netH)}</b></div><div class="row"><span>Risco</span><b>${Math.round(i.danger * 100)}%</b></div><div class="row"><span>Ocupantes</span><b>${occ.map(o => o.name).join(", ") || "ninguém"}</b></div>${i.lvlOk ? "" : `<div class="warn">Level baixo pra cá (ideal ${Math.ceil(i.m.lvl * .6)}+)</div>`}<button data-go="${hh.id}" class="primary" style="width:100%;margin-top:6px">${p.huntId === hh.id ? "Já é sua hunt" : "Caçar aqui"}</button>`;
  el.hidden = false; const x = Math.min(clientX - wrap.left + 8, wrap.width - 230), y = Math.min(clientY - wrap.top + 8, wrap.height - 230); el.style.left = Math.max(8, x) + "px"; el.style.top = Math.max(8, y) + "px";
}
export function hideHuntPop() { $("huntPop").hidden = true; }

// ---------- criação de personagem e relatório ----------
export function showCreate(onDone) {
  const el = $("create"); el.hidden = false;
  el.querySelector("#cVoc").innerHTML = Object.entries(VOC).map(([k, v]) => `<label class="pick"><input type="radio" name="voc" value="${k}" ${k === "knight" ? "checked" : ""}><b>${v.name}</b><small>${v.desc}</small></label>`).join("");
  el.querySelector("#cKing").innerHTML = Object.entries(KING).map(([k, v]) => `<label class="pick"><input type="radio" name="king" value="${k}" ${k === "grey" ? "checked" : ""}><b style="color:${v.color}">${v.name}</b><small>${v.bonus}</small></label>`).join("");
  el.querySelector("#cGo").onclick = () => { const name = el.querySelector("#cName").value.trim() || "Aventureiro"; const voc = el.querySelector("input[name=voc]:checked").value, king = el.querySelector("input[name=king]:checked").value; el.hidden = true; onDone(name, voc, king); };
}
export function showReport(r) {
  $("repSub").textContent = `${r.hours < 1 ? Math.round(r.hours * 60) + " min" : r.hours.toFixed(1) + " h"} fora, caçando em ${r.hunt}`;
  $("repGrid").innerHTML = [["Exp", "+" + fmt(r.exp)], ["Levels", (r.levels >= 0 ? "+" : "") + r.levels], ["Gold", "+" + fmt(r.gold)], ["Abates", fmt(r.kills)], ["Drops raros", r.drops], ["Mortes", r.deaths], ["Poções", "-" + r.potsUsed], ["Hunt tomada", r.taken ? "sim" : "não"]].map(([a, b]) => `<div><b>${b}</b><small>${a}</small></div>`).join("");
  $("repNotes").textContent = r.taken ? "Um rival te expulsou enquanto você estava fora. Você está na capital; a rota continua ao fechar." : r.deaths ? "Morreu pra monstro. Compre bênção pra perder só 1%." : "Sem incidentes. Rota rodou limpa.";
  $("report").hidden = false;
}
