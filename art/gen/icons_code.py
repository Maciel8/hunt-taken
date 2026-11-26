#!/usr/bin/env python3
"""Ícones de item desenhados por código (pixel art 16x16 ampliada 2x, com contorno escuro).
Sem IA: cada ícone é uma lista de pixels. Gera assets/sprites/<nome>.png e registra no manifest."""
import json, os
from PIL import Image
ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "assets", "sprites"); MAN = os.path.join(ROOT, "assets", "manifest.json")
P = {"w": (139, 94, 52), "W": (96, 62, 32), "m": (170, 176, 186), "M": (110, 116, 128), "h": (230, 234, 240), "d": (120, 220, 255), "D": (60, 150, 220), "H": (225, 250, 255),
     "r": (190, 190, 200), "g": (230, 180, 60), "G": (160, 112, 30), "s": (230, 225, 210), "p": (220, 60, 220), "P": (150, 30, 160), "c": (90, 200, 140), "k": (70, 60, 50), "e": (200, 60, 60)}
def draw(rows):
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row.ljust(16)[:16]):
            if ch in P: px[x, y] = P[ch] + (255,)
    # contorno escuro de 1 px em volta dos pixels pintados
    out = im.copy(); po = out.load()
    for y in range(16):
        for x in range(16):
            if px[x, y][3] == 0 and any(0 <= x + dx < 16 and 0 <= y + dy < 16 and px[x + dx, y + dy][3] for dx, dy in ((1,0),(-1,0),(0,1),(0,-1))):
                po[x, y] = (24, 20, 30, 255)
    return out.resize((32, 32), Image.NEAREST)
ICONS = {
 "pickaxe": ["", "  mmmmmmmmm", " mhmmmmmmmmM", " M  W     MM", "     W      M", "      W", "       W", "        W", "         W", "          W", "           W", "            W", "", "", "", ""],
 "axe": ["", "      MMM", "     Mmmmm", "    MmhmmmW", "    MmmmmW", "     MmmW", "       W", "       W", "       W", "       W", "       W", "       W", "       W", "       W", "", ""],
 "sickle": ["", "     mmmmm", "   mm     mm", "  mh        m", "  m          ", "  mm", "   mm", "    mmW", "      W", "      W", "      W", "      W", "      W", "", "", ""],
 "rod": ["            W", "           W s", "          W  s", "         W   s", "        W    s", "       W     s", "      W      s", "     W      ss", "    W       ee", "   W        ", "  W", " W", "W", "", "", ""],
 "hammer": ["", "   MMMMMMM", "   MmmhmmM", "   MmmmmmM", "   MMMWMMM", "      W", "      W", "      W", "      W", "      W", "      W", "      W", "      W", "      W", "", ""],
 "diamond_raw": ["", "", "", "      rr", "    rrdrr", "   rddHdrr", "  rrdDddDrr", "  rdDHddDdr", "  rrdddDdrr", "   rrdDdrr", "    rrrr", "", "", "", "", ""],
 "diamond": ["", "", "", "   dddddddd", "  dHHdHHdHHd", " dDddDddDddDd", "  dDdDdDdDdd", "   dDdDdDdd", "    dDdDdd", "     dDdd", "      dd", "", "", "", "", ""],
 "axe_w": ["", "   MMMM  MMMM", "  MmmmmMMmmmmM", "  MmhmmmWmmhmM", "  MmmmmmWmmmmM", "   MMMM W MMMM", "        W", "        W", "        W", "        W", "        W", "        W", "        W", "        g", "", ""],
 "hammer_w": ["", "  MMMMMMMMMMM", "  MmmmmhmmmmM", "  MmmmmmmmmmM", "  MmmmmmmmmmM", "  MMMMMWMMMMM", "       W", "       W", "       W", "       W", "       W", "       W", "       W", "       g", "", ""],
 "bow": ["     W", "    W s", "   W  s", "  W   s", "  W   s", " W    s", " W    s", "WggggggW", " W    s", " W    s", "  W   s", "  W   s", "   W  s", "    W s", "     W", ""],
 "amulet": ["   g       g", "    g     g", "     g   g", "      g g", "       g", "      ggg", "     gGeGg", "    gGeeeGg", "    gGeeeGg", "     gGeGg", "      ggg", "", "", "", "", ""],
 "crown": ["", "", "", "  g   g   g", "  gg ggg gg", "  ggggggggg", "  gGgegdgpG", "  ggggggggg", "  GGGGGGGGG", "", "", "", "", "", "", ""],
 "key": ["", "  ggg", " gG Gg", " g   g", " gG Gg", "  gggggggggg", "        g g", "        g g", "", "", "", "", "", "", "", ""],
 "relic": ["", "      pp", "     pPPp", "    pPHHPp", "   pPHppHPp", "   pPpppPPp", "   pPPppPPp", "    pPPPPp", "     pPPp", "      pp", "     gggg", "    gGGGGg", "    gggggg", "", "", ""],
}
os.makedirs(OUT, exist_ok=True)
man = json.load(open(MAN)); names = {m["name"] for m in man}
for name, rows in ICONS.items():
    im = draw(rows); im.save(os.path.join(OUT, name + ".png"))
    if name not in names: man.append({"name": name, "file": name + ".png", "w": 32, "h": 32})
json.dump(man, open(MAN, "w"), ensure_ascii=False, indent=1)
print("ícones:", ", ".join(ICONS))
