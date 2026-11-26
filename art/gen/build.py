"""Monta assets/ a partir das folhas geradas (v1, v2 e v3): recorta sprites (slice.py), limpa detalhes finos,
prepara texturas tileáveis e escreve assets/manifest.json.
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

def preprocess_sheet(sheet, src):
    """Limpeza pontual de artefatos conhecidos antes do fatiamento."""
    if sheet == "nocthar_cathedral.png":
        # Recolore a base de areia quente no rodapé da catedral para pedra-obsidiana escura arroxeada
        im = Image.open(src).convert("RGB")
        a = np.asarray(im).copy().astype(int)
        r, g, b = a[..., 0], a[..., 1], a[..., 2]
        # areia/terra quente amarelada (R alto, G médio-alto, B baixo) -> não é magenta nem roxo
        sand = (r > 135) & (g > 95) & (b < 110) & ((r - b) > 55)
        # aplica somente na metade inferior (base da catedral)
        H = a.shape[0]
        sand[:int(H * 0.52), :] = False
        lum = (0.3 * r + 0.59 * g + 0.11 * b)
        a[sand, 0] = np.clip(lum[sand] * 0.34 + 14, 0, 255)
        a[sand, 1] = np.clip(lum[sand] * 0.27 + 10, 0, 255)
        a[sand, 2] = np.clip(lum[sand] * 0.44 + 26, 0, 255)
        out = os.path.join(HERE, "_clean_" + sheet)
        Image.fromarray(a.astype(np.uint8), "RGB").save(out)
        return out
    if sheet in ("pack_valen.png", "pack_sylvana.png", "pack_nocthar.png"):
        # Remove brilho/halo quente no fundo magenta da célula (0,0) fora do contorno escuro
        im = Image.open(src).convert("RGB")
        a = np.asarray(im).copy()
        sub = a[:256, :256]
        r, g, b = sub[..., 0].astype(int), sub[..., 1].astype(int), sub[..., 2].astype(int)
        if sheet == "pack_nocthar.png":
            # flood-fill a partir das bordas da célula (0,0) sobre qualquer pixel claro/rosado/quente que não seja contorno escuro
            halo = (r > 150) & ((b > 110) | ((r > 205) & (g > 140))) & ~((r < 80) & (g < 80) & (b < 80))
            H2, W2 = halo.shape
            vis = np.zeros_like(halo, dtype=bool)
            st = [(y, x) for x in range(W2) for y in (0, H2 - 1) if halo[y, x]] + [(y, x) for y in range(H2) for x in (0, W2 - 1) if halo[y, x]]
            for y, x in st: vis[y, x] = True
            while st:
                yy, xx = st.pop()
                for ny, nx in ((yy - 1, xx), (yy + 1, xx), (yy, xx - 1), (yy, xx + 1)):
                    if 0 <= ny < H2 and 0 <= nx < W2 and halo[ny, nx] and not vis[ny, nx]:
                        vis[ny, nx] = True; st.append((ny, nx))
            sub[vis] = [215, 78, 206]
        else:
            r2, g2, b2 = a[:110, :120, 0].astype(int), a[:110, :120, 1].astype(int), a[:110, :120, 2].astype(int)
            flare = (r2 > 205) & (g2 > 165) & (b2 > 90) & (np.abs(r2 - g2) < 85)
            a[:110, :120][flare] = [215, 78, 206]
        out = os.path.join(HERE, "_clean_" + sheet)
        Image.fromarray(a, "RGB").save(out)
        return out
    if sheet == "sylvana_colossal.png":
        # Remove tufinhos soltos nas pontas extremas do rodapé
        im = Image.open(src).convert("RGB")
        a = np.asarray(im).copy()
        a[415:, :145] = [215, 78, 206]
        a[415:, 368:] = [215, 78, 206]
        out = os.path.join(HERE, "_clean_" + sheet)
        Image.fromarray(a, "RGB").save(out)
        return out
    if sheet == "pack_world.png":
        # Remove poça azul sob o coqueiro na célula (col=2, row=0) para encaixar em qualquer praia/grama
        im = Image.open(src).convert("RGB")
        a = np.asarray(im).copy()
        sub = a[160:250, 512:760]
        r, g, b = sub[..., 0].astype(int), sub[..., 1].astype(int), sub[..., 2].astype(int)
        puddle = (b > 150) & (b > r + 40)
        sub[puddle] = [215, 78, 206]
        out = os.path.join(HERE, "_clean_" + sheet)
        Image.fromarray(a, "RGB").save(out)
        return out
    if sheet == "furniture.png":
        cp = os.path.join(HERE, "_crop_" + sheet)
        Image.open(src).crop((70, 50, 704, 722)).save(cp)
        return cp
    return src

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

    # v1
    ("props_test.png", "4x4", 40, "bush,pine_small,oak_small,tree_round,flower_yellow,tree_small,flower_red,flower_yellow2,boulder,log,stump,bush2,bush3,post,mushroom,fence"),
    ("trees.png", "2x2", 72, "oak,pine,willow,dead"),
    ("buildings.png", "3x3", 96, "house,house_thatch,house_thatch2,well,lantern_fence,stall,house2,tent,mine"),
    ("props2.png", "5x5", 40, "bush_dark,berry_bush,reed,lily,lily2,bush_dark2,cattail,moss_rock,moss_rock2,bone,wheel,mushroom_red,bone_pile,_,skull,crate,campfire,barrel,_,_,hay,_,pumpkin,dead_shrub,_"),
    ("items.png", "5x5", 32, "potion,coins,_,_,_,sword,shield,_,armor,helmet,tusk,cape,ring,dagger,staff,gem,orb,rope,_,_,meat,fish,_,_,chest"),
    ("monsters1.png", "3x3", 40, "rat,boar,bandit,wolf,drowned,spider,witch,miner,golem"),
    ("monsters2.png", "3x2", 48, "wasp,fallen,guardian,boss_foreman,boss_wasp,boss_king"),

    # v2
    ("dragon.png", "1x1", 150, "dragon"),
    ("dragonling.png", "1x1", 48, "dragonling"),
    ("witch_hut.png", "1x1", 128, "witch_hut"),
    ("barn.png", "1x1", 128, "barn"),
    ("tavern.png", "1x1", 132, "tavern"),
    ("fountain.png", "1x1", 64, "fountain"),
    ("cave_entrance.png", "1x1", 128, "cave_entrance"),
    ("wolf_den.png", "1x1", 84, "wolf_den"),
    ("landmarks.png", "3x3", 52, "web,cocoon,watchtower,haystack,flower_bed,signpost,statue,banner,cart"),
    ("furniture.png", "4x4", 44, "table,chair,bookshelf,fireplace,chest_big,barrel_rack,rug,anvil,weapon_rack,candle,throne,counter,bar,bar2,crate_stack,plant"),

    # v3 — Monumentos heroicos e packs culturais das 6 cidades e continente
    ("khazad_citadel.png", "1x1", 230, "khazad_citadel"),
    ("solkar_palace.png", "1x1", 190, "solkar_palace"),
    ("valen_lighthouse.png", "1x1", 150, "valen_lighthouse"),
    ("sylvana_sanctuary.png", "1x1", 165, "sylvana_sanctuary"),
    ("sylvana_colossal.png", "1x1", 175, "sylvana_colossal"),
    ("nocthar_cathedral.png", "1x1", 230, "nocthar_cathedral"),
    ("arken_castle.png", "1x1", 235, "arken_castle"),
    ("pack_khazad.png", "3x3", 96, "khazad_house1,khazad_house2,khazad_foundry,khazad_tower,khazad_mine,khazad_minecart,khazad_cauldron,khazad_tavern,peak_volc"),
    ("pack_solkar.png", "3x3", 96, "solkar_adobe1,solkar_adobe2,solkar_shrine,solkar_tent_red,solkar_tent_blue,solkar_tent_purple,solkar_tower,palm_date,cactus_saguaro"),
    ("pack_valen.png", "3x3", 96, "valen_house1,valen_house2,valen_warehouse,valen_tower,valen_galleon,valen_sailboat,valen_rowboat,valen_fishstall,valen_crane"),
    ("pack_sylvana.png", "3x3", 96, "sylvana_cottage,sylvana_hut,sylvana_trunkhouse,sylvana_sawmill,sylvana_herbalist,giant_mushrooms,sylvana_wagon,sylvana_monolith,sylvana_garden"),
    ("pack_nocthar.png", "3x3", 96, "nocthar_house1,nocthar_house2,nocthar_spire,nocthar_tower,nocthar_crypt,nocthar_crystal,nocthar_brazier,ruin_wall,dead_shadow"),
    ("pack_world.png", "3x3", 96, "peak_snow,cliff_rock,palm_coco,desert_bones,windmill_v3,frontier_amber,frontier_red,guardhouse,swamp_willow"),
]

OVERRIDE = {
    "watchtower": 84, "web": 60, "statue": 56, "cart": 56, "cocoon": 30, "flower_bed": 34, "haystack": 38, "signpost": 34,
    "chair": 30, "candle": 34, "plant": 32, "rug": 56, "bar": 64, "barrel_rack": 56, "fireplace": 56, "bookshelf": 52,
    "weapon_rack": 52, "throne": 52, "table": 48, "counter": 56, "anvil": 36, "chest_big": 34, "bed": 52, "crate_stack": 40,
    "well": 52, "lantern_fence": 64, "stall": 64, "tent": 72, "mine": 88, "house": 96, "house2": 96, "house_thatch": 96,
    "house_thatch2": 96, "campfire": 34, "crate": 30, "barrel": 30, "skull": 24, "bone": 26, "bone_pile": 30, "wheel": 30,
    "hay": 34, "pumpkin": 26, "dead_shrub": 34, "moss_rock": 36, "moss_rock2": 36, "lily": 28, "lily2": 28, "reed": 36,
    "cattail": 36, "boss_foreman": 64, "boss_wasp": 64, "boss_king": 64,
    # v3 overrides
    "khazad_house1": 96, "khazad_house2": 100, "khazad_foundry": 112, "khazad_tower": 92, "khazad_mine": 104,
    "khazad_minecart": 56, "khazad_cauldron": 46, "khazad_tavern": 114, "peak_volc": 104,
    "solkar_adobe1": 94, "solkar_adobe2": 102, "solkar_shrine": 106, "solkar_tent_red": 76, "solkar_tent_blue": 76,
    "solkar_tent_purple": 76, "solkar_tower": 96, "palm_date": 86, "cactus_saguaro": 52,
    "valen_house1": 98, "valen_house2": 96, "valen_warehouse": 114, "valen_tower": 94, "valen_galleon": 124,
    "valen_sailboat": 98, "valen_rowboat": 62, "valen_fishstall": 72, "valen_crane": 84,
    "sylvana_cottage": 100, "sylvana_hut": 94, "sylvana_trunkhouse": 102, "sylvana_sawmill": 108, "sylvana_herbalist": 100,
    "giant_mushrooms": 52, "sylvana_wagon": 64, "sylvana_monolith": 58, "sylvana_garden": 86,
    "nocthar_house1": 98, "nocthar_house2": 102, "nocthar_spire": 122, "nocthar_tower": 100, "nocthar_crypt": 106,
    "nocthar_crystal": 56, "nocthar_brazier": 46, "ruin_wall": 68, "dead_shadow": 84,
    "peak_snow": 96, "cliff_rock": 66, "palm_coco": 86, "desert_bones": 44, "windmill_v3": 118,
    "frontier_amber": 66, "frontier_red": 74, "guardhouse": 96, "swamp_willow": 88,
}

manifest = []
seen_names = set()
for sheet, grid, target, names in SHEETS:
    src = os.path.join(HERE, sheet)
    if not os.path.exists(src):
        print("falta", sheet); continue
    src = preprocess_sheet(sheet, src)
    tmp = os.path.join(HERE, "_tmp_" + sheet[:-4]); os.makedirs(tmp, exist_ok=True)
    big = max([target] + [OVERRIDE.get(n, 0) for n in names.split(",")])
    subprocess.run([PY, "-W", "ignore", os.path.join(HERE, "slice.py"), src, tmp, "s", "--target", str(big), "--grid", grid, "--names", names], check=True, capture_output=True)
    for m in json.load(open(os.path.join(tmp, "smanifest.json"))):
        if m["name"] == "_" or (m["name"].startswith("s") and m["name"][1:].isdigit()): continue
        im = Image.open(os.path.join(tmp, m["file"])).convert("RGBA")
        want = OVERRIDE.get(m["name"], target)
        s = want / max(im.size)
        if s < 1:
            im = im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)
            q = np.asarray(im).copy(); q[..., 3] = np.where(q[..., 3] > 140, 255, 0); im = Image.fromarray(q, "RGBA")
        im.save(os.path.join(SPR, m["name"] + ".png"))
        if m["name"] not in seen_names:
            seen_names.add(m["name"])
            manifest.append({"name": m["name"], "file": m["name"] + ".png", "w": im.size[0], "h": im.size[1]})
    print(sheet, "ok")

# texturas: NÃO sobrescreve grass/grass_dark/sand/swamp/rock orgânicas sem grade (já artesanais em assets/tex/)
for n in ["wood", "stone_floor", "cave", "snow"]:
    src = os.path.join(HERE, f"tex_{n}.png")
    if not os.path.exists(src): print("falta tex", n); continue
    im = Image.open(src).convert("RGB").crop((64, 64, 448, 448)).resize((128, 128), Image.LANCZOS)
    big = Image.new("RGB", (256, 256))
    big.paste(im, (0, 0)); big.paste(im.transpose(Image.FLIP_LEFT_RIGHT), (128, 0)); big.paste(im.transpose(Image.FLIP_TOP_BOTTOM), (0, 128)); big.paste(im.transpose(Image.ROTATE_180), (128, 128))
    big.save(os.path.join(TEX, n + ".png")); print("tex", n, "ok")

# khazad_floor: chão vulcânico/basalto orgânico escuro (zero grade)
rock_path = os.path.join(TEX, "rock.png")
if os.path.exists(rock_path):
    rk = np.asarray(Image.open(rock_path).convert("RGB")).astype(np.float32)
    rng = np.random.default_rng(322)
    grain = rng.normal(0, 6.0, rk.shape[:2])[..., None]
    kh = np.clip(rk * np.array([0.56, 0.52, 0.54]) + grain, 28, 128).astype(np.uint8)
    Image.fromarray(kh, "RGB").save(os.path.join(TEX, "khazad_floor.png"))
    print("tex khazad_floor (organic basalt) ok")

# solkar_sand: areia dourada orgânica sem grade (aquecida para o tom da imagem 2)
sand_path = os.path.join(TEX, "sand.png")
if os.path.exists(sand_path):
    sd = np.asarray(Image.open(sand_path).convert("RGB")).astype(np.float32)
    rng = np.random.default_rng(323)
    grain = rng.normal(0, 3.2, sd.shape[:2])[..., None]
    ss = np.clip(sd * np.array([1.05, 1.01, 0.89]) + np.array([6, 3, -6]) + grain, 0, 255).astype(np.uint8)
    Image.fromarray(ss, "RGB").save(os.path.join(TEX, "solkar_sand.png"))
    print("tex solkar_sand (organic dunes) ok")

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False)
print(len(manifest), "sprites no manifest")
