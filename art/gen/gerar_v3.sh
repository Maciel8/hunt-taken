#!/usr/bin/env bash
# Arte v3 (Remodelagem Completa 10.000x10.000 e 6 Cidades Expandidas) — Z-Image local.
set -uo pipefail
cd "$(dirname "$0")"
SD=/Users/bielz1n/Projetos/Lcb/skills/vox-motion-graphics/scripts/sd_image.sh
STYLE="pixel art for a modern 16-bit top-down 2D RPG in the style of Stardew Valley and Sea of Stars, three-quarter top-down view, crisp 1px dark outline, rich warm shading, sunlight from top-left, crisp pixels, no text, no watermark, no UI"
ONE="single object centered, filling most of the image, isolated on a flat solid magenta background (#FF00FF), nothing else in the image"
BG="9 distinct objects arranged in a neat 3x3 grid, each object completely isolated inside its own cell on a flat solid magenta background (#FF00FF) with generous empty magenta space between cells, no grid lines"
TEX="seamless tileable top-down RPG ground texture, modern 16-bit pixel art like Stardew Valley, crisp pixels, organic irregular detail, no repeating square grid, no text, fills the whole image edge to edge"

gen() {
  local out="$1.png"
  if [ -s "$out" ]; then echo "skip $1"; return; fi
  echo "== $1 $(date +%H:%M:%S)"
  "$SD" "$2" "$out" --w "$3" --h "$4" --steps 8 --seed "$5" 2>&1 | tail -1
}

# --- Monumentos Heroicos das 6 Cidades ---
gen khazad_citadel "$STYLE. A massive dark-stone dwarven forge citadel fortress with 3 tall stone chimneys billowing grey smoke, glowing bright orange molten lava furnaces, dark battlements, arched iron gate and small wall torches. $ONE" 768 768 301
gen solkar_palace "$STYLE. A grand golden sandstone desert oasis palace with a large shining golden central dome, two flanking smaller golden domes, ornate wooden arched doorway and cream sandstone walls. $ONE" 512 512 302
gen valen_lighthouse "$STYLE. A tall medieval coastal stone lighthouse with red-roofed glowing yellow lantern room perched on a cluster of dark grey seaside rocks. $ONE" 512 512 303
gen sylvana_sanctuary "$STYLE. An ancient druid sacred stone circle of mossy carved standing monolith stones around a small mossy stone shrine basin with soft emerald runes. $ONE" 512 512 304
gen sylvana_colossal "$STYLE. A colossal ancient fantasy oak tree with massive thick gnarled brown trunk, mossy sprawling roots and huge multi-layered lush dark emerald green foliage canopy. $ONE" 512 512 305
gen nocthar_cathedral "$STYLE. An imposing dark gothic obsidian cathedral with 3 tall pointed black spires tipped with glowing purple crystals, luminous violet stained-glass windows and central arcane rose window. $ONE" 768 768 306
gen arken_castle "$STYLE. A grand medieval pale-stone royal castle citadel with pointed blue-roofed corner towers, high central keep, crenellated stone battlements, small red banners and arched timber gate. $ONE" 768 768 307

# --- Packs Culturais 3x3 (54 sprites artesanais) ---
gen pack_khazad "$STYLE. $BG. Row 1: small dark stone dwarven house with slate roof, wider dark stone dwarven house with iron chimney, dwarven blacksmith foundry with glowing orange furnace. Row 2: square dark grey stone fortress tower with battlements, wooden timber-framed mine cave entrance, iron minecart filled with ore on wooden rails. Row 3: iron cauldron glowing with orange embers, sturdy dwarven stone tavern with warm window, dark jagged volcanic mountain rock peak with orange lava crack." 768 768 311
gen pack_solkar "$STYLE. $BG. Row 1: flat-roof golden sandstone adobe house, two-story golden sandstone adobe building with small wooden balcony, small sandstone shrine with golden dome. Row 2: red and white striped desert market tent stall, blue and white striped desert market tent stall, purple and gold striped desert market tent stall. Row 3: round sandstone fortress tower with golden dome roof, tall lush desert date palm tree with curved trunk, green desert saguaro cactus with arms." 768 768 312
gen pack_valen "$STYLE. $BG. Row 1: medieval timber-frame house with red clay roof, medieval stone port cottage with yellow thatched roof, big wooden maritime harbor warehouse. Row 2: square grey stone port wall tower with battlements, wooden three-mast medieval sailing galleon ship with billowing white sails, medium two-mast wooden sailing boat with white sail. Row 3: small wooden fishing rowboat, open-air fish market stall with red striped canopy, wooden harbor dock crane with stacked crates and barrels." 768 768 313
gen pack_sylvana "$STYLE. $BG. Row 1: cozy woodland cottage with lush green mossy roof, thatched druid hut with vines and flowers, whimsical house built inside a giant hollow tree trunk. Row 2: rustic wooden elven sawmill shed with stacked logs, herbalist cottage with hanging green herbs, cluster of giant red-and-white spotted mushrooms. Row 3: wooden wagon loaded with cut logs, mossy carved druid standing stone monolith, rustic wooden-fenced vegetable and herb garden bed." 768 768 314
gen pack_nocthar "$STYLE. $BG. Row 1: dark gothic stone house with steep purple-slate roof, gothic arcane workshop house with glowing violet windows, tall narrow obsidian wizard spire tower. Row 2: dark obsidian corner fortress tower topped with glowing purple crystal, gothic stone crypt mausoleum entrance, cluster of glowing luminous violet arcane crystals. Row 3: black iron brazier burning with bright purple flame, crumbling ancient purple-grey stone ruin wall, gnarled twisted dead shadow tree." 768 768 315
gen pack_world "$STYLE. $BG. Row 1: jagged grey mountain peak topped with white snow, mossy jagged grey rock cliff formation, curved coastal tropical coconut palm tree. Row 2: dry desert shrub with bleached animal skull, classic medieval stone-and-timber windmill with wooden sails, wooden frontier border post flying bright amber-orange banner flags. Row 3: dark iron skull monolith flanked by two burning red torches, medieval timber guardhouse tower with banner, weeping mossy swamp willow tree." 768 768 316

# --- Texturas无缝 de Chão Urbano e Bioma ---
gen tex_cobble_v3 "$TEX: medieval town square irregular grey cobblestones with subtle mortar joints, tiny pebbles and warm weathered variation" 512 512 321
gen tex_khazad_floor "$TEX: dark charcoal volcanic slate flagstones and rough basalt stone ground of a dwarven mountain fortress" 512 512 322
gen tex_solkar_sand "$TEX: warm golden desert sand with gentle wind-blown dune ripples and tiny sunlit pebbles" 512 512 323

echo "FIM_V3 $(date +%H:%M:%S)"
