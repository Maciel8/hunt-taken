#!/usr/bin/env bash
# Personagens: uma imagem por pose (frente, lado, costas), personagem grande e único, pra recorte limpo e redução a ~36 px.
# (bash 3.2 do macOS: sem arrays associativos)
set -uo pipefail
cd "$(dirname "$0")"
SD=/Users/bielz1n/Projetos/Lcb/skills/vox-motion-graphics/scripts/sd_image.sh
STYLE="16-bit SNES RPG character sprite in the style of Chrono Trigger and Tibia outfits, full body, standing, detailed face with eyes, clean dark outline, 3-tone shading, crisp pixels, no text, no watermark, a single character centered on a flat solid magenta background (#FF00FF), nothing else in the image"
desc() { case "$1" in
  knight) echo "human knight in a blue tunic with steel chainmail, steel longsword in the right hand and round wooden shield on the left arm, brown hair";;
  paladin) echo "human paladin archer in a green hooded tunic with leather armor, holding a yew bow, quiver on the back, blond hair";;
  sorcerer) echo "human sorcerer in a red robe with gold trim, holding a glowing wand, black hair";;
  druid) echo "human druid in a brown and green robe with leaf motifs, holding a wooden staff, red hair";;
esac; }
pose() { case "$1" in down) echo "facing the viewer (front view)";; side) echo "facing right (side profile view), walking pose";; up) echo "seen from behind (back view)";; esac; }
gen() { local out="$1.png"; [ -s "$out" ] && { echo "skip $1"; return; }; echo "== $1"; "$SD" "$2" "$out" --w 512 --h 512 --steps 8 --seed "$3" 2>&1 | tail -1; }
i=30
for v in knight paladin sorcerer druid; do for p in down side up; do i=$((i+1)); gen "${v}_${p}" "$STYLE. $(desc $v), $(pose $p)." "$i"; done; done
echo "FIM CHARS $(date +%H:%M)"
