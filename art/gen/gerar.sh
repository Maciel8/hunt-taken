#!/usr/bin/env bash
# Gera as folhas de sprites do Hunt Taken com o Z-Image local (stable-diffusion.cpp, Metal).
# Cada folha: props isolados em fundo magenta (#FF00FF) pra recorte automático em slice.py.
set -uo pipefail
cd "$(dirname "$0")"
SD=/Users/bielz1n/Projetos/Lcb/skills/vox-motion-graphics/scripts/sd_image.sh
STYLE="pixel art for a top-down 2D RPG in the style of Game Boy Advance Pokemon and Tibia tilesets, clean dark outline, 3-tone shading, crisp pixels, no text, no watermark"
BG="each sprite isolated on a flat solid magenta background (#FF00FF), arranged in a neat grid with empty magenta space between them"
gen() { # nome prompt w h seed
  local out="$1.png"; [ -s "$out" ] && { echo "skip $1"; return; }
  echo "== $1"; "$SD" "$2" "$out" --w "$3" --h "$4" --steps 8 --seed "$5" 2>&1 | tail -1
}
gen trees "$STYLE. Sprite sheet: 4 large trees, each filling one quarter of the image: a broad oak with dense dark-green canopy and visible trunk, a tall pine, a willow, a dead leafless tree. $BG" 768 768 11
gen props2 "$STYLE. Sprite sheet grid of 16 forest and swamp props: dark bush, berry bush, reed clump, lily pad, cattail, moss rock, mushroom cluster, bone pile, skull, broken cart wheel, campfire with logs, wooden crate, barrel, hay bale, pumpkin, dead shrub. $BG" 768 768 12
gen buildings "$STYLE. Sprite sheet grid of 9 medieval village buildings and structures, each filling one cell of a 3x3 grid: stone cottage with red tiled roof and chimney, timber house with thatched roof, market stall with red-and-white striped awning and goods on the counter, stone well with wooden roof, wooden signpost, street lantern on a post, wooden fence segment, bandit tent made of hide, mine entrance in a rock wall with wooden beams. $BG" 768 768 13
gen items "$STYLE. Sprite sheet grid of 16 RPG item icons: red health potion, gold coin pile, steel sword, round wooden shield, chainmail armor, iron helmet, boar tusk, leather cape, silver ring, wooden staff, obsidian blade, glowing blessing orb, raw meat, fish, rope, treasure chest. $BG" 768 768 14
gen monsters1 "$STYLE. Sprite sheet grid of 9 monsters for a Tibia-like game, each in one cell of a 3x3 grid, seen from above at three-quarter view facing down-right: grey field rat, wild boar with tusks, hooded bandit with dagger, grey wolf, giant web spider, drowned corpse dripping water, swamp witch with willow staff, dead miner skeleton with pickaxe, coal golem with glowing cracks. $BG" 768 768 15
gen monsters2 "$STYLE. Sprite sheet grid of 6 monsters and bosses for a Tibia-like game, each in one cell of a 3x2 grid, three-quarter view facing down-right: queen wasp with huge stinger, fallen knight in black broken armor, stone guardian statue with glowing eyes, the Foreman boss (huge miner with a giant pickaxe and lantern), Mother of Wasps boss (wasp queen on a hive throne), Forgotten King boss (skeletal king with a cracked crown and cape). $BG" 768 512 16
TEX="seamless tileable texture, top-down, pixel art for a 2D RPG in the style of Game Boy Advance Pokemon tilesets, crisp pixels, no text, fills the whole image edge to edge"
gen tex_grass "$TEX: lush green grass with small tufts and a few tiny flowers" 512 512 21
gen tex_grass_dark "$TEX: dark forest floor grass with fallen leaves and moss" 512 512 22
gen tex_dirt "$TEX: brown dirt path with small pebbles" 512 512 23
gen tex_sand "$TEX: pale beach sand with ripples" 512 512 24
gen tex_water "$TEX: deep blue lake water with small wave highlights" 512 512 25
gen tex_cobble "$TEX: grey cobblestone pavement of a medieval town square" 512 512 26
gen tex_swamp "$TEX: murky green swamp mud with puddles" 512 512 27
gen tex_rock "$TEX: grey cave rock floor with cracks" 512 512 28
echo "FIM $(date +%H:%M)"
