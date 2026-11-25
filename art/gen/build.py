"""Monta assets/ a partir das folhas geradas: recorta sprites (slice.py), prepara texturas tileáveis e escreve assets/manifest.json.
uso: python3 build.py   (pula folhas que ainda não existem)
"""
import os, json, subprocess, sys
from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets"); SPR = os.path.join(OUT, "sprites"); TEX = os.path.join(OUT, "tex")
os.makedirs(SPR, exist_ok=True); os.makedirs(TEX, exist_ok=True)
PY = sys.executable

SHEETS = [
    ("knight_down.png", "1x1", 40, "knight_down"),
    ("knight_side.png", "1x1", 40, "knight_side"),
    ("knight_up.png", "1x1", 40, "knight_up"),
    ("paladin_down.png", "1x1", 40, "paladin_down"),
    ("paladin_side.png", "1x1", 40, "paladin_side"),
    ("paladin_up.png", "1x1", 40, "paladin_up"),
    ("sorcerer_down.png", "1x1", 40, "sorcerer_down"),
    ("sorcerer_side.png", "1x1", 40, "sorcerer_side"),
    ("sorcerer_up.png", "1x1", 40, "sorcerer_up"),
    ("druid_down.png", "1x1", 40, "druid_down"),
    ("druid_side.png", "1x1", 40, "druid_side"),
    ("druid_up.png", "1x1", 40, "druid_up"),

    # (arquivo, grid, target, nomes)
    ("props_test.png", "4x4", 40, "bush,pine_small,oak_small,tree_round,flower_yellow,tree_small,flower_red,flower_yellow2,boulder,log,stump,bush2,bush3,post,mushroom,fence"),
    ("trees.png", "2x2", 72, "oak,pine,willow,dead"),
    ("buildings.png", "3x3", 96, "house,house_thatch,house_thatch2,well,lantern_fence,stall,house2,tent,mine"),
    ("props2.png", "5x5", 40, "bush_dark,berry_bush,reed,lily,lily2,bush_dark2,cattail,moss_rock,moss_rock2,bone,wheel,mushroom_red,bone_pile,_,skull,crate,campfire,barrel,_,_,hay,_,pumpkin,dead_shrub,_"),
    ("items.png", "5x5", 32, "potion,coins,_,_,_,sword,shield,_,armor,helmet,tusk,cape,ring,dagger,staff,gem,orb,rope,_,_,meat,fish,_,_,chest"),
    ("monsters1.png", "3x3", 40, "rat,boar,bandit,wolf,drowned,spider,witch,miner,golem"),
    ("monsters2.png", "3x2", 48, "wasp,fallen,guardian,boss_foreman,boss_wasp,boss_king"),
]
# tamanhos individuais que fogem do target da folha
OVERRIDE = {"well": 52, "lantern_fence": 64, "stall": 64, "tent": 72, "mine": 88, "house": 96, "house2": 96, "house_thatch": 96, "house_thatch2": 96, "campfire": 34, "crate": 30, "barrel": 30, "skull": 24, "bone": 26, "bone_pile": 30, "wheel": 30, "hay": 34, "pumpkin": 26, "dead_shrub": 34, "moss_rock": 36, "moss_rock2": 36, "lily": 28, "lily2": 28, "reed": 36, "cattail": 36, "boss_foreman": 64, "boss_wasp": 64, "boss_king": 64}

manifest = []
for sheet, grid, target, names in SHEETS:
    src = os.path.join(HERE, sheet)
    if not os.path.exists(src): print("falta", sheet); continue
    tmp = os.path.join(HERE, "_tmp_" + sheet[:-4]); os.makedirs(tmp, exist_ok=True)
    # recorta no maior target do grupo; depois reduz os que têm override menor
    big = max([target] + [OVERRIDE.get(n, 0) for n in names.split(",")])
    subprocess.run([PY, "-W", "ignore", os.path.join(HERE, "slice.py"), src, tmp, "s", "--target", str(big), "--grid", grid, "--names", names], check=True, capture_output=True)
    for m in json.load(open(os.path.join(tmp, "smanifest.json"))):
        if m["name"] == "_" or m["name"].startswith("s") and m["name"][1:].isdigit(): continue
        im = Image.open(os.path.join(tmp, m["file"])).convert("RGBA")
        want = OVERRIDE.get(m["name"], target)
        s = want / max(im.size)
        if s < 1:
            im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            q = np.asarray(im).copy(); q[..., 3] = np.where(q[..., 3] > 140, 255, 0); im = Image.fromarray(q, "RGBA")
        im.save(os.path.join(SPR, m["name"] + ".png"))
        manifest.append({"name": m["name"], "file": m["name"] + ".png", "w": im.size[0], "h": im.size[1]})
    print(sheet, "ok")

# texturas: 512 -> 128 (pixel art real), espelhadas pra 256 tileável; o jogo lê blocos de 32
for n in ["grass", "grass_dark", "sand", "cobble", "swamp", "rock"]:   # terra e água ficam procedurais (a IA desenhou grade de azulejos)
    src = os.path.join(HERE, f"tex_{n}.png")
    if not os.path.exists(src): print("falta tex", n); continue
    im = Image.open(src).convert("RGB").crop((64, 64, 448, 448)).resize((128, 128), Image.LANCZOS)
    big = Image.new("RGB", (256, 256))
    big.paste(im, (0, 0)); big.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (128, 0)); big.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0, 128)); big.paste(im.transpose(Image.ROTATE_180), (128, 128))
    big.save(os.path.join(TEX, n + ".png")); print("tex", n, "ok")
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False)
print(len(manifest), "sprites no manifest")
