# Ícones de item em pixel art, gerados por código (sem IA): cada material tem forma e cor próprias.
# Saída: assets/sprites/ic_<id>.png (32x32) + lista em art/gen/icons.json (id -> nome do sprite).
# Rodar: python3 art/gen/icons.py
import json, math, os, random
from PIL import Image, ImageDraw, ImageChops, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "sprites")
S = 32
def hexc(h, a=255): h = h.lstrip("#"); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def shade(c, k): return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3] if len(c) > 3 else 255,)
def outline(im, col=(22, 16, 20, 255)):
    a = im.split()[3].point(lambda v: 255 if v > 40 else 0)
    big = a.filter(ImageFilter.MaxFilter(3)); ring = ImageChops.subtract(big, a)
    bg = Image.new("RGBA", im.size, (0, 0, 0, 0)); bg.paste(Image.new("RGBA", im.size, col), (0, 0), ring)
    bg.alpha_composite(im); return bg
def new(): im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); return im, ImageDraw.Draw(im)
def rnd(seed): return random.Random(seed)

def rock(d, base, r, pts=None):
    pts = pts or [(6, 22), (8, 12), (14, 7), (22, 8), (27, 14), (26, 24), (17, 27), (9, 26)]
    d.polygon(pts, fill=base)
    d.polygon([(8, 12), (14, 7), (22, 8), (18, 13), (11, 15)], fill=shade(base, 1.25))   # topo iluminado
    d.polygon([(17, 27), (26, 24), (27, 14), (22, 19), (16, 21)], fill=shade(base, .72))  # lado na sombra
def ore(id, base, vein, seed):
    im, d = new(); rock(d, hexc(base), 0); r = rnd(seed); v = hexc(vein)
    for _ in range(7):
        x, y = r.randint(9, 23), r.randint(10, 23); d.rectangle([x, y, x + 1, y + 1], fill=v); d.point((x, y), fill=shade(v, 1.35))
    d.line([(11, 17), (15, 15), (19, 18), (23, 16)], fill=v, width=1)
    return im
def nugget(id, col):
    im, d = new(); c = hexc(col)
    d.ellipse([8, 11, 24, 25], fill=c); d.ellipse([15, 8, 26, 18], fill=shade(c, 1.08)); d.ellipse([10, 12, 16, 17], fill=shade(c, 1.4)); d.ellipse([18, 19, 23, 24], fill=shade(c, .75))
    return im
def coal():
    im, d = new()
    for (x, y, w, h) in [(5, 15, 14, 11), (14, 9, 13, 12), (13, 18, 14, 10)]:
        d.polygon([(x, y + h // 2), (x + 3, y), (x + w - 2, y + 1), (x + w, y + h // 2), (x + w - 3, y + h), (x + 2, y + h)], fill=hexc("#26232a"))
        d.line([(x + 3, y + 2), (x + w - 4, y + 2)], fill=hexc("#5b5866")); d.point((x + w - 4, y + 3), fill=hexc("#9fa3b8"))
    return im
def powder(col):
    im, d = new(); c = hexc(col)
    d.polygon([(4, 26), (10, 17), (16, 11), (22, 17), (28, 26)], fill=c); d.polygon([(10, 17), (16, 11), (19, 15), (13, 19)], fill=shade(c, 1.3))
    r = rnd(col); [d.point((r.randint(7, 25), r.randint(16, 25)), fill=shade(c, .6)) for _ in range(12)]
    d.ellipse([3, 24, 29, 29], fill=shade(c, .7)); return im
def stone(col, accent=None, layers=False):
    im, d = new(); rock(d, hexc(col), 0, [(5, 24), (7, 14), (13, 9), (21, 9), (27, 15), (27, 24), (18, 28), (10, 28)])
    if layers: [d.line([(7, y), (26, y + 1)], fill=shade(hexc(col), .8)) for y in (15, 19, 23)]
    if accent: a = hexc(accent); d.line([(10, 22), (14, 16), (18, 19), (22, 13)], fill=a, width=2); d.point((22, 13), fill=shade(a, 1.4))
    return im
def ingot(col, shine=None):
    im, d = new(); c = hexc(col)
    d.polygon([(4, 23), (9, 13), (27, 13), (28, 23)], fill=c)                 # frente
    d.polygon([(9, 13), (12, 8), (29, 8), (27, 13)], fill=shade(c, 1.3))      # topo
    d.polygon([(27, 13), (29, 8), (31, 17), (28, 23)], fill=shade(c, .7))     # lado
    d.line([(11, 10), (26, 10)], fill=hexc(shine) if shine else shade(c, 1.6)); d.line([(8, 21), (25, 21)], fill=shade(c, .82))
    return im
def logpiece(bark, wood):
    im, d = new(); b, w = hexc(bark), hexc(wood)
    d.rounded_rectangle([3, 11, 25, 23], 4, fill=b); d.line([(6, 14), (21, 14)], fill=shade(b, .7)); d.line([(6, 19), (20, 19)], fill=shade(b, 1.2))
    d.ellipse([20, 10, 29, 24], fill=w); d.ellipse([22, 13, 27, 21], outline=shade(w, .7)); d.point((24, 17), fill=shade(w, .6)); return im
def planks(wood):
    im, d = new(); w = hexc(wood)
    for i, y in enumerate((8, 14, 20)):
        d.rectangle([4 + i, y, 27 - i, y + 5], fill=shade(w, 1 - i * .08)); d.line([(5 + i, y + 1), (26 - i, y + 1)], fill=shade(w, 1.25)); d.point((8 + i * 5, y + 3), fill=shade(w, .6)); d.point((22 - i * 3, y + 3), fill=shade(w, .6))
    return im
def bark(col):
    im, d = new(); c = hexc(col); d.polygon([(6, 6), (24, 4), (27, 26), (8, 28)], fill=c)
    for x in (10, 15, 20): d.line([(x, 6), (x + 2, 26)], fill=shade(c, .6))
    d.point((18, 12), fill=hexc("#8fd8a0")); d.point((12, 20), fill=hexc("#8fd8a0")); return im
def gem_raw(col):
    im, d = new(); c = hexc(col)
    rock(d, hexc("#6d6a70"), 0, [(4, 26), (6, 18), (12, 14), (22, 15), (28, 20), (27, 27), (14, 29)])
    for (x, h) in ((10, 12), (16, 16), (21, 10)):
        d.polygon([(x - 3, 22), (x, 22 - h), (x + 3, 22)], fill=c); d.line([(x, 22 - h), (x, 21)], fill=shade(c, 1.45))
    return im
def gem_cut(col):
    im, d = new(); c = hexc(col)
    d.polygon([(6, 12), (11, 6), (21, 6), (26, 12), (16, 27)], fill=c)
    d.polygon([(6, 12), (11, 6), (21, 6), (26, 12)], fill=shade(c, 1.3)); d.polygon([(11, 12), (16, 27), (21, 12)], fill=shade(c, .8))
    d.line([(12, 8), (15, 8)], fill=(255, 255, 255, 230)); d.point((19, 9), fill=(255, 255, 255, 200)); return im
def bone(col, polished=False):
    im, d = new(); c = hexc(col)
    d.line([(9, 23), (23, 9)], fill=c, width=5)
    for (x, y) in ((7, 21), (11, 25), (21, 7), (25, 11)): d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=c)
    d.line([(10, 21), (21, 10)], fill=shade(c, 1.2))
    if polished: d.point((17, 13), fill=(255, 255, 255, 255)); d.point((13, 17), fill=(255, 255, 255, 220))
    return im
def horn(col, polished=False):
    im, d = new(); c = hexc(col)
    pts = [(7, 27), (11, 18), (14, 11), (19, 6), (25, 4), (22, 9), (19, 15), (16, 22), (13, 28)]
    d.polygon(pts, fill=c); d.line([(10, 25), (13, 17), (17, 10), (22, 6)], fill=shade(c, 1.3))
    for y in (20, 24): d.line([(9, y), (15, y + 1)], fill=shade(c, .7))
    if polished: d.point((18, 9), fill=(255, 255, 255, 255))
    return im
def hide(col, tanned=False):
    im, d = new(); c = hexc(col)
    d.polygon([(6, 8), (12, 5), (20, 5), (26, 8), (24, 14), (27, 24), (20, 27), (12, 27), (5, 24), (8, 14)], fill=c)
    if tanned: [d.line([(10, y), (22, y)], fill=shade(c, .8)) for y in (12, 18, 23)]
    else: [d.point((x, y), fill=shade(c, .75)) for x, y in ((12, 11), (19, 15), (14, 21), (21, 22), (10, 17))]
    return im
def fish(col, fin):
    im, d = new(); c, f = hexc(col), hexc(fin)
    d.ellipse([5, 11, 23, 22], fill=c); d.polygon([(21, 16), (29, 10), (29, 23)], fill=f); d.polygon([(11, 12), (15, 7), (18, 12)], fill=f)
    d.line([(7, 18), (20, 18)], fill=shade(c, .8)); d.point((9, 15), fill=(20, 20, 20, 255)); d.point((14, 14), fill=shade(c, 1.4)); return im
def herb(leaf, flower=None):
    im, d = new(); l = hexc(leaf)
    d.line([(16, 28), (16, 12)], fill=shade(l, .7), width=2)
    for (x, y, s) in ((10, 18, 1), (22, 16, -1), (11, 11, 1), (21, 9, -1)): d.ellipse([x - 4, y - 2, x + 4, y + 2], fill=l)
    if flower: fc = hexc(flower); d.ellipse([12, 3, 20, 11], fill=fc); d.ellipse([14, 5, 18, 9], fill=shade(fc, 1.3))
    return im
def orb(col, glow=True):
    im, d = new(); c = hexc(col)
    if glow: d.ellipse([3, 3, 29, 29], fill=c[:3] + (60,))
    d.ellipse([8, 8, 24, 24], fill=c); d.ellipse([11, 10, 17, 16], fill=shade(c, 1.5)); d.ellipse([16, 17, 22, 23], fill=shade(c, .7)); return im
def vial(col):
    im, d = new(); c = hexc(col)
    d.rectangle([13, 4, 19, 9], fill=hexc("#c9b38a")); d.ellipse([7, 9, 25, 28], fill=hexc("#d8e4ee", 200)); d.ellipse([9, 15, 23, 27], fill=c); d.point((12, 13), fill=(255, 255, 255, 255)); return im
def scale(col):
    im, d = new(); c = hexc(col)
    for (x, y) in ((8, 8), (16, 8), (12, 15), (20, 15), (16, 22)): d.pieslice([x - 6, y - 6, x + 6, y + 8], 0, 180, fill=c); d.arc([x - 6, y - 6, x + 6, y + 8], 0, 180, fill=shade(c, 1.35))
    return im
def thread(col):
    im, d = new(); c = hexc(col); d.ellipse([7, 7, 25, 25], fill=c)
    for k in range(4): d.arc([8 + k, 8 + k, 24 - k, 24 - k], 200, 340, fill=shade(c, .75 + k * .1))
    d.line([(24, 18), (29, 27)], fill=c); return im
def scrap():
    im, d = new(); g = hexc("#7c7470")
    d.polygon([(5, 20), (12, 9), (18, 14), (14, 25)], fill=g); d.polygon([(16, 22), (22, 8), (28, 12), (25, 26)], fill=hexc("#8a5a3c")); d.ellipse([9, 13, 13, 17], outline=hexc("#3b3536")); return im
def key(col):
    im, d = new(); c = hexc(col); d.ellipse([4, 6, 14, 16], outline=c, width=3); d.line([(13, 13), (27, 25)], fill=c, width=3); d.line([(22, 21), (19, 25)], fill=c, width=2); d.line([(25, 24), (22, 28)], fill=c, width=2); return im

# ---- ícones de equipamento: o sprite base recolorido por material ----
def tinted(base_name, col, amt=.55):
    src = Image.open(os.path.join(OUT, base_name + ".png")).convert("RGBA")
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0)); src.thumbnail((S, S), Image.NEAREST); im.paste(src, ((S - src.width) // 2, (S - src.height) // 2))
    r, g, b, a = im.split(); gray = Image.merge("RGB", (r, g, b)).convert("L")
    c = hexc(col); col_im = Image.merge("RGB", [gray.point(lambda v, k=k: int(min(255, v / 255 * c[k] * 1.6))) for k in range(3)])
    mixed = Image.blend(Image.merge("RGB", (r, g, b)), col_im, amt); out = Image.merge("RGBA", (*mixed.split(), a)); return out

MAT = {"cobre": ("#b87333", "#e3934f"), "ferro": ("#7d7f86", "#a9acb4"), "prata": ("#c9ccd4", "#ffffff"), "estanho": ("#a7b0b8", "#dfe6ec"), "bronze": ("#a8742c", "#d9a45a"),
       "aco": ("#8f9cab", "#d0dbe7"), "aco_negro": ("#3b3f4a", "#7a8294"), "ouro": ("#e2b53b", "#fff09a"), "mitril": ("#7fd0e6", "#e0fbff"), "adamantita": ("#9b3f6a", "#e07aa6"),
       "oricalco": ("#d07a3a", "#ffc48a"), "celestial": ("#8fb8ff", "#ffffff"), "primordial": ("#3fb59a", "#b8ffe8")}
GEMS = {"ametista": "#9b59d0", "esmeralda": "#2fbf6a", "rubi": "#d8304a", "safira": "#3060e0", "topazio": "#f0b030", "onix": "#2a2830", "quartzo": "#e8eef6", "pedra_lunar": "#b8d4ff",
        "pedra_solar": "#ff9a3a", "opala": "#9fe6e0", "diamante": "#eaf6ff", "cristal_vazio": "#5a2f7a", "cristal_celestial_lap": "#8fd8ff", "cristal_primordial": "#3fe0b0"}
ICONS = {}
def put(id, im): outline(im).save(os.path.join(OUT, f"ic_{id}.png")); ICONS[id] = f"ic_{id}"
def main():
    for m, (c, l) in MAT.items():
        if m in ("aco", "aco_negro", "celestial", "oricalco", "primordial"): continue
    ores = {"cobre": ("#6b5a4e", "#e3803a"), "ferro": ("#6a5c55", "#b5653e"), "prata": ("#6a6872", "#e8eef6"), "estanho": ("#70757c", "#c8d6e0"), "mitril": ("#4f5866", "#7fe6ff"), "adamantita": ("#4d3c48", "#e05a9a")}
    for k, (b, v) in ores.items(): put(f"minerio_{k}", ore(k, b, v, k))
    for k in ("cobre", "ferro", "prata", "mitril", "adamantita"): put(f"concentrado_{k}", powder(MAT[k][0]))
    put("pepita_ouro", nugget("ouro", "#e8b83c")); put("carvao", coal())
    for k, (c, l) in MAT.items(): put(f"barra_{k}", ingot(c, l))
    put("liga_ancestral", ingot("#5d8a6a", "#c8ffd8")); put("obsidiana", gem_cut("#24202e"))
    for k, (bk, wd) in {"comum": ("#6b4a2c", "#d8b27a"), "carvalho": ("#5a3a22", "#c89254"), "ancestral": ("#3f4a32", "#9fb67a"), "espiritual": ("#3a4a6a", "#b8d0ff")}.items():
        put(f"tora_{k}", logpiece(bk, wd)); put(f"tabua_{k}", planks(wd))
    put("casca_ent", bark("#4f6a3a")); put("raiz_antiga", herb("#6a4a2c"))
    stones = {"pedra": ("#8b8b8f", None), "pedra_comum": ("#8b8b8f", None), "pedra_ancestral": ("#6f7a5a", "#a8c47a"), "pedra_arenosa": ("#cdb07a", None), "pedra_sedimentar": ("#a98f6a", None),
              "pedra_corrompida": ("#5a4a66", "#b56ae0"), "pedra_dimensional": ("#4a3a6a", "#ff6ad8"), "pedra_glacial": ("#a9c8de", "#ffffff"), "pedra_montanhosa": ("#6f6c72", None),
              "pedra_primordial": ("#3f5a56", "#5ff0c8"), "pedra_vulcanica": ("#3a2a2a", "#ff7a2a")}
    for k, (c, a) in stones.items(): put(k, stone(c, a, layers=k == "pedra_sedimentar"))
    for k, c in GEMS.items():
        if k in ("cristal_celestial_lap", "cristal_primordial"): put(k, gem_cut(c)); continue
        put(k, gem_cut(c)); raw = {"ametista": "ametista_bruta", "esmeralda": "esmeralda_bruta", "rubi": "rubi_bruto", "safira": "safira_bruta", "topazio": "topazio_bruto", "onix": "onix_bruto",
            "pedra_lunar": "pedra_lunar_bruta", "pedra_solar": "pedra_solar_bruta", "opala": "opala_bruta", "diamante": "diamante_bruto", "cristal_vazio": "cristal_vazio_bruto", "quartzo": "gema_bruta"}.get(k)
        if raw: put(raw, gem_raw(c))
    put("cristal_primordial_bruto", gem_raw("#3fe0b0")); put("cristal_celestial", gem_raw("#8fd8ff")); put("cristal_gelo", gem_cut("#bfe8ff")); put("cristal_sombrio", gem_cut("#4a2a6a")); put("fragmento_dimensional", gem_raw("#ff6ad8"))
    for k, c in {"osso": "#e8dfc8", "osso_lobo": "#d8d0c0", "osso_dragao": "#c86a4a", "osso_primordial": "#7fe0c0"}.items(): put(k, bone(c)); put(k + "_t", bone(c, True))
    for k, c in {"chifre_javali": "#d8c8a0", "chifre_minotauro": "#8a6a4a", "chifre_demoniaco": "#7a2a3a"}.items(): put(k, horn(c)); put(k + "_t", horn(c, True))
    put("presa_javali", horn("#efe6cf")); put("couro_cru", hide("#c88a7a")); put("couro", hide("#8a5a32", True))
    put("peixe_comum", fish("#7a9ab0", "#4e6a80")); put("peixe_prateado", fish("#d0d8e2", "#8a98a8")); put("peixe_dourado", fish("#f0c040", "#d07a20"))
    put("erva_curativa", herb("#4caf50", "#ff8aa0")); put("flor_lunar", herb("#3f8a6a", "#cfe0ff"))
    put("po_arcano", powder("#b48aff")); put("essencia_sombria", vial("#5a2a8a")); put("fragmento_primordial", orb("#3fe0b0")); put("nucleo", orb("#ff8a3a")); put("selo_eldoria", orb("#ffd25a", False))
    put("escama_dragao", scale("#c8402a")); put("fio_seda", thread("#efe8ff")); put("sucata", scrap()); put("chave_dragao", key("#d0502a")); put("chave_abismo", key("#7a4ab0"))
    # equipamento: o desenho de sempre, cor do material
    eq = {"espada_aco": ("sword", "#b8c8d8"), "espada_dragao": ("sword", "#d0402a"), "espada_quebrada": ("sword", "#7a6a5a"), "ferrao": ("sword", "#c8b040"), "espada_forjada": ("sword", "#d8d8e0"),
          "comp_lamina": ("sword", "#9aa0a8"), "escudo_aco": ("shield", "#a8b8c8"), "escudo_madeira": ("shield", "#a8743a"), "escudo_forjado": ("shield", "#c8c8d0"), "placa": ("shield", "#6a7a8a"), "comp_guarda": ("shield", "#8a8f96"),
          "armadura_aco": ("armor", "#a8b8c8"), "armadura_couro": ("armor", "#8a5a32"), "armadura_dragao": ("armor", "#c8402a"), "quitina": ("armor", "#5a7a3a"), "armadura_forjada": ("armor", "#c8c8d0"),
          "capacete_aco": ("helmet", "#b8c8d8"), "capacete_ferro": ("helmet", "#7d7f86"), "coroa": ("helmet", "#e8c040"), "elmo_forjado": ("helmet", "#c8c8d0"),
          "picareta": ("pickaxe", "#8a7a6a"), "picareta_cobre": ("pickaxe", "#c87a3a"), "picareta_ferro": ("pickaxe", "#9aa0a8"), "picareta_forjada": ("pickaxe", "#d8d8e0"), "comp_cabeca_picareta": ("pickaxe", "#8a8f96"),
          "machado_ferro": ("axe", "#9aa0a8"), "machado_lenhador_forjado": ("axe", "#d8d8e0"), "comp_cabeca_machado": ("axe", "#8a8f96"), "foice": ("sickle", "#9aa0a8"), "foice_forjada": ("sickle", "#d8d8e0"), "comp_cabeca_foice": ("sickle", "#8a8f96"),
          "arco": ("bow", "#a8743a"), "cajado": ("staff", "#7a4ab0"), "bastao_forjado": ("staff", "#a8743a"), "cajado_forjado": ("staff", "#9a6ad0"), "comp_empunhadura": ("staff", "#8a5a32"),
          "capa": ("cape", "#3a5a9a"), "manto_seda": ("cape", "#9a7ad8"), "anel_enf": ("ring", "#d8b040"), "comp_pomo": ("ring", "#8a8f96"), "liga_ancestral_x": None}
    for k, v in eq.items():
        if not v: continue
        b, c = v
        if os.path.exists(os.path.join(OUT, b + ".png")): ICONS[k] = f"ic_{k}"; tinted(b, c).save(os.path.join(OUT, f"ic_{k}.png"))
    json.dump(ICONS, open(os.path.join(ROOT, "art", "gen", "icons.json"), "w"), indent=0, ensure_ascii=False)
    # contato de tudo pra conferir
    ids = sorted(ICONS); cols = 16; sheet = Image.new("RGBA", (cols * 36, ((len(ids) + cols - 1) // cols) * 36), (36, 30, 50, 255))
    for i, k in enumerate(ids): sheet.alpha_composite(Image.open(os.path.join(OUT, ICONS[k] + ".png")), ((i % cols) * 36 + 2, (i // cols) * 36 + 2))
    sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save("/tmp/icons-sheet.png" if not os.environ.get("SHEET") else os.environ["SHEET"])
    print(len(ICONS), "ícones")
main()
