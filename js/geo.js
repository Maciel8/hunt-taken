// Geografia do mundo (mesma fonte do mapa da proposta, docs/mapa.js). Unidades de desenho 1200x800; 1 tile = 4 unidades.
// Gera contornos orgânicos determinísticos. Usado pelo construtor do mundo (world.js).
export const DW = 1200, DH = 800, UPT = 4;
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function rough(pts, iters = 4, amp = 18, s = 1) {
  seed = s; let p = pts.map(q => q.slice());
  for (let k = 0; k < iters; k++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length]; out.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, off = (rnd() - .5) * amp * Math.min(1, len / 60);
      out.push([(a[0] + b[0]) / 2 - dy / len * off, (a[1] + b[1]) / 2 + dx / len * off]);
    }
    p = out; amp *= .55;
  }
  return p;
}
function wiggle(pts, s, amp = 10) { // linha com curvas naturais
  seed = s; const out = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; out.push(a); const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1; for (const t of [.33, .66]) { const o = (rnd() - .5) * amp * 2; out.push([a[0] + dx * t - dy / len * o, a[1] + dy * t + dx / len * o]); } }
  out.push(pts[pts.length - 1]); return out;
}

// ---------- geografia (segue a referência: vila NO, serra N, ruínas NE, floresta centro, pântano L, campos SO, minas SE) ----------
export const REG = {
  campos: rough([[0,0],[1200,0],[1200,800],[0,800]], 1, 0, 1),
  floresta: rough([[150,230],[300,175],[460,180],[600,170],[740,190],[820,250],[760,330],[700,420],[690,520],[640,600],[520,640],[400,610],[330,540],[250,470],[200,380],[140,300]], 4, 40, 5),
  montanhas: rough([[360,0],[880,0],[870,70],[820,140],[760,175],[660,165],[560,150],[470,130],[400,95],[360,40]], 4, 30, 3),
  ruinas: rough([[880,0],[1200,0],[1200,330],[1120,350],[1040,320],[960,280],[900,220],[860,150],[870,70]], 4, 30, 13),
  pantano: rough([[760,330],[820,250],[900,240],[980,290],[1060,330],[1110,380],[1090,450],[1020,500],[920,520],[820,500],[730,470],[700,420]], 4, 36, 11),
  minas: rough([[700,560],[820,505],[940,520],[1030,505],[1110,450],[1200,430],[1200,800],[680,800],[640,700],[660,620]], 4, 34, 17),
  serraLeste: rough([[1110,380],[1200,330],[1200,470],[1130,470]], 3, 20, 19),
};
export const RIVERS = [
  { w0: 3, w1: 14, pts: wiggle([[505,82],[488,104],[470,122],[400,150],[320,185],[250,210],[170,215],[100,240],[60,310],[55,400],[85,470],[60,560],[30,650],[10,740],[0,800]], 21, 12) },
  { w0: 5, w1: 13, pts: wiggle([[250,210],[270,300],[230,390],[270,470],[370,530],[460,560],[560,600],[660,640],[760,690],[860,720],[960,780],[1000,800]], 22, 14) },
  { w0: 3, w1: 8, pts: wiggle([[880,120],[850,200],[820,250],[790,300]], 23, 8) },
];
export const LAKES = [[790, 300, 46, 26, -.15], [150, 650, 30, 18, .3], [512, 66, 26, 14, .2]];   // Lago Turvo, Lago das Garças, lago da nascente
// sítios: lotes de plantação alinhados por fazenda, com corredores de terra entre eles. kind: trigo, verde, terra (abóbora), repolho
export const FARMS = [
  { x: 118, y: 432, rot: -.05, cols: 2, rows: 3 },    // Moinho Velho
  { x: 312, y: 546, rot: .1, cols: 3, rows: 3 },      // Aldeia do Celeiro
  { x: 330, y: 690, rot: -.06, cols: 4, rows: 2 },    // campos do sul
  { x: 100, y: 588, rot: .05, cols: 2, rows: 2 },     // beira do rio
];
export const ROADS = [
  [[230,150],[300,240],[360,300],[460,330],[560,330],[620,320]],        // vila -> forte
  [[230,150],[300,122],[370,110],[420,108]],                            // vila -> posto da serra (ao norte do rio)
  [[420,108],[500,96],[600,80],[700,70]],                               // posto -> encosta
  [[620,320],[700,290],[780,250],[860,230],[920,190],[990,170]],        // forte -> portão das ruínas
  [[620,320],[700,380],[790,420],[880,440]],                            // forte -> pântano
  [[230,150],[180,260],[150,360],[170,470],[210,560],[220,650]],        // vila -> campos
  [[170,470],[290,520],[380,560],[470,640],[540,700],[700,700],[840,660],[930,640]], // campos -> torre -> minas
  [[880,440],[960,470],[1010,540],[980,600],[930,640]],                 // pântano -> minas
];
// lagos com contorno irregular (mesmo desenho pra colisão e pra arte)
export const LAKE_POLYS = LAKES.map(([x, y, rx, ry, a], i) => { const pts = []; for (let k = 0; k < 18; k++) { const t = k / 18 * 6.283; pts.push([x + Math.cos(t) * rx * Math.cos(a) - Math.sin(t) * ry * Math.sin(a), y + Math.cos(t) * rx * Math.sin(a) + Math.sin(t) * ry * Math.cos(a)]); } return { x, y, pts: rough(pts, 3, Math.min(rx, ry) * .55, 40 + i) }; });
export const BRIDGES = [];   // calculadas no construtor: onde uma estrada cruza um rio nasce uma ponte no ângulo da estrada
// rio como curvas suaves: cada trecho vai do meio de um segmento ao meio do próximo, com controle no vértice
export function riverCurves(r) {
  const p = r.pts, out = [];
  for (let i = 1; i < p.length - 1; i++) {
    const a = i === 1 ? p[0] : [(p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2], b = i === p.length - 2 ? p[p.length - 1] : [(p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2];
    out.push({ a, c: p[i], b, w: r.w0 + (r.w1 - r.w0) * i / (p.length - 1) + 2 });
  }
  return out;
}
export const SECRETS = [
  { pts: [[790,300],[760,360],[740,430],[720,470]], name: "Trilha dos Juncos", desc: "Trilha escondida entre os juncos que sai do Lago Turvo e entra no Pântano pelos fundos, sem passar pela estrada vigiada." },
  { pts: [[930,640],[1000,520],[1060,420],[1080,300],[1060,250]], name: "Túnel dos Contrabandistas", desc: "Galeria no andar 2 das Minas que sobe por dentro da serra leste e sai na Cripta do Rei, nas Ruínas." },
  { pts: [[420,108],[470,70],[520,30],[560,0]], name: "Passo do Corvo", desc: "Trilha de neve acima do Posto da Serra. Bloqueada por avalanche até a primeira expansão do mapa." },
];
export const PLACES = [
  { x: 210, y: 140, kind: "city", name: "Vila de Arken", zone: "segura", desc: "Capital murada no noroeste, entre dois braços de rio. Castelo, praça com poço, mercado, ferreiro, banco, templo e quatro portões. Ponto de renascer." },
  { x: 420, y: 104, kind: "shrine", name: "Posto da Serra", zone: "segura", desc: "Capela e refúgio de caravaneiros no pé das montanhas. Depósito pequeno e ponto de renascer para quem sobe a serra." },
  { x: 620, y: 310, kind: "castle", name: "Forte Cinzento", zone: "guerra", desc: "Castelo no coração da floresta, no cruzamento de todas as estradas. Primeiro posto avançado que os clãs disputam em guerra agendada. Fora da guerra é seguro." },
  { x: 110, y: 525, kind: "village", name: "Moinho Velho", zone: "segura", desc: "Aldeia de fazendeiros com moinho. Vende comida e poção barata para iniciantes." },
  { x: 230, y: 600, kind: "village", name: "Aldeia do Celeiro", zone: "segura", desc: "Fazendas e celeiros no meio dos Campos Dourados, à beira do Lago das Garças." },
  { x: 880, y: 450, kind: "village", name: "Vau dos Juncos", zone: "segura", desc: "Palafitas de pescadores na margem do pântano. Última parada antes da água escura." },
  { x: 1080, y: 560, kind: "mine", name: "Acampamento Mineiro", zone: "segura", desc: "Barracões, forja e guindaste ao lado da boca da mina. Depósito e ponto de renascer." },
  { x: 990, y: 170, kind: "gate", name: "Portão Partido", zone: "guerra", desc: "Brecha na muralha externa. Única entrada das Ruínas por estrada." },
];
export const CAVES = [{ x: 300, y: 330, name: "Gruta das Raízes", desc: "Entrada de caverna sob uma árvore antiga, no fundo da floresta. Galeria pequena com baús." }];
export const GROUNDS = [
  { id: "ratos", x: 160, y: 420, name: "Celeiros de Arken", mon: "Rato-do-campo", lvl: "1", zone: "protegida", why: "Celeiros e sacos de grão na estrada que desce da vila para os campos. Criaturas pequenas perto de construções." },
  { id: "javalis", x: 330, y: 560, name: "Orla dos Carvalhos", mon: "Javali", lvl: "5", zone: "protegida", why: "Onde o trigal encosta na floresta. Javalis fuçam a borda entre campo e mata." },
  { id: "bandidos", x: 470, y: 690, name: "Torre dos Bandidos", mon: "Bandido", lvl: "9", zone: "protegida", why: "Torre abandonada na estrada sul que leva às minas. Emboscam caravanas." },
  { id: "aranhas", x: 330, y: 400, name: "Ravina das Teias", mon: "Aranha-de-teia", lvl: "12", zone: "protegida", why: "Fenda úmida na floresta funda, ao lado da Gruta das Raízes." },
  { id: "lobos", x: 540, y: 470, name: "Clareira dos Uivos", mon: "Lobo selvagem", lvl: "15", zone: "protegida", why: "Clareira longe das estradas, no sul da floresta. A matilha patrulha as trilhas em volta." },
  { id: "afogados", x: 800, y: 400, name: "Margens Negras", mon: "Afogado", lvl: "17", zone: "conflito", why: "Água parada onde o rio do lago se espalha no pântano. Saem da água e voltam para ela." },
  { id: "bruxas", x: 1000, y: 400, name: "Cabana da Bruxa", mon: "Bruxa do pântano", lvl: "19", zone: "conflito", why: "Cabana sobre estacas no canto leste do pântano, encostada na serra." },
  { id: "mina1", x: 940, y: 640, name: "Minas Profundas", mon: "Mineiro morto", lvl: "62", zone: "conflito", why: "Boca da mina entre as rochas do sudeste. Três andares por baixo, cada um uma camada própria do mapa, com chefes no 2 e no 3." },
  { id: "neve", x: 560, y: 110, name: "Encosta dos Uivos", mon: "Lobo glacial", lvl: "26", zone: "conflito", why: "Campo de neve aberto acima do Posto da Serra. Criatura nova." },
  { id: "gelo", x: 780, y: 110, name: "Caverna Congelada", mon: "Troll de gelo", lvl: "33", zone: "conflito", why: "Gruta de gelo no lado leste da serra. Elite, anda em dupla. Criatura nova." },
  { id: "ruinas1", x: 1010, y: 240, name: "Pátio das Muralhas", mon: "Cavaleiro caído", lvl: "85", zone: "guerra", why: "Pátio logo depois do Portão Partido, entre muralhas quebradas." },
  { id: "templo", x: 1110, y: 120, name: "Templo Partido", mon: "Sentinela de pedra", lvl: "90", zone: "guerra", why: "Torre-templo roxa no alto das Ruínas. Criatura nova." },
  { id: "ruinas2", x: 1100, y: 280, name: "Cripta do Rei", mon: "Guardião de pedra e Rei Esquecido", lvl: "95", zone: "guerra", why: "Cripta sob as Ruínas. Chefe final do mapa. O túnel das Minas sai aqui." },
];
// terrenos extras que existem no jogo além dos marcadores do mapa: andares 2 e 3 das minas
GROUNDS.push(
  { id: "mina2", x: 1060, y: 700, name: "Minas, andar 2", mon: "Golem de carvão e O Capataz", lvl: "70", zone: "conflito", why: "Galerias fundas perto do acampamento." },
  { id: "goblins", x: 160, y: 735, name: "Acampamento Goblin", mon: "Goblin saqueador", lvl: "7", zone: "protegida", why: "Barracas de sucata no sul dos campos. Goblins roubam o que as caravanas deixam cair." },
  { id: "ancestrais", x: 440, y: 440, name: "Floresta dos Ancestrais", mon: "Ent ancestral", lvl: "19", zone: "protegida", why: "Clareira sagrada no coração da Floresta Sombria. Ents guardam o Ancião e o portal selado do Reino Espiritual." },
  { id: "mina3", x: 1150, y: 630, name: "Minas, andar 3", mon: "Vespa-rainha e Mãe das Vespas", lvl: "78", zone: "conflito", why: "Ninho de vespas no fundo da mina." },
);
