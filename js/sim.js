// Simulação: jogador, rivais, criaturas, combate, economia, arena, guerra, off-line.
import { T, TICK, KING, VOC, MONS, ITEMS, RARITY, HUNTS, REGIONS, CAPITAL, DEPOT, HOME, BOT_SPOTS, BOT_NAMES, ECON, WAR, TIERS, expFor, skillNext } from "./data.js";
import { walk, path, huntAt, inRect, freeTile, regionAt } from "./world.js";

export const rr = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const now = () => Date.now();
export const fmt = n => { n = Math.floor(n); if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M"; if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k"; return String(n); };
export const hhmm = (d = new Date()) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
const SAVE_KEY = "hunt-taken-v4";

export const S = {
  p: null, bots: [], mons: [], feed: [], clog: [], t: 0, speed: 1,
  stats: { start: now(), exp: 0, gold: 0, kills: 0, deaths: 0, pots: 0, spent: 0, drops: 0, taken: 0, lost: 0 },
  auto: { potionAt: 50, autoReturn: true, autoDeposit: true, potBuy: 10, sellLoot: true },
  event: { name: "Semana de abertura", exp: .5, loot: .2, until: now() + 3 * 86400000 },
  war: { next: nextWar(), owner: Object.fromEntries(WAR.territories.map((t, i) => [t, ["ash", "thorn", "grey"][i % 3]])), supplies: { grey: 0, ash: 0, thorn: 0 }, last: null },
  pvp: { rating: 1000, wins: 0, losses: 0, tactic: { potionAt: 50, retreatAt: 20, opener: "forte", stance: "equilibrado" }, log: [], weekReset: nextSunday() },
  market: { listings: [], mine: [] },
  listeners: [],
};
export const emit = (ev, data) => S.listeners.forEach(f => f(ev, data));
export const P = () => S.p;

function nextWar() { const d = new Date(); d.setHours(WAR.hour, 0, 0, 0); while (d.getDay() !== WAR.day || d <= new Date()) d.setDate(d.getDate() + 1); return d.getTime(); }
function nextSunday() { const d = new Date(); d.setHours(0, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== 0); return d.getTime(); }

// ---------- criação ----------
export function newPlayer(name, voc, king) {
  return { name, king, voc, x: HOME.x, y: HOME.y, lvl: 1, exp: 0, hp: 150, mana: 50, skills: { sword: 10, distance: 10, magic: 0, shield: 10 }, skillXp: { sword: 0, distance: 0, magic: 0, shield: 0 },
    gold: 50, pots: 5, bag: [], equip: { weapon: null, shield: null, armor: null, helmet: null, ring: null }, bless: false, premium: false,
    huntId: null, task: "idle", target: null, path: [], dead: 0, attackCd: 0, immune: 0, lastHunt: null, moving: 0, dir: "down", face: 1, roam: null, created: now() };
}
export function makeBots() {
  S.bots = BOT_NAMES.map(([name, king, voc, lvl], i) => ({ name, king, voc, lvl, exp: expFor(lvl), skills: { sword: 10 + lvl, distance: 10 + lvl, magic: Math.floor(lvl * .8), shield: 8 + lvl }, pots: 10, x: BOT_SPOTS[i][0], y: BOT_SPOTS[i][1], hunt: null, goal: null, path: [], busy: 0, next: now() + rr(10000, 40000), immune: 0, moving: 0, dir: "down", face: 1, hair: ["#3a2415", "#e8a84a", "#2b2b2b", "#b8552e", "#5a3a2a", "#d8c070", "#1a1a1a", "#8a2a2a", "#3a2415", "#e8a84a", "#2b2b2b"][i], rating: 900 + lvl * 8, grow: now() }));
}
export function spawnAll() {
  S.mons = [];
  for (const h of HUNTS) for (let i = 0; i < h.spawns; i++) { const m = MONS[h.mon], pos = freeTile(h.rect); S.mons.push({ hunt: h.id, type: h.mon, x: pos.x, y: pos.y, hp: m.hp, alive: true, respawnAt: 0, cd: 0, face: 1 }); }
  for (const h of HUNTS) if (h.boss) { const m = MONS[h.boss], pos = freeTile(h.rect); S.mons.push({ hunt: h.id, type: h.boss, x: pos.x, y: pos.y, hp: m.hp, alive: false, respawnAt: now() + rr(2, 8) * 60000, cd: 0, face: 1, boss: true }); }
}

// ---------- derivados ----------
export const hpMax = p => 100 + VOC[p.voc].hpPerLvl * p.lvl + equipSum(p, "hp");
export const manaMax = p => 30 + VOC[p.voc].manaPerLvl * p.lvl;
export const mainSkill = p => p.skills[VOC[p.voc].skill] ?? 10;
export function equipSum(p, k) { let s = 0; for (const it of Object.values(p.equip || {})) if (it) { const d = ITEMS[it.id]; const base = d[k] || 0; s += base * (RARITY[it.rar]?.mult || 1) + (it.roll?.[k] || 0); } return s; }
export const atkOf = p => VOC[p.voc].atkBase + mainSkill(p) * 1.1 + equipSum(p, "atk") + (p.king === "ash" ? 0 : 0);
export const defOf = p => (equipSum(p, "def") + (p.skills.shield || 10) * .3) * VOC[p.voc].defMul;
export const power = e => (e.lvl * 2 + (e.skills ? (mainSkill(e) * 3 + e.skills.shield * 2) : 50) + (e.equip ? equipSum(e, "atk") * 2 + equipSum(e, "def") * 2 : e.lvl * 1.5) + (e.pots || 0) * .5) * (1 + tierBonus(e));
export function tierBonus(e) { if (e !== S.p) return 0; const t = tierOf(S.pvp.rating); return t * .02; }
export function tierOf(r) { let i = 0; TIERS.forEach((t, k) => { if (r >= t[1]) i = k; }); return i; }
export const medianBotLvl = () => { const l = S.bots.map(b => b.lvl).sort((a, b) => a - b); return l[Math.floor(l.length / 2)] || 1; };
export function expMult(p) {
  let m = 1; if (p.premium) m *= 1.5; if (S.event && now() < S.event.until) m *= 1 + S.event.exp; if (dominant() === p.king) m *= 1.15; if (p.lvl < medianBotLvl()) m *= 5; return m;
}
export function lootMult(p) { let m = 1; if (p.king === "grey") m *= 1.05; if (S.event && now() < S.event.until) m *= 1 + S.event.loot; m *= 1 + equipSum(p, "loot"); const h = p.lastHunt && HUNTS.find(x => x.id === p.lastHunt); if (h?.rare) m *= 1; return m; }
export function dominant() { const c = { grey: 0, ash: 0, thorn: 0 }; for (const k of Object.values(S.war.owner)) c[k]++; const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best[1] >= 5 ? best[0] : null; }

export function log(msg, kind) { S.feed.unshift({ t: hhmm(), msg, kind }); if (S.feed.length > 60) S.feed.pop(); emit("feed"); }
export function clog(msg, kind) { S.clog.unshift({ msg, kind, t: S.t }); if (S.clog.length > 6) S.clog.pop(); }
export const fx = [];

// ---------- itens ----------
export function rollItem(id) { const r = Math.random(); let acc = 0, rar = 0; RARITY.forEach((x, i) => { acc += x.chance; if (r > acc) rar = Math.min(i + 1, RARITY.length - 1); }); const d = ITEMS[id]; const roll = {}; if (d.slot) { if (d.atk) roll.atk = rr(0, Math.ceil(d.atk * .15)); if (d.def) roll.def = rr(0, Math.ceil(d.def * .15)); if (Math.random() < .25) roll.skill = 1 + rar; } return { id, rar, roll, uid: Math.random().toString(36).slice(2, 8) }; }
export const itemName = it => `${ITEMS[it.id].name}${it.rar ? " (" + RARITY[it.rar].name + ")" : ""}`;
export const itemValue = it => Math.floor((ITEMS[it.id].sell || 0) * (RARITY[it.rar]?.mult || 1) * (1 + Object.values(it.roll || {}).reduce((a, b) => a + b, 0) * .05));
export function canEquip(p, it) { const d = ITEMS[it.id]; return d.slot && (!d.voc || d.voc.includes(p.voc)); }
export function equipItem(p, idx) { const it = p.bag[idx]; if (!it || !canEquip(p, it)) return false; const slot = ITEMS[it.id].slot; const old = p.equip[slot]; p.equip[slot] = it; p.bag.splice(idx, 1); if (old) p.bag.push(old); log(`Equipou ${itemName(it)}.`, "good"); return true; }
export function unequip(p, slot) { const it = p.equip[slot]; if (!it || p.bag.length >= ECON.BAG_CAP) return false; p.equip[slot] = null; p.bag.push(it); return true; }

// ---------- progresso ----------
export function gainExp(p, n) { n = Math.floor(n * expMult(p)); p.exp += n; S.stats.exp += n; while (p.exp >= expFor(p.lvl + 1)) { p.lvl++; p.hp = hpMax(p); p.mana = manaMax(p); log(`Level ${p.lvl}!`, "good"); emit("toast", { msg: `Level ${p.lvl}` }); } return n; }
export function skillUp(p, k) { p.skillXp[k] = (p.skillXp[k] || 0) + 1; if (p.skillXp[k] >= skillNext(p.skills[k])) { p.skillXp[k] = 0; p.skills[k]++; log(`${{ sword: "Espada", distance: "Distância", magic: "Magic level", shield: "Escudo" }[k]} subiu pra ${p.skills[k]}`, "good"); } }
export function sendHome(p, ticks) { p.x = HOME.x; p.y = HOME.y; p.hp = hpMax(p); p.mana = manaMax(p); p.path = []; p.target = null; p.dead = ticks; p.task = (S.auto.autoReturn && p.huntId) ? "goto" : "idle"; p.lastHunt = null; }
export function playerDies(p, cause) {
  const loss = p.bless ? .01 : .05, lost = Math.floor(p.exp * loss);
  p.exp = Math.max(0, p.exp - lost); while (p.lvl > 1 && p.exp < expFor(p.lvl)) p.lvl--;
  const dropped = p.bag.splice(0, Math.min(p.bag.length, 3)); p.bless = false; S.stats.deaths++;
  sendHome(p, 12); log(`Você morreu pra ${cause}. Perdeu ${fmt(lost)} de exp${dropped.length ? ` e ${dropped.length} itens` : ""}.`, "bad"); emit("toast", { msg: "Você morreu", bad: true });
  if (!S.auto.autoReturn || p.pots === 0) { p.task = "idle"; log("Rota pausada: sem poção ou retorno automático desligado."); }
}

// ---------- desafio de hunt ----------
export function resolveChallenge(att, def) { const pa = power(att) * (1 + (Math.random() * .2 - .1)), pd = power(def) * (1 + (Math.random() * .2 - .1)); return pa > pd; }
function toCapital(b) { const i = S.bots.indexOf(b); b.x = BOT_SPOTS[i][0]; b.y = BOT_SPOTS[i][1]; b.path = []; b.hunt = null; b.busy = 0; b.goal = null; }
export function botTakesHunt(b) {
  const p = S.p; if (p.immune > 0 || p.lvl < 10 || b.lvl > p.lvl + 20) return;
  if (resolveChallenge(b, p)) { const stolen = Math.floor(p.gold * .1); p.gold -= stolen; const lost = Math.floor(p.exp * .01); p.exp -= lost; sendHome(p, 8); p.immune = 15000 / TICK; S.stats.lost++; log(`HUNT TAKEN: ${b.name} (${KING[b.king].name}) te expulsou. -${fmt(lost)} exp, -${stolen} gold.`, "bad"); emit("toast", { msg: `${b.name} tomou sua hunt`, bad: true }); }
  else { b.immune = 30000 / TICK; b.next = now() + 20000; toCapital(b); log(`${b.name} tentou tomar sua hunt e perdeu.`, "good"); emit("toast", { msg: `${b.name} perdeu o desafio` }); }
}
export function playerChallenges(b) {
  const p = S.p; if (b.immune > 0) return emit("toast", { msg: `${b.name} está protegido`, bad: true }); if (b.lvl < p.lvl - 20) return emit("toast", { msg: "Alvo muito abaixo do seu level", bad: true });
  if (resolveChallenge(p, b)) { const stolen = Math.floor(30 + b.lvl * 4); p.gold += stolen; S.stats.taken++; b.immune = 15000 / TICK; b.next = now() + rr(30000, 60000); toCapital(b); log(`HUNT TAKEN: você expulsou ${b.name} (${KING[b.king].name}). +${stolen} gold do chão.`, "good"); emit("toast", { msg: `Você tomou a hunt de ${b.name}` }); }
  else { const lost = Math.floor(p.exp * .01); p.exp -= lost; sendHome(p, 8); p.immune = 15000 / TICK; S.stats.lost++; log(`Você desafiou ${b.name} e perdeu. -${fmt(lost)} exp.`, "bad"); emit("toast", { msg: "Perdeu o desafio", bad: true }); }
  emit("ui");
}
export function occupantsOf(id) { const o = []; if (S.p.lastHunt === id) o.push(S.p); for (const b of S.bots) if (b.hunt === id && b.busy > 0) o.push(b); return o; }
export function huntInfo(h, p = S.p) {
  const m = MONS[h.mon], perHour = h.spawns * 3600000 / (h.respawn + 6000), occ = occupantsOf(h.id).length || 1;
  const goldH = perHour * ((m.gold[0] + m.gold[1]) / 2 + (m.drop ? m.drop.chance * (ITEMS[m.drop.item].sell || 0) : 0)) * lootMult(p);
  const expH = perHour * m.exp * expMult(p);
  const danger = clamp((m.lvl - p.lvl) * .06 + .03, .01, .95);
  const dps = Math.max(1, atkOf(p) * .9 - m.def), ttk = m.hp / dps * (TICK * 2 / 1000), dmgIn = Math.max(0, m.atk - defOf(p)) * ttk / 1.2;
  const potsH = clamp(dmgIn * perHour / 60 / ECON.POT_HEAL, 0, 400);
  return { m, perHour, goldH, expH, danger, occ, share: 1 / occ, potsH, netH: goldH / occ - potsH * ECON.POT_COST, lvlOk: p.lvl >= m.lvl * .6 };
}

// ---------- ticks ----------
export function stepAlong(e) { if (!e.path.length) { e.moving = 0; return false; } const n = e.path.shift(); if (n.x !== e.x) { e.face = n.x > e.x ? 1 : -1; e.dir = e.face > 0 ? "right" : "left"; } else if (n.y !== e.y) e.dir = n.y > e.y ? "down" : "up"; e.x = n.x; e.y = n.y; e.moving = 2; return true; }
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function nearestMon(p, range, huntId) { let best = null, bd = 1e9; for (const m of S.mons) if (m.alive && (!huntId || m.hunt === huntId)) { const d = dist(m, p); if (d <= range && d < bd) { bd = d; best = m; } } return best; }

export function playerTick() {
  const p = S.p, voc = VOC[p.voc];
  if (p.moving > 0) p.moving--; if (p.immune > 0) p.immune--;
  if (p.dead > 0) { p.dead--; return; }
  p.hp = Math.min(hpMax(p), p.hp + .6 * (p.king === "thorn" ? 1.05 : 1) + (p.lvl * .02)); p.mana = Math.min(manaMax(p), p.mana + .8);
  p.lastHunt = huntAt(p.x, p.y)?.id || null;
  if (p.hp < hpMax(p) * S.auto.potionAt / 100 && p.pots > 0) { p.pots--; S.stats.pots++; p.hp = Math.min(hpMax(p), p.hp + ECON.POT_HEAL + p.lvl); clog("poção usada", "info"); }
  if (p.task === "idle") return;
  const needDeposit = S.auto.autoDeposit && (p.bag.length >= ECON.BAG_CAP || (p.pots === 0 && p.gold >= ECON.POT_COST));
  if (p.task === "hunt" && needDeposit) { p.task = "deposit"; p.path = []; p.target = null; log("Mochila cheia ou sem poção: voltando pro depósito."); }
  if (p.task === "deposit") {
    if (p.x === DEPOT.x && p.y === DEPOT.y + 1) { depositAtNpc(p); p.task = p.huntId ? "goto" : "idle"; p.path = []; }
    else if (!p.path.length) p.path = path(p.x, p.y, DEPOT.x, DEPOT.y + 1) || [];
    stepAlong(p); return;
  }
  const hh = p.huntId && HUNTS.find(x => x.id === p.huntId);
  if (!hh) { p.task = "idle"; return; }
  if (p.task === "goto") {
    if (inRect(hh.rect, p.x, p.y)) { p.task = "hunt"; p.path = []; log(`Chegou em ${hh.name}.`); emit("ui"); }
    else { if (!p.path.length) { const d = freeTile(hh.rect); p.path = path(p.x, p.y, d.x, d.y) || []; if (!p.path.length) { p.task = "idle"; log("Não achei caminho até a hunt."); return; } } stepAlong(p); return; }
  }
  // em hunt: ataca o que estiver perto, senão vagueia dentro da área
  if (!p.target || !p.target.alive) p.target = nearestMon(p, 7, hh.id);
  if (p.target) {
    const m = p.target, d = dist(m, p);
    if (d <= voc.range) {
      p.face = m.x > p.x ? 1 : m.x < p.x ? -1 : p.face; p.dir = Math.abs(m.x - p.x) >= Math.abs(m.y - p.y) ? (m.x > p.x ? "right" : "left") : (m.y > p.y ? "down" : "up");
      if (p.attackCd-- <= 0) {
        p.attackCd = voc.skill === "magic" ? 2 : 1; const mt = MONS[m.type];
        if (voc.skill === "magic") { if (p.mana < 5) { p.attackCd = 0; return; } p.mana -= 5; }
        const kb = p.king === "ash" ? 1.05 : 1;
        const dmg = Math.max(1, Math.floor(atkOf(p) * kb * (.6 + Math.random() * .6) - mt.def));
        m.hp -= dmg; skillUp(p, voc.skill); fx.push({ x: m.x, y: m.y, v: "-" + dmg, t: 6, c: "#fff" });
        if (m.hp <= 0) killMon(p, m);
      }
      return;
    }
    if (!p.path.length || p.path.at(-1).x !== m.x || p.path.at(-1).y !== m.y) { const pp = path(p.x, p.y, m.x, m.y); p.path = pp ? pp.slice(0, -1) : []; }
    if (p.path.length) { stepAlong(p); return; }
  }
  if (!p.path.length) { if (Math.random() < .35) { const d = freeTile(hh.rect); p.path = (path(p.x, p.y, d.x, d.y) || []).slice(0, 6); } return; }
  stepAlong(p);
}
function lineClear(a, b) { return true; }
function killMon(p, m) {
  const mt = MONS[m.type], h = HUNTS.find(x => x.id === m.hunt);
  m.alive = false; m.respawnAt = now() + (m.boss ? rr(8, 15) * 60000 : h.respawn); S.stats.kills++;
  const e = gainExp(p, mt.exp); const g = Math.floor(rr(mt.gold[0], mt.gold[1]) * lootMult(p)); p.gold += g; S.stats.gold += g;
  fx.push({ x: m.x, y: m.y, v: "+" + g + "g", t: 8, c: "#ffcf5a" });
  clog(`${mt.name} derrotado! +${fmt(e)} exp, +${g} gold`, "kill");
  if (mt.drop && Math.random() < mt.drop.chance * (h.rare || 1) * (1 + equipSum(p, "loot"))) { if (p.bag.length < ECON.BAG_CAP) { const it = rollItem(mt.drop.item); p.bag.push(it); S.stats.drops++; log(`Dropou ${itemName(it)}!`, "good"); emit("toast", { msg: `Drop: ${itemName(it)}` }); } else log(`${ITEMS[mt.drop.item].name} caiu no chão: mochila cheia.`, "bad"); }
  if (m.boss) { log(`BOSS: ${mt.name} abatido por você!`, "good"); S.war.supplies[p.king] += 50; }
  p.target = null;
}
export function depositAtNpc(p) {
  let sold = 0, n = 0; if (S.auto.sellLoot) { p.bag = p.bag.filter(it => { if (ITEMS[it.id].mat || (!canEquip(p, it) && !ITEMS[it.id].slot)) { sold += itemValue(it); n++; return false; } return true; }); }
  p.gold += sold; const want = Math.min(S.auto.potBuy - p.pots, Math.floor(p.gold / ECON.POT_COST)); if (want > 0) { p.pots += want; p.gold -= want * ECON.POT_COST; S.stats.spent += want * ECON.POT_COST; }
  log(`Depósito: vendeu ${n} itens por ${fmt(sold)} gold, comprou ${Math.max(0, want)} poções.`);
}

export function monTick() {
  const t = now(), p = S.p;
  for (const m of S.mons) {
    const mt = MONS[m.type];
    if (!m.alive) { if (t >= m.respawnAt) { const h = HUNTS.find(x => x.id === m.hunt); const pos = freeTile(h.rect); m.x = pos.x; m.y = pos.y; m.hp = mt.hp; m.alive = true; if (m.boss) log(`${mt.name} apareceu em ${h.name}!`, "bad"); } continue; }
    const d = dist(m, p);
    if (p.dead === 0 && p.task !== "idle" && d <= 1) {
      if (m.cd-- <= 0) {
        m.cd = 2;
        if (Math.random() < clamp(p.skills.shield * .012, .05, .6)) { skillUp(p, "shield"); fx.push({ x: p.x, y: p.y, v: "bloqueou", t: 5, c: "#9fe8c9" }); continue; }
        const dmg = Math.max(0, Math.floor(mt.atk * (.5 + Math.random()) - defOf(p)));
        p.hp -= dmg; fx.push({ x: p.x, y: p.y, v: "-" + dmg, t: 6, c: "#ff8a8a" }); if (p.hp <= 0) { playerDies(p, mt.name); return; }
      }
      continue;
    }
    if (p.dead === 0 && p.task !== "idle" && d <= 6 && huntAt(p.x, p.y)?.id === m.hunt) { if (S.t % (mt.speed === 2 ? 1 : 2) === 0) { const pp = path(m.x, m.y, p.x, p.y); if (pp && pp.length > 1) { m.face = pp[0].x > m.x ? 1 : pp[0].x < m.x ? -1 : m.face; m.x = pp[0].x; m.y = pp[0].y; } } continue; }
    if (Math.random() < .15) { const h = HUNTS.find(x => x.id === m.hunt); const nx = m.x + rr(-1, 1), ny = m.y + rr(-1, 1); if (walk(nx, ny) && inRect(h.rect, nx, ny)) { m.face = nx > m.x ? 1 : nx < m.x ? -1 : m.face; m.x = nx; m.y = ny; } }
  }
}

export function botTick() {
  const t = now(), p = S.p;
  S.bots.forEach((b, i) => {
    if (b.moving > 0) b.moving--; if (b.immune > 0) b.immune--;
    if (t - b.grow > 120000) { b.grow = t; if (Math.random() < .5) { b.lvl++; b.skills.sword++; b.skills.shield++; b.rating += rr(-10, 15); } }
    if (b.busy > 0) {
      b.busy--;
      if (Math.random() < .12) { const h = HUNTS.find(x => x.id === b.hunt); const alive = S.mons.filter(m => m.alive && m.hunt === b.hunt && !m.boss); if (alive.length) { const m = alive[rr(0, alive.length - 1)]; if (m !== p.target && dist(m, b) <= 3) { m.alive = false; m.respawnAt = t + h.respawn; } else { const pp = path(b.x, b.y, m.x, m.y); if (pp && pp.length > 1) { b.path = pp.slice(0, 2); stepAlong(b); } } } }
      else if (Math.random() < .3) { const h = HUNTS.find(x => x.id === b.hunt); const nx = b.x + rr(-1, 1), ny = b.y + rr(-1, 1); if (walk(nx, ny) && inRect(h.rect, nx, ny)) { b.face = nx > b.x ? 1 : nx < b.x ? -1 : b.face; b.dir = nx > b.x ? "right" : nx < b.x ? "left" : ny > b.y ? "down" : "up"; b.x = nx; b.y = ny; b.moving = 2; } }
      if (p.lastHunt === b.hunt && p.dead === 0 && b.immune === 0 && Math.random() < .004 && b.king !== p.king) botTakesHunt(b);
      if (b.busy === 0) { b.hunt = null; b.next = t + rr(10000, 40000); b.path = path(b.x, b.y, BOT_SPOTS[i][0], BOT_SPOTS[i][1]) || []; }
      return;
    }
    if (b.path.length) { stepAlong(b); if (!b.path.length && b.goal) { b.hunt = b.goal.id; b.goal = null; b.busy = rr(90, 300) * (1000 / TICK) | 0; if (p.lastHunt === b.hunt) { log(`${b.name} (${KING[b.king].name}) entrou na sua hunt.`); emit("toast", { msg: `${b.name} entrou na sua hunt`, bad: true }); } } return; }
    if (t >= b.next) { const fit = HUNTS.filter(h => Math.abs(MONS[h.mon].lvl - b.lvl) <= 15); const list = fit.length ? fit : HUNTS.slice(0, 3); const h = list[rr(0, list.length - 1)]; const pos = freeTile(h.rect); b.goal = h; b.path = path(b.x, b.y, pos.x, pos.y) || []; if (!b.path.length) b.next = t + 5000; }
  });
}

// ---------- mercado ----------
export function refreshMarket() {
  if (S.market.listings.length > 14) return;
  const ids = Object.keys(ITEMS).filter(k => ITEMS[k].slot);
  while (S.market.listings.length < 12) { const id = ids[rr(0, ids.length - 1)]; const it = rollItem(id); const seller = S.bots[rr(0, S.bots.length - 1)]; S.market.listings.push({ it, seller: seller.name, king: seller.king, price: Math.floor(Math.max(ITEMS[id].price || ITEMS[id].sell * 3, itemValue(it) * (2.2 + Math.random() * 1.6))), at: now() }); }
}
export function buyListing(i) { const p = S.p, l = S.market.listings[i]; if (!l) return; if (p.gold < l.price) return emit("toast", { msg: "Gold insuficiente", bad: true }); if (p.bag.length >= ECON.BAG_CAP) return emit("toast", { msg: "Mochila cheia", bad: true }); p.gold -= l.price; S.stats.spent += l.price; p.bag.push(l.it); S.market.listings.splice(i, 1); log(`Comprou ${itemName(l.it)} de ${l.seller} por ${fmt(l.price)}.`, "good"); emit("ui"); }
export function listItem(idx, price) { const p = S.p, it = p.bag[idx]; if (!it) return; p.bag.splice(idx, 1); S.market.mine.push({ it, price, at: now(), fair: itemValue(it) * 3 }); log(`Anunciou ${itemName(it)} por ${fmt(price)} (taxa ${Math.round((p.premium ? ECON.PREMIUM_FEE : ECON.MARKET_FEE) * 100)}%).`); emit("ui"); }
export function marketTick() { const p = S.p; for (let i = S.market.mine.length - 1; i >= 0; i--) { const l = S.market.mine[i]; const age = (now() - l.at) / 60000; const chance = l.price <= l.fair ? .02 : l.price <= l.fair * 1.3 ? .006 : .001; if (Math.random() < chance * Math.min(age, 10)) { const fee = p.premium ? ECON.PREMIUM_FEE : ECON.MARKET_FEE; const got = Math.floor(l.price * (1 - fee)); p.gold += got; S.market.mine.splice(i, 1); log(`Vendeu ${itemName(l.it)} no market por ${fmt(l.price)} (+${fmt(got)} líquido).`, "good"); emit("ui"); } } if (Math.random() < .01 && S.market.listings.length) S.market.listings.splice(rr(0, S.market.listings.length - 1), 1); refreshMarket(); }
export function buyShop(id, qty = 1) { const p = S.p, d = ITEMS[id]; const cost = d.price * qty; if (p.gold < cost) return emit("toast", { msg: "Gold insuficiente", bad: true }); if (id === "potion") { p.pots += qty; } else { if (p.bag.length >= ECON.BAG_CAP) return emit("toast", { msg: "Mochila cheia", bad: true }); p.bag.push(rollItem(id)); } p.gold -= cost; S.stats.spent += cost; log(`Comprou ${qty > 1 ? qty + "x " : ""}${d.name} por ${fmt(cost)}.`); emit("ui"); }
export function sellToNpc(idx) { const p = S.p, it = p.bag[idx]; if (!it) return; const v = itemValue(it); p.bag.splice(idx, 1); p.gold += v; log(`Vendeu ${itemName(it)} pro NPC por ${fmt(v)}.`); emit("ui"); }
export function buyBless() { const p = S.p; if (!inRect(CAPITAL, p.x, p.y)) return emit("toast", { msg: "Só na capital", bad: true }); if (p.bless || p.gold < ECON.BLESS_COST) return; p.gold -= ECON.BLESS_COST; S.stats.spent += ECON.BLESS_COST; p.bless = true; log("Bênção comprada: morte perde 1% em vez de 5%.", "good"); emit("ui"); }

// ---------- arena (PvP ranqueado) ----------
export function arenaFight(b) {
  const p = S.p, tac = S.pvp.tactic, lines = [];
  let php = hpMax(p), bhp = 100 + 15 * b.lvl, ppots = Math.min(p.pots, 10), bpots = 8, ppow = power(p), bpow = power(b);
  const patk = atkOf(p) * (tac.stance === "agressivo" ? 1.2 : tac.stance === "defensivo" ? .85 : 1), pdef = defOf(p) * (tac.stance === "defensivo" ? 1.3 : tac.stance === "agressivo" ? .8 : 1);
  const batk = 8 + b.skills.sword * 1.1 + b.lvl * .5, bdef = b.skills.shield * .4 + b.lvl * .3;
  let round = 0, retreated = false;
  if (tac.opener === "forte") { const d = Math.floor(patk * 2.2); bhp -= d; lines.push(`Golpe de abertura: ${d} de dano.`); }
  while (round++ < 60 && php > 0 && bhp > 0) {
    const d1 = Math.max(1, Math.floor(patk * (.6 + Math.random() * .6) - bdef)); bhp -= d1;
    const d2 = Math.max(1, Math.floor(batk * (.6 + Math.random() * .6) - pdef)); php -= d2;
    if (php < hpMax(p) * tac.potionAt / 100 && ppots > 0) { ppots--; php = Math.min(hpMax(p), php + ECON.POT_HEAL + p.lvl); lines.push(`Rodada ${round}: você bebeu poção (${ppots} sobrando).`); }
    if (bhp < (100 + 15 * b.lvl) * .5 && bpots > 0) { bpots--; bhp += 60 + b.lvl; }
    if (php < hpMax(p) * tac.retreatAt / 100 && !retreated) { retreated = true; lines.push(`Rodada ${round}: você recuou pra curar, 2 rodadas sem atacar.`); php = Math.min(hpMax(p), php + 40 + p.lvl * 2); round += 2; }
    if (round % 10 === 0) lines.push(`Rodada ${round}: você ${Math.floor(php)} de vida, ${b.name} ${Math.floor(bhp)}.`);
  }
  const win = bhp <= 0 || (php > 0 && php / hpMax(p) > bhp / (100 + 15 * b.lvl));
  const exp = 1 / (1 + Math.pow(10, (b.rating - S.pvp.rating) / 400)), K = 32;
  const delta = win ? Math.round(K * (1 - exp)) : -Math.round(K * exp * .7);
  S.pvp.rating += delta; b.rating -= Math.round(delta * .5); if (win) S.pvp.wins++; else S.pvp.losses++;
  lines.push(win ? `Vitória em ${round} rodadas. +${delta} de rating.` : `Derrota em ${round} rodadas. ${delta} de rating (derrota cobra 70% do que a vitória pagaria).`);
  S.pvp.log.unshift({ vs: b.name, win, delta, lines, t: hhmm() }); if (S.pvp.log.length > 10) S.pvp.log.pop();
  log(`Arena: ${win ? "venceu" : "perdeu pra"} ${b.name} (${delta > 0 ? "+" : ""}${delta}).`, win ? "good" : "bad"); emit("ui");
  return { win, delta, lines, round };
}
export function pvpWeekTick() { if (now() >= S.pvp.weekReset) { const r = S.pvp.rating; S.pvp.rating = 1000 + Math.round(Math.max(0, r - 1000) * .2); S.pvp.weekReset = nextSunday(); log(`Semana da arena fechou. Rating de ${r} virou ${S.pvp.rating}.`); } }

// ---------- guerra ----------
export function donateWar(g) { const p = S.p; g = Math.min(g, p.gold); if (g <= 0) return; p.gold -= g; S.war.supplies[p.king] += Math.floor(g / 10); S.stats.spent += g; log(`Doou ${fmt(g)} gold pra guerra de ${KING[p.king].name}.`, "good"); emit("ui"); }
export function kingdomPower(k) { let s = S.war.supplies[k] * .5; for (const b of S.bots) if (b.king === k) s += power(b) * .6; if (S.p.king === k) s += power(S.p) * (1 + equipSum(S.p, "war")); const n = S.bots.filter(b => b.king === k).length + (S.p.king === k ? 1 : 0); const mult = n <= 2 ? 1.5 : n === 3 ? 1.2 : 1; return s * mult; }
export function simulateWar() {
  const res = {}; const pw = { grey: kingdomPower("grey"), ash: kingdomPower("ash"), thorn: kingdomPower("thorn") };
  for (const t of WAR.territories) { let best = null, bv = -1; for (const k of Object.keys(pw)) { const v = pw[k] * (.7 + Math.random() * .6); if (v > bv) { bv = v; best = k; } } res[t] = best; }
  S.war.owner = res; S.war.supplies = { grey: 0, ash: 0, thorn: 0 }; S.war.last = { at: now(), res, pw };
  const dom = dominant(); log(`Guerra de sábado: ${dom ? KING[dom].name + " domina com " + Object.values(res).filter(x => x === dom).length + " territórios (+15% exp por 7 dias)" : "sem reino dominante"}.`, dom === S.p.king ? "good" : "bad");
  S.war.next = nextWar(); emit("ui");
}
export function warTick() { if (now() >= S.war.next) simulateWar(); }

export function goHunt(id) { const p = S.p, hh = HUNTS.find(x => x.id === id); if (!hh) return; p.huntId = id; p.task = "goto"; p.path = []; p.target = null; log(`Indo caçar em ${hh.name}.`); emit("toast", { msg: `Indo pra ${hh.name}` }); emit("ui"); }
export function goHome() { const p = S.p; p.huntId = null; p.task = "deposit"; p.path = []; p.target = null; p.idleAfter = true; emit("toast", { msg: "Voltando pra capital" }); emit("ui"); }

// ---------- off-line ----------
export function offlineReport(ms) {
  const p = S.p, hours = Math.min(p.premium ? ECON.OFFLINE_H_PREMIUM : ECON.OFFLINE_H, ms / 3600000);
  if (hours < 1 / 60 || !p.huntId || p.task === "idle") return null;
  const h = HUNTS.find(x => x.id === p.huntId) || HUNTS[0], info = huntInfo(h, p), m = info.m;
  const share = 1 / (1 + S.bots.filter(b => Math.abs(m.lvl - b.lvl) <= 15).length * .3);
  const kills = Math.floor(info.perHour * hours * share), exp = Math.floor(kills * m.exp * expMult(p)), gold = Math.floor(kills * (m.gold[0] + m.gold[1]) / 2 * lootMult(p));
  const drops = Math.floor(kills * (m.drop ? m.drop.chance * (h.rare || 1) : 0)), deaths = Math.floor(hours * info.danger * 2 + (Math.random() < hours * info.danger ? 1 : 0)), taken = Math.random() < hours * .2 ? 1 : 0, before = p.lvl;
  p.exp += exp; while (p.exp >= expFor(p.lvl + 1)) p.lvl++; p.gold += gold; S.stats.exp += exp; S.stats.gold += gold; S.stats.kills += kills;
  const potsUsed = Math.min(p.pots, Math.floor(info.potsH * hours)); p.pots -= potsUsed; S.stats.pots += potsUsed;
  for (let i = 0; i < deaths; i++) { const l = Math.floor(p.exp * (p.bless ? .01 : .05)); p.exp -= l; p.bless = false; } while (p.lvl > 1 && p.exp < expFor(p.lvl)) p.lvl--;
  if (m.drop) for (let i = 0; i < drops && p.bag.length < ECON.BAG_CAP; i++) p.bag.push(rollItem(m.drop.item));
  if (taken) { S.stats.lost++; p.x = HOME.x; p.y = HOME.y; p.path = []; } S.stats.deaths += deaths; S.stats.drops += drops; p.hp = hpMax(p);
  return { hours, kills, exp, gold, drops, deaths, taken, levels: p.lvl - before, hunt: h.name, potsUsed };
}

// ---------- save ----------
export function save() { const p = S.p; if (!p) return; const d = { p: { ...p, path: [], target: null }, bots: S.bots.map(b => ({ ...b, path: [], goal: null })), stats: S.stats, auto: S.auto, event: S.event, war: S.war, pvp: S.pvp, market: S.market, feed: S.feed.slice(0, 30), lastSeen: now() }; try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { } }
export function load() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); if (!d) return null; S.p = { ...d.p, path: [], target: null, dead: 0, immune: 0, moving: 0 }; if (!walk(S.p.x, S.p.y)) { S.p.x = HOME.x; S.p.y = HOME.y; } if (d.bots) S.bots = d.bots.map(b => ({ ...b, path: [], goal: null, busy: 0, hunt: null })); Object.assign(S.stats, d.stats, { start: now() }); Object.assign(S.auto, d.auto || {}); if (d.event) S.event = d.event; if (d.war) S.war = d.war; if (d.pvp) S.pvp = d.pvp; if (d.market) S.market = d.market; S.feed = d.feed || []; return now() - (d.lastSeen || now()); } catch (e) { return null; } }
export function resetSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }
