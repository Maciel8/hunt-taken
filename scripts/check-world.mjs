// Validação do continente (Node): nada importante bloqueado, estradas andáveis, cidades ligadas entre si
// e amostra de zonas pra comparar com o servidor (zone_at). Uso: node scripts/check-world.mjs [saida.csv]
import fs from "node:fs";
const T = await import("../js/terrain.js"); const C = await import("../js/continent.js"); const W = await import("../js/world.js");
const net = JSON.parse(fs.readFileSync(new URL("../assets/world-net.json", import.meta.url)));
T.initNet(net); C.CONT.net = net; C.CONT.ready = true;
let fail = 0; const ok = (cond, msg) => { console.log((cond ? "  ok  " : "  FALHOU ") + msg); if (!cond) fail = 1; };
const walk = (x, y) => W.inHeart(Math.floor(x), Math.floor(y)) ? true : C.procWalk(x, y);
// bordas do mundo são oceano profundo
ok([[-T.OX, -T.OY], [T.SIZE - T.OX - 1, -T.OY], [-T.OX, T.SIZE - T.OY - 1], [T.SIZE - T.OX - 1, T.SIZE - T.OY - 1]].every(([x, y]) => T.tileAt(x, y) === T.B.DEEP), "cantos do mundo são oceano profundo");
// biomas presentes
const seen = new Set(); for (let j = 0; j < 200; j++) for (let i = 0; i < 200; i++) seen.add(T.baseBiome(i * 50 + 25, j * 50 + 25));
const need = ["DEEP", "BEACH", "CLIFF", "PLAINS", "FOREST", "ANCIENT", "SWAMP", "MANGROVE", "DESERT", "CANYON", "MOUNTAIN", "PEAK", "VOLCANIC", "LAVA", "TUNDRA", "GLACIER", "DARK", "LAKE"];
const miss = need.filter(k => !seen.has(T.B[k])); ok(!miss.length, "todos os biomas existem" + (miss.length ? " (faltam " + miss.join(",") + ")" : ""));
// cidades, construções, NPCs, depósitos e áreas de caça
for (const c of net.cities.filter(c => !c.heart)) { ok(C.procWalk(c.x, c.y) && T.tileAt(c.x, c.y) === T.B.CITY, `praça de ${c.name} andável`); }
let blockedNodes = net.nodes.filter(n => !C.procWalk(n.x, n.y) && !C.procWalk(n.x, n.y + 1) && !C.procWalk(n.x + 1, n.y) && !C.procWalk(n.x - 1, n.y));
ok(!blockedNodes.length, `${net.nodes.length} depósitos acessíveis` + (blockedNodes.length ? ": " + blockedNodes.map(n => n.id).join(",") : ""));
let badHunts = net.hunts.filter(h => { let n = 0; for (let a = 0; a < 6.283; a += .4) for (const r of [0, 3, 6]) if (C.procWalk(Math.round(h.cx + Math.cos(a) * r), Math.round(h.cy + Math.sin(a) * r))) n++; return n < 30; });
ok(!badHunts.length, `${net.hunts.length} áreas de caça abertas` + (badHunts.length ? ": " + badHunts.map(h => h.id).join(",") : ""));
// estradas andáveis ponto a ponto (pontes onde cruzam rios)
let badRoad = 0, bridges = 0; for (const r of net.roads) for (let i = 1; i < r.pts.length; i++) { const [a, b] = [r.pts[i - 1], r.pts[i]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let k = 0; k <= n; k++) { const x = Math.floor(a[0] + (b[0] - a[0]) * k / n), y = Math.floor(a[1] + (b[1] - a[1]) * k / n); if (W.inHeart(x, y)) continue; const t = T.tileAt(x, y); if (t === T.B.BRIDGE) bridges++; if (T.isBlocked(t)) badRoad++; } }
ok(badRoad === 0, `estradas sem bloqueio (${bridges} tiles de ponte)`);
// cidades ligadas (caminho real, sem atravessar água/picos)
const heartPath = (a, b, c, d) => [{ x: c, y: d }];
for (const r of net.roads.filter(r => r.to !== "porto")) { const A = r.from === "arken" ? { x: r.pts[0][0], y: r.pts[0][1] } : net.cities.find(c => c.id === r.from), B = net.cities.find(c => c.id === r.to);
  const p = C.findPathWide(A.x, A.y, B.x, B.y, walk, () => false, heartPath); let k = 0; while (p && p.rest && k++ < 2000) C.extendPath(p, 2, 1e9);
  const end = p && p[p.length - 1]; ok(!!end && Math.hypot(end.x - B.x, end.y - B.y) < 2, `caminho ${r.from} → ${r.to}`); }
// amostra de zonas (mesma conta no servidor)
const out = process.argv[2]; if (out) { const rows = []; let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const c of net.cities) for (let k = 0; k < 66; k++) { const a = rnd() * 6.283, d = rnd() * (c.heart ? 700 : c.r[2] * 1.3), cx = c.heart ? 150 : c.x, cy = c.heart ? 100 : c.y; const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d); const z = T.zoneAt(x, y); rows.push(`${x},${y},${z.ring},${z.city ? z.city.id : ""}`); }
  while (rows.length < 400) { const x = Math.round(-T.OX + rnd() * T.SIZE), y = Math.round(-T.OY + rnd() * 9900); const z = T.zoneAt(x, y); rows.push(`${x},${y},${z.ring},${z.city ? z.city.id : ""}`); }
  fs.writeFileSync(out, rows.slice(0, 400).join("\n") + "\n"); }
process.exit(fail);
