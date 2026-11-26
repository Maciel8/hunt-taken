#!/usr/bin/env bash
# Regera o continente: rede (assets/world-net.json), validação e mapa-múndi (assets/world-overview.png).
# Depois de mudar js/terrain.js ou scripts/gen-world.mjs, rode isto e o teste ./scripts/test-continente.sh.
set -euo pipefail; cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
node --max-old-space-size=4000 scripts/gen-world.mjs "$TMP"
python3 - "$TMP" <<'PY'
import sys, json
from PIL import Image
t = sys.argv[1]
im = Image.frombytes("RGB", (1000, 1000), open(f"{t}/world-overview.rgb", "rb").read())
net = json.load(open("assets/world-net.json"))
paint = Image.open("assets/heart-mid.webp").convert("RGB").resize((30, 20), Image.BOX)   # o coração como o jogo desenha (scripts: ver docs/continente.md)
im.paste(paint, (net["ox"] // 10, net["oy"] // 10))
im.save("assets/world-overview.png", optimize=True)
g = json.load(open(f"{t}/world-gen.json"))
if g["problems"]: print("PROBLEMAS:", g["problems"]); sys.exit(1)
print("mapa-múndi ok")
PY
