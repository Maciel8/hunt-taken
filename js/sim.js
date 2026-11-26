// Simulação: jogador, rivais, criaturas, combate, economia, arena, guerra, off-line.
import { extendPath } from "./continent.js";
import { T, TICK, KING, VOC, MONS, ITEMS, RARITY, HUNTS, REGIONS, CAPITAL, DEPOT, HOME, ECON, WAR, TIERS, expFor, skillNext } from "./data.js";
import { walk, findPath, huntAt, inRect, freeTile, regionAt, inVila, NPCS } from "./world.js";
import { projectile, slash, burst, dying, ring, later } from "./fx.js";
import { drawMonGhost } from "./art.js";

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
  server: true, gold: 0, inventory: [], session: null, reports: [], huntState: {}, presence: {}, occupants: [], influence: [], events: [], rivals: [], medianRival: 1,
};
export const emit = (ev, data) => S.listeners.forEach(f => f(ev, data));
export const P = () => S.p;

function nextWar() { const d = new Date(); d.setHours(WAR.hour, 0, 0, 0); while (d.getDay() !== WAR.day || d <= new Date()) d.setDate(d.getDate() + 1); return d.getTime(); }
function nextSunday() { const d = new Date(); d.setHours(0, 0, 0, 0); do d.setDate(d.getDate() + 1); while (d.getDay() !== 0); return d.getTime(); }

// ---------- criação ----------
export function newPlayer(name, voc, king) {
  return { name, king, voc, x: HOME.x, y: HOME.y, lvl: 1, exp: 0, hp: 150, mana: 50, skills: { sword: 10, distance: 10, magic: 0, shield: 10 }, skillXp: { sword: 0, distance: 0, magic: 0, shield: 0 },
    gold: 50, pots: 5, bag: [], equip: { weapon: null, shield: null, armor: null, helmet: null, ring: null }, bless: false, premium: false,
    huntId: null, task: "idle", target: null, path: [], dead: 0, attackCd: 0, immune: 0, lastHunt: null, moving: false, dir: "down", face: 1, speed: 3.6, anim: 0, vx: 0, vy: 0, seed: Math.floor(Math.random() * 24), created: now() };
}
export function spawnAll() {
  S.mons = [];
  const mk = (h, type, boss) => { const pos = freeTile(h); return { hunt: h.id, type, x: pos.x, y: pos.y, hp: MONS[type].hp, alive: !boss, respawnAt: boss ? now() + rr(2, 8) * 60000 : 0, cd: 0, face: 1, boss: !!boss, path: [], speed: MONS[type].speed === 2 ? 2.4 : 1.4, anim: 0, moving: false, think: Math.random() * 3 }; };
  S.mk = mk; S.spawned = new Set();
  for (const h of HUNTS) { if (h.city) continue; for (let i = 0; i < h.spawns; i++) S.mons.push(mk(h, h.mon)); if (h.boss) S.mons.push(mk(h, h.boss, true)); }
}
// áreas de caça do continente: monstros só existem perto da câmera/jogador (centenas de áreas sem pesar)
export function spawnNear(cx, cy) {
  if (!S.mk) return;
  for (const h of HUNTS) { if (!h.city) continue; const d = Math.hypot(h.cx - cx, h.cy - cy);
    if (d < 230 && !S.spawned.has(h.id)) { S.spawned.add(h.id); for (let i = 0; i < h.spawns; i++) S.mons.push(S.mk(h, h.mon)); if (h.boss && MONS[h.boss]) S.mons.push(S.mk(h, h.boss, true)); }
    else if (d > 420 && S.spawned.has(h.id) && S.p?.huntId !== h.id) { S.spawned.delete(h.id); S.mons = S.mons.filter(m => m.hunt !== h.id); } }
}

// ---------- derivados ----------
export const hpMax = p => p.hpMax || (100 + VOC[p.voc].hpPerLvl * p.lvl + equipSum(p, "hp"));
export const manaMax = p => p.manaMax || (30 + VOC[p.voc].manaPerLvl * p.lvl);
export const mainSkill = p => p.skills[VOC[p.voc].skill] ?? 10;
export function equipSum(p, k) { let s = 0; for (const it of Object.values(p.equip || {})) if (it) { const d = ITEMS[it.id]; const base = d[k] || 0; s += base * (RARITY[it.rar]?.mult || 1) + (it.roll?.[k] || 0); } return s; }
export const atkOf = p => p.atk || (VOC[p.voc].atkBase + mainSkill(p) * 1.1 + equipSum(p, "atk"));
export const defOf = p => p.def || ((equipSum(p, "def") + (p.skills.shield || 10) * .3) * VOC[p.voc].defMul);
export const power = e => e.power || ((e.lvl * 2 + (e.skills ? (mainSkill(e) * 3 + e.skills.shield * 2) : 50) + (e.equip ? equipSum(e, "atk") * 2 + equipSum(e, "def") * 2 : e.lvl * 1.5) + (e.pots || 0) * .5) * (1 + tierBonus(e)));
export function tierBonus(e) { if (e !== S.p) return 0; const t = tierOf(S.pvp.rating); return t * .02; }
export function tierOf(r) { let i = 0; TIERS.forEach((t, k) => { if (r >= t[1]) i = k; }); return i; }
export const medianBotLvl = () => { const l = S.bots.map(b => b.lvl).sort((a, b) => a - b); return l[Math.floor(l.length / 2)] || 1; };
export function expMult(p) {
  if (S.server) { let m = 1; for (const e of S.events) if (!e.hunt_id) m *= 1 + Number(e.payload?.exp || 0); if (p.lvl < S.medianRival) m *= 2; return m; }
  let m = 1; if (p.premium) m *= 1.5; if (S.event && now() < S.event.until) m *= 1 + S.event.exp; if (dominant() === p.king) m *= 1.15; if (p.lvl < medianBotLvl()) m *= 5; return m;
}
export function lootMult(p) { let m = 1; if (p.king === "grey") m *= 1.05; if (S.server) { for (const e of S.events) if (!e.hunt_id) m *= 1 + Number(e.payload?.loot || 0); return m; } if (S.event && now() < S.event.until) m *= 1 + S.event.loot; m *= 1 + equipSum(p, "loot"); const h = p.lastHunt && HUNTS.find(x => x.id === p.lastHunt); if (h?.rare) m *= 1; return m; }
export function dominant() { const c = { grey: 0, ash: 0, thorn: 0 }; for (const k of Object.values(S.war.owner)) c[k]++; const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return best[1] >= 5 ? best[0] : null; }

export function log(msg, kind) { S.feed.unshift({ t: hhmm(), msg, kind }); if (S.feed.length > 60) S.feed.pop(); emit("feed"); }
// abates seguidos do mesmo monstro viram uma linha só com contador (×N)
export function clog(msg, kind) { const top = S.clog[0]; if (top && top.msg === msg) { top.n = (top.n || 1) + 1; top.t = S.t; return; } S.clog.unshift({ msg, kind, t: S.t, n: 1 }); if (S.clog.length > 6) S.clog.pop(); }
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

export function occupantsOf(id) { if (S.server) return occupantsServer(id); const o = []; if (S.p.lastHunt === id) o.push(S.p); for (const b of S.bots) if (b.hunt === id && b.busy > 0) o.push(b); return o; }
export function huntInfo(h, p = S.p) {
  // espelha a conta do servidor: spawn × população, limitado pelo tempo de matar, dividido entre ocupantes
  const m = MONS[h.mon], pop = S.server ? huntStateOf(h.id).population : 100, pf = .2 + .8 * pop / 100;
  const occ = Math.max(1, occupantsOf(h.id).length + (S.server && S.p.huntId !== h.id ? 1 : 0));
  const dps = Math.max(1, atkOf(p) * .9 - m.def), ttk = m.hp / dps * .8, capKills = 3600 / (ttk + 2);
  const spawnH = h.spawns * 3600000 / (h.respawn + 6000) * pf, perHour = Math.min(spawnH / occ, capKills) * (p.lvl < m.lvl * .6 ? .5 : 1);
  const evLocal = S.server ? S.events.filter(e => e.hunt_id === h.id) : [];
  const goldH = perHour * ((m.gold[0] + m.gold[1]) / 2) * lootMult(p) * (1 + evLocal.reduce((a, e) => a + Number(e.payload?.loot || 0), 0));
  const expH = perHour * m.exp * expMult(p) * (1 + evLocal.reduce((a, e) => a + Number(e.payload?.exp || 0), 0));
  const danger = clamp((m.lvl - p.lvl) * .06 + .03, .01, .95);
  const dmgIn = Math.max(0, m.atk - defOf(p)) * ttk / 1.2 * perHour, potsH = clamp(dmgIn / (60 + p.lvl), 0, 400);
  return { m, perHour, goldH, expH, danger, occ, share: 1, potsH, netH: goldH - potsH * ECON.POT_COST, lvlOk: p.lvl >= m.lvl * .6 };
}

// ---------- movimento contínuo ----------
// Posição em tiles com casas decimais (centro do tile = inteiro). A rota é uma lista de pontos já alisada.
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const EXTRA_HUNTS = [];
const findHunt = id => HUNTS.find(x => x.id === id) || EXTRA_HUNTS.find(x => x.id === id);
export function moveEntity(e, dt) {
  if (e.path && e.path.rest && e.path.length < 4) extendPath(e.path);
  if (!e.path || !e.path.length) { e.moving = false; e.vx = 0; e.vy = 0; return; }
  let budget = e.speed * dt, moved = 0;
  while (budget > 0 && e.path.length) {
    const t = e.path[0], dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
    if (d <= budget) { e.x = t.x; e.y = t.y; e.path.shift(); budget -= d; moved += d; }
    else { e.x += dx / d * budget; e.y += dy / d * budget; moved += budget; budget = 0; }
  }
  const t = e.path[0] || { x: e.x, y: e.y }, dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy) || 1;
  e.vx = dx / d * e.speed; e.vy = dy / d * e.speed; e.moving = moved > 0; e.anim = (e.anim || 0) + moved;
  // direção com histerese: só troca de eixo quando o outro domina com folga
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const horiz = e.dir === "left" || e.dir === "right";
  if (horiz ? ay > ax * 1.35 : ax > ay * 1.35 || !e.dir) e.dir = ax >= ay ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  else e.dir = horiz ? (dx > 0 ? "right" : dx < 0 ? "left" : e.dir) : (dy > 0 ? "down" : dy < 0 ? "up" : e.dir);
  if (dx) e.face = dx > 0 ? 1 : -1;
}
// WASD / setas: anda direto com colisão por eixo (desliza nas paredes e nunca entra na água)
export const keys = new Set();
function manualMove(p, dt) {
  let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
  if (!dx && !dy) { if (p.manual) { p.manual = false; p.moving = false; p.vx = p.vy = 0; const h = huntAt(p.x, p.y); if (p.inDungeon) p.task = "hunt"; else if (h && h.id === p.manualFrom) { p.task = "hunt"; p.huntId = h.id; } else if (h) { p.huntId = h.id; p.task = "hunt"; emit("arrive", h.id); } else { if (p.manualFrom) emit("leave"); p.huntId = null; p.task = "idle"; emit("ui"); } } return false; }
  if (!p.manual) { p.manual = true; p.manualFrom = p.task === "hunt" || p.task === "goto" ? p.huntId : null; }
  const l = Math.hypot(dx, dy); dx /= l; dy /= l; const st = p.speed * dt;
  p.path = []; p.target = null; p.task = "walk";
  const ok = (x, y) => walk(Math.round(x), Math.round(y)) && walk(Math.round(x + .3), Math.round(y)) && walk(Math.round(x - .3), Math.round(y)) && walk(Math.round(x), Math.round(y + .3));
  if (ok(p.x + dx * st, p.y)) p.x += dx * st; if (ok(p.x, p.y + dy * st)) p.y += dy * st;
  p.vx = dx * p.speed; p.vy = dy * p.speed; p.moving = true; p.anim = (p.anim || 0) + st;
  p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); if (dx) p.face = dx > 0 ? 1 : -1;
  return true;
}
export function updateMovement(dt) {
  const p = S.p; if (p && p.dead <= 0 && !manualMove(p, dt)) moveEntity(p, dt);
  const dec = e => { if (e.atkT > 0) e.atkT -= dt; if (e.hitT > 0) e.hitT -= dt; };
  if (p) dec(p);
  for (const m of S.mons) if (m.alive) { moveEntity(m, dt); dec(m); }
  for (const n of NPCS) { moveEntity(n, dt); }
}
// NPCs: olham em volta; guardas fazem ronda curta
export function npcTick() {
  for (const n of NPCS) {
    if (!n.home) { n.home = { x: n.x, y: n.y }; n.speed = 1.3; n.path = []; n.anim = 0; n.seed = (n.x * 7 + n.y) % 24; }
    if (n.path.length) continue;
    if (n.voc === "guarda" && Math.random() < .08) { const tx = n.home.x + (Math.abs(n.x - n.home.x) < .5 ? (Math.random() < .5 ? -3 : 3) : 0), ty = n.home.y; const pp = findPath(n.x, n.y, tx, ty, 400); if (pp) n.path = pp; }
    else if (Math.random() < .06) n.dir = ["down", "left", "right", "down", "up"][Math.floor(Math.random() * 5)];
  }
}
// se o personagem ficou em cima de um tile bloqueado (colisão do andar manual), encosta no livre mais perto
function unstick(e) { if (walk(e.x, e.y)) return; for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(e.x + dx, e.y + dy)) { e.x = Math.floor(e.x + dx) + .5; e.y = Math.floor(e.y + dy) + .5; return; } }
function goTo(e, x, y) { const pp = findPath(e.x, e.y, x, y); e.path = pp || []; return !!pp; }
function nearestMon(p, range, huntId) { let best = null, bd = 1e9; for (const m of S.mons) if (m.alive && (!huntId || m.hunt === huntId)) { const d = dist(m, p); if (d <= range && d < bd) { bd = d; best = m; } } return best; }

export function playerTick() {
  const p = S.p, voc = VOC[p.voc];
  if (p.immune > 0) p.immune--;
  if (p.dead > 0) { p.dead--; return; }
  p.lastHunt = huntAt(p.x, p.y)?.id || null;
  if (p.task === "idle" || p.task === "gather") return;
  // andar manual: chegou numa área de caça, começa a caçar ali; fora dela, para
  if (p.task === "walk") { if (!p.path.length && p.pendingDoor) { const d = p.pendingDoor; p.pendingDoor = null; p.task = "idle"; emit("door", d); return; } if (!p.path.length && !p.manual) { const h = huntAt(p.x, p.y); if (h) { p.huntId = h.id; p.task = "hunt"; emit("arrive", h.id); log(`Chegou em ${h.name}.`); } else { p.task = "idle"; emit("ui"); } } return; }
  const hh = p.huntId && findHunt(p.huntId);
  if (!hh) { p.task = "idle"; return; }
  if (p.task === "goto") {
    if (huntAt(p.x, p.y)?.id === hh.id && dist(p, { x: hh.cx, y: hh.cy }) < hh.r * .8) { p.task = "hunt"; p.path = []; log(`Chegou em ${hh.name}.`); if (S.server && S.session?.hunt_id !== hh.id) emit("arrive", hh.id); emit("ui"); return; }
    if (!p.path.length) {
      // não desiste: tenta outros pontos da área, desencosta de parede e tenta de novo a cada 2 s
      if (p.gotoWait && performance.now() < p.gotoWait) return;
      const d = freeTile({ ...hh, r: hh.r * .5 });
      if (goTo(p, d.x, d.y) || goTo(p, hh.cx, hh.cy) || goTo(p, hh.door[0], hh.door[1] + 1)) { p.gotoWarned = false; return; }
      unstick(p); p.gotoWait = performance.now() + 2000;
      if (!p.gotoWarned) { p.gotoWarned = true; log(`Procurando caminho até ${hh.name}…`); }
    }
    return;
  }
  // caçando: escolhe o alvo mais perto, chega no alcance e ataca; sem alvo, patrulha a área
  if (!p.target || !p.target.alive || dist(p.target, { x: hh.cx, y: hh.cy }) > hh.r + 3) p.target = nearestMon(p, hh.r + 6, hh.id);
  const m = p.target;
  if (m) {
    const d = dist(m, p), reach = voc.range + .35;
    if (d <= reach) {
      p.path = []; const dx = m.x - p.x, dy = m.y - p.y; p.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); p.face = dx >= 0 ? 1 : -1;
      if (p.attackCd-- <= 0) {
        p.attackCd = voc.skill === "magic" ? 2 : 1; const mt = MONS[m.type];
        const dmg = Math.max(1, Math.floor(atkOf(p) * (p.king === "ash" ? 1.05 : 1) * (.6 + Math.random() * .6) - mt.def));
        p.atkT = p.atkDur = .36; p.atkSeq = (p.atkSeq || 0) + 1;
        const hit = () => { if (!m.alive) return; m.hp -= dmg; m.hitT = .15; fx.push({ x: m.x, y: m.y, v: "-" + dmg, t: 8, c: "#fff" }); burst(m, p.voc === "knight" ? "#ffe6a8" : p.voc === "paladin" ? "#e8dfc9" : p.voc === "druid" ? "#9be36b" : "#c9a8ff", 6); if (m.hp <= 0) killMon(p, m); };
        if (p.voc === "knight") later(.16, () => { slash(m, p.dir, KING[p.king].light); hit(); });
        else later(.2, () => projectile(p.voc === "paladin" ? "arrow" : p.voc === "druid" ? "nature" : "arcane", p, m, hit));
      }
      return;
    }
    const end = p.path[p.path.length - 1];
    if (!end || Math.hypot(end.x - m.x, end.y - m.y) > 1.5) { goTo(p, Math.round(m.x), Math.round(m.y)); if (p.path.length && voc.range > 1) { /* para no alcance */ } }
    return;
  }
  if (!p.path.length && Math.random() < .4) { const d = freeTile({ ...hh, r: hh.r * .8 }); goTo(p, d.x, d.y); }
}
function killMon(p, m) {
  const mt = MONS[m.type], h = findHunt(m.hunt) || { respawn: 1e12 };
  dying(m, drawMonGhost); burst(m, "#ffcf5a", 10, 2.8); ring(m, "#ffcf5a");
  m.alive = false; m.path = []; m.respawnAt = now() + (m.boss ? rr(8, 15) * 60000 : h.respawn); S.stats.kills++;
  clog(`${mt.name} derrotado`, "kill"); p.target = null;
}
export function depositAtNpc() {}

export function monTick() {
  const t = now(), p = S.p;
  for (const m of S.mons) {
    const mt = MONS[m.type], h = m.home || HUNTS.find(x => x.id === m.hunt);
    if (!m.alive) { if (t >= m.respawnAt) { const pos = freeTile(h); m.x = pos.x; m.y = pos.y; m.hp = mt.hp; m.alive = true; m.path = []; if (m.boss) log(`${mt.name} apareceu em ${h.name}!`, "bad"); } continue; }
    // quem apanha persegue (inclusive de arqueiro/mago a distância) e quem está perto ataca
    if (m.hitT > 0) m.aggro = now() + 8000;
    const d = dist(m, p), engaged = p.dead === 0 && p.task === "hunt" && p.huntId === m.hunt && (p.target === m || d < 2.2 || (m.aggro > t && d < 12));
    if (engaged) {
      if (d > 1.25) { if (!m.path.length || (m.think -= 1) <= 0) { m.think = 2; const pp = findPath(Math.round(m.x), Math.round(m.y), Math.round(p.x), Math.round(p.y), 3000); m.path = pp ? pp.slice(0, -1) : []; if (!m.path.length && d > 1.25) { const dx = Math.sign(Math.round(p.x) - Math.round(m.x)), dy = Math.sign(Math.round(p.y) - Math.round(m.y)); if (walk(Math.round(m.x) + dx, Math.round(m.y) + dy)) m.path = [{ x: Math.round(m.x) + dx, y: Math.round(m.y) + dy }]; } } }
      else { m.path = []; m.face = p.x > m.x ? 1 : -1; if (m.cd-- <= 0) { m.cd = 2; const dd = Math.hypot(p.x - m.x, p.y - m.y) || 1; m.atkDx = (p.x - m.x) / dd; m.atkDy = (p.y - m.y) / dd; m.atkT = .3; const raw = mt.atk * (.75 + Math.random() * .5), dmg = Math.max(Math.ceil(raw * .3), Math.floor(raw - defOf(p) * .7)), blocked = Math.random() < .08; /* mesma regra do servidor: dano mínimo de 30%; bloqueio é raro */ later(.14, () => { if (!m.alive) return; if (!blocked) { p.hitT = .14; burst(p, "#ff8a8a", 4, 1.6); } else ring(p, "#9fe8c9"); fx.push({ x: p.x, y: p.y, v: !blocked ? "-" + dmg : "bloqueou", t: 8, c: !blocked ? "#ff8a8a" : "#9fe8c9" }); }); } }
      continue;
    }
    // vaga devagar no próprio habitat, sem sair do raio
    if (!m.path.length && (m.think -= 1) <= 0) { m.think = 3 + Math.random() * 8; const a = Math.random() * 6.283, r = 1 + Math.random() * 3; let x = Math.round(m.x + Math.cos(a) * r), y = Math.round(m.y + Math.sin(a) * r); if (Math.hypot(x - h.cx, y - h.cy) > h.r) { x = Math.round(h.cx + (m.x - h.cx) * .6); y = Math.round(h.cy + (m.y - h.cy) * .6); } if (walk(x, y)) { const pp = findPath(m.x, m.y, x, y, 600); m.path = pp || []; } }
  }
}

export function botTick() {}

// aplica o estado do servidor no estado local (números são do servidor; posição e animação são locais)
export function applyServer(st) {
  if (!st || !st.character) return;
  const c = st.character, p = S.p;
  Object.assign(p, { name: c.name, king: c.kingdom, voc: c.vocation, lvl: c.level, exp: Number(c.exp), hp: c.hp, mana: c.mana, skills: c.skills, skillXp: c.skill_xp || {}, pots: c.pots, bless: c.bless, premium: c.premium, serverId: c.id, hpMax: c.hp_max, manaMax: c.mana_max, atk: c.atk, def: c.def, power: c.power, attrs: c.attrs, freeReset: !!c.free_reset, classId: c.class_id, specId: c.spec_id, expNext: Number(c.exp_next), expCur: Number(c.exp_cur), behavior: c.behavior, killsTotal: Number(c.kills), deathsTotal: c.deaths });
  S.cstats = st.stats || {}; S.pointsFree = st.points_free || 0; S.cls = st.class; S.spec = st.spec; S.skillsOn = st.skills_on || []; S.profs = st.professions || []; S.stacks = st.stacks || []; S.carry = st.carry || { used: 0, cap: 100 }; S.gatherJob = st.gather_job; S.craftJobs = st.craft_jobs || [];
  S.gold = Number(st.gold || 0); S.gems = Number(st.gems || 0); S.clan = st.clan || null; S.quests = st.quests || []; S.trades = st.trades || []; S.clanInvites = st.clan_invites || []; S.clanSent = st.clan_sent || []; S.world = st.world || S.world || null; S.usdtEquiv = st.usdt_equiv || 0; S.clanExtra = st.clan_extra || null; S.fortOwner = st.fort_owner || null; S.marketNews = st.market_news || 0; S.admin = !!st.admin; S.dungeon = st.dungeon || null; S.inventory = st.inventory || []; S.session = st.session; S.reports = st.reports || []; S.huntState = st.hunt_state || {}; S.presence = st.presence || {}; S.occupants = st.occupants || []; S.influence = st.influence || []; S.events = st.events || []; S.medianRival = st.median_level || 1;
  // sincroniza modo/hunt local com o servidor
  // andando até uma caçada (a pé): o servidor só começa a caçada quando o personagem chega, então o "indo" local é mantido
  const wasHunt = p.huntId; if (!p.inDungeon) p.huntId = c.hunt_id || (p.task === "goto" ? p.huntId : null);
  // primeira carga: aparece onde o servidor diz que está (na área de caça ou na vila). Depois disso a posição é do movimento local.
  if (!p.placed) { p.placed = true; const h0 = c.task === "hunt" && HUNTS.find(x => x.id === c.hunt_id); if (h0) { const f = freeTile({ ...h0, r: h0.r * .5 }); p.x = f.x; p.y = f.y; p.task = "hunt"; } else { p.x = HOME.x; p.y = HOME.y; p.task = "idle"; } }
  else if (p.inDungeon) { }
  else if (c.task === "hunt") { if (p.task === "idle" || wasHunt !== p.huntId) { p.task = huntAt(p.x, p.y)?.id === p.huntId ? "hunt" : "goto"; p.path = []; p.target = null; } }
  else if (p.task !== "walk" && p.task !== "gather" && p.task !== "goto") { p.task = "idle"; if (wasHunt) { p.path = []; p.target = null; } }
  // nenhum personagem é desenhado sem posição real vinda do servidor (etapa 3). Lista de online vem do servidor.
  S.bots = []; S.ranking = st.ranking || []; S.online = st.online || 0;
  emit("ui");
}
export const huntStateOf = id => S.huntState[id] || { population: 100, state: "abundante" };
export function territoryOf(id) {
  const list = S.influence.filter(i => i.hunt_id === id).sort((a, b) => b.influence - a.influence);
  if (!list.length || list[0].influence < 20) return { state: "livre", top: null, list };
  if (list.length > 1 && list[1].influence >= 20 && list[0].influence - list[1].influence < 25) return { state: "disputada", top: list[0], list };
  return { state: list[0].influence >= 50 ? "dominada" : "disputada", top: list[0], list };
}
export function occupantsServer(id) { return S.occupants.filter(o => o.hunt_id === id); }

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

export function goHunt(id) { const p = S.p, hh = HUNTS.find(x => x.id === id); if (!hh) return; p.huntId = id; p.task = huntAt(p.x, p.y)?.id === id ? "hunt" : "goto"; p.path = []; p.target = null; log(`Indo caçar em ${hh.name}.`); emit("toast", { msg: `Indo pra ${hh.name}` }); emit("ui"); }
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

// clique num tile: anda até lá por uma rota alisada. Se estava caçando, avisa o servidor que parou.
export function walkTo(x, y) {
  const p = S.p; const pp = findPath(p.x, p.y, x, y); if (!pp) return false;
  const wasHunting = p.task === "hunt" || p.task === "goto";
  p.task = "walk"; p.path = pp; p.target = null; if (wasHunting) { p.huntId = null; emit("leave"); }
  return true;
}
