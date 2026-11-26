import { GROUNDS, PLACES } from "./geo.js";
// Dados do jogo: vocações, criaturas, hunts, itens, reinos, constantes. Nada de número solto no código.
export const T = 32;                 // tile em px
export const TICK = 400;             // ms por tick
export const MW = 300, MH = 200;     // mundo em tiles (geo.js: 1200x800 unidades, 4 por tile)
// interiores e masmorras ficam numa faixa além da costa sul do continente (no mundo: y >= IY); por dentro usam as linhas 208-271 da grade do coração
export const IY = 4816, IYR = 208, MHA = 272;

export const KING = {
  grey: { name: "Greyhold", color: "#6ea8ff", tunic: "#3a62b8", dark: "#24407f", light: "#5a84d6", bonus: "+5% loot" },
  ash: { name: "Ashvale", color: "#ff5d5d", tunic: "#b53c34", dark: "#7c2621", light: "#d6625a", bonus: "+5% dano" },
  thorn: { name: "Thornmere", color: "#64e08a", tunic: "#3a9a58", dark: "#25663a", light: "#58ba78", bonus: "+5% regen" },
};

export const VOC = {
  knight: { name: "Knight", skill: "sword", range: 1, hpPerLvl: 15, manaPerLvl: 5, atkBase: 8, defMul: 1.25, desc: "Mata devagar, gasta pouco, difícil de expulsar." },
  paladin: { name: "Paladin", skill: "distance", range: 4, hpPerLvl: 10, manaPerLvl: 15, atkBase: 10, defMul: 1.0, desc: "Ataca de longe, gasta munição, bom pra tomar hunt." },
  sorcerer: { name: "Sorcerer", skill: "magic", range: 3, hpPerLvl: 5, manaPerLvl: 30, atkBase: 14, defMul: 0.75, desc: "Dano alto em área, gasta muita poção, frágil." },
  druid: { name: "Druid", skill: "magic", range: 3, hpPerLvl: 5, manaPerLvl: 30, atkBase: 11, defMul: 0.85, desc: "Cura e dano médio, multiplica o grupo na guerra." },
};

// Curva cúbica sem teto (Pokeidle): xp total pra chegar no level L
export const expFor = L => Math.max(0, Math.round(50 / 3 * (L ** 3 - 6 * L ** 2 + 17 * L - 12)));
export const skillNext = s => Math.floor(40 * Math.pow(1.1, s - 10));

export const MONS = {
  rato: { name: "Rato-do-campo", lvl: 1, hp: 22, atk: 4, def: 0, exp: 5, gold: [1, 3], speed: 1, drop: null, sprite: "rat" },
  javali: { name: "Javali", lvl: 5, hp: 80, atk: 9, def: 2, exp: 25, gold: [3, 7], speed: 1, drop: { item: "presa", chance: .02 }, sprite: "boar" },
  bandido: { name: "Bandido", lvl: 9, hp: 170, atk: 16, def: 5, exp: 60, gold: [8, 16], speed: 1, drop: { item: "capa", chance: .01 }, sprite: "bandit" },
  aranha: { name: "Aranha-de-teia", lvl: 12, hp: 320, atk: 24, def: 8, exp: 120, gold: [12, 28], speed: 1, drop: { item: "seda", chance: .03 }, sprite: "spider" },
  lobo: { name: "Lobo cinzento", lvl: 15, hp: 420, atk: 30, def: 10, exp: 180, gold: [15, 35], speed: 2, drop: { item: "pele", chance: .02 }, sprite: "wolf" },
  afogado: { name: "Afogado", lvl: 17, hp: 700, atk: 40, def: 14, exp: 320, gold: [30, 60], speed: 1, drop: { item: "anel_enf", chance: .005 }, sprite: "drowned" },
  bruxa: { name: "Bruxa do pântano", lvl: 19, hp: 950, atk: 55, def: 16, exp: 520, gold: [50, 90], speed: 1, drop: { item: "cajado", chance: .004 }, sprite: "witch" },
  mineiro: { name: "Mineiro morto", lvl: 62, hp: 1400, atk: 70, def: 22, exp: 800, gold: [80, 140], speed: 1, drop: { item: "capacete_ferro", chance: .005 }, sprite: "miner" },
  golem: { name: "Golem de carvão", lvl: 70, hp: 2300, atk: 90, def: 35, exp: 1300, gold: [120, 200], speed: 1, drop: { item: "nucleo", chance: .01 }, sprite: "golem" },
  vespa: { name: "Vespa-rainha", lvl: 78, hp: 2600, atk: 115, def: 30, exp: 1900, gold: [160, 260], speed: 2, drop: { item: "ferrao", chance: .003 }, sprite: "wasp" },
  cavaleiro: { name: "Cavaleiro caído", lvl: 85, hp: 4200, atk: 140, def: 50, exp: 2800, gold: [220, 380], speed: 1, drop: { item: "espada_quebrada", chance: .002 }, sprite: "fallen" },
  guardiao: { name: "Guardião de pedra", lvl: 95, hp: 6500, atk: 170, def: 70, exp: 4000, gold: [320, 520], speed: 1, drop: { item: "placa", chance: .002 }, sprite: "guardian" },
  goblin: { name: "Goblin saqueador", lvl: 7, hp: 100, atk: 15, def: 3, exp: 50, gold: [7, 16], speed: 2, drop: null, sprite: "bandit", tint: "goblin" },
  ent: { name: "Ent ancestral", lvl: 19, hp: 1000, atk: 40, def: 12, exp: 900, gold: [19, 40], speed: 1, drop: null, sprite: "golem", tint: "ancient", scale: 1.2 },
  anciao: { name: "O Ancião da Floresta", lvl: 24, hp: 20000, atk: 60, def: 20, exp: 0, gold: [0, 0], speed: 1, drop: null, sprite: "golem", tint: "ancient", scale: 2.2, boss: true },
  lobo_neve: { name: "Lobo-das-neves", lvl: 26, hp: 3000, atk: 120, def: 40, exp: 2200, gold: [180, 300], speed: 2, drop: { item: "pele", chance: .01 }, sprite: "wolf", tint: "snow" },
  troll_gelo: { name: "Troll de gelo", lvl: 33, hp: 4800, atk: 150, def: 55, exp: 3300, gold: [250, 420], speed: 1, drop: { item: "placa", chance: .002 }, sprite: "golem", tint: "ice" },
  sentinela: { name: "Sentinela de pedra", lvl: 90, hp: 5200, atk: 155, def: 60, exp: 3600, gold: [280, 450], speed: 1, drop: { item: "espada_quebrada", chance: .002 }, sprite: "guardian", tint: "void" },
  dragonling: { name: "Filhote de dragão", lvl: 70, hp: 1800, atk: 80, def: 25, exp: 0, gold: [0, 0], speed: 2, drop: null, sprite: "dragon", scale: .42, tint: "fire" },
  guardiao_lava: { name: "Guardião de lava", lvl: 85, hp: 6000, atk: 120, def: 45, exp: 0, gold: [0, 0], speed: 1, drop: null, sprite: "guardian", tint: "fire" },
  dragonling_elite: { name: "Dragão jovem", lvl: 90, hp: 4000, atk: 110, def: 35, exp: 0, gold: [0, 0], speed: 2, drop: null, sprite: "dragon", scale: .62 },
  dragao: { name: "Ignaroth, o Dragão", lvl: 120, hp: 60000, atk: 200, def: 60, exp: 0, gold: [0, 0], speed: 1, drop: null, sprite: "dragon", boss: true, scale: 1.4 },
  // bosses
  capataz: { name: "O Capataz", lvl: 85, hp: 30000, atk: 160, def: 45, exp: 25000, gold: [2000, 4000], speed: 1, drop: { item: "picareta", chance: 1 }, sprite: "boss_foreman", boss: true },
  mae_vespas: { name: "Mãe das Vespas", lvl: 88, hp: 42000, atk: 190, def: 40, exp: 40000, gold: [3000, 5000], speed: 2, drop: { item: "quitina", chance: 1 }, sprite: "boss_wasp", boss: true },
  rei: { name: "Rei Esquecido", lvl: 100, hp: 90000, atk: 260, def: 80, exp: 120000, gold: [8000, 12000], speed: 1, drop: { item: "coroa", chance: 1 }, sprite: "boss_king", boss: true },
};

export const ITEMS = {
  potion: { name: "Poção de vida", price: 20, sell: 0, heal: 60, icon: "potion" },
  presa: { name: "Presa de javali", sell: 120, icon: "tusk", mat: true },
  capa: { name: "Capa de couro", sell: 400, icon: "cape", slot: "armor", def: 3 },
  seda: { name: "Seda", sell: 90, icon: "rope", mat: true },
  pele: { name: "Pele de lobo", sell: 260, icon: "cape", mat: true },
  anel_enf: { name: "Anel enferrujado", sell: 1800, icon: "ring", slot: "ring", skill: 1 },
  cajado: { name: "Cajado de salgueiro", sell: 2600, icon: "staff", slot: "weapon", atk: 18, voc: ["sorcerer", "druid"] },
  capacete_ferro: { name: "Capacete de ferro", sell: 3200, icon: "helmet", slot: "helmet", def: 6 },
  nucleo: { name: "Núcleo de carvão", sell: 900, icon: "orb", mat: true },
  ferrao: { name: "Ferrão", sell: 5200, icon: "sword", slot: "weapon", atk: 26 },
  espada_quebrada: { name: "Espada quebrada", sell: 9000, icon: "sword", slot: "weapon", atk: 34 },
  placa: { name: "Placa de pedra", sell: 12000, icon: "shield", slot: "shield", def: 14 },
  picareta: { name: "Picareta do Capataz", sell: 40000, icon: "sword", slot: "weapon", atk: 40, loot: .10 },
  quitina: { name: "Armadura de quitina", sell: 60000, icon: "armor", slot: "armor", def: 22 },
  coroa: { name: "Coroa Esquecida", sell: 200000, icon: "helmet", slot: "helmet", def: 18, war: .05 },
  // loja
  espada_aco: { name: "Espada de aço", price: 1500, sell: 500, icon: "sword", slot: "weapon", atk: 20 },
  escudo_madeira: { name: "Escudo de madeira", price: 300, sell: 100, icon: "shield", slot: "shield", def: 5 },
  escudo_aco: { name: "Escudo de aço", price: 2400, sell: 800, icon: "shield", slot: "shield", def: 11 },
  armadura_couro: { name: "Armadura de couro", price: 600, sell: 200, icon: "armor", slot: "armor", def: 6 },
  armadura_aco: { name: "Armadura de aço", price: 4000, sell: 1300, icon: "armor", slot: "armor", def: 14 },
  capacete_aco: { name: "Capacete de aço", price: 2200, sell: 700, icon: "helmet", slot: "helmet", def: 9 },
  arco: { name: "Arco de teixo", price: 1800, sell: 600, icon: "staff", slot: "weapon", atk: 22, voc: ["paladin"] },
};
export const RARITY = [   // 8 raridades (cores da expansão); o servidor tem a mesma tabela em game_config
  { name: "Comum", mult: 1, color: "#a8a8a8" }, { name: "Incomum", mult: 1.12, color: "#5bd16b" }, { name: "Raro", mult: 1.28, color: "#4f8cff" }, { name: "Épico", mult: 1.5, color: "#a35bff" },
  { name: "Lendário", mult: 1.8, color: "#ffbf3a" }, { name: "Mítico", mult: 2.2, color: "#ff4a4a" }, { name: "Divino", mult: 2.7, color: "#3fe6ff" }, { name: "Primordial", mult: 3.4, color: "#ff3fd2" },
];
export const ATTRS = [["for", "Força", "dano físico e carga"], ["vit", "Vitalidade", "vida e recuperação"], ["res", "Resistência", "defesa física"], ["int", "Inteligência", "dano mágico e mana"], ["agi", "Agilidade", "velocidade de ataque e esquiva"], ["des", "Destreza", "precisão e crítico"], ["sab", "Sabedoria", "resistência mágica e habilidades"], ["sor", "Sorte", "um pouco mais de achados raros (com teto)"]];

// zonas (doc "Visão geral", seção 7): segura = sem PvP; protegida = sem ataque livre; conflito = PvP aberto; guerra = objetivos de clã
export const ZONES = {
  segura: { name: "Zona segura", desc: "PvP desativado. Cidade, comércio e recuperação.", risk: "Sem risco", color: "#9cc287", tint: null },
  protegida: { name: "Zona protegida", desc: "Ataques livres desativados. Só eventos e guerras.", risk: "Baixo", color: "#9bc1d6", tint: null },
  conflito: { name: "Zona de conflito", desc: "PvP aberto. Mais risco, mais recompensa. Morrer custa gold e um item.", risk: "Alto", color: "#e07a7a", tint: "rgba(168,61,61,.13)" },
  guerra: { name: "Zona de guerra", desc: "Objetivos de clã com calendário. Elite, bosses e raros.", risk: "Muito alto", color: "#c3a9e6", tint: "rgba(138,107,181,.16)" },
};
export const REGIONS = [   // região = parte do mapa; realm = reino territorial; tier = nível de zona da expansão
  { id: "vila", name: "Vila de Arken", lvl: 1, zone: "segura", realm: "Eldoria", tier: "segura" },
  { id: "campos", name: "Campos Dourados", lvl: 1, zone: "protegida", realm: "Eldoria", tier: "selvagem" },
  { id: "floresta", name: "Floresta Sombria", lvl: 10, zone: "protegida", realm: "Eldoria", tier: "hostil" },
  { id: "pantano", name: "Pântano Vermelho", lvl: 15, zone: "conflito", realm: "Eldoria", tier: "elite" },
  { id: "montanhas", name: "Fronteira de Frostheim", lvl: 25, zone: "conflito", realm: "Frostheim", tier: "hostil" },
  { id: "minas", name: "Fronteira de Ignareth", lvl: 60, zone: "conflito", realm: "Ignareth", tier: "hostil" },
  { id: "ruinas", name: "Fronteira de Nocthar", lvl: 80, zone: "guerra", realm: "Nocthar", tier: "elite" },
];
export const zoneOf = h => h.zone || REGIONS.find(r => r.id === h.region)?.zone || "protegida";
export const CAPITAL_NAME = "Vila de Arken";
// terrenos de caça: posição e nome vêm de geo.js; aqui ficam criatura, quantidade e respawn. r = raio em tiles.
const HUNT_RULES = {
  ratos: { region: "campos", mon: "rato", spawns: 9, respawn: 7000, r: 8 },
  javalis: { region: "campos", mon: "javali", spawns: 8, respawn: 11000, r: 9 },
  bandidos: { region: "campos", mon: "bandido", spawns: 7, respawn: 14000, r: 8 },
  aranhas: { region: "floresta", mon: "aranha", spawns: 7, respawn: 15000, r: 8 },
  lobos: { region: "floresta", mon: "lobo", spawns: 7, respawn: 16000, r: 9 },
  afogados: { region: "pantano", mon: "afogado", spawns: 6, respawn: 20000, r: 9 },
  bruxas: { region: "pantano", mon: "bruxa", spawns: 6, respawn: 22000, r: 8 },
  mina1: { region: "minas", mon: "mineiro", spawns: 7, respawn: 20000, r: 8 },
  mina2: { region: "minas", mon: "golem", spawns: 6, respawn: 24000, r: 8, boss: "capataz" },
  goblins: { region: "campos", mon: "goblin", spawns: 8, respawn: 12000, r: 8 },
  ancestrais: { region: "floresta", mon: "ent", spawns: 5, respawn: 26000, r: 9 },
  mina3: { region: "minas", mon: "vespa", spawns: 6, respawn: 22000, r: 7, boss: "mae_vespas", rare: 2 },
  neve: { region: "montanhas", mon: "lobo_neve", spawns: 6, respawn: 24000, r: 9 },
  gelo: { region: "montanhas", mon: "troll_gelo", spawns: 5, respawn: 28000, r: 7 },
  ruinas1: { region: "ruinas", mon: "cavaleiro", spawns: 6, respawn: 26000, r: 8 },
  templo: { region: "ruinas", mon: "sentinela", spawns: 5, respawn: 28000, r: 7 },
  ruinas2: { region: "ruinas", mon: "guardiao", spawns: 5, respawn: 30000, r: 7, boss: "rei", rare: 2 },
};
export const HUNTS = GROUNDS.map(g => { const rule = HUNT_RULES[g.id], cx = Math.round(g.x / 4), cy = Math.round(g.y / 4), r = rule.r;
  return { id: g.id, name: g.name, why: g.why, ...rule, cx, cy, rect: { x: cx - r, y: cy - r, w: 2 * r + 1, h: 2 * r + 1 }, door: [cx, cy - r] }; });
export const TOWNS = PLACES.map(p => ({ ...p, tx: Math.round(p.x / 4), ty: Math.round(p.y / 4) }));
export const CAPITAL = { x: 14, y: 9, w: 74, h: 48 };   // área murada expandida da Vila de Arken
export const DEPOT = { x: 55, y: 38 };
export const HOME = { x: 52, y: 42 };

export const ECON = { BAG_CAP: 20, POT_COST: 20, POT_HEAL: 60, BLESS_COST: 200, MARKET_FEE: .05, PREMIUM_FEE: .03, OFFLINE_H: 12, OFFLINE_H_PREMIUM: 24 };
export const WAR = { territories: ["Ponte Velha", "Moinho", "Pedreira", "Colina", "Cais", "Bosque Negro", "Torre", "Vale", "Forja"], day: 6, hour: 15 };
export const TIERS = [["Bronze", 0], ["Prata", 1100], ["Ouro", 1300], ["Platina", 1500], ["Diamante", 1700], ["Mestre", 1900]];
