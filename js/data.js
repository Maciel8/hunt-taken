// Dados do jogo: vocações, criaturas, hunts, itens, reinos, constantes. Nada de número solto no código.
export const T = 32;                 // tile em px
export const TICK = 400;             // ms por tick
export const MW = 64, MH = 48;       // mapa em tiles

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
  javali: { name: "Javali", lvl: 8, hp: 80, atk: 9, def: 2, exp: 25, gold: [3, 7], speed: 1, drop: { item: "presa", chance: .02 }, sprite: "boar" },
  bandido: { name: "Bandido", lvl: 15, hp: 170, atk: 16, def: 5, exp: 60, gold: [8, 16], speed: 1, drop: { item: "capa", chance: .01 }, sprite: "bandit" },
  aranha: { name: "Aranha-de-teia", lvl: 25, hp: 320, atk: 24, def: 8, exp: 120, gold: [12, 28], speed: 1, drop: { item: "seda", chance: .03 }, sprite: "spider" },
  lobo: { name: "Lobo cinzento", lvl: 32, hp: 420, atk: 30, def: 10, exp: 180, gold: [15, 35], speed: 2, drop: { item: "pele", chance: .02 }, sprite: "wolf" },
  afogado: { name: "Afogado", lvl: 45, hp: 700, atk: 40, def: 14, exp: 320, gold: [30, 60], speed: 1, drop: { item: "anel_enf", chance: .005 }, sprite: "drowned" },
  bruxa: { name: "Bruxa do pântano", lvl: 60, hp: 950, atk: 55, def: 16, exp: 520, gold: [50, 90], speed: 1, drop: { item: "cajado", chance: .004 }, sprite: "witch" },
  mineiro: { name: "Mineiro morto", lvl: 75, hp: 1400, atk: 70, def: 22, exp: 800, gold: [80, 140], speed: 1, drop: { item: "capacete_ferro", chance: .005 }, sprite: "miner" },
  golem: { name: "Golem de carvão", lvl: 95, hp: 2300, atk: 90, def: 35, exp: 1300, gold: [120, 200], speed: 1, drop: { item: "nucleo", chance: .01 }, sprite: "golem" },
  vespa: { name: "Vespa-rainha", lvl: 110, hp: 2600, atk: 115, def: 30, exp: 1900, gold: [160, 260], speed: 2, drop: { item: "ferrao", chance: .003 }, sprite: "wasp" },
  cavaleiro: { name: "Cavaleiro caído", lvl: 130, hp: 4200, atk: 140, def: 50, exp: 2800, gold: [220, 380], speed: 1, drop: { item: "espada_quebrada", chance: .002 }, sprite: "fallen" },
  guardiao: { name: "Guardião de pedra", lvl: 150, hp: 6500, atk: 170, def: 70, exp: 4000, gold: [320, 520], speed: 1, drop: { item: "placa", chance: .002 }, sprite: "guardian" },
  // bosses
  capataz: { name: "O Capataz", lvl: 100, hp: 30000, atk: 160, def: 45, exp: 25000, gold: [2000, 4000], speed: 1, drop: { item: "picareta", chance: 1 }, sprite: "boss_foreman", boss: true },
  mae_vespas: { name: "Mãe das Vespas", lvl: 120, hp: 42000, atk: 190, def: 40, exp: 40000, gold: [3000, 5000], speed: 2, drop: { item: "quitina", chance: 1 }, sprite: "boss_wasp", boss: true },
  rei: { name: "Rei Esquecido", lvl: 160, hp: 90000, atk: 260, def: 80, exp: 120000, gold: [8000, 12000], speed: 1, drop: { item: "coroa", chance: 1 }, sprite: "boss_king", boss: true },
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
export const RARITY = [
  { name: "comum", mult: 1, chance: .70, color: "#d9d9d9" },
  { name: "boa", mult: 1.15, chance: .22, color: "#64e08a" },
  { name: "rara", mult: 1.35, chance: .07, color: "#6ea8ff" },
  { name: "lendária", mult: 1.7, chance: .01, color: "#ffcf5a" },
];

// Regiões e hunts. rect em tiles do mapa 64x48. door = tile de entrada (placa).
export const REGIONS = [
  { id: "campos", name: "Campos", lvl: 1, tex: "grass" },
  { id: "floresta", name: "Floresta", lvl: 25, tex: "grass_dark" },
  { id: "pantano", name: "Pântano", lvl: 45, tex: "swamp" },
  { id: "minas", name: "Minas", lvl: 60, tex: "rock" },
  { id: "ruinas", name: "Ruínas", lvl: 100, tex: "cobble" },
];
export const HUNTS = [
  { id: "ratos", name: "Campo dos Ratos", region: "campos", rect: { x: 16, y: 3, w: 11, h: 8 }, mon: "rato", spawns: 8, respawn: 7000, door: [16, 7] },
  { id: "javalis", name: "Bosque dos Javalis", region: "campos", rect: { x: 31, y: 4, w: 13, h: 9 }, mon: "javali", spawns: 7, respawn: 11000, door: [31, 9] },
  { id: "bandidos", name: "Acampamento dos Bandidos", region: "campos", rect: { x: 20, y: 17, w: 14, h: 8 }, mon: "bandido", spawns: 6, respawn: 14000, door: [20, 21] },
  { id: "aranhas", name: "Teia da Floresta", region: "floresta", rect: { x: 48, y: 3, w: 13, h: 9 }, mon: "aranha", spawns: 6, respawn: 15000, door: [48, 8] },
  { id: "lobos", name: "Toca dos Lobos", region: "floresta", rect: { x: 48, y: 15, w: 13, h: 9 }, mon: "lobo", spawns: 6, respawn: 16000, door: [48, 19] },
  { id: "afogados", name: "Lago dos Afogados", region: "pantano", rect: { x: 3, y: 26, w: 13, h: 9 }, mon: "afogado", spawns: 5, respawn: 20000, door: [15, 30] },
  { id: "bruxas", name: "Cabana da Bruxa", region: "pantano", rect: { x: 19, y: 28, w: 12, h: 9 }, mon: "bruxa", spawns: 5, respawn: 22000, door: [19, 32] },
  { id: "mina1", name: "Minas, andar 1", region: "minas", rect: { x: 36, y: 27, w: 12, h: 9 }, mon: "mineiro", spawns: 6, respawn: 20000, door: [36, 31] },
  { id: "mina2", name: "Minas, andar 2", region: "minas", rect: { x: 50, y: 27, w: 11, h: 9 }, mon: "golem", spawns: 5, respawn: 24000, door: [50, 31], boss: "capataz" },
  { id: "mina3", name: "Minas, andar 3", region: "minas", rect: { x: 50, y: 38, w: 11, h: 8 }, mon: "vespa", spawns: 6, respawn: 22000, door: [50, 41], boss: "mae_vespas", rare: 2 },
  { id: "ruinas1", name: "Ruínas, pátio", region: "ruinas", rect: { x: 20, y: 39, w: 12, h: 7 }, mon: "cavaleiro", spawns: 5, respawn: 26000, door: [20, 42] },
  { id: "ruinas2", name: "Ruínas, cripta", region: "ruinas", rect: { x: 35, y: 39, w: 11, h: 7 }, mon: "guardiao", spawns: 4, respawn: 30000, door: [35, 42], boss: "rei", rare: 2 },
];
export const CAPITAL = { x: 2, y: 2, w: 11, h: 9 };
export const DEPOT = { x: 7, y: 7 };
export const HOME = { x: 8, y: 8 };
export const BOT_SPOTS = [[3, 9], [4, 9], [5, 9], [6, 9], [9, 9], [10, 9], [11, 9], [12, 9]];

export const BOT_NAMES = [
  ["Kharzul", "ash", "knight", 6], ["Vexa", "thorn", "sorcerer", 11], ["Drogan", "ash", "paladin", 17], ["Lirael", "thorn", "druid", 23],
  ["Morrak", "ash", "knight", 34], ["Sylphe", "thorn", "paladin", 48], ["Oberon", "ash", "sorcerer", 66], ["Nyx", "thorn", "knight", 92],
];

export const ECON = { BAG_CAP: 20, POT_COST: 20, POT_HEAL: 60, BLESS_COST: 200, MARKET_FEE: .05, PREMIUM_FEE: .03, OFFLINE_H: 12, OFFLINE_H_PREMIUM: 24 };
export const WAR = { territories: ["Ponte Velha", "Moinho", "Pedreira", "Colina", "Cais", "Bosque Negro", "Torre", "Vale", "Forja"], day: 6, hour: 15 };
export const TIERS = [["Bronze", 0], ["Prata", 1100], ["Ouro", 1300], ["Platina", 1500], ["Diamante", 1700], ["Mestre", 1900]];
