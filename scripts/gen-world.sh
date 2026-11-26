#!/usr/bin/env bash
# Regera o continente: rede (assets/world-net.json), validação e mapa-múndi (assets/world-overview.webp).
# Depois de mudar js/terrain.js ou scripts/gen-world.mjs, rode isto e o teste ./scripts/test-continente.sh.
set -euo pipefail; cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
node --max-old-space-size=4000 scripts/gen-world.mjs "$TMP"
python3 - "$TMP" <<'PY'
import sys, json
from PIL import Image
t = sys.argv[1]
im = Image.frombytes("RGB", (2000, 2000), open(f"{t}/world-overview.rgb", "rb").read())
net = json.load(open("assets/world-net.json"))
# coração: o mesmo desenho de 1 px por tile que o jogo usa de longe (assets/heart-lod.png, gerado pelo jogo), reduzido pra 1 px = 5 tiles
heart = Image.open("assets/heart-lod.png").convert("RGB").resize((60, 40), Image.BOX)
im.paste(heart, (net["ox"] // 5, net["oy"] // 5))
im.save("assets/world-overview.webp", quality=92, method=6)
g = json.load(open(f"{t}/world-gen.json"))
if g["problems"]: print("PROBLEMAS:", g["problems"]); sys.exit(1)
print("mapa-múndi ok")
PY
