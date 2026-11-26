#!/usr/bin/env bash
# Arte nova (26/11/2026): marcos das áreas de caça, vila, interiores e a Caverna do Dragão. Z-Image local.
set -uo pipefail
cd "$(dirname "$0")"
SD=/Users/bielz1n/Projetos/Lcb/skills/vox-motion-graphics/scripts/sd_image.sh
STYLE="pixel art for a top-down 2D RPG in the style of Game Boy Advance Pokemon and Tibia tilesets, three-quarter top-down view, clean dark outline, 3-tone shading, crisp pixels, no text, no watermark"
ONE="single object centered, filling most of the image, isolated on a flat solid magenta background (#FF00FF), nothing else in the image"
BG="each sprite isolated on a flat solid magenta background (#FF00FF), arranged in a neat grid with empty magenta space between them"
gen() { local out="$1.png"; [ -s "$out" ] && { echo "skip $1"; return; }; echo "== $1"; "$SD" "$2" "$out" --w "$3" --h "$4" --steps 8 --seed "$5" 2>&1 | tail -1; }
gen dragon "$STYLE. A huge red fire dragon boss with spread wings, horns and glowing yellow eyes, breathing small flames, facing down-left. $ONE" 768 768 51
gen dragonling "$STYLE. A small orange baby dragon monster with tiny wings, facing down-right. $ONE" 512 512 52
gen witch_hut "$STYLE. A crooked witch hut on wooden stilts over swamp water, mossy thatched roof, green glowing window, cauldron by the door. $ONE" 768 768 53
gen barn "$STYLE. A big red wooden farm barn with a white trim, hay bales by the open door. $ONE" 768 768 54
gen tavern "$STYLE. A two-story medieval tavern building with timber frame, stone base, hanging sign with a mug, warm lit windows. $ONE" 768 768 55
gen fountain "$STYLE. An ornate round stone town fountain with water spraying, top-down three-quarter view. $ONE" 512 512 56
gen cave_entrance "$STYLE. A large dark cave entrance carved into a snowy rocky mountainside, with scorch marks and bones at the mouth, dragon lair. $ONE" 768 768 57
gen wolf_den "$STYLE. A wolf den: a rocky burrow entrance under tree roots with scattered bones. $ONE" 512 512 58
gen landmarks "$STYLE. Sprite sheet grid of 9 objects in a 3x3 grid: big spider web between two dead branches, spider egg cocoon, wooden watchtower ruin, wooden signpost, haystack, flower bed with tulips, stone statue of a knight, red and gold banner on a pole, wooden cart with crates. $BG" 768 768 59
gen furniture "$STYLE. Sprite sheet grid of 16 medieval interior furniture objects in a 4x4 grid: wooden table, wooden chair, bed with red blanket, bookshelf, stone fireplace with fire, barrel rack, treasure chest, round rug, anvil, weapon rack, throne, candle stand, kitchen counter, bar counter with mugs, wooden crate stack, potted plant. $BG" 768 768 60
TEX="seamless tileable texture, top-down, pixel art for a 2D RPG in the style of Game Boy Advance Pokemon tilesets, crisp pixels, no text, fills the whole image edge to edge"
gen tex_wood "$TEX: polished wooden floor planks of a tavern interior" 512 512 61
gen tex_stone_floor "$TEX: castle interior floor of large square grey stone tiles" 512 512 62
gen tex_cave "$TEX: dark volcanic cave floor with cracks and faint glowing embers" 512 512 63
gen tex_snow "$TEX: fresh white snow with soft blue shadows and small footprints" 512 512 64
echo "FIM $(date +%H:%M)"
