// Mundo: geração do mapa 64x48, estradas, bosques, props e pathfinding.
import { MW, MH, HUNTS, CAPITAL, DEPOT, REGIONS } from "./data.js";

let seed = 20261125;
export const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
export const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };

// terreno: 0 grama 1 terra 2 água 3 árvore 4 pedra(capital) 5 barraca 6 casa 7 cerca 8 rocha 9 grama escura 10 pântano 11 rocha de mina 12 cobble ruínas 13 areia
export const map = new Uint8Array(MW * MH);
export const props = [];        // {x,y,kind} decoração (sem colisão)
export const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH) ? 3 : map[y * MW + x];
const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < MW && y < MH) map[y * MW + x] = t; };
export const walk = (x, y) => { const t = at(x, y); return t === 0 || t === 1 || t === 4 || t === 9 || t === 10 || t === 11 || t === 12 || t === 13; };
export const groundOf = (x, y) => { const t = at(x, y); if (t === 2) return "water"; if (t === 1) return "dirt"; if (t === 4 || t === 5 || t === 6 || t === 7) return "cobble"; if (t === 9) return "grass_dark"; if (t === 10) return "swamp"; if (t === 11) return "rock"; if (t === 12) return "cobble"; if (t === 13) return "sand"; return "grass"; };
export const inRect = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
export const huntAt = (x, y) => HUNTS.find(h => inRect(h.rect, x, y)) || null;
export const regionAt = (x, y) => { const h = huntAt(x, y); if (h) return REGIONS.find(r => r.id === h.region); if (y >= 26 && x < 32) return REGIONS[2]; if (y >= 26) return REGIONS[3]; if (x >= 46) return REGIONS[1]; return REGIONS[0]; };

export function bfs(sx, sy, tx, ty, ok) {
  if (!ok(tx, ty)) return null;
  const prev = new Int32Array(MW * MH).fill(-1), q = [sy * MW + sx]; prev[sy * MW + sx] = sy * MW + sx;
  const goal = ty * MW + tx;
  for (let i = 0; i < q.length; i++) {
    const c = q[i]; if (c === goal) break;
    const cx = c % MW, cy = (c / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (!ok(nx, ny)) continue;
      const n = ny * MW + nx; if (prev[n] !== -1) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const out = []; let c = goal;
  while (c !== sy * MW + sx) { out.push({ x: c % MW, y: (c / MW) | 0 }); c = prev[c]; }
  return out.reverse();
}
export const path = (sx, sy, tx, ty) => bfs(sx, sy, tx, ty, walk);

export function genMap() {
  map.fill(0); props.length = 0;
  for (let x = 0; x < MW; x++) { set(x, 0, 3); set(x, MH - 1, 3); }
  for (let y = 0; y < MH; y++) { set(0, y, 3); set(MW - 1, y, 3); }
  // regiões de chão
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    if (x >= 46 && y < 26) set(x, y, 9);              // floresta escura
    if (y >= 26 && x < 32) set(x, y, 10);             // pântano
    if (y >= 26 && x >= 32) set(x, y, 11);            // minas
    if (y >= 37 && x >= 18 && x < 48) set(x, y, 12);  // ruínas
  }
  // lago central e lago do pântano
  for (let y = 13; y < 19; y++) for (let x = 5; x < 14; x++) if (rnd() < .85 || (y > 13 && y < 18 && x > 5 && x < 13)) set(x, y, 2);
  for (let y = 27; y < 34; y++) for (let x = 4; x < 15; x++) if (rnd() < .6) set(x, y, 2);
  for (let y = 12; y < 20; y++) for (let x = 3; x < 16; x++) if (at(x, y) === 0 && rnd() < .35) set(x, y, 13); // areia na beira
  // capital
  for (let y = CAPITAL.y; y < CAPITAL.y + CAPITAL.h; y++) for (let x = CAPITAL.x; x < CAPITAL.x + CAPITAL.w; x++) set(x, y, 4);
  for (let y = 2; y <= 4; y++) for (let x = 3; x <= 5; x++) set(x, y, 6);
  for (let y = 2; y <= 4; y++) for (let x = 8; x <= 10; x++) set(x, y, 6);
  set(DEPOT.x, DEPOT.y, 5); set(DEPOT.x - 1, DEPOT.y, 5);
  for (let x = 2; x <= 12; x++) if (x !== 11 && x !== 12) set(x, 10, 7);
  for (let y = 2; y <= 10; y++) if (y !== 7 && y !== 8) set(12, y, 7);
  // estradas
  const free = (x, y) => walk(x, y) || at(x, y) === 0;
  const gate = [13, 8];
  for (const h of HUNTS) {
    const p = bfs(gate[0], gate[1], h.door[0] - 1, h.door[1], free) || [];
    for (const n of [{ x: gate[0], y: gate[1] }, ...p]) { if (walk(n.x, n.y) && at(n.x, n.y) !== 4 && at(n.x, n.y) !== 2) set(n.x, n.y, 1); if (walk(n.x, n.y + 1) && at(n.x, n.y + 1) !== 2 && at(n.x, n.y + 1) !== 4 && rnd() < .3 && !huntAt(n.x, n.y)) set(n.x, n.y + 1, 1); }
  }
  // bosques em volta das hunts
  const forestRing = (r, d) => { for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) { const edge = y === r.y - 1 || y === r.y + r.h || x === r.x - 1 || x === r.x + r.w; if (edge && walk(x, y) && at(x, y) !== 1 && at(x, y) !== 2 && rnd() < d) set(x, y, 3); } };
  for (const h of HUNTS) forestRing(h.rect, .9);
  // bosques soltos e rochas
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const t = at(x, y); if (t !== 0 && t !== 9 && t !== 10 && t !== 11) continue;
    if (huntAt(x, y) || inRect(CAPITAL, x, y)) continue;
    const r = rnd();
    if (t === 9 && r < .22) set(x, y, 3); else if (t === 0 && r < .06) set(x, y, 3); else if (t === 10 && r < .08) set(x, y, 3);
    else if (t === 11 && r < .10) set(x, y, 8); else if (r < .025) set(x, y, 8);
  }
  // props decorativos (sem colisão)
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const t = at(x, y); if (!walk(x, y) || t === 1 || t === 4) continue;
    const h = hash(x, y), r = h % 100;
    if (t === 0 && r < 14) props.push({ x, y, kind: ["bush", "flower_yellow", "flower_red", "bush2", "mushroom", "stump", "flower_yellow2", "bush3", "berry_bush", "log"][h % 10] });
    if (t === 9 && r < 16) props.push({ x, y, kind: ["bush_dark", "bush_dark2", "mushroom_red", "log", "berry_bush", "mushroom"][h % 6] });
    if (t === 10 && r < 14) props.push({ x, y, kind: ["reed", "lily", "cattail", "bone", "mushroom_red", "moss_rock", "lily2"][h % 7] });
    if (t === 11 && r < 10) props.push({ x, y, kind: ["crate", "barrel", "skull", "bone", "moss_rock2", "wheel"][h % 6] });
    if (t === 12 && r < 9) props.push({ x, y, kind: ["skull", "bone", "dead_shrub", "bone_pile", "wheel"][h % 5] });
    if (t === 13 && r < 8) props.push({ x, y, kind: ["log", "reed", "hay"][h % 3] });
  }
  // garante chão nas hunts e portas
  for (const h of HUNTS) { set(h.door[0], h.door[1], 1); set(h.door[0] - 1, h.door[1], 1); for (let y = h.rect.y; y < h.rect.y + h.rect.h; y++) for (let x = h.rect.x; x < h.rect.x + h.rect.w; x++) { const t = at(x, y); if (t === 3 || t === 8 || t === 2) set(x, y, h.region === "campos" ? 0 : h.region === "floresta" ? 9 : h.region === "pantano" ? 10 : h.region === "minas" ? 11 : 12); } }
}
export function freeTile(r) { for (let i = 0; i < 80; i++) { const x = r.x + Math.floor(Math.random() * r.w), y = r.y + Math.floor(Math.random() * r.h); if (walk(x, y)) return { x, y }; } return { x: r.x, y: r.y }; }
